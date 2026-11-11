//! Solicitudes ARCO y cancelación de datos (`ArcoRequests`).
//!
//! Reproduce `privacy.go`: crear solicitud, cambiar su estado,
//! consultar datos del titular y la cancelación de datos, que es la
//! operación con más pasos de todo el sistema. La cancelación exige
//! identidad verificada y que no haya visitas abiertas; anonimiza el
//! perfil y sus referencias, limpia los tokens de búsqueda y deja una
//! solicitud de cancelación resuelta como constancia, todo en una sola
//! transacción inmediata.

use rusqlite::{params, Connection, Transaction};

use crate::error::{StoreError, StoreResult};
use crate::models::ArcoRequest;
use crate::repos::audit::{self, AuditEntry};
use crate::repos::Actor;

const REQUEST_COLUMNS: &str = "id, \"requestType\", \"subjectCedulaHash\", \
    \"subjectCedulaEncrypted\", \"requestedByName\", \"requestedByUserId\", \"contactEmail\", \
    reason, \"requestPayload\", status, \"resolutionNotes\", \"resolvedAt\", \"createdAt\", \"updatedAt\"";

/// Datos para crear una solicitud ARCO.
pub struct NewArcoRequest<'a> {
    pub request_type: &'a str,
    pub subject_cedula_hash: &'a str,
    pub subject_cedula_encrypted: Option<&'a str>,
    pub requested_by_name: &'a str,
    pub requested_by_user_id: Option<i64>,
    pub contact_email: Option<&'a str>,
    pub reason: Option<&'a str>,
    pub request_payload: Option<&'a str>,
    pub created_at: &'a str,
    pub updated_at: &'a str,
}

/// Crea una solicitud en estado `pending` y devuelve su id.
pub fn insert_request(tx: &Transaction, request: &NewArcoRequest<'_>) -> StoreResult<i64> {
    tx.execute(
        "INSERT INTO \"ArcoRequests\"(\"requestType\", \"subjectCedulaHash\", \"subjectCedulaEncrypted\", \
         \"requestedByName\", \"requestedByUserId\", \"contactEmail\", reason, \"requestPayload\", \
         status, \"createdAt\", \"updatedAt\") \
         VALUES(?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 'pending', ?9, ?10)",
        params![
            request.request_type,
            request.subject_cedula_hash,
            request.subject_cedula_encrypted,
            request.requested_by_name,
            request.requested_by_user_id,
            request.contact_email,
            request.reason,
            request.request_payload,
            request.created_at,
            request.updated_at,
        ],
    )?;
    Ok(tx.last_insert_rowid())
}

/// Busca una solicitud por id.
pub fn find_request_by_id(conn: &Connection, id: i64) -> StoreResult<ArcoRequest> {
    let sql = format!("SELECT {REQUEST_COLUMNS} FROM \"ArcoRequests\" WHERE id = ?1");
    conn.query_row(&sql, params![id], |row| ArcoRequest::try_from(row))
        .map_err(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => StoreError::not_found(
                "ARCO_REQUEST_NOT_FOUND",
                format!("solicitud {id} no encontrada"),
            ),
            other => other.into(),
        })
}

/// Solicitudes más recientes, con paginación.
pub fn list_requests(conn: &Connection, limit: i64, offset: i64) -> StoreResult<Vec<ArcoRequest>> {
    let sql = format!(
        "SELECT {REQUEST_COLUMNS} FROM \"ArcoRequests\" \
         ORDER BY \"createdAt\" DESC, id DESC LIMIT ?1 OFFSET ?2"
    );
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map(params![limit, offset], |row| ArcoRequest::try_from(row))?;
    rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
}

/// Cambia el estado de una solicitud (admin/root). Devuelve las filas
/// afectadas (0 = la solicitud no existe).
pub fn update_request_status(
    tx: &Transaction,
    id: i64,
    status: &str,
    resolution_notes: Option<&str>,
    resolved_at: Option<&str>,
    now: &str,
) -> StoreResult<u64> {
    let rows = tx.execute(
        "UPDATE \"ArcoRequests\" SET status = ?2, \"resolutionNotes\" = ?3, \"resolvedAt\" = ?4, \
         \"updatedAt\" = ?5 WHERE id = ?1",
        params![id, status, resolution_notes, resolved_at, now],
    )?;
    Ok(rows as u64)
}

/// Cancela los datos de un titular: anonimiza perfil, visitas,
/// historial, bitácora y solicitudes, borra fotos y tokens, y deja la
/// solicitud de cancelación resuelta como constancia.
///
/// Es la traducción literal de `subjectCancel` en `privacy.go`, con
/// dos adaptaciones de SQLite: `= ANY($n)` se sustituye por `IN` con
/// marcadores generados, y la reindexación de Go (`indexVisitor`) se
/// sustituye por el borrado de tokens —tras anonimizar, el perfil ya
/// no tiene nada que indexar—.
///
/// Exige: `visitor_id` del perfil, `cedula_plain` (la cédula
/// normalizada en claro, para la limpieza de la bitácora),
/// `cedula_hash` (el HMAC de la columna `cedula`) y `reference` (el
/// identificador anónimo aleatorio que sustituye a la identidad).
/// Con visitas abiertas devuelve `OPEN_VISIT_EXISTS`.
#[allow(clippy::too_many_arguments)] // los 8 parámetros son la operación de Go, sin abreviar
pub fn cancel_subject(
    tx: &Transaction,
    visitor_id: i64,
    cedula_plain: &str,
    cedula_hash: &str,
    reference: &str,
    actor: &Actor,
    verification_method: &str,
    now: &str,
) -> StoreResult<()> {
    // 1. Visitas del titular: ninguna puede estar abierta.
    let mut stmt = tx.prepare(
        "SELECT id, status FROM \"Visits\" WHERE visitor_id = ?1 OR visitor_cedula = ?2",
    )?;
    let visits: Vec<(i64, Option<String>)> = stmt
        .query_map(params![visitor_id, cedula_hash], |row| {
            Ok((row.get::<_, i64>(0)?, row.get::<_, Option<String>>(1)?))
        })?
        .collect::<Result<Vec<_>, _>>()?;
    drop(stmt);
    for (_, status) in &visits {
        if !matches!(status.as_deref(), Some("completed") | Some("cancelled")) {
            return Err(StoreError::conflict(
                "OPEN_VISIT_EXISTS",
                "Cierre las visitas abiertas antes de cancelar los datos",
            ));
        }
    }
    let ids: Vec<i64> = visits.iter().map(|(id, _)| *id).collect();

    // 2. Historial de ediciones: se vacían los valores.
    if !ids.is_empty() {
        let placeholders = placeholders(ids.len());
        let sql = format!(
            "UPDATE \"VisitorEditHistories\" SET \"oldValue\" = NULL, \"newValue\" = NULL \
             WHERE \"visitorId\" = ?1 OR \"visitId\" IN ({placeholders})"
        );
        let mut p: Vec<rusqlite::types::Value> = vec![rusqlite::types::Value::Integer(visitor_id)];
        p.extend(ids.iter().map(|id| rusqlite::types::Value::Integer(*id)));
        tx.execute(&sql, rusqlite::params_from_iter(p.iter()))?;

        // 3. Intervalos: se vacían las notas.
        let sql = format!(
            "UPDATE \"IntermittentLogs\" SET notes = NULL, \"updatedAt\" = ?1 \
             WHERE visit_id IN ({placeholders})"
        );
        let p: Vec<rusqlite::types::Value> = ids
            .iter()
            .map(|id| rusqlite::types::Value::Integer(*id))
            .collect();
        tx.execute(
            &sql,
            rusqlite::params_from_iter(
                std::iter::once(&rusqlite::types::Value::Text(now.to_string())).chain(p.iter()),
            ),
        )?;
    }

    // 4. Bitácora: se anonimiza lo que menciona al titular.
    //
    // Los parámetros van numerados de forma explícita y en orden
    // (?1, ?2, ...): mezclar `?N` con `?` anónimos les asignaría a
    // estos últimos índices que chocan con los explícitos.
    let entity_ids: Vec<String> = ids.iter().map(|id| id.to_string()).collect();
    let visitor_refs = [
        cedula_plain.to_string(),
        cedula_hash.to_string(),
        visitor_id.to_string(),
    ];
    let mut next_param = 2; // ?1 es `reference` (el SET).
    let numbered = |n: usize, next: &mut i64| -> String {
        let mut out = Vec::with_capacity(n);
        for _ in 0..n {
            out.push(format!("?{}", next));
            *next += 1;
        }
        out.join(", ")
    };
    let visitor_in = numbered(visitor_refs.len(), &mut next_param);
    let visit_in = if entity_ids.is_empty() {
        "NULL".to_string()
    } else {
        numbered(entity_ids.len(), &mut next_param)
    };
    let hash_param = next_param;
    next_param += 1;
    let like_param = next_param;
    let sql = format!(
        "UPDATE \"ActivityLogs\" SET \"entityId\" = ?1, details = 'Datos anonimizados', path = NULL, \
         \"ipAddress\" = NULL, \"userAgent\" = NULL \
         WHERE (entity = 'Visitor' AND \"entityId\" IN ({visitor_in})) \
         OR (entity = 'Visit' AND \"entityId\" IN ({visit_in})) \
         OR (entity = 'ArcoRequest' AND \"entityId\" IN \
             (SELECT CAST(id AS TEXT) FROM \"ArcoRequests\" WHERE \"subjectCedulaHash\" = ?{hash_param})) \
         OR path LIKE '%' || ?{like_param} || '%' OR details LIKE '%' || ?{like_param} || '%'"
    );
    let mut params: Vec<rusqlite::types::Value> =
        vec![rusqlite::types::Value::Text(reference.to_string())];
    params.extend(
        visitor_refs
            .iter()
            .map(|v| rusqlite::types::Value::Text(v.clone())),
    );
    params.extend(
        entity_ids
            .iter()
            .map(|id| rusqlite::types::Value::Text(id.clone())),
    );
    params.push(rusqlite::types::Value::Text(cedula_hash.to_string()));
    params.push(rusqlite::types::Value::Text(cedula_plain.to_string()));
    tx.execute(&sql, rusqlite::params_from_iter(params.iter()))?;

    // 5. Visitas: referencias anónimas y textos genéricos.
    tx.execute(
        "UPDATE \"Visits\" SET visitor_id = ?1, visitor_cedula = ?2, purpose = 'Anonimizado', \
         person_to_visit = 'Anonimizado', notes = NULL, cancellation_reason = NULL, \
         companion_name = NULL, companion_cedula = NULL, vehicle_brand = NULL, \
         vehicle_model = NULL, vehicle_plate = NULL, host_person = NULL, \
         target_department = NULL, department = NULL, area = NULL, \"updatedAt\" = ?4 \
         WHERE visitor_id = ?1 OR visitor_cedula = ?3",
        params![visitor_id, reference, cedula_hash, now],
    )?;

    // 6. Solicitudes ARCO del titular.
    tx.execute(
        "UPDATE \"ArcoRequests\" SET \"subjectCedulaHash\" = ?2, \"subjectCedulaEncrypted\" = NULL, \
         \"requestedByName\" = 'Anonimizado', \"contactEmail\" = NULL, reason = NULL, \
         \"requestPayload\" = NULL, \"resolutionNotes\" = NULL, \"updatedAt\" = ?3 \
         WHERE \"subjectCedulaHash\" = ?1",
        params![cedula_hash, reference, now],
    )?;

    // 7. Perfil: anonimizado, sin fotos ni contacto.
    tx.execute(
        "UPDATE \"Visitors\" SET cedula = ?2, encrypted_cedula = NULL, \"anonymizedAt\" = ?3, \
         first_name = 'Anonimizado', last_name = '', company = 'Anonimizado', job_title = NULL, \
         email = NULL, phone = NULL, photo_data = NULL, id_photo_data = NULL, photo_url = NULL, \
         id_photo_url = NULL, observations = NULL, \"isBlocked\" = 0, \"updatedAt\" = ?3 \
         WHERE id = ?1",
        params![visitor_id, reference, now],
    )?;

    // 8. Solicitud de cancelación resuelta, como constancia.
    tx.execute(
        "INSERT INTO \"ArcoRequests\"(\"requestType\", \"subjectCedulaHash\", \"requestedByName\", \
         \"requestedByUserId\", status, \"resolvedAt\", \"createdAt\", \"updatedAt\") \
         VALUES('cancellation', ?1, 'Anonimizado', ?2, 'completed', ?3, ?3, ?3)",
        params![reference, actor.id, now],
    )?;

    // 9. Tokens de búsqueda del perfil (Go lo hace vía `indexVisitor`).
    tx.execute(
        "DELETE FROM \"VisitorSearchTokens\" WHERE visitor_id = ?1",
        params![visitor_id],
    )?;

    // 10. Auditoría de la cancelación, en la misma transacción.
    audit::write(
        tx,
        &AuditEntry {
            user_id: actor.id,
            username: &actor.username,
            action: "ARCO_CANCELLATION_EXECUTED",
            entity: "Visitor",
            entity_id: reference,
            details: Some(&format!("Verificación de identidad: {verification_method}")),
            ip_address: None,
            user_agent: None,
            created_at: now,
            role: None,
            method: None,
            path: None,
        },
    )?;
    Ok(())
}

/// `?, ?, ...` para un `IN` con `n` valores.
fn placeholders(n: usize) -> String {
    std::iter::repeat_n("?", n).collect::<Vec<_>>().join(", ")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::migrations;
    use crate::repos::visitors::{self, NewVisitor};
    use crate::repos::visits::{self, NewVisit};

    const NOW: &str = "2026-11-10T00:00:00.000000Z";

    fn migrated() -> Connection {
        let mut conn = Connection::open_in_memory().unwrap();
        conn.pragma_update(None, "foreign_keys", "ON").unwrap();
        migrations::apply(&mut conn).unwrap();
        conn
    }

    fn seed_visitor_with_completed_visit(conn: &mut Connection) -> (i64, i64) {
        let tx = conn
            .transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)
            .unwrap();
        let visitor_id = visitors::insert(
            &tx,
            &NewVisitor {
                cedula_hash: "hash-a",
                encrypted_cedula: Some("ENC:cedula"),
                first_name: "ENC:Ana",
                last_name: "ENC:Pérez",
                company: "Trébol",
                job_title: Some("ENC:Operaria"),
                email: Some("ENC:a@example.test"),
                phone: Some("ENC:04120000000"),
                photo_data: Some(b"foto"),
                id_photo_data: Some(b"documento"),
                created_at: NOW,
                updated_at: NOW,
            },
        )
        .unwrap();
        let visit_id = visits::insert_checkin(
            &tx,
            &NewVisit {
                visitor_cedula: "hash-a",
                visitor_id,
                purpose: "Reunión",
                person_to_visit: "Anfitrión",
                status: "completed",
                notes: Some("nota privada"),
                companion_name: None,
                companion_cedula: None,
                vehicle_brand: None,
                vehicle_model: None,
                vehicle_plate: None,
                area: None,
                action: "Ninguna",
                department: None,
                target_department: None,
                host_person: None,
                arrival_time: NOW,
                entry_time: Some(NOW),
                check_in_time: NOW,
                consent_policy_version: "v1",
                consent_accepted_at: NOW,
                consent_recorded_by: 1,
                created_at: NOW,
                updated_at: NOW,
            },
        )
        .unwrap();
        // La visita completada necesita salida para ser coherente.
        tx.execute(
            "UPDATE \"Visits\" SET check_out_time = ?2 WHERE id = ?1",
            params![visit_id, NOW],
        )
        .unwrap();
        tx.execute(
            "INSERT INTO \"VisitorSearchTokens\"(visitor_id, token) VALUES(?1, ?2)",
            params![visitor_id, vec![1u8; 32]],
        )
        .unwrap();
        tx.commit().unwrap();
        (visitor_id, visit_id)
    }

    #[test]
    fn request_lifecycle() {
        let mut conn = migrated();
        let tx = conn.transaction().unwrap();
        let id = insert_request(
            &tx,
            &NewArcoRequest {
                request_type: "access",
                subject_cedula_hash: "hash-a",
                subject_cedula_encrypted: Some("ENC:cedula"),
                requested_by_name: "Ana Pérez",
                requested_by_user_id: Some(1),
                contact_email: Some("a@example.test"),
                reason: Some("Quiero mis datos"),
                request_payload: None,
                created_at: NOW,
                updated_at: NOW,
            },
        )
        .unwrap();
        tx.commit().unwrap();
        let request = find_request_by_id(&conn, id).unwrap();
        assert_eq!(request.status, "pending");
        let tx = conn.transaction().unwrap();
        let rows =
            update_request_status(&tx, id, "completed", Some("Entregado"), Some(NOW), NOW).unwrap();
        assert_eq!(rows, 1);
        tx.commit().unwrap();
        assert_eq!(find_request_by_id(&conn, id).unwrap().status, "completed");
        assert_eq!(list_requests(&conn, 10, 0).unwrap().len(), 1);
    }

    #[test]
    fn cancel_subject_anonymizes_everything() {
        let mut conn = migrated();
        let (visitor_id, visit_id) = seed_visitor_with_completed_visit(&mut conn);
        let tx = conn
            .transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)
            .unwrap();
        let actor = Actor {
            id: 1,
            username: "root".to_string(),
        };
        cancel_subject(
            &tx,
            visitor_id,
            "V-12345678",
            "hash-a",
            "anon-0123456789abcdef",
            &actor,
            "cédula laminada",
            NOW,
        )
        .unwrap();
        tx.commit().unwrap();

        let visitor = visitors::find_by_id(&conn, visitor_id).unwrap();
        assert_eq!(visitor.cedula, "anon-0123456789abcdef");
        assert_eq!(visitor.first_name, "Anonimizado");
        assert_eq!(visitor.last_name, "");
        assert_eq!(visitor.company, "Anonimizado");
        assert!(visitor.anonymized_at.is_some());
        assert_eq!(visitor.photo_data, None);
        assert_eq!(visitor.email, None);

        let visit = visits::find_by_id(&conn, visit_id).unwrap();
        assert_eq!(visit.visitor_cedula, "anon-0123456789abcdef");
        assert_eq!(visit.purpose, "Anonimizado");
        assert_eq!(visit.notes, None);

        let tokens: i64 = conn
            .query_row(
                "SELECT count(*) FROM \"VisitorSearchTokens\" WHERE visitor_id = ?1",
                params![visitor_id],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(tokens, 0);

        // Constancia de cancelación resuelta.
        let requests = list_requests(&conn, 10, 0).unwrap();
        assert_eq!(requests.len(), 1);
        assert_eq!(requests[0].request_type, "cancellation");
        assert_eq!(requests[0].status, "completed");

        // Y el perfil ya no se encuentra por su hash original.
        assert!(matches!(
            visitors::find_by_cedula(&conn, "hash-a"),
            Err(StoreError::NotFound { .. })
        ));
    }

    #[test]
    fn cancel_with_open_visit_is_refused() {
        let mut conn = migrated();
        let tx = conn
            .transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)
            .unwrap();
        let visitor_id = visitors::insert(
            &tx,
            &NewVisitor {
                cedula_hash: "hash-b",
                encrypted_cedula: None,
                first_name: "B",
                last_name: "C",
                company: "Trébol",
                job_title: None,
                email: None,
                phone: None,
                photo_data: None,
                id_photo_data: None,
                created_at: NOW,
                updated_at: NOW,
            },
        )
        .unwrap();
        visits::insert_checkin(
            &tx,
            &NewVisit {
                visitor_cedula: "hash-b",
                visitor_id,
                purpose: "Reunión",
                person_to_visit: "Anfitrión",
                status: "active",
                notes: None,
                companion_name: None,
                companion_cedula: None,
                vehicle_brand: None,
                vehicle_model: None,
                vehicle_plate: None,
                area: None,
                action: "Ninguna",
                department: None,
                target_department: None,
                host_person: None,
                arrival_time: NOW,
                entry_time: Some(NOW),
                check_in_time: NOW,
                consent_policy_version: "v1",
                consent_accepted_at: NOW,
                consent_recorded_by: 1,
                created_at: NOW,
                updated_at: NOW,
            },
        )
        .unwrap();
        let actor = Actor {
            id: 1,
            username: "root".to_string(),
        };
        let err = cancel_subject(
            &tx,
            visitor_id,
            "V-99999999",
            "hash-b",
            "anon-xyz",
            &actor,
            "cédula laminada",
            NOW,
        )
        .unwrap_err();
        assert!(matches!(
            err,
            StoreError::Conflict {
                code: "OPEN_VISIT_EXISTS",
                ..
            }
        ));
        tx.rollback().unwrap();
    }
}
