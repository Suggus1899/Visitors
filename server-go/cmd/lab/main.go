// lab runs only against an explicitly disposable database and never becomes an API service.
package main

import (
	"bytes"
	"context"
	"crypto/tls"
	"crypto/x509"
	"encoding/binary"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"hash/crc32"
	"image"
	"image/png"
	"io"
	"math"
	"math/rand"
	"net/http"
	"net/http/cookiejar"
	"net/url"
	"os"
	"runtime"
	"sort"
	"sync"
	"sync/atomic"
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
	openVisits := flags.Int("open-visits", 75, "unique open visits, up to 5000")
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
		if err := validateFixtureVolume(*visitors, *visits, *openVisits); err != nil {
			return errors.New("invalid laboratory volume")
		}
		return generate(c, *visitors, *visits, *openVisits)
	case "load":
		if *warm < 0 || *duration <= 0 {
			return errors.New("invalid test durations")
		}
		return load(*base, *warm, *duration)
	default:
		return errors.New("unknown lab command")
	}
}

func validateFixtureVolume(people, visits, openVisits int) error {
	if people < 100 || people > 100000 || visits < people || visits > 1000000 || openVisits < 0 || openVisits > 5000 || openVisits > people-people/200 {
		return errors.New("invalid laboratory volume")
	}
	return nil
}

func generate(c config.Config, people, total, openCount int) error {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Minute)
	defer cancel()
	openPeople := make([]int, 0, openCount)
	for person := 1; person <= people && len(openPeople) < openCount; person++ {
		if person%200 != 0 {
			openPeople = append(openPeople, person)
		}
	}
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
	photos := make([][]byte, 3)
	documents := make([][]byte, 3)
	for i, size := range []int{128 << 10, 192 << 10, 256 << 10} {
		photos[i], e = paddedPNG(int64(i+1), size)
		if e != nil {
			return e
		}
	}
	for i, size := range []int{256 << 10, 384 << 10, 512 << 10} {
		documents[i], e = paddedPNG(int64(i+11), size)
		if e != nil {
			return e
		}
	}
	for start := 0; start < people; start += 1000 {
		count := min(1000, people-start)
		rows := make([][]any, count)
		for j := range count {
			id := start + j + 1
			cedula := fmt.Sprintf("V-%08d", 40000000+id)
			ids[id-1] = security.IdentityHash(c.EncryptionKey, cedula)
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
			var anon, encryptedCedula, photograph, idPhotograph any
			encryptedCedula = encrypted
			if id%200 == 0 {
				ids[id-1] = fmt.Sprintf("anon-fixture-%d", id)
				first = "Anonimizado"
				last = ""
				company = ""
				encryptedCedula = nil
				anon = epoch
			}
			if id%200 != 0 && id%10 == 1 {
				photograph = photos[id%len(photos)]
			}
			if id%200 != 0 && id%20 == 2 {
				idPhotograph = documents[id%len(documents)]
			}
			rows[j] = []any{id, ids[id-1], encryptedCedula, first, last, company, epoch, epoch, anon, photograph, idPhotograph}
		}
		if _, e = pg.CopyFrom(ctx, pgx.Identifier{"Visitors"}, []string{"id", "cedula", "encrypted_cedula", "first_name", "last_name", "company", "createdAt", "updatedAt", "anonymizedAt", "photo_data", "id_photo_data"}, pgx.CopyFromRows(rows)); e != nil {
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
			var cancellationReason any
			if id%1000 == 0 && id <= total-openCount {
				status = "cancelled"
				exit = nil
				cancellationReason = "Cancelación ficticia de laboratorio"
			}
			if id > total-openCount {
				person = openPeople[id-(total-openCount)-1]
				status = []string{"active", "waiting", "intermittent"}[id%3]
				exit = nil
				cancellationReason = nil
			}
			rows[j] = []any{id, ids[person-1], person, "Prueba ficticia", "Responsable ficticio", at, exit, status, at, at, at, at, "Laboratorio", "Responsable ficticio", cancellationReason}
		}
		if _, e = pg.CopyFrom(ctx, pgx.Identifier{"Visits"}, []string{"id", "visitor_cedula", "visitor_id", "purpose", "person_to_visit", "check_in_time", "check_out_time", "status", "createdAt", "updatedAt", "arrival_time", "entry_time", "target_department", "host_person", "cancellation_reason"}, pgx.CopyFromRows(rows)); e != nil {
			return errors.New("fictitious visit batch failed")
		}
	}
	for _, statement := range []string{
		`SELECT setval('"Visitors_id_seq"',(SELECT max(id) FROM "Visitors"))`,
		`SELECT setval('"Visits_id_seq"',(SELECT max(id) FROM "Visits"))`,
		`ANALYZE "Visitors"`,
		`ANALYZE "Visits"`,
	} {
		if _, e = pg.Exec(ctx, statement); e != nil {
			return e
		}
	}
	if e = db.RebuildIdentity(ctx, sqlDB, c.EncryptionKey, false); e != nil {
		return e
	}
	if e = db.RebuildSearch(ctx, sqlDB, c.EncryptionKey, true); e != nil {
		return e
	}
	if _, e = pg.Exec(ctx, `ANALYZE "VisitorSearchTokens"`); e != nil {
		return e
	}
	return json.NewEncoder(os.Stdout).Encode(map[string]any{"visitors": people, "visits": total, "anonymizedVisitors": people / 200, "cancelledVisits": (total - openCount) / 1000, "openVisits": openCount, "profilePhotos": people / 10, "identityDocuments": people / 20, "sessions": 50, "generationSeconds": time.Since(started).Seconds()})
}

func paddedPNG(seed int64, targetSize int) ([]byte, error) {
	img := image.NewNRGBA(image.Rect(0, 0, 64, 64))
	rng := rand.New(rand.NewSource(seed))
	for i := 0; i < len(img.Pix); i += 4 {
		img.Pix[i], img.Pix[i+1], img.Pix[i+2], img.Pix[i+3] = byte(rng.Intn(256)), byte(rng.Intn(256)), byte(rng.Intn(256)), 255
	}
	var encoded bytes.Buffer
	if err := png.Encode(&encoded, img); err != nil {
		return nil, err
	}
	base := encoded.Bytes()
	iend := len(base) - 12
	if iend < 8 || string(base[iend+4:iend+8]) != "IEND" {
		return nil, errors.New("invalid generated PNG")
	}
	payloadSize := targetSize - len(base) - 12
	if payloadSize < 10 {
		return nil, errors.New("PNG target size is too small")
	}
	payload := make([]byte, payloadSize)
	copy(payload, "LogMaster\x00")
	const alphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_"
	for i := 10; i < len(payload); i++ {
		payload[i] = alphabet[rng.Intn(len(alphabet))]
	}
	chunk := make([]byte, 12+len(payload))
	binary.BigEndian.PutUint32(chunk, uint32(len(payload)))
	copy(chunk[4:8], "tEXt")
	copy(chunk[8:], payload)
	binary.BigEndian.PutUint32(chunk[8+len(payload):], crc32.ChecksumIEEE(chunk[4:8+len(payload)]))
	result := make([]byte, 0, targetSize)
	result = append(result, base[:iend]...)
	result = append(result, chunk...)
	result = append(result, base[iend:]...)
	if _, err := png.Decode(bytes.NewReader(result)); err != nil {
		return nil, err
	}
	return result, nil
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

func summarize(samples []sample, lostSessions int) (map[string]any, float64, bool) {
	errorsCount := 0
	for _, s := range samples {
		if s.Failed {
			errorsCount++
		}
	}
	ratio := float64(errorsCount) / float64(max(1, len(samples)))
	metrics := map[string]any{}
	passed := len(samples) > 0 && ratio < .01 && lostSessions == 0
	for _, kind := range []string{"query", "search", "operation"} {
		values := []float64{}
		for _, s := range samples {
			if s.Kind == kind {
				values = append(values, s.Duration)
			}
		}
		sort.Float64s(values)
		p95 := 0.0
		if len(values) > 0 {
			p95 = values[int(math.Ceil(float64(len(values))*.95))-1]
		}
		metrics[kind] = map[string]any{"samples": len(values), "p95Seconds": p95}
		limit := 1.0
		if kind == "search" {
			limit = 2
		}
		passed = passed && len(values) > 0 && p95 <= limit
	}
	return metrics, ratio, passed
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
	if req.Method == http.MethodPost {
		if origin := os.Getenv("LAB_APP_ORIGIN"); origin != "" {
			req.Header.Set("Origin", origin)
		}
	}
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

type loadSession struct {
	client  *http.Client
	access  string
	refresh string
}

func parseLoadTarget(base string) (*url.URL, bool, error) {
	endpoint, err := url.Parse(base)
	if err != nil || endpoint.User != nil || endpoint.RawQuery != "" || endpoint.Fragment != "" || endpoint.Path != "" && endpoint.Path != "/" {
		return nil, false, errors.New("invalid laboratory load URL")
	}
	host := endpoint.Hostname()
	allowed := host == "api" || host == "web" || host == "localhost" || host == "127.0.0.1"
	if !allowed || endpoint.Scheme != "http" && endpoint.Scheme != "https" || host == "web" && endpoint.Scheme != "https" {
		return nil, false, errors.New("load URL must be the laboratory API or HTTPS web proxy")
	}
	return endpoint, host == "web", nil
}

func loadTransport(endpoint *url.URL, fullStack bool) (*http.Transport, error) {
	transport := &http.Transport{MaxIdleConns: 100, MaxIdleConnsPerHost: 100}
	if !fullStack {
		return transport, nil
	}
	path := os.Getenv("LAB_TLS_CA_FILE")
	if path == "" {
		return nil, errors.New("LAB_TLS_CA_FILE required for HTTPS web load")
	}
	pem, err := os.ReadFile(path)
	if err != nil {
		return nil, errors.New("laboratory TLS certificate unavailable")
	}
	roots := x509.NewCertPool()
	if !roots.AppendCertsFromPEM(pem) {
		return nil, errors.New("laboratory TLS certificate invalid")
	}
	transport.TLSClientConfig = &tls.Config{RootCAs: roots, MinVersion: tls.VersionTLS12}
	return transport, nil
}

func hasSessionCookies(jar http.CookieJar, endpoint *url.URL) bool {
	access, refresh := false, false
	for _, cookie := range jar.Cookies(endpoint) {
		access = access || cookie.Name == "__Host-logmaster-access"
		refresh = refresh || cookie.Name == "__Host-logmaster-refresh"
	}
	return access && refresh
}

func load(base string, warm, duration time.Duration) error {
	endpoint, fullStack, e := parseLoadTarget(base)
	if e != nil {
		return e
	}
	password := os.Getenv("LAB_PASSWORD")
	if e = security.ValidatePassword(password); e != nil {
		return e
	}
	transport, e := loadTransport(endpoint, fullStack)
	if e != nil {
		return e
	}
	defer transport.CloseIdleConnections()
	client := &http.Client{Timeout: 10 * time.Second, Transport: transport}
	sessions := make([]loadSession, 50)
	for i := range sessions {
		if fullStack {
			jar, jarErr := cookiejar.New(nil)
			if jarErr != nil {
				return jarErr
			}
			sessions[i].client = &http.Client{Timeout: 10 * time.Second, Transport: transport, Jar: jar}
			if e = call(sessions[i].client, "POST", base+"/api/v1/auth/login", "", map[string]string{"username": fmt.Sprintf("lab%02d", i), "password": password}, nil); e != nil {
				return e
			}
			if !hasSessionCookies(jar, endpoint) {
				return errors.New("BFF login did not establish secure session cookies")
			}
			continue
		}
		sessions[i].client = client
		var auth credentials
		if e = call(client, "POST", base+"/api/v1/auth/login", "", map[string]string{"username": fmt.Sprintf("lab%02d", i), "password": password}, &auth); e != nil {
			return e
		}
		if auth.Access == "" || auth.Refresh == "" {
			return errors.New("API login did not return a session")
		}
		sessions[i].access, sessions[i].refresh = auth.Access, auth.Refresh
	}
	var mu sync.Mutex
	var lostSessions atomic.Int64
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
					started := time.Now()
					var refreshErr error
					if fullStack {
						refreshErr = call(session.client, "POST", base+"/api/v1/auth/refresh", "", nil, nil)
					} else {
						var auth credentials
						auth, refreshErr = authCall(session.client, base+"/api/v1/auth/refresh", session.refresh)
						if refreshErr == nil {
							session.access, session.refresh = auth.Access, auth.Refresh
						}
					}
					record("operation", started, refreshErr)
					if refreshErr != nil {
						lostSessions.Add(1)
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
					e = call(session.client, "GET", base+path, session.access, nil, nil)
					record(kind, start, e)
				}
				if iteration%10 == 9 {
					cedula := fmt.Sprintf("V-%08d", 80000000+worker*100000+iteration)
					body := map[string]any{"visitorCedula": cedula, "purpose": "Prueba de carga", "personToVisit": "Ficticio", "targetDepartment": "Laboratorio", "hostPerson": "Ficticio", "status": "waiting", "visitorData": map[string]string{"firstName": "Carga", "lastName": "Ficticio", "company": "Laboratorio"}, "consent": map[string]any{"accepted": true, "policyVersion": "1.0", "acceptedAt": time.Now().UTC().Format(time.RFC3339)}}
					var visit struct {
						ID int `json:"id"`
					}
					start = time.Now()
					e = call(session.client, "POST", base+"/api/v1/visits/checkin", session.access, body, &visit)
					record("operation", start, e)
					for _, transition := range []string{"admit", "intermittent-exit", "intermittent-reentry", "checkout"} {
						if e == nil {
							start = time.Now()
							e = call(session.client, "POST", fmt.Sprintf("%s/api/v1/visits/%d/%s", base, visit.ID, transition), session.access, nil, nil)
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
	failedSessions := int(lostSessions.Load())
	metrics, ratio, passed := summarize(samples, failedSessions)
	path := "api-only"
	if fullStack {
		path = "https-nginx-next-bff-cookie-sessions"
	}
	result := map[string]any{"path": path, "sessions": 50, "failedSessions": failedSessions, "warmupSeconds": warm.Seconds(), "durationSeconds": duration.Seconds(), "metrics": metrics, "unexpectedErrorRatio": ratio, "passed": passed, "go": runtime.Version(), "cpus": runtime.NumCPU(), "requestsMeasured": len(samples)}
	if e = json.NewEncoder(os.Stdout).Encode(result); e != nil {
		return e
	}
	if !passed {
		return errors.New("laboratory performance targets not met")
	}
	return nil
}

func authCall(client *http.Client, endpoint, refresh string) (credentials, error) {
	var auth credentials
	if err := call(client, "POST", endpoint, "", map[string]string{"refreshToken": refresh}, &auth); err != nil {
		return credentials{}, err
	}
	if auth.Access == "" || auth.Refresh == "" {
		return credentials{}, errors.New("API refresh did not return a session")
	}
	return auth, nil
}
