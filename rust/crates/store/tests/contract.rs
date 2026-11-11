//! Pruebas de contrato del doble motor: los mismos casos contra
//! SQLite en memoria y contra el PostgreSQL 16 local.
//!
//! Cada caso corre en ambos motores con los mismos datos y las
//! mismas aserciones: misma máquina de estados de visitas, mismas
//! restricciones y mismos códigos de error. Los casos no comparten
//! datos entre sí: cada uno usa una etiqueta única (proceso +
//! contador), así que pueden correr en paralelo contra la misma base
//! PostgreSQL sin chocar en los índices de unicidad.
//!
//! PostgreSQL: cadena en `LOGMASTER_TEST_PG_URL`, o la base local de
//! pruebas (`logmaster_pg_test`, rol `logmaster_test`, solo VM local).
//! Si no está disponible y la variable no se fijó, los casos PG se
//! omiten con un aviso visible; si la variable se fijó y no conecta,
//! la prueba falla (no se finge la verificación).

use std::sync::atomic::{AtomicU64, Ordering};

use logmaster_store::error::StoreError;
use logmaster_store::repos::audit::AuditEntry;
use logmaster_store::repos::users::NewUser;
use logmaster_store::repos::visitors::NewVisitor;
use logmaster_store::repos::visits::{NewVisit, Transition};
use logmaster_store::repos::Actor;
use logmaster_store::{Database, DatabaseConfig, DatabaseEngine, Repositories, Store};

const NOW: &str = "2026-11-10T00:00:00.000000Z";
const LATER: &str = "2026-11-10T01:00:00.000000Z";
const DEFAULT_PG_URL: &str =
    "postgres://logmaster_test:logmaster-test-only-local@127.0.0.1:5432/logmaster_pg_test";

static COUNTER: AtomicU64 = AtomicU64::new(0);

fn tag() -> String {
    let n = COUNTER.fetch_add(1, Ordering::SeqCst);
    format!("t{}-{}", std::process::id(), n)
}

fn assert_code(err: &StoreError, code: &str) {
    assert_eq!(err.code(), code, "error inesperado: {err:?}");
}

async fn sqlite_db() -> Database {
    let store = Store::open(":memory:".as_ref()).unwrap();
    store.migrate().unwrap();
    Database::Sqlite(store)
}

/// Base PostgreSQL local, si está disponible. `None` = se omite el
/// caso PG (con aviso); si `LOGMASTER_TEST_PG_URL` está fijada y no
/// conecta, la prueba falla.
async fn pg_db() -> Option<Database> {
    let explicit = std::env::var("LOGMASTER_TEST_PG_URL").ok();
    let url = explicit
        .clone()
        .unwrap_or_else(|| DEFAULT_PG_URL.to_string());
    let config = DatabaseConfig {
        engine: DatabaseEngine::Postgres,
        sqlite_path: Default::default(),
        postgres_url: Some(url.clone()),
    };
    match Database::open(&config).await {
        Ok(db) => {
            db.migrate().await.unwrap();
            Some(db)
        }
        Err(e) => {
            if explicit.is_some() {
                panic!("LOGMASTER_TEST_PG_URL no conecta ({url}): {e:#}");
            }
            eprintln!(
                "AVISO: PostgreSQL local no disponible ({e:#}); se omiten los casos PG del contrato"
            );
            None
        }
    }
}

/// Corre un caso contra SQLite siempre y contra PostgreSQL si está
/// disponible. El caso recibe los repositorios y una etiqueta única.
async fn run_case<F, Fut>(case: F)
where
    F: Fn(Repositories, String) -> Fut,
    Fut: std::future::Future<Output = ()>,
{
    let db = sqlite_db().await;
    case(db.repositories(), tag()).await;
    if let Some(db) = pg_db().await {
        case(db.repositories(), tag()).await;
    }
}

fn seed_visitor(repos: &Repositories, cedula_hash: &str) -> impl std::future::Future<Output = i64> {
    let repos = repos.clone();
    let cedula_hash = cedula_hash.to_string();
    async move {
        repos
            .visitors
            .insert(&NewVisitor {
                cedula_hash: &cedula_hash,
                encrypted_cedula: None,
                first_name: "Ana",
                last_name: "Pérez",
                company: "Trébol",
                job_title: None,
                email: None,
                phone: None,
                photo_data: None,
                id_photo_data: None,
                created_at: NOW,
                updated_at: NOW,
            })
            .await
            .unwrap()
    }
}

fn checkin(
    repos: &Repositories,
    visitor_id: i64,
    cedula_hash: &str,
) -> impl std::future::Future<Output = i64> {
    let repos = repos.clone();
    let cedula_hash = cedula_hash.to_string();
    async move {
        repos
            .visits
            .insert_checkin(&NewVisit {
                visitor_cedula: &cedula_hash,
                visitor_id,
                purpose: "Reunión",
                person_to_visit: "Anfitrión",
                status: "waiting",
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
                entry_time: None,
                check_in_time: NOW,
                consent_policy_version: "v1",
                consent_accepted_at: NOW,
                consent_recorded_by: 1,
                created_at: NOW,
                updated_at: NOW,
            })
            .await
            .unwrap()
    }
}

fn actor() -> Actor {
    Actor {
        id: 1,
        username: "root".to_string(),
    }
}

#[tokio::test]
async fn visit_full_cycle() {
    run_case(|repos, tag| async move {
        let cedula = format!("hash-{tag}");
        let visitor_id = seed_visitor(&repos, &cedula).await;
        let visit_id = checkin(&repos, visitor_id, &cedula).await;

        let visit = repos
            .visits
            .transition(visit_id, Transition::Admit, &actor(), None, None, LATER)
            .await
            .unwrap();
        assert_eq!(visit.status.as_deref(), Some("active"));
        assert_eq!(visit.entry_time.as_deref(), Some(LATER));

        let visit = repos
            .visits
            .transition(
                visit_id,
                Transition::Exit,
                &actor(),
                Some("Almuerzo"),
                None,
                LATER,
            )
            .await
            .unwrap();
        assert_eq!(visit.status.as_deref(), Some("intermittent"));
        let logs = repos.visits.visit_logs(visit_id).await.unwrap();
        assert_eq!(logs.len(), 1);
        assert_eq!(logs[0].re_entry, None);
        assert_eq!(logs[0].notes.as_deref(), Some("Almuerzo"));

        let visit = repos
            .visits
            .transition(visit_id, Transition::Reentry, &actor(), None, None, LATER)
            .await
            .unwrap();
        assert_eq!(visit.status.as_deref(), Some("active"));
        let logs = repos.visits.visit_logs(visit_id).await.unwrap();
        assert_eq!(logs[0].re_entry.as_deref(), Some(LATER));

        let visit = repos
            .visits
            .transition(
                visit_id,
                Transition::Checkout,
                &actor(),
                Some("Salió"),
                None,
                LATER,
            )
            .await
            .unwrap();
        assert_eq!(visit.status.as_deref(), Some("completed"));
        assert_eq!(visit.check_out_time.as_deref(), Some(LATER));

        // La auditoría del ciclo quedó en la misma base.
        let logs = repos.audit.list_recent(50).await.unwrap();
        let actions: Vec<&str> = logs.iter().map(|l| l.action.as_str()).collect();
        for action in [
            "VISIT_ADMIT",
            "VISIT_INTERMITTENT_EXIT",
            "VISIT_REENTRY",
            "VISIT_CHECKOUT",
        ] {
            assert!(actions.contains(&action), "falta {action} en {actions:?}");
        }
    })
    .await;
}

#[tokio::test]
async fn open_visit_duplicate_is_conflict() {
    run_case(|repos, tag| async move {
        let cedula = format!("hash-{tag}");
        let visitor_id = seed_visitor(&repos, &cedula).await;
        checkin(&repos, visitor_id, &cedula).await;
        // Segunda visita abierta para la misma identidad.
        let err = repos
            .visits
            .insert_checkin(&NewVisit {
                visitor_cedula: &cedula,
                visitor_id,
                purpose: "Reunión",
                person_to_visit: "Anfitrión",
                status: "waiting",
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
                entry_time: None,
                check_in_time: NOW,
                consent_policy_version: "v1",
                consent_accepted_at: NOW,
                consent_recorded_by: 1,
                created_at: NOW,
                updated_at: NOW,
            })
            .await
            .unwrap_err();
        assert_code(&err, "OPEN_VISIT_EXISTS");
        // Y la visita original sigue ahí, en espera.
        let waiting = repos.visits.list_by_status("waiting", 10, 0).await.unwrap();
        assert!(waiting
            .iter()
            .any(|v| v.id > 0 && v.visitor_id == Some(visitor_id)));
    })
    .await;
}

#[tokio::test]
async fn invalid_transitions_are_conflicts() {
    run_case(|repos, tag| async move {
        let cedula = format!("hash-{tag}");
        let visitor_id = seed_visitor(&repos, &cedula).await;
        let visit_id = checkin(&repos, visitor_id, &cedula).await;
        // Salir desde `waiting` no es válido.
        let err = repos
            .visits
            .transition(visit_id, Transition::Checkout, &actor(), None, None, LATER)
            .await
            .unwrap_err();
        assert_code(&err, "INVALID_VISIT_STATE");
        // Admitir dos veces tampoco.
        repos
            .visits
            .transition(visit_id, Transition::Admit, &actor(), None, None, LATER)
            .await
            .unwrap();
        let err = repos
            .visits
            .transition(visit_id, Transition::Admit, &actor(), None, None, LATER)
            .await
            .unwrap_err();
        assert_code(&err, "INVALID_VISIT_STATE");
        // Cancelar una visita en espera funciona (el motivo lo exige
        // el handler de Go, no el repositorio) y deja de ser válida.
        let visit_id = {
            let cedula2 = format!("hash-{tag}-b");
            let visitor2 = seed_visitor(&repos, &cedula2).await;
            checkin(&repos, visitor2, &cedula2).await
        };
        let visit = repos
            .visits
            .transition(
                visit_id,
                Transition::Cancel,
                &actor(),
                None,
                Some("No vino"),
                LATER,
            )
            .await
            .unwrap();
        assert_eq!(visit.status.as_deref(), Some("cancelled"));
        assert_eq!(visit.cancellation_reason.as_deref(), Some("No vino"));
        let err = repos
            .visits
            .transition(
                visit_id,
                Transition::Cancel,
                &actor(),
                None,
                Some("Otra"),
                LATER,
            )
            .await
            .unwrap_err();
        assert_code(&err, "INVALID_VISIT_STATE");
    })
    .await;
}

#[tokio::test]
async fn not_found_codes_match() {
    run_case(|repos, _tag| async move {
        let err = repos.visits.find_by_id(999_999).await.unwrap_err();
        assert_code(&err, "VISIT_NOT_FOUND");
        let err = repos.users.find_by_id(999_999).await.unwrap_err();
        assert_code(&err, "USER_NOT_FOUND");
        let err = repos.visitors.find_by_id(999_999).await.unwrap_err();
        assert_code(&err, "VISITOR_NOT_FOUND");
        let err = repos.arco.find_request_by_id(999_999).await.unwrap_err();
        assert_code(&err, "ARCO_REQUEST_NOT_FOUND");
    })
    .await;
}

#[tokio::test]
async fn cedula_unique_rejects_duplicate() {
    // Ambas variantes rechazan la segunda cédula igual; ninguna la
    // traduce todavía a un código de dominio (fase 4), así que el
    // contrato exige el fallo, no el código.
    run_case(|repos, tag| async move {
        let cedula = format!("hash-{tag}");
        seed_visitor(&repos, &cedula).await;
        let err = repos
            .visitors
            .insert(&NewVisitor {
                cedula_hash: &cedula,
                encrypted_cedula: None,
                first_name: "Otra",
                last_name: "Persona",
                company: "Trébol",
                job_title: None,
                email: None,
                phone: None,
                photo_data: None,
                id_photo_data: None,
                created_at: NOW,
                updated_at: NOW,
            })
            .await
            .unwrap_err();
        assert!(
            !matches!(
                err,
                StoreError::NotFound { .. } | StoreError::Conflict { .. }
            ),
            "la cédula duplicada debe fallar por unicidad, no {err:?}"
        );
    })
    .await;
}

#[tokio::test]
async fn arco_cancel_full_and_with_open_visit() {
    run_case(|repos, tag| async move {
        // Con visita abierta: la cancelación se niega.
        let cedula = format!("hash-{tag}");
        let visitor_id = seed_visitor(&repos, &cedula).await;
        let visit_id = checkin(&repos, visitor_id, &cedula).await;
        let err = repos
            .arco
            .cancel_subject(
                visitor_id,
                "V-12345678",
                &cedula,
                &format!("ARCO-{tag}"),
                &actor(),
                "documento",
                NOW,
            )
            .await
            .unwrap_err();
        assert_code(&err, "OPEN_VISIT_EXISTS");

        // Visita completada: la cancelación procede y anonimiza.
        repos
            .visits
            .transition(visit_id, Transition::Admit, &actor(), None, None, LATER)
            .await
            .unwrap();
        repos
            .visits
            .transition(visit_id, Transition::Checkout, &actor(), None, None, LATER)
            .await
            .unwrap();
        repos
            .search
            .replace_tokens(visitor_id, &[vec![1u8; 32], vec![2u8; 32]])
            .await
            .unwrap();
        repos
            .arco
            .cancel_subject(
                visitor_id,
                "V-12345678",
                &cedula,
                &format!("ARCO-{tag}"),
                &actor(),
                "documento",
                NOW,
            )
            .await
            .unwrap();
        // Perfil anonimizado: ya no se encuentra por cédula.
        let err = repos.visitors.find_by_cedula(&cedula).await.unwrap_err();
        assert_code(&err, "VISITOR_NOT_FOUND");
        // Tokens de búsqueda borrados.
        let tokens = repos.search.tokens_for_visitor(visitor_id).await.unwrap();
        assert!(tokens.is_empty());
        // La solicitud de cancelación quedó como constancia: la
        // referencia pasa a ser el hash del titular y el estado,
        // `completed`.
        let requests = repos.arco.list_requests(50, 0).await.unwrap();
        assert!(
            requests
                .iter()
                .any(|r| r.subject_cedula_hash == format!("ARCO-{tag}") && r.status == "completed"),
            "falta la constancia ARCO-{tag} completada en {requests:?}"
        );
    })
    .await;
}

#[tokio::test]
async fn search_tokens_roundtrip() {
    run_case(|repos, tag| async move {
        let cedula = format!("hash-{tag}");
        let visitor_id = seed_visitor(&repos, &cedula).await;
        // Los tokens miden 32 bytes (CHECK de VisitorSearchTokens).
        let token = vec![0xAA; 32];
        repos
            .search
            .replace_tokens(visitor_id, std::slice::from_ref(&token))
            .await
            .unwrap();
        let tokens = repos.search.tokens_for_visitor(visitor_id).await.unwrap();
        assert_eq!(tokens.len(), 1);
        let found = repos.search.find_visitors_by_token(&token).await.unwrap();
        assert_eq!(found, vec![visitor_id]);
        repos.search.delete_tokens(visitor_id).await.unwrap();
        let tokens = repos.search.tokens_for_visitor(visitor_id).await.unwrap();
        assert!(tokens.is_empty());
    })
    .await;
}

#[tokio::test]
async fn catalogs_roundtrip() {
    run_case(|repos, tag| async move {
        let dept = format!("Depto-{tag}");
        let dept_id = repos
            .catalogs
            .insert_department(&dept, None, NOW)
            .await
            .unwrap();
        let departments = repos.catalogs.list_departments().await.unwrap();
        assert!(departments
            .iter()
            .any(|d| d.id == dept_id && d.name == dept));
        repos
            .catalogs
            .set_department_active(dept_id, false)
            .await
            .unwrap();
        let departments = repos.catalogs.list_departments().await.unwrap();
        let dept = departments.iter().find(|d| d.id == dept_id).unwrap();
        assert_eq!(dept.is_active, Some(false));

        let purpose = format!("Motivo-{tag}");
        let purpose_id = repos.catalogs.insert_purpose(&purpose, NOW).await.unwrap();
        let purposes = repos.catalogs.list_purposes().await.unwrap();
        assert!(purposes
            .iter()
            .any(|p| p.id == purpose_id && p.name == purpose));
    })
    .await;
}

#[tokio::test]
async fn password_reset_is_single_use() {
    run_case(|repos, tag| async move {
        let username = format!("usuario-{tag}");
        let user_id = repos
            .users
            .insert(&NewUser {
                username: &username,
                email: Some("usuario@example.test"),
                password_hash: "$2b$12$fixturehashfixturehashfixturehashfixturehashfixt",
                role: "operador",
                must_change_password: false,
                created_at: NOW,
                updated_at: NOW,
            })
            .await
            .unwrap();
        let token = "aabbccddeeff00112233445566778899aabbccddeeff00112233445566778899";
        let saved = repos
            .users
            .save_reset_token(user_id, token, LATER, "usuario@example.test", 0, NOW)
            .await
            .unwrap();
        assert_eq!(saved, 1);
        let updated = repos
            .users
            .consume_reset_token(
                token,
                "$2b$12$newhashnewhashnewhashnewhashnewhashnewhashnewh",
                NOW,
            )
            .await
            .unwrap();
        assert_eq!(updated.id, user_id);
        // Segundo uso: ya no vale.
        let err = repos
            .users
            .consume_reset_token(
                token,
                "$2b$12$newhashnewhashnewhashnewhashnewhashnewhashnewh",
                NOW,
            )
            .await
            .unwrap_err();
        assert_code(&err, "USER_NOT_FOUND");
    })
    .await;
}

#[tokio::test]
async fn audit_write_and_count() {
    run_case(|repos, _tag| async move {
        // En PostgreSQL la base es compartida con los demás casos,
        // que escriben auditoría en paralelo: el conteo solo crece.
        let before = repos.audit.count().await.unwrap();
        repos
            .audit
            .write(&AuditEntry {
                user_id: 1,
                username: "root",
                action: "CONTRACT_TEST",
                entity: "Visit",
                entity_id: "1",
                details: None,
                ip_address: None,
                user_agent: None,
                created_at: NOW,
                role: None,
                method: None,
                path: None,
            })
            .await
            .unwrap();
        assert!(repos.audit.count().await.unwrap() > before);
        let recent = repos.audit.list_recent(200).await.unwrap();
        assert!(recent.iter().any(|l| l.action == "CONTRACT_TEST"));
    })
    .await;
}

#[tokio::test]
async fn probe_reports_engine_and_schema() {
    let db = sqlite_db().await;
    let probe = db.test_connection().await.unwrap();
    assert_eq!(probe.engine, "sqlite");
    assert_eq!(probe.schema_version, 7);
    assert!(probe.path.is_some());
    if let Some(db) = pg_db().await {
        let probe = db.test_connection().await.unwrap();
        assert_eq!(probe.engine, "postgres");
        assert_eq!(probe.schema_version, 6);
        assert!(probe.version.starts_with("PostgreSQL 16"));
        assert_eq!(probe.database.as_deref(), Some("logmaster_pg_test"));
    }
}
