//! Correo con lettre (fase 6; documento §4).
//!
//! Traducción de `sendResetEmail` de Go
//! (`server-go/internal/httpapi/auth.go`): mismo remitente, asunto
//! y cuerpo, mismo enlace (`APP_URL/reset-password?token=...`,
//! 15 minutos, un solo uso) y mismos modos TLS (`local`,
//! `starttls`, `implicit`). Sin `SMTP_HOST` configurado, el envío
//! falla con un error visible, no silencioso: el llamador (el
//! `forgot` de auth) anula el token guardado, como Go.
//!
//! El remitente genérico (`Mailer::send`) queda listo para otros
//! avisos (respaldo, retención, ensayo). En laboratorio, Mailpit
//! sigue sirviendo fuera del .exe, como en el documento.

use std::time::Duration;

use anyhow::{anyhow, bail, Context, Result};
use lettre::message::Mailbox;
use lettre::transport::smtp::authentication::Credentials;
use lettre::transport::smtp::client::{Tls, TlsParameters};
use lettre::{AsyncSmtpTransport, AsyncTransport, Message, Tokio1Executor};

use crate::config::Config;

/// Remitente de correo, construido desde `[mail]` y el entorno.
pub struct Mailer {
    transport: AsyncSmtpTransport<Tokio1Executor>,
    from: Mailbox,
    app_url: String,
}

impl Mailer {
    /// Construye el remitente desde la configuración. Sin
    /// `SMTP_HOST` (o `[mail] host`), devuelve un error, como Go
    /// (`SMTP is not configured`).
    pub fn from_config(config: &Config) -> Result<Self> {
        let host = config
            .mail_host
            .clone()
            .filter(|host| !host.is_empty())
            .ok_or_else(|| anyhow!("SMTP is not configured"))?;
        let from = config
            .mail_from
            .clone()
            .filter(|from| !from.is_empty())
            .ok_or_else(|| anyhow!("EMAIL_FROM is required to send mail"))?;
        let from: Mailbox = from
            .parse()
            .map_err(|e| anyhow!("EMAIL_FROM inválido: {e}"))?;
        let mode = match config.mail_tls_mode.as_deref() {
            Some(mode) => mode.to_string(),
            None if is_local_host(&host) => "local".to_string(),
            None => "starttls".to_string(),
        };
        if mode == "local" && !is_local_host(&host) && host != "mailpit" {
            bail!("local SMTP restricted to isolated validation");
        }
        let tls = match mode.as_str() {
            "local" => Tls::None,
            "starttls" => Tls::Required(
                TlsParameters::new(host.clone())
                    .map_err(|e| anyhow!("parámetros TLS SMTP: {e}"))?,
            ),
            "implicit" => Tls::Wrapper(
                TlsParameters::new(host.clone())
                    .map_err(|e| anyhow!("parámetros TLS SMTP: {e}"))?,
            ),
            _ => bail!("invalid SMTP_TLS_MODE"),
        };
        let mut builder = AsyncSmtpTransport::<Tokio1Executor>::builder_dangerous(&host)
            .port(config.mail_port)
            .tls(tls)
            .timeout(Some(Duration::from_secs(10)));
        if let (Some(user), Some(password)) =
            (config.mail_user.clone(), config.mail_password.clone())
        {
            builder = builder.credentials(Credentials::new(user, password));
        }
        Ok(Self {
            transport: builder.build(),
            from,
            app_url: config.app_url.trim_end_matches('/').to_string(),
        })
    }

    /// Envío genérico (texto plano), para recuperación y otros
    /// avisos. Falla de forma visible si el servidor no responde.
    pub async fn send(&self, to: &str, subject: &str, body: &str) -> Result<()> {
        let to: Mailbox = to
            .parse()
            .map_err(|e| anyhow!("destinatario inválido: {e}"))?;
        let message = Message::builder()
            .from(self.from.clone())
            .to(to)
            .subject(subject)
            .body(body.to_string())
            .context("construir el mensaje")?;
        self.transport
            .send(message)
            .await
            .map_err(|e| anyhow!("enviar correo: {e}"))?;
        Ok(())
    }

    /// Correo de recuperación de contraseña (Go: mismo asunto y
    /// cuerpo, enlace con el token de un solo uso, 15 minutos).
    pub async fn send_reset_email(&self, to: &str, token: &str) -> Result<()> {
        let link = format!(
            "{}/reset-password?token={}",
            self.app_url,
            urlencoding(token)
        );
        self.send(
            to,
            "Restablecimiento de contraseña — LogMaster",
            &format!(
                "Solicitud de restablecimiento de contraseña. El enlace vence en 15 minutos y tiene un solo uso:\n{link}"
            ),
        )
        .await
    }
}

/// ¿Es un host de bucle local (Go: `127.0.0.1`, `localhost`, `::1`)?
fn is_local_host(host: &str) -> bool {
    matches!(host, "127.0.0.1" | "localhost" | "::1")
}

/// Codificación de un valor de query (`url.QueryEscape` de Go).
fn urlencoding(value: &str) -> String {
    let mut out = String::with_capacity(value.len());
    for byte in value.bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(byte as char)
            }
            _ => out.push_str(&format!("%{byte:02X}")),
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
    use tokio::net::TcpListener;

    fn test_config() -> Config {
        let mut config = Config::fixture();
        config.mail_host = Some("127.0.0.1".to_string());
        config.mail_port = 1025;
        config.mail_from = Some("LogMaster <avisos@ejemplo.local>".to_string());
        config.mail_tls_mode = Some("local".to_string());
        config
    }

    /// Sumidero SMTP mínimo (220/EHLO/MAIL/RCPT/DATA/QUIT) que
    /// guarda el mensaje recibido. Sirve para probar el envío sin
    /// Mailpit ni red.
    struct Sink {
        received: std::sync::Arc<tokio::sync::Mutex<Vec<String>>>,
        addr: std::net::SocketAddr,
    }

    async fn start_sink() -> Sink {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        let received = std::sync::Arc::new(tokio::sync::Mutex::new(Vec::new()));
        let sink_received = received.clone();
        tokio::spawn(async move {
            let Ok((socket, _)) = listener.accept().await else {
                return;
            };
            let (reader, mut writer) = socket.into_split();
            let mut lines = BufReader::new(reader).lines();
            writer.write_all(b"220 sink listo\r\n").await.unwrap();
            let mut data = String::new();
            while let Ok(Some(line)) = lines.next_line().await {
                let upper = line.to_uppercase();
                if upper.starts_with("EHLO") || upper.starts_with("HELO") {
                    writer.write_all(b"250 sink\r\n").await.unwrap();
                } else if upper.starts_with("MAIL FROM")
                    || upper.starts_with("RCPT TO")
                    || upper.starts_with("NOOP")
                    || upper.starts_with("RSET")
                {
                    writer.write_all(b"250 ok\r\n").await.unwrap();
                } else if upper.starts_with("DATA") {
                    writer.write_all(b"354 fin con punto\r\n").await.unwrap();
                    while let Ok(Some(line)) = lines.next_line().await {
                        if line == "." {
                            break;
                        }
                        data.push_str(&line);
                        data.push('\n');
                    }
                    sink_received.lock().await.push(data.clone());
                    data.clear();
                    writer.write_all(b"250 ok\r\n").await.unwrap();
                } else if upper.starts_with("QUIT") {
                    writer.write_all(b"221 adios\r\n").await.unwrap();
                    break;
                } else {
                    writer.write_all(b"250 ok\r\n").await.unwrap();
                }
            }
        });
        Sink { received, addr }
    }

    /// Decodifica quoted-printable (el cuerpo que lettre genera
    /// por los caracteres no ASCII): `=XX` a byte y `=` al final
    /// de línea como continuación.
    fn qp_decode(input: &str) -> String {
        let bytes = input.as_bytes();
        let mut out = Vec::with_capacity(bytes.len());
        let mut i = 0;
        while i < bytes.len() {
            if bytes[i] == b'=' && i + 2 < bytes.len() && bytes[i + 1] != b'\n' {
                if let Ok(hex) = std::str::from_utf8(&bytes[i + 1..i + 3]) {
                    if let Ok(byte) = u8::from_str_radix(hex, 16) {
                        out.push(byte);
                        i += 3;
                        continue;
                    }
                }
            }
            if bytes[i] == b'=' && i + 1 < bytes.len() && bytes[i + 1] == b'\n' {
                i += 2;
                continue;
            }
            out.push(bytes[i]);
            i += 1;
        }
        String::from_utf8_lossy(&out).into_owned()
    }

    #[tokio::test]
    async fn reset_email_reaches_a_local_sink() {
        let sink = start_sink().await;
        let mut config = test_config();
        config.mail_port = sink.addr.port();
        let mailer = Mailer::from_config(&config).unwrap();
        mailer
            .send_reset_email("usuario@example.test", "token-de-prueba-64-hex")
            .await
            .unwrap();
        let received = sink.received.lock().await;
        assert_eq!(received.len(), 1);
        let message = qp_decode(&received[0]);
        assert!(message.contains("To: usuario@example.test"));
        assert!(message.contains("Subject: Restablecimiento de =?utf-8?b?"));
        assert!(message.contains("restablecimiento de contraseña"));
        assert!(
            message.contains("https://localhost:8443/reset-password?token=token-de-prueba-64-hex")
        );
    }

    #[tokio::test]
    async fn send_fails_visibly_without_smtp() {
        // Puerto cerrado: el envío debe fallar, no silenciarse.
        let mut closed = test_config();
        closed.mail_port = 1;
        let mailer = Mailer::from_config(&closed).unwrap();
        assert!(mailer
            .send("a@example.test", "Asunto", "Cuerpo")
            .await
            .is_err());
    }

    #[test]
    fn from_config_requires_smtp_host_and_from() {
        let mut config = test_config();
        config.mail_host = None;
        assert!(Mailer::from_config(&config).is_err());
        let mut config = test_config();
        config.mail_from = None;
        assert!(Mailer::from_config(&config).is_err());
        let mut config = test_config();
        config.mail_host = Some("smtp.externo.local".to_string());
        config.mail_tls_mode = Some("local".to_string());
        assert!(Mailer::from_config(&config).is_err());
    }
}
