//! Componentes Leptos compartidos por las páginas: tablas de
//! visitas y visitantes, etiquetas de estado y detalles.
//!
//! Trabajan sobre los DTOs JSON de la API (`dto.rs`): el mismo
//! formato que el navegador recibe por `fetch`, así que la tabla
//! renderizada en el servidor y la que reconstruye el JS en vivo
//! muestran lo mismo.

use leptos::prelude::*;
use serde_json::Value;

/// Texto de un campo del DTO, vacío si no existe o es `null`.
pub fn text(value: &Value, key: &str) -> String {
    value
        .get(key)
        .and_then(|item| item.as_str())
        .unwrap_or("")
        .to_string()
}

/// Texto de un campo, o el alternativo si está vacío.
pub fn text_or(value: &Value, key: &str, fallback: &str) -> String {
    let found = text(value, key);
    if found.is_empty() {
        fallback.to_string()
    } else {
        found
    }
}

/// Nombre completo de un visitante en un DTO de visita.
pub fn visitor_name(value: &Value) -> String {
    let name = text_or(value, "visitorName", "");
    if name.trim().is_empty() || name == "Anonimizado" {
        text_or(value, "visitorCedula", "Anonimizado")
    } else {
        name
    }
}

fn visit_row(visit: Value) -> impl IntoView {
    let id = visit.get("id").and_then(|item| item.as_i64()).unwrap_or(0);
    let name = visitor_name(&visit);
    let cedula = text_or(&visit, "visitorCedula", "Anonimizado");
    let company = text_or(&visit, "visitorCompany", "");
    let purpose = text(&visit, "purpose");
    let entry = text_or(&visit, "checkInTime", "");
    let status = text(&visit, "status");
    let status_label = status.clone();
    let detail = format!("/visits/{id}");
    let action = match status.as_str() {
        "waiting" => "Admitir",
        "intermittent" => "Reingreso",
        _ => "Ver",
    };
    view! {
        <tr>
            <td>
                <a href={detail.clone()}>{name}</a>
            </td>
            <td>{cedula}</td>
            <td>{company}</td>
            <td>{purpose}</td>
            <td>{entry}</td>
            <td>
                <span class={format!("etiqueta {status}")}>{status_label}</span>
            </td>
            <td>
                <a class="boton" href={detail}>
                    {action}
                </a>
            </td>
        </tr>
    }
}

/// Una lista del punto de control, con el contador y los atributos
/// que usa el JS en vivo (`data-lista`, `data-cuenta`).
///
/// Las filas se construyen antes del `view!`: dentro de `Show`/`For`
/// los hijos son closures `Fn` y no admiten valores movidos, así que
/// para SSR se precalcula el `Vec<AnyView>` y se interpola.
#[component]
pub fn VisitTable(title: String, status: String, visits: Vec<Value>) -> impl IntoView {
    let count = visits.len();
    let rows: Vec<AnyView> = if visits.is_empty() {
        vec![view! { <tr><td colspan="7" class="muted">"Sin visitas."</td></tr> }.into_any()]
    } else {
        visits
            .into_iter()
            .map(|visit| visit_row(visit).into_any())
            .collect()
    };
    view! {
        <section class="tarjeta">
            <h2>
                {title} " (" <span data-cuenta={status.clone()}>{count}</span> ")"
            </h2>
            <table data-lista={status}>
                <thead>
                    <tr>
                        <th>"Visitante"</th>
                        <th>"Cédula"</th>
                        <th>"Empresa"</th>
                        <th>"Motivo"</th>
                        <th>"Entrada"</th>
                        <th>"Estado"</th>
                        <th>"Acciones"</th>
                    </tr>
                </thead>
                <tbody>{rows}</tbody>
            </table>
        </section>
    }
}

/// Una fila `dt/dd` para las fichas de detalle.
#[component]
pub fn Dato(label: &'static str, value: String) -> impl IntoView {
    view! {
        <dt>{label}</dt>
        <dd>{value}</dd>
    }
}
