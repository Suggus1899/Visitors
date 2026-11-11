#!/usr/bin/env python3
"""Recorridos de comparación Go vs Rust (fase 7).

Ejecuta los mismos pasos contra una versión en marcha (Go o Rust) y
guarda cada respuesta normalizada en un JSON de captura. Dos capturas
(`--diff a.json b.json`) se comparan paso a paso: mismo código HTTP y
mismo cuerpo normalizado.

Solo biblioteca estándar. No necesita credenciales nuevas: usa los
usuarios sembrados por `run-go.sh` / `run-rust.sh`
(operador/admin/auditor/root, contraseña en `FASE7_PASSWORD`).

Uso:
    python3 compare.py --base http://127.0.0.1:18081 --out captura-go.json --label go
    python3 compare.py --base http://127.0.0.1:18085 --out captura-rust.json --label rust
    python3 compare.py --diff captura-go.json captura-rust.json

Normalización (lo volátil no se compara): ids numéricos, tokens,
fechas/horas, hashes y huellas pasan a marcadores. Lo que sí se
compara: códigos, `success`, `error.code`, estados, totales,
paginación, roles y textos de error.

Diferencias conocidas y esperadas (no son fallos del arnés):
  - Ruta o método desconocido: Go devuelve el sobre de error
    (`NOT_FOUND` / `METHOD_NOT_ALLOWED`); Axum devuelve 404/405 sin
    cuerpo. El paso queda como DIFERENCIA DOCUMENTADA.
  - `GET /health` (salud del proceso) solo existe en Rust; en Go esa
    ruta es del frontend Next.js retirado. Se registra por separado.
"""

import argparse
import json
import re
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone

PNG_1X1 = (
    "data:image/png;base64,"
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
)

# Claves cuyo valor es volátil y se sustituye por un marcador.
VOLATILE_KEYS = {
    "id", "userId", "visitorId", "visitId", "entityId", "requestId",
    "token", "accessToken", "refreshToken", "csrfToken",
    "createdAt", "updatedAt", "checkInTime", "checkOutTime", "arrivalTime",
    "entryTime", "exitTime", "acceptedAt", "resolvedAt", "requestedAt",
    "lastLoginAt", "passwordChangedAt", "expiresAt", "absoluteExpiresAt",
    "sessionStartedAt", "iat", "exp", "tokenVersion",
    "subjectCedulaHash", "cedulaHash", "identityHash", "searchHash",
    "passwordHash", "photoHash", "hash", "fingerprint", "sha256",
}
VOLATILE_SUFFIXES = ("At", "Hash", "Token", "Id")
TIME_RE = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}")
HEX_RE = re.compile(r"^[0-9a-f]{32,}$")


def normalize(value, key=""):
    """Sustituye valores volátiles por marcadores estables."""
    if isinstance(value, dict):
        return {k: normalize(v, k) for k, v in value.items()}
    if isinstance(value, list):
        return [normalize(v, key) for v in value]
    if isinstance(value, str):
        low = key.lower()
        if key in VOLATILE_KEYS or key.endswith(VOLATILE_SUFFIXES) or low.endswith("hash"):
            return "<V>"
        if TIME_RE.match(value):
            return "<T>"
        if HEX_RE.match(value) and len(value) >= 32:
            return "<H>"
        if key in ("username",) or low in ("username",):
            return value
        return value
    if isinstance(value, (int, float)) and key in (
        "id", "userId", "visitorId", "visitId", "entityId",
    ):
        return "<N>"
    return value


def normalize_body(body, content_type):
    if body is None:
        return None
    if "text/csv" in content_type or "text/plain" in content_type:
        text = body.decode("utf-8", "replace")
        # El CSV de auditoría lleva fechas; se normaliza línea a línea.
        lines = []
        for line in text.splitlines():
            line = TIME_RE.sub("<T>", line)
            line = re.sub(r"\b\d+\b", "<N>", line, count=1) if line and line[0].isdigit() else line
            lines.append(line)
        return {"csv_lines": lines}
    if "application/json" in content_type or body[:1] in (b"{", b"["):
        try:
            return normalize(json.loads(body.decode("utf-8", "replace")))
        except json.JSONDecodeError:
            return {"raw": body.decode("utf-8", "replace")[:500]}
    if body[:8] == b"%PDF":
        return {"pdf": True, "bytes": len(body)}
    if body[:2] == b"PK":
        return {"xlsx": True, "bytes": len(body)}
    if body[:8] == b"\x89PNG\r\n\x1a\n":
        return {"png": True, "bytes": len(body)}
    return {"raw_bytes": len(body), "content_type": content_type}


class Client:
    def __init__(self, base, origin):
        self.base = base.rstrip("/")
        self.origin = origin
        self.tokens = {}

    def call(self, method, path, token=None, body=None, raw_headers=None, timeout=15):
        url = self.base + path
        data = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(url, data=data, method=method)
        req.add_header("Content-Type", "application/json")
        if method in ("POST", "PATCH", "PUT", "DELETE"):
            req.add_header("Origin", self.origin)
        if token:
            req.add_header("Authorization", "Bearer " + token)
        if raw_headers:
            for k, v in raw_headers.items():
                req.add_header(k, v)
        start = time.monotonic()
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                raw = resp.read()
                status = resp.status
                ctype = resp.headers.get("Content-Type", "")
        except urllib.error.HTTPError as e:
            raw = e.read()
            status = e.code
            ctype = e.headers.get("Content-Type", "")
        except Exception as e:  # conexión caída, timeout, TLS
            return {"status": 0, "body": {"transport_error": type(e).__name__}, "ms": 0}
        ms = round((time.monotonic() - start) * 1000, 1)
        try:
            raw_json = json.loads(raw.decode("utf-8", "replace"))
        except (json.JSONDecodeError, UnicodeDecodeError):
            raw_json = None
        # `raw` es solo para que el recorrido encadene ids reales; en la
        # captura guardada solo queda `body` (normalizado, sin tokens).
        return {"status": status, "body": normalize_body(raw, ctype),
                "raw": raw_json, "ms": ms}

    def login(self, username, password):
        r = self.call("POST", "/api/v1/auth/login",
                      body={"username": username, "password": password})
        if r["status"] == 200 and isinstance(r["raw"], dict):
            data = r["raw"].get("data") or {}
            self.tokens[username] = data.get("accessToken", "")
        return r

    def sse_first(self, token, timeout=6):
        """GET SSE y devuelve el estado y el primer fragmento."""
        url = self.base + "/api/v1/events/visits"
        req = urllib.request.Request(url, method="GET")
        req.add_header("Authorization", "Bearer " + token)
        req.add_header("Accept", "text/event-stream")
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                chunk = resp.read(400).decode("utf-8", "replace")
                return {"status": resp.status,
                        "body": {"sse_first": re.sub(r"\d{4}-\d{2}-\d{2}T[^\s\"}]*", "<T>", chunk)[:300]}}
        except urllib.error.HTTPError as e:
            return {"status": e.code, "body": {"error": e.read().decode("utf-8", "replace")[:200]}}
        except Exception as e:
            return {"status": 0, "body": {"transport_error": type(e).__name__}}


def now_iso():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def checkin_body(cedula, status="waiting", first="Prueba", last="Comparación"):
    return {
        "visitorCedula": cedula,
        "purpose": "Reunión",
        "personToVisit": "Responsable Ficticio",
        "targetDepartment": "Producción",
        "hostPerson": "Jefe de turno",
        "status": status,
        "action": "Descarga",
        "visitorData": {
            "firstName": first, "lastName": last,
            "company": "Laboratorio", "photoBase64": PNG_1X1,
        },
        "consent": {"accepted": True, "policyVersion": "v1", "acceptedAt": now_iso()},
    }


def run(base, label, password):
    origin = base  # mismo origen que el servidor
    c = Client(base, origin)
    steps = []

    def step(name, result, expect=None):
        entry = {"name": name, "status": result["status"], "body": result["body"]}
        if "ms" in result:
            entry["ms"] = result["ms"]
        if expect is not None:
            entry["expect"] = expect
            entry["ok"] = result["status"] == expect
        steps.append(entry)
        return result

    op = au = ad = ro = None

    # Salud (sin autenticación).
    step("health api", c.call("GET", "/api/v1/health"), 200)
    step("health proceso", c.call("GET", "/health"))  # 200 en Rust, 404 en Go

    # Auth: errores y sesión.
    step("login credenciales malas", c.call(
        "POST", "/api/v1/auth/login",
        body={"username": "operador", "password": "mala"}), 401)
    step("login operador", c.login("operador", password), 200)
    op = c.tokens.get("operador")
    step("login admin", c.login("admin", password), 200)
    ad = c.tokens.get("admin")
    step("login auditor", c.login("auditor", password), 200)
    au = c.tokens.get("auditor")
    step("login root", c.login("root", password), 200)
    ro = c.tokens.get("root")
    step("sesión sin token", c.call("GET", "/api/v1/auth/session"), 401)
    step("sesión operador", c.call("GET", "/api/v1/auth/session", token=op), 200)

    # Matriz de roles: misma ruta, 5 roles (demo no tiene usuario
    # sembrado; se cubre en la prueba de paridad en proceso).
    for path in ("/api/v1/visits", "/api/v1/audit/logs",
                 "/api/v1/superadmin/users", "/api/v1/backups"):
        for name, tok in (("operador", op), ("admin", ad),
                          ("auditor", au), ("root", ro)):
            step(f"roles {path} como {name}",
                 c.call("GET", path, token=tok))

    # J1: check-in completo con consentimiento y foto.
    r = step("J1 check-in waiting", c.call(
        "POST", "/api/v1/visits/checkin", token=op,
        body=checkin_body("V-10000001")), 201)
    visit_id = None
    if isinstance(r["raw"], dict):
        data = r["raw"].get("data") or {}
        visit_id = data.get("id")
    step("J1 check-in duplicado (misma cédula, visita abierta)",
         c.call("POST", "/api/v1/visits/checkin", token=op,
                body=checkin_body("V-10000001", status="active")), 409)
    step("J1 foto del visitante", c.call(
        "GET", "/api/v1/visitors/V-10000001/photo", token=op), 200)

    # J2: ciclo completo waiting -> admitir -> salida temporal ->
    # reingreso -> salida definitiva, con sus 409 de estado inválido.
    if visit_id not in (None, "<N>"):
        step("J2 admitir", c.call(
            "POST", f"/api/v1/visits/{visit_id}/admit", token=op, body={}), 200)
        step("J2 admitir de nuevo (estado inválido)", c.call(
            "POST", f"/api/v1/visits/{visit_id}/admit", token=op, body={}), 409)
        step("J2 salida temporal", c.call(
            "POST", f"/api/v1/visits/{visit_id}/intermittent", token=op, body={}), 200)
        step("J2 reingreso", c.call(
            "POST", f"/api/v1/visits/{visit_id}/reactivate", token=op, body={}), 200)
        step("J2 salida definitiva", c.call(
            "POST", f"/api/v1/visits/{visit_id}/checkout", token=op, body={}), 200)
        step("J2 salida de nuevo (estado inválido)", c.call(
            "POST", f"/api/v1/visits/{visit_id}/checkout", token=op, body={}), 409)
        step("J2 detalle de la visita", c.call(
            "GET", f"/api/v1/visits/{visit_id}/edit-history", token=op), 200)

    # Cancelación en espera con motivo, y sin motivo.
    r = step("J2b check-in waiting para cancelar", c.call(
        "POST", "/api/v1/visits/checkin", token=op,
        body=checkin_body("V-10000002")), 201)
    vid2 = (r["raw"].get("data") or {}).get("id") if isinstance(r["raw"], dict) else None
    if vid2 not in (None, "<N>"):
        step("J2b cancelar sin motivo", c.call(
            "POST", f"/api/v1/visits/{vid2}/cancel", token=op, body={}), 400)
        step("J2b cancelar con motivo", c.call(
            "POST", f"/api/v1/visits/{vid2}/cancel", token=op,
            body={"reason": "No vino"}), 200)

    # J3: privacidad / ARCO.
    step("J3 crear solicitud ARCO (acceso)", c.call(
        "POST", "/api/v1/privacy/arco-requests", token=op,
        body={"requestType": "access", "cedula": "V-10000001",
              "requestedByName": "Prueba Comparación",
              "contactEmail": "prueba@example.com",
              "reason": "Comparación fase 7"}), 201)
    step("J3 listar ARCO como operador (denegado)", c.call(
        "GET", "/api/v1/privacy/arco-requests", token=op), 403)
    r = step("J3 listar ARCO como auditor", c.call(
        "GET", "/api/v1/privacy/arco-requests", token=au), 200)
    arco_id = None
    if isinstance(r["raw"], dict):
        data = r["raw"].get("data") or {}
        items = data.get("requests") or data.get("items") or []
        if items:
            arco_id = items[0].get("id")
    step("J3 consulta del titular como auditor", c.call(
        "GET", "/api/v1/privacy/subjects/V-10000001", token=au), 200)
    if arco_id not in (None, "<N>"):
        step("J3 cambiar estado como operador (denegado)", c.call(
            "PATCH", f"/api/v1/privacy/arco-requests/{arco_id}/status",
            token=op, body={"status": "completed"}), 403)
        step("J3 cambiar estado como admin", c.call(
            "PATCH", f"/api/v1/privacy/arco-requests/{arco_id}/status",
            token=ad, body={"status": "completed",
                            "resolutionNotes": "Entregado"}), 200)

    # J4: consultas, reportes, auditoría, exportación.
    step("J4 lista filtrada de visitas", c.call(
        "GET", "/api/v1/visits?limit=10&page=1", token=op), 200)
    step("J4 visitas en espera", c.call("GET", "/api/v1/visits/waiting", token=op), 200)
    step("J4 búsqueda corta", c.call(
        "GET", "/api/v1/visits?search=ab", token=op), 400)
    step("J4 búsqueda por cédula", c.call(
        "GET", "/api/v1/visits?search=V-10000001", token=op), 200)
    step("J4 búsqueda de visitantes", c.call(
        "GET", "/api/v1/visitors?search=Pru", token=op), 200)
    step("J4 detalle de visitante", c.call(
        "GET", "/api/v1/visitors/V-10000001", token=op), 200)
    step("J4 calendario 62 días", c.call(
        "GET", "/api/v1/visits/calendar?startDate=2026-11-01&endDate=2026-12-31",
        token=op), 200)
    step("J4 calendario 63 días", c.call(
        "GET", "/api/v1/visits/calendar?startDate=2026-11-01&endDate=2027-01-03",
        token=op), 400)
    step("J4 estadísticas de reportes", c.call(
        "GET", "/api/v1/reports/stats", token=ad), 200)
    step("J4 estadísticas de auditoría", c.call(
        "GET", "/api/v1/audit/stats", token=au), 200)
    step("J4 bitácora", c.call("GET", "/api/v1/audit/logs?limit=10", token=au), 200)
    step("J4 exportación CSV de auditoría", c.call(
        "GET", "/api/v1/audit/export", token=au), 200)
    # Exportación: Go devuelve la instantánea JSON (el cliente Next.js
    # generaba el archivo); Rust genera el binario en el servidor
    # (fase 6). Mismo código 200, cuerpo distinto por diseño: la
    # diferencia queda registrada en el diff, no como fallo.
    step("J4 exportación XLSX de visitas", c.call(
        "GET", "/api/v1/visits/export?format=xlsx", token=op), 200)
    step("J4 exportación PDF de visitas", c.call(
        "GET", "/api/v1/visits/export?format=pdf", token=op), 200)
    step("J4 exportación con formato inválido", c.call(
        "GET", "/api/v1/visits/export?format=json", token=op), 400)

    # J5: errores de contrato.
    # El historial por visita no comprueba que la visita exista en
    # ninguna de las dos versiones: lista vacía con 200.
    step("J5 visita inexistente", c.call(
        "GET", "/api/v1/visits/999999/edit-history", token=op), 200)
    step("J5 ruta desconocida", c.call("GET", "/api/v1/no-existe", token=op), 404)
    step("J5 método no permitido", c.call(
        "DELETE", "/api/v1/visits", token=op), 405)
    # Ambas versiones responden 200 con {"valid": false} ante una
    # contraseña de edición incorrecta (el campo es `password`).
    step("J5 verificar contraseña de edición (mala)", c.call(
        "POST", "/api/v1/visitors/verify-edit-password", token=op,
        body={"password": "mala"}), 200)
    step("J5 SSE primer fragmento", c.sse_first(op))

    # Superadmin: root crea un usuario y lo borra (cierra el círculo).
    # Crear usuario: Go responde 200 (no 201); Rust, igual.
    r = step("J4 root crea usuario temporal", c.call(
        "POST", "/api/v1/superadmin/users", token=ro,
        body={"username": "temporal7", "email": "t7@example.com",
              "password": "Temporal!7Segura", "role": "demo"}), 200)
    uid = (r["raw"].get("data") or {}).get("id") if isinstance(r["raw"], dict) else None
    step("J4 admin crea usuario (denegado)", c.call(
        "POST", "/api/v1/superadmin/users", token=ad,
        body={"username": "temporal8", "email": "t8@example.com",
              "password": "Temporal!8Segura", "role": "demo"}), 403)
    if uid not in (None, "<N>"):
        step("J4 root borra usuario temporal", c.call(
            "DELETE", f"/api/v1/superadmin/users/{uid}", token=ro), 200)

    failed = [s for s in steps if "ok" in s and not s["ok"]]
    return {"label": label, "base": base, "at": now_iso(), "steps": steps,
            "total": len(steps), "failed_expectations": len(failed),
            "failed_names": [s["name"] for s in failed]}


def diff(a, b):
    by_name_a = {s["name"]: s for s in a["steps"]}
    by_name_b = {s["name"]: s for s in b["steps"]}
    names = sorted(set(by_name_a) | set(by_name_b))
    same = diffs = missing = 0
    print(f"{'paso':58} {'go':>4} {'rust':>4}  veredicto")
    print("-" * 100)
    for name in names:
        sa, sb = by_name_a.get(name), by_name_b.get(name)
        if sa is None or sb is None:
            missing += 1
            print(f"{name:58} {'--':>4} {'--':>4}  FALTA EN UNA CAPTURA")
            continue
        if sa["status"] == sb["status"] and sa["body"] == sb["body"]:
            same += 1
            print(f"{name:58} {sa['status']:>4} {sb['status']:>4}  igual")
        else:
            diffs += 1
            print(f"{name:58} {sa['status']:>4} {sb['status']:>4}  DIFERENCIA")
            if sa["status"] != sb["status"]:
                print(f"    códigos: {a['label']}={sa['status']} {b['label']}={sb['status']}")
            if sa["body"] != sb["body"]:
                print(f"    cuerpo {a['label']}: {json.dumps(sa['body'], ensure_ascii=False)[:300]}")
                print(f"    cuerpo {b['label']}: {json.dumps(sb['body'], ensure_ascii=False)[:300]}")
    print("-" * 100)
    print(f"iguales={same} diferencias={diffs} faltantes={missing} "
          f"total={len(names)}")
    return diffs


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--base")
    p.add_argument("--out")
    p.add_argument("--label", default="?")
    p.add_argument("--password", default="Private!Safe12Á")
    p.add_argument("--diff", nargs=2, metavar=("A.json", "B.json"))
    args = p.parse_args()
    if args.diff:
        with open(args.diff[0]) as f:
            a = json.load(f)
        with open(args.diff[1]) as f:
            b = json.load(f)
        n = diff(a, b)
        sys.exit(1 if n else 0)
    if not args.base or not args.out:
        p.error("--base y --out son obligatorios sin --diff")
    result = run(args.base, args.label, args.password)
    with open(args.out, "w") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
    print(f"{result['label']}: {result['total']} pasos, "
          f"expectativas fallidas: {result['failed_expectations']}")
    for name in result["failed_names"]:
        print(f"  FALLO: {name}")
    sys.exit(1 if result["failed_expectations"] else 0)


if __name__ == "__main__":
    main()
