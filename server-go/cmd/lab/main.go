// lab runs only against an explicitly disposable database and never becomes an API service.
package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"image"
	"image/png"
	"io"
	"net/http"
	"net/url"
	"os"
	"runtime"
	"sort"
	"sync"
	"time"

	"github.com/Suggus1899/Visitors/server-go/db"
	"github.com/Suggus1899/Visitors/server-go/internal/config"
	"github.com/Suggus1899/Visitors/server-go/internal/security"
	"github.com/jackc/pgx/v5"
)

func main() {
	if e := run(); e != nil {
		fmt.Fprintln(os.Stderr, e)
		os.Exit(1)
	}
}
func run() error {
	flags := flag.NewFlagSet("lab", flag.ContinueOnError)
	visitors := flags.Int("visitors", 100000, "fictitious visitors")
	visits := flags.Int("visits", 1000000, "fictitious visits")
	base := flags.String("url", "http://api:3000", "laboratory API")
	warm := flags.Duration("warmup", 2*time.Minute, "unmeasured warmup")
	duration := flags.Duration("duration", 15*time.Minute, "measured mixture")
	if len(os.Args) < 2 {
		return errors.New("usage: lab generate|load [flags]")
	}
	if e := flags.Parse(os.Args[2:]); e != nil {
		return e
	}
	c, e := config.Load()
	if e != nil {
		return e
	}
	if c.Environment != "test" || c.Database != "logmaster_load_test" || os.Getenv("LOGMASTER_LOAD_TEST") != "true" {
		return errors.New("explicit fictitious logmaster_load_test in test mode required")
	}
	switch os.Args[1] {
	case "generate":
		if *visitors < 100 || *visits < *visitors || *visitors > 100000 || *visits > 1000000 {
			return errors.New("invalid laboratory volume")
		}
		return generate(c, *visitors, *visits)
	case "load":
		if *warm < 0 || *duration <= 0 {
			return errors.New("invalid test durations")
		}
		return load(*base, *warm, *duration)
	default:
		return errors.New("unknown lab command")
	}
}

func generate(c config.Config, people, total int) error {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Minute)
	defer cancel()
	sqlDB, e := db.Open(c)
	if e != nil {
		return e
	}
	defer sqlDB.Close()
	if e = db.Migrate(ctx, sqlDB); e != nil {
		return e
	}
	connection, e := c.DBConfig()
	if e != nil {
		return e
	}
	connection.RuntimeParams["statement_timeout"] = "1800000"
	pg, e := pgx.ConnectConfig(ctx, connection)
	if e != nil {
		return e
	}
	defer pg.Close(ctx)
	var existing int
	if e = pg.QueryRow(ctx, `SELECT count(*) FROM "Visitors"`).Scan(&existing); e != nil {
		return e
	}
	if existing != 0 {
		return errors.New("load generation requires an empty laboratory database")
	}
	password := os.Getenv("LAB_PASSWORD")
	if e = security.ValidatePassword(password); e != nil {
		return e
	}
	hash, e := security.PasswordHash(password)
	if e != nil {
		return e
	}
	for i := 0; i < 50; i++ {
		role := "operador"
		if i == 0 {
			role = "root"
		}
		if _, e = pg.Exec(ctx, `INSERT INTO "Users"(username,password,role,email,"mustChangePassword","createdAt","updatedAt") VALUES($1,$2,$3,$4,false,now(),now())`, fmt.Sprintf("lab%02d", i), hash, role, fmt.Sprintf("lab%02d@example.test", i)); e != nil {
			return e
		}
	}
	started := time.Now()
	epoch := time.Date(2026, 10, 1, 12, 0, 0, 0, time.UTC)
	names := []string{"Gustavo", "María", "Luis", "Ana", "José", "Lucía", "Pedro", "Carla", "Miguel", "Elena"}
	ids := make([]string, people)
	var photo bytes.Buffer
	if e = png.Encode(&photo, image.NewRGBA(image.Rect(0, 0, 8, 8))); e != nil {
		return e
	}
	for start := 0; start < people; start += 1000 {
		count := min(1000, people-start)
		rows := make([][]any, count)
		for j := range count {
			id := start + j + 1
			cedula := fmt.Sprintf("V-%08d", 40000000+id)
			ids[id-1] = security.Hash(cedula)
			first, e := security.Encrypt(c.EncryptionKey, names[id%len(names)])
			if e != nil {
				return e
			}
			last, e := security.Encrypt(c.EncryptionKey, fmt.Sprintf("Ficticio %06d", id))
			if e != nil {
				return e
			}
			encrypted, e := security.Encrypt(c.EncryptionKey, cedula)
			if e != nil {
				return e
			}
			company := "Empresa ficticia"
			var anon, encryptedCedula, photograph any
			encryptedCedula = encrypted
			if id%200 == 0 {
				ids[id-1] = fmt.Sprintf("anon-fixture-%d", id)
				first = "Anonimizado"
				last = ""
				company = ""
				encryptedCedula = nil
				anon = epoch
			}
			if id%1000 == 1 {
				photograph = photo.Bytes()
			}
			rows[j] = []any{id, ids[id-1], encryptedCedula, first, last, company, epoch, epoch, anon, photograph}
		}
		if _, e = pg.CopyFrom(ctx, pgx.Identifier{"Visitors"}, []string{"id", "cedula", "encrypted_cedula", "first_name", "last_name", "company", "createdAt", "updatedAt", "anonymizedAt", "photo_data"}, pgx.CopyFromRows(rows)); e != nil {
			return errors.New("fictitious visitor batch failed")
		}
	}
	for start := 0; start < total; start += 5000 {
		count := min(5000, total-start)
		rows := make([][]any, count)
		for j := range count {
			id := start + j + 1
			person := (id-1)%people + 1
			at := epoch.Add(-time.Duration(id%1095) * 24 * time.Hour)
			status := "completed"
			var exit any = at.Add(time.Hour)
			if id > total-75 && person%200 != 0 {
				status = []string{"active", "waiting", "intermittent"}[id%3]
				exit = nil
			}
			rows[j] = []any{id, ids[person-1], person, "Prueba ficticia", "Responsable ficticio", at, exit, status, at, at, at, at, "Laboratorio", "Responsable ficticio"}
		}
		if _, e = pg.CopyFrom(ctx, pgx.Identifier{"Visits"}, []string{"id", "visitor_cedula", "visitor_id", "purpose", "person_to_visit", "check_in_time", "check_out_time", "status", "createdAt", "updatedAt", "arrival_time", "entry_time", "target_department", "host_person"}, pgx.CopyFromRows(rows)); e != nil {
			return errors.New("fictitious visit batch failed")
		}
	}
	if _, e = pg.Exec(ctx, `SELECT setval('"Visitors_id_seq"',(SELECT max(id) FROM "Visitors"));SELECT setval('"Visits_id_seq"',(SELECT max(id) FROM "Visits"));ANALYZE "Visitors";ANALYZE "Visits"`); e != nil {
		return e
	}
	if e = db.RebuildSearch(ctx, sqlDB, c.EncryptionKey, true); e != nil {
		return e
	}
	if _, e = pg.Exec(ctx, `ANALYZE "VisitorSearchTokens"`); e != nil {
		return e
	}
	return json.NewEncoder(os.Stdout).Encode(map[string]any{"visitors": people, "visits": total, "sessions": 50, "generationSeconds": time.Since(started).Seconds()})
}

type envelope struct {
	Success bool            `json:"success"`
	Data    json.RawMessage `json:"data"`
}
type credentials struct {
	Access  string `json:"accessToken"`
	Refresh string `json:"refreshToken"`
}
type sample struct {
	Kind     string
	Duration float64
	Failed   bool
}

func call(client *http.Client, method, endpoint, token string, body any, out any) error {
	var raw []byte
	var e error
	if body != nil {
		raw, e = json.Marshal(body)
		if e != nil {
			return e
		}
	}
	req, e := http.NewRequest(method, endpoint, bytes.NewReader(raw))
	if e != nil {
		return e
	}
	req.Header.Set("Content-Type", "application/json")
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	resp, e := client.Do(req)
	if e != nil {
		return errors.New("laboratory request failed")
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		io.Copy(io.Discard, resp.Body)
		return fmt.Errorf("unexpected HTTP %d", resp.StatusCode)
	}
	var result envelope
	if e = json.NewDecoder(io.LimitReader(resp.Body, 5*1024*1024)).Decode(&result); e != nil {
		return e
	}
	if !result.Success {
		return errors.New("unsuccessful API response")
	}
	if out != nil {
		return json.Unmarshal(result.Data, out)
	}
	return nil
}
func load(base string, warm, duration time.Duration) error {
	endpoint, e := url.Parse(base)
	if e != nil || endpoint.Hostname() != "api" && endpoint.Hostname() != "localhost" && endpoint.Hostname() != "127.0.0.1" {
		return errors.New("load URL must be a laboratory loopback or Compose API")
	}
	password := os.Getenv("LAB_PASSWORD")
	if e = security.ValidatePassword(password); e != nil {
		return e
	}
	client := &http.Client{Timeout: 10 * time.Second, Transport: &http.Transport{MaxIdleConns: 100, MaxIdleConnsPerHost: 100}}
	defer client.CloseIdleConnections()
	sessions := make([]credentials, 50)
	for i := range sessions {
		if e = call(client, "POST", base+"/api/v1/auth/login", "", map[string]string{"username": fmt.Sprintf("lab%02d", i), "password": password}, &sessions[i]); e != nil {
			return e
		}
	}
	var mu sync.Mutex
	samples := []sample{}
	var workers sync.WaitGroup
	measured := time.Now().Add(warm)
	end := measured.Add(duration)
	record := func(kind string, started time.Time, err error) {
		if !started.Before(measured) {
			mu.Lock()
			samples = append(samples, sample{kind, time.Since(started).Seconds(), err != nil})
			mu.Unlock()
		}
	}
	for worker := range 50 {
		workers.Add(1)
		go func(worker int) {
			defer workers.Done()
			session := sessions[worker]
			iteration := 0
			refreshed := time.Now()
			for time.Now().Before(end) {
				if time.Since(refreshed) > 5*time.Minute {
					if e := call(client, "POST", base+"/api/v1/auth/refresh", "", map[string]string{"refreshToken": session.Refresh}, &session); e != nil {
						mu.Lock()
						samples = append(samples, sample{"operation", 0, true})
						mu.Unlock()
						return
					}
					refreshed = time.Now()
				}
				kind := "query"
				path := "/api/v1/visits?page=1&limit=20&startDate=2026-09-01&endDate=2026-10-01"
				switch iteration % 10 {
				case 1, 5:
					kind = "search"
					path = "/api/v1/visitors?search=Gustavo&page=1&limit=20"
				case 2:
					path = "/api/v1/visits/calendar?startDate=2026-09-01&endDate=2026-10-01"
				case 4:
					path = "/api/v1/visits/active"
				case 7:
					path = "/api/v1/visits?page=2&limit=20&status=completed&startDate=2026-09-01&endDate=2026-10-01"
				}
				start := time.Now()
				var e error
				if iteration%10 != 9 {
					e = call(client, "GET", base+path, session.Access, nil, nil)
					record(kind, start, e)
				}
				if iteration%10 == 9 {
					cedula := fmt.Sprintf("V-%08d", 80000000+worker*100000+iteration)
					body := map[string]any{"visitorCedula": cedula, "purpose": "Prueba de carga", "personToVisit": "Ficticio", "targetDepartment": "Laboratorio", "hostPerson": "Ficticio", "status": "waiting", "visitorData": map[string]string{"firstName": "Carga", "lastName": "Ficticio", "company": "Laboratorio"}, "consent": map[string]any{"accepted": true, "policyVersion": "1.0", "acceptedAt": time.Now().UTC().Format(time.RFC3339)}}
					var visit struct {
						ID int `json:"id"`
					}
					start = time.Now()
					e = call(client, "POST", base+"/api/v1/visits/checkin", session.Access, body, &visit)
					record("operation", start, e)
					for _, transition := range []string{"admit", "intermittent-exit", "intermittent-reentry", "checkout"} {
						if e == nil {
							start = time.Now()
							e = call(client, "POST", fmt.Sprintf("%s/api/v1/visits/%d/%s", base, visit.ID, transition), session.Access, nil, nil)
							record("operation", start, e)
						}
					}
				}
				iteration++
				time.Sleep(time.Second)
			}
		}(worker)
	}
	workers.Wait()
	metrics := map[string]any{}
	errorsCount := 0
	for _, kind := range []string{"query", "search", "operation"} {
		values := []float64{}
		for _, s := range samples {
			if s.Kind == kind {
				values = append(values, s.Duration)
			}
			if kind == "query" && s.Failed {
				errorsCount++
			}
		}
		sort.Float64s(values)
		p95 := 0.0
		if len(values) > 0 {
			p95 = values[min(len(values)-1, int(float64(len(values))*.95))]
		}
		metrics[kind] = map[string]any{"samples": len(values), "p95Seconds": p95}
	}
	ratio := float64(errorsCount) / float64(max(1, len(samples)))
	passed := len(samples) > 0 && ratio < .01
	for _, kind := range []string{"query", "operation", "search"} {
		limit := 1.0
		if kind == "search" {
			limit = 2
		}
		metric := metrics[kind].(map[string]any)
		passed = passed && metric["samples"].(int) > 0 && metric["p95Seconds"].(float64) <= limit
	}
	result := map[string]any{"sessions": 50, "warmupSeconds": warm.Seconds(), "durationSeconds": duration.Seconds(), "metrics": metrics, "unexpectedErrorRatio": ratio, "passed": passed, "go": runtime.Version(), "cpus": runtime.NumCPU(), "requestsMeasured": len(samples)}
	if e = json.NewEncoder(os.Stdout).Encode(result); e != nil {
		return e
	}
	if !passed {
		return errors.New("laboratory performance targets not met")
	}
	return nil
}
