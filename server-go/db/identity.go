package db

import (
	"context"
	"database/sql"
	"errors"
	"fmt"

	"github.com/Suggus1899/Visitors/server-go/internal/security"
)

const identityBatchSize = 1000

type identityProfile struct {
	current, target string
}

func RebuildIdentity(ctx context.Context, database *sql.DB, key []byte, force bool) error {
	fingerprint := security.IdentityFingerprint(key)
	tx, err := database.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelSerializable})
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err = tx.ExecContext(ctx, `SELECT pg_advisory_xact_lock(174829302)`); err != nil {
		return err
	}
	var current string
	var ready bool
	if err = tx.QueryRowContext(ctx, `SELECT fingerprint,ready FROM "IdentityIndexState" WHERE id=true`).Scan(&current, &ready); err != nil {
		return errors.New("protected identity index state is unavailable; run explicit migration")
	}
	if ready {
		if current != fingerprint {
			return errors.New("protected identity index was prepared with a different key")
		}
		if !force {
			return nil
		}
	}
	if _, err = tx.ExecContext(ctx, `LOCK TABLE "Visitors","Visits","ArcoRequests" IN ACCESS EXCLUSIVE MODE`); err != nil {
		return err
	}
	if _, err = tx.ExecContext(ctx, `UPDATE "IdentityIndexState" SET ready=false WHERE id=true`); err != nil {
		return err
	}
	profiles, identifiers, err := rebuildVisitorIdentities(ctx, tx, key)
	if err != nil {
		return err
	}
	if err = rebuildVisitIdentities(ctx, tx, profiles, identifiers); err != nil {
		return err
	}
	if err = rebuildArcoIdentities(ctx, tx, key, identifiers); err != nil {
		return err
	}
	if _, err = tx.ExecContext(ctx, `UPDATE "IdentityIndexState" SET fingerprint=$1,ready=true WHERE id=true`, fingerprint); err != nil {
		return err
	}
	if err = tx.Commit(); err != nil {
		return err
	}
	return nil
}

func rebuildVisitorIdentities(ctx context.Context, tx *sql.Tx, key []byte) (map[int32]identityProfile, map[string]string, error) {
	profiles := map[int32]identityProfile{}
	identifiers := map[string]string{}
	owners := map[string]int32{}
	var cursor int32
	for {
		rows, err := tx.QueryContext(ctx, `SELECT id,cedula,encrypted_cedula,"anonymizedAt" FROM "Visitors" WHERE id>$1 ORDER BY id LIMIT $2`, cursor, identityBatchSize)
		if err != nil {
			return nil, nil, err
		}
		type row struct {
			id           int32
			cedula       string
			encrypted    sql.NullString
			anonymizedAt sql.NullTime
		}
		batch := make([]row, 0, identityBatchSize)
		for rows.Next() {
			var value row
			if err = rows.Scan(&value.id, &value.cedula, &value.encrypted, &value.anonymizedAt); err != nil {
				rows.Close()
				return nil, nil, err
			}
			batch = append(batch, value)
		}
		err = rows.Err()
		rows.Close()
		if err != nil {
			return nil, nil, err
		}
		if len(batch) == 0 {
			return profiles, identifiers, nil
		}
		ids, oldValues, newValues := make([]int32, 0, len(batch)), make([]string, 0, len(batch)), make([]string, 0, len(batch))
		for _, value := range batch {
			cursor = value.id
			if owner, exists := owners[value.cedula]; exists && owner != value.id {
				return nil, nil, errors.New("duplicate visitor identity reference")
			}
			owners[value.cedula] = value.id
			profile := identityProfile{current: value.cedula, target: value.cedula}
			if !value.anonymizedAt.Valid {
				if !value.encrypted.Valid || value.encrypted.String == "" {
					return nil, nil, fmt.Errorf("visitor %d has no encrypted identity", value.id)
				}
				plain, decryptErr := security.Decrypt(key, value.encrypted.String)
				if decryptErr != nil {
					return nil, nil, fmt.Errorf("identity decryption failed at visitor %d", value.id)
				}
				normalized := security.NormalizeIdentity(plain)
				if normalized == "" {
					return nil, nil, fmt.Errorf("visitor %d has an empty identity", value.id)
				}
				legacyHash := security.Hash(normalized)
				profile.target = security.IdentityHash(key, normalized)
				if value.cedula != legacyHash && value.cedula != security.Hash(plain) && value.cedula != profile.target {
					return nil, nil, fmt.Errorf("visitor %d identity reference does not match its encrypted value", value.id)
				}
				if owner, exists := owners[profile.target]; exists && owner != value.id {
					return nil, nil, errors.New("duplicate decrypted visitor identity")
				}
				owners[profile.target] = value.id
				if err = setIdentityMapping(identifiers, legacyHash, profile.target); err != nil {
					return nil, nil, err
				}
				if err = setIdentityMapping(identifiers, security.Hash(plain), profile.target); err != nil {
					return nil, nil, err
				}
				if err = setIdentityMapping(identifiers, profile.target, profile.target); err != nil {
					return nil, nil, err
				}
				if profile.current != profile.target {
					ids = append(ids, value.id)
					oldValues = append(oldValues, profile.current)
					newValues = append(newValues, profile.target)
				}
			} else {
				if _, exists := identifiers[profile.current]; exists {
					return nil, nil, errors.New("duplicate anonymized identity reference")
				}
				identifiers[profile.current] = profile.current
			}
			profiles[value.id] = profile
		}
		if len(ids) > 0 {
			result, updateErr := tx.ExecContext(ctx, `UPDATE "Visitors" AS visitor SET cedula=changes.new_value FROM unnest($1::integer[],$2::text[],$3::text[]) AS changes(id,old_value,new_value) WHERE visitor.id=changes.id AND visitor.cedula=changes.old_value`, ids, oldValues, newValues)
			if updateErr != nil {
				return nil, nil, updateErr
			}
			if affected, _ := result.RowsAffected(); affected != int64(len(ids)) {
				return nil, nil, errors.New("visitor identity rows changed during maintenance")
			}
		}
	}
}

func rebuildVisitIdentities(ctx context.Context, tx *sql.Tx, profiles map[int32]identityProfile, identifiers map[string]string) error {
	openIdentities := map[string]bool{}
	var cursor int32
	for {
		rows, err := tx.QueryContext(ctx, `SELECT id,visitor_id,visitor_cedula,status::text,check_out_time FROM "Visits" WHERE id>$1 ORDER BY id LIMIT $2`, cursor, identityBatchSize)
		if err != nil {
			return err
		}
		type row struct {
			id           int32
			visitorID    sql.NullInt64
			cedula       string
			status       string
			checkOutTime sql.NullTime
		}
		batch := make([]row, 0, identityBatchSize)
		for rows.Next() {
			var value row
			if err = rows.Scan(&value.id, &value.visitorID, &value.cedula, &value.status, &value.checkOutTime); err != nil {
				rows.Close()
				return err
			}
			batch = append(batch, value)
		}
		err = rows.Err()
		rows.Close()
		if err != nil {
			return err
		}
		if len(batch) == 0 {
			return nil
		}
		ids, oldValues, newValues := make([]int32, 0, len(batch)), make([]string, 0, len(batch)), make([]string, 0, len(batch))
		for _, value := range batch {
			cursor = value.id
			target, exists := identifiers[value.cedula]
			if value.visitorID.Valid {
				profile, found := profiles[int32(value.visitorID.Int64)]
				if !found {
					return fmt.Errorf("visit %d references an unknown visitor", value.id)
				}
				if !exists || target != profile.target {
					return fmt.Errorf("visit %d has an incompatible visitor reference", value.id)
				}
				target, exists = profile.target, true
			}
			if !exists {
				return fmt.Errorf("visit %d has no visitor identity mapping", value.id)
			}
			if (value.status == "waiting" || value.status == "active" || value.status == "intermittent") && !value.checkOutTime.Valid {
				if openIdentities[target] {
					return errors.New("duplicate open visits share a visitor identity")
				}
				openIdentities[target] = true
			}
			if value.cedula != target {
				ids = append(ids, value.id)
				oldValues = append(oldValues, value.cedula)
				newValues = append(newValues, target)
			}
		}
		if len(ids) > 0 {
			result, updateErr := tx.ExecContext(ctx, `UPDATE "Visits" AS visit SET visitor_cedula=changes.new_value FROM unnest($1::integer[],$2::text[],$3::text[]) AS changes(id,old_value,new_value) WHERE visit.id=changes.id AND visit.visitor_cedula=changes.old_value`, ids, oldValues, newValues)
			if updateErr != nil {
				return updateErr
			}
			if affected, _ := result.RowsAffected(); affected != int64(len(ids)) {
				return errors.New("visit identity rows changed during maintenance")
			}
		}
	}
}

func rebuildArcoIdentities(ctx context.Context, tx *sql.Tx, key []byte, identifiers map[string]string) error {
	var cursor int32
	for {
		rows, err := tx.QueryContext(ctx, `SELECT id,"subjectCedulaHash","subjectCedulaEncrypted" FROM "ArcoRequests" WHERE id>$1 ORDER BY id LIMIT $2`, cursor, identityBatchSize)
		if err != nil {
			return err
		}
		type row struct {
			id        int32
			hash      string
			encrypted sql.NullString
		}
		batch := make([]row, 0, identityBatchSize)
		for rows.Next() {
			var value row
			if err = rows.Scan(&value.id, &value.hash, &value.encrypted); err != nil {
				rows.Close()
				return err
			}
			batch = append(batch, value)
		}
		err = rows.Err()
		rows.Close()
		if err != nil {
			return err
		}
		if len(batch) == 0 {
			return nil
		}
		ids, oldValues, newValues := make([]int32, 0, len(batch)), make([]string, 0, len(batch)), make([]string, 0, len(batch))
		for _, value := range batch {
			cursor = value.id
			target, exists := identifiers[value.hash]
			if value.encrypted.Valid && value.encrypted.String != "" {
				plain, decryptErr := security.Decrypt(key, value.encrypted.String)
				if decryptErr != nil {
					return fmt.Errorf("identity decryption failed at privacy request %d", value.id)
				}
				normalized := security.NormalizeIdentity(plain)
				legacyHash := security.Hash(normalized)
				target = security.IdentityHash(key, normalized)
				if value.hash != legacyHash && value.hash != security.Hash(plain) && value.hash != target {
					return fmt.Errorf("privacy request %d identity reference does not match its encrypted value", value.id)
				}
				exists = true
			}
			if !exists {
				return fmt.Errorf("privacy request %d has no identity mapping or encrypted identity", value.id)
			}
			if value.hash != target {
				ids = append(ids, value.id)
				oldValues = append(oldValues, value.hash)
				newValues = append(newValues, target)
			}
		}
		if len(ids) > 0 {
			result, updateErr := tx.ExecContext(ctx, `UPDATE "ArcoRequests" AS arco SET "subjectCedulaHash"=changes.new_value FROM unnest($1::integer[],$2::text[],$3::text[]) AS changes(id,old_value,new_value) WHERE arco.id=changes.id AND arco."subjectCedulaHash"=changes.old_value`, ids, oldValues, newValues)
			if updateErr != nil {
				return updateErr
			}
			if affected, _ := result.RowsAffected(); affected != int64(len(ids)) {
				return errors.New("privacy identity rows changed during maintenance")
			}
		}
	}
}

func setIdentityMapping(identifiers map[string]string, source, target string) error {
	if existing, ok := identifiers[source]; ok && existing != target {
		return errors.New("duplicate legacy identity reference")
	}
	identifiers[source] = target
	return nil
}
