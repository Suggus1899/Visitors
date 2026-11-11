#!/usr/bin/env python3
"""Carga pequeña de la fase 7: 100 perfiles / 1.000 visitas.

Siembra por la API (check-in + salida) y mide después la mezcla de
lecturas y escrituras, con el mismo p95 de rango más cercano que el
`lab` de Go (`summarize`: `valores[ceil(0.95*n)-1]` sobre muestras
ordenadas) y el mismo criterio de aceptación (p95 <= 1 s en
consulta/operación, <= 2 s en búsqueda; errores < 1 %).

Solo biblioteca estándar. El servidor debe arrancar con el límite
general de peticiones levantado (`RATE_LIMIT_MAX_REQUESTS=100000` en
ambas versiones; el límite en sí se verifica en sus pruebas propias),
sobre una base vacía con los 4 usuarios sembrados (ver `run-go.sh` /
`run-rust.sh`).

Uso:
    python3 load.py --base http://127.0.0.1:18081 --out carga-go.json --label go
    python3 load.py --base http://127.0.0.1:18085 --out carga-rust.json --label rust

Siembra: 100 perfiles (V-20000001..V-20100000); cada uno con 9
visitas completadas (check-in active + checkout) y 1 visita en espera.
Total: 1.000 visitas, 100 abiertas en espera, 900 completadas.
"""

import argparse
import json
import math
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone

sys.path.insert(0, __file__.rsplit("/", 1)[0])
from compare import Client, checkin_body, now_iso  # noqa: E402


def p95(values):
    if not values:
        return None
    ordered = sorted(values)
    return ordered[math.ceil(len(ordered) * 0.95) - 1]


def measure(client, method, path, token, body, samples, label):
    lat = []
    errors = 0
    codes = {}
    for _ in range(samples):
        r = client.call(method, path, token=token, body=body)
        lat.append(r["ms"])
        codes[r["status"]] = codes.get(r["status"], 0) + 1
        if r["status"] >= 400:
            errors += 1
    return {
        "route": label,
        "samples": samples,
        "p50_ms": sorted(lat)[len(lat) // 2],
        "p95_ms": p95(lat),
        "max_ms": max(lat),
        "errors": errors,
        "codes": {str(k): v for k, v in sorted(codes.items())},
    }


def run(base, label, password, profiles=100, visits_per_profile=10, samples=50):
    c = Client(base, base)
    c.login("operador", password)
    op = c.tokens.get("operador")
    c.login("admin", password)
    ad = c.tokens.get("admin")
    c.login("auditor", password)
    au = c.tokens.get("auditor")
    if not op:
        print("FALLO: login de operador", file=sys.stderr)
        sys.exit(2)

    # --- Siembra por la API ---
    t0 = time.monotonic()
    seeded_visits = 0
    first_visit_id = None
    for i in range(1, profiles + 1):
        cedula = f"V-{20000000 + i}"
        for j in range(visits_per_profile - 1):
            r = c.call("POST", "/api/v1/visits/checkin", token=op,
                       body=checkin_body(cedula, status="active",
                                         first=f"Perfil{i}", last="Carga"))
            if r["status"] != 201:
                print(f"FALLO siembra check-in {cedula} #{j}: {r['status']} "
                      f"{json.dumps(r['body'], ensure_ascii=False)[:200]}",
                      file=sys.stderr)
                sys.exit(2)
            vid = (r["raw"] or {}).get("data", {}).get("id")
            if first_visit_id is None:
                first_visit_id = vid
            r = c.call("POST", f"/api/v1/visits/{vid}/checkout", token=op, body={})
            if r["status"] != 200:
                print(f"FALLO siembra checkout {vid}: {r['status']}", file=sys.stderr)
                sys.exit(2)
            seeded_visits += 1
        r = c.call("POST", "/api/v1/visits/checkin", token=op,
                   body=checkin_body(cedula, status="waiting",
                                     first=f"Perfil{i}", last="Carga"))
        if r["status"] != 201:
            print(f"FALLO siembra waiting {cedula}: {r['status']}", file=sys.stderr)
            sys.exit(2)
        seeded_visits += 1
    seed_s = round(time.monotonic() - t0, 1)

    # --- Comprobación de conteos ---
    # La lista filtrada trae {"visits": [...], "total": N}; las listas
    # por estado traen la lista directa en `data`.
    totals = {}
    for name, path in (("total", "/api/v1/visits?limit=1&page=1"),
                       ("waiting", "/api/v1/visits/waiting"),
                       ("active", "/api/v1/visits/active")):
        r = c.call("GET", path, token=op)
        data = (r["raw"] or {}).get("data")
        if isinstance(data, dict):
            totals[name] = data.get("total")
        elif isinstance(data, list):
            totals[name] = len(data)
        else:
            totals[name] = None

    # --- Medición ---
    results = []
    results.append(measure(c, "GET", "/api/v1/health", None, None, samples, "GET /api/v1/health"))
    results.append(measure(c, "GET", "/api/v1/visits/waiting?limit=10&page=1", op, None,
                           samples, "GET /api/v1/visits/waiting"))
    results.append(measure(c, "GET", "/api/v1/visits/active?limit=10&page=1", op, None,
                           samples, "GET /api/v1/visits/active"))
    results.append(measure(c, "GET", "/api/v1/visits?limit=10&page=1", op, None,
                           samples, "GET /api/v1/visits (filtrada)"))
    results.append(measure(c, "GET", "/api/v1/visits?search=V-20000042", op, None,
                           samples, "GET /api/v1/visits?search=cedula"))
    results.append(measure(c, "GET", "/api/v1/visitors?search=Perfil42", op, None,
                           samples, "GET /api/v1/visitors?search=nombre"))
    results.append(measure(c, "GET", "/api/v1/visitors/V-20000042", op, None,
                           samples, "GET /api/v1/visitors/{cedula}"))
    results.append(measure(c, "GET", f"/api/v1/visits/{first_visit_id}/edit-history", op, None,
                           samples, "GET /api/v1/visits/{id}/edit-history"))
    results.append(measure(c, "GET",
                           "/api/v1/visits/calendar?startDate=2026-11-01&endDate=2026-12-31",
                           op, None, samples, "GET /api/v1/visits/calendar (61 días)"))
    results.append(measure(c, "GET", "/api/v1/reports/stats", ad, None,
                           samples, "GET /api/v1/reports/stats"))
    results.append(measure(c, "GET", "/api/v1/audit/logs?limit=10&page=1", au, None,
                           samples, "GET /api/v1/audit/logs"))
    results.append(measure(c, "GET", "/api/v1/visits/export?format=xlsx", op, None,
                           samples, "GET /api/v1/visits/export?format=xlsx"))

    # Escrituras: ciclo check-in + checkout con cédula nueva cada vez.
    write_lat, write_err, write_codes = [], 0, {}
    for k in range(samples):
        cedula = f"V-{30000000 + k}"
        r = c.call("POST", "/api/v1/visits/checkin", token=op,
                   body=checkin_body(cedula, status="active",
                                     first="Carga", last="Escritura"))
        write_lat.append(r["ms"])
        write_codes[r["status"]] = write_codes.get(r["status"], 0) + 1
        if r["status"] != 201:
            write_err += 1
            continue
        vid = (r["raw"] or {}).get("data", {}).get("id")
        r2 = c.call("POST", f"/api/v1/visits/{vid}/checkout", token=op, body={})
        write_lat.append(r2["ms"])
        write_codes[r2["status"]] = write_codes.get(r2["status"], 0) + 1
        if r2["status"] != 200:
            write_err += 1
    results.append({
        "route": "POST check-in + checkout (ciclo)",
        "samples": len(write_lat),
        "p50_ms": sorted(write_lat)[len(write_lat) // 2],
        "p95_ms": p95(write_lat),
        "max_ms": max(write_lat),
        "errors": write_err,
        "codes": {str(k): v for k, v in sorted(write_codes.items())},
    })

    total_samples = sum(r["samples"] for r in results)
    total_errors = sum(r["errors"] for r in results)
    return {
        "label": label, "base": base, "at": now_iso(),
        "seed": {"profiles": profiles, "visits": seeded_visits,
                 "seconds": seed_s, "totals": totals},
        "routes": results,
        "total_samples": total_samples, "total_errors": total_errors,
        "error_ratio": round(total_errors / max(1, total_samples), 4),
    }


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--base", required=True)
    p.add_argument("--out", required=True)
    p.add_argument("--label", default="?")
    p.add_argument("--password", default="Private!Safe12Á")
    p.add_argument("--profiles", type=int, default=100)
    p.add_argument("--visits-per-profile", type=int, default=10)
    p.add_argument("--samples", type=int, default=50)
    args = p.parse_args()
    result = run(args.base, args.label, args.password,
                 args.profiles, args.visits_per_profile, args.samples)
    with open(args.out, "w") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
    print(f"{result['label']}: siembra {result['seed']['visits']} visitas "
          f"en {result['seed']['seconds']} s; totales={result['seed']['totals']}")
    print(f"{'ruta':52} {'n':>4} {'p50':>7} {'p95':>7} {'máx':>7} {'err':>4}")
    for r in result["routes"]:
        print(f"{r['route']:52} {r['samples']:>4} {r['p50_ms']:>7} "
              f"{r['p95_ms']:>7} {r['max_ms']:>7} {r['errors']:>4}")
    print(f"errores totales: {result['total_errors']}/{result['total_samples']} "
          f"({result['error_ratio']:.2%})")


if __name__ == "__main__":
    main()
