//! Exportaciones en servidor (fase 6; documento §9).
//!
//! - XLSX con rust_xlsxwriter (hasta 20.000 visitas).
//! - PDF con printpdf 0.8 (fuentes integradas Helvetica; hasta 2.000
//!   visitas).
//!
//! `genpdf` no encaja: exige archivos de fuentes en disco y el
//! ejecutable es único; printpdf trae las fuentes integradas, así
//! que el PDF se genera sin depender de archivos externos. La
//! exportación lee en una única transacción de lectura estable (la
//! hace la ruta, con `list_filtered`) y omite binarios: las columnas
//! son las del DTO de visita, sin fotos.

use anyhow::Result;
use printpdf::{BuiltinFont, Mm, Op, PdfDocument, PdfPage, PdfSaveOptions, Point, Pt, TextItem};
use rust_xlsxwriter::{Format, Workbook};
use serde_json::Value;

/// Columnas fijas: (título, clave del DTO de visita).
pub const EXPORT_COLUMNS: [(&str, &str); 11] = [
    ("ID", "id"),
    ("Cédula", "visitorCedula"),
    ("Visitante", "visitorName"),
    ("Empresa", "company"),
    ("Estado", "status"),
    ("Propósito", "purpose"),
    ("Persona a visitar", "personToVisit"),
    ("Departamento", "department"),
    ("Entrada", "checkInTime"),
    ("Salida", "checkOutTime"),
    ("Duración (min)", "durationMinutes"),
];

fn cell_text(item: &Value, key: &str) -> String {
    match item.get(key) {
        Some(Value::String(text)) => text.clone(),
        Some(Value::Number(number)) => number.to_string(),
        Some(Value::Bool(value)) => value.to_string(),
        _ => String::new(),
    }
}

/// Acorta un texto a `max` caracteres (el PDF es de ancho fijo).
fn truncate(text: &str, max: usize) -> String {
    if text.chars().count() <= max {
        text.to_string()
    } else {
        text.chars().take(max.saturating_sub(1)).collect::<String>() + "…"
    }
}

/// XLSX con una hoja `Visitas` y las columnas fijas.
pub fn visits_xlsx(items: &[Value]) -> Result<Vec<u8>> {
    let mut workbook = Workbook::new();
    let worksheet = workbook.add_worksheet();
    worksheet.set_name("Visitas")?;
    let header = Format::new().set_bold();
    for (col, (title, _)) in EXPORT_COLUMNS.iter().enumerate() {
        worksheet.write_string_with_format(0, col as u16, *title, &header)?;
        worksheet.set_column_width(col as u16, 22)?;
    }
    for (row, item) in items.iter().enumerate() {
        for (col, (_, key)) in EXPORT_COLUMNS.iter().enumerate() {
            worksheet.write_string((row + 1) as u32, col as u16, cell_text(item, key))?;
        }
    }
    Ok(workbook.save_to_buffer()?)
}

/// PDF apaisado (A4) con una línea por visita. El XLSX es la
/// exportación precisa; el PDF es el resumen imprimible.
pub fn visits_pdf(items: &[Value], total: i64) -> Result<Vec<u8>> {
    const LINES_PER_PAGE: usize = 37;
    let header_line = EXPORT_COLUMNS
        .iter()
        .map(|(title, _)| truncate(title, 14))
        .collect::<Vec<_>>()
        .join(" | ");
    let mut lines: Vec<String> = Vec::with_capacity(items.len() + 1);
    lines.push(header_line);
    for item in items {
        let row = EXPORT_COLUMNS
            .iter()
            .map(|(_, key)| truncate(&cell_text(item, key), 16))
            .collect::<Vec<_>>()
            .join(" | ");
        lines.push(row);
    }
    if lines.len() == 1 {
        lines.push("(sin visitas)".to_string());
    }
    let title = format!("Visitas — LogMaster ({total})");
    let mut doc = PdfDocument::new("Visitas LogMaster");
    let mut pages = Vec::new();
    for chunk in lines.chunks(LINES_PER_PAGE) {
        let mut ops = vec![
            Op::StartTextSection,
            Op::SetTextCursor {
                pos: Point::new(Mm(15.0), Mm(195.0)),
            },
            Op::SetFontSizeBuiltinFont {
                size: Pt(12.0),
                font: BuiltinFont::HelveticaBold,
            },
            Op::SetLineHeight { lh: Pt(14.0) },
            Op::WriteTextBuiltinFont {
                items: vec![TextItem::Text(title.clone())],
                font: BuiltinFont::HelveticaBold,
            },
            Op::AddLineBreak,
            Op::SetFontSizeBuiltinFont {
                size: Pt(9.0),
                font: BuiltinFont::Helvetica,
            },
            Op::SetLineHeight { lh: Pt(12.0) },
        ];
        for (i, line) in chunk.iter().enumerate() {
            let font = if i == 0 {
                BuiltinFont::HelveticaBold
            } else {
                BuiltinFont::Helvetica
            };
            ops.push(Op::SetFontSizeBuiltinFont {
                size: Pt(9.0),
                font,
            });
            ops.push(Op::WriteTextBuiltinFont {
                items: vec![TextItem::Text(line.clone())],
                font,
            });
            ops.push(Op::AddLineBreak);
        }
        ops.push(Op::EndTextSection);
        pages.push(PdfPage::new(Mm(297.0), Mm(210.0), ops));
    }
    Ok(doc
        .with_pages(pages)
        .save(&PdfSaveOptions::default(), &mut Vec::new()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn sample() -> Vec<Value> {
        vec![
            json!({
                "id": 1,
                "visitorCedula": "V-12345678",
                "visitorName": "Ana Prueba",
                "company": "Trébol",
                "status": "completed",
                "purpose": "Reunión",
                "personToVisit": "Anfitrión",
                "department": "Planta",
                "checkInTime": "2026-11-10T08:00:00Z",
                "checkOutTime": "2026-11-10T09:30:00Z",
                "durationMinutes": 90,
            }),
            json!({
                "id": 2,
                "visitorCedula": "V-87654321",
                "visitorName": "Luis Ejemplo",
                "company": "Proveedor",
                "status": "active",
                "purpose": "Entrega",
                "personToVisit": "Recepción",
                "department": "Almacén",
                "checkInTime": "2026-11-10T10:00:00Z",
                "checkOutTime": null,
                "durationMinutes": 0,
            }),
        ]
    }

    #[test]
    fn xlsx_starts_with_zip_magic_and_holds_rows() {
        let bytes = visits_xlsx(&sample()).unwrap();
        assert!(bytes.starts_with(b"PK\x03\x04"));
        assert!(bytes.len() > 1000);
        let empty = visits_xlsx(&[]).unwrap();
        assert!(empty.starts_with(b"PK\x03\x04"));
    }

    #[test]
    fn pdf_starts_with_header_and_paginates() {
        let bytes = visits_pdf(&sample(), 2).unwrap();
        assert!(bytes.starts_with(b"%PDF-"));
        assert!(bytes.len() > 500);
        // 100 filas: varias páginas, sigue siendo un solo PDF válido.
        let many: Vec<Value> = (0..100)
            .map(|i| {
                let mut item = sample()[0].clone();
                item["id"] = json!(i);
                item
            })
            .collect();
        let bytes = visits_pdf(&many, 100).unwrap();
        assert!(bytes.starts_with(b"%PDF-"));
        assert!(bytes.len() > 1000);
    }
}
