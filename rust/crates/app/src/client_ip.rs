//! IP del cliente y proxies de confianza.
//!
//! Traduccion de `App.ClientIP` y del `TRUSTED_PROXY_CIDRS` de Go
//! (`server-go/internal/httpapi/app.go`): la IP es la del par remoto
//! salvo que ese par sea un proxy de confianza, en cuyo caso se
//! recorre `X-Forwarded-For` de derecha a izquierda mientras los
//! saltos sigan siendo de confianza. Se usa en el limite de peticiones
//! y en la auditoria.

use std::fmt;
use std::net::{IpAddr, Ipv4Addr, Ipv6Addr};
use std::str::FromStr;

/// Un prefijo CIDR de confianza (`192.168.0.0/16`, `::1/128`).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct TrustedPrefix {
    addr: IpAddr,
    bits: u8,
}

impl TrustedPrefix {
    /// `true` si la direccion cae dentro del prefijo.
    pub fn contains(&self, ip: IpAddr) -> bool {
        match (self.addr, ip) {
            (IpAddr::V4(network), IpAddr::V4(addr)) => {
                let mask = mask_v4(self.bits);
                network
                    .octets()
                    .iter()
                    .zip(addr.octets().iter())
                    .zip(mask.iter())
                    .all(|((n, a), m)| n & m == a & m)
            }
            (IpAddr::V6(network), IpAddr::V6(addr)) => {
                let mask = mask_v6(self.bits);
                network
                    .octets()
                    .iter()
                    .zip(addr.octets().iter())
                    .zip(mask.iter())
                    .all(|((n, a), m)| n & m == a & m)
            }
            _ => false,
        }
    }
}

fn mask_v4(bits: u8) -> [u8; 4] {
    let mask: u32 = if bits == 0 {
        0
    } else {
        u32::MAX << (32 - bits)
    };
    mask.to_be_bytes()
}

fn mask_v6(bits: u8) -> [u8; 16] {
    let mask: u128 = if bits == 0 {
        0
    } else {
        u128::MAX << (128 - bits)
    };
    mask.to_be_bytes()
}

impl FromStr for TrustedPrefix {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        let (addr, bits) = s
            .split_once('/')
            .ok_or_else(|| format!("CIDR sin prefijo: {s}"))?;
        let addr: IpAddr = addr.parse().map_err(|_| format!("IP invalida: {addr}"))?;
        let bits: u8 = bits
            .parse()
            .map_err(|_| format!("prefijo invalido: {bits}"))?;
        let max = match addr {
            IpAddr::V4(_) => 32,
            IpAddr::V6(_) => 128,
        };
        if bits > max {
            return Err(format!("prefijo invalido: {bits}"));
        }
        Ok(Self { addr, bits })
    }
}

impl fmt::Display for TrustedPrefix {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}/{}", self.addr, self.bits)
    }
}

/// IP del cliente, igual que Go: el par remoto, o el ultimo salto no
/// confiable de `X-Forwarded-For` cuando el par es de confianza.
pub fn client_ip(remote: IpAddr, forwarded_for: Option<&str>, trusted: &[TrustedPrefix]) -> IpAddr {
    let mut ip = remote;
    if !trusted.iter().any(|p| p.contains(ip)) {
        return ip;
    }
    let header = match forwarded_for {
        Some(header) if !header.is_empty() => header,
        _ => return ip,
    };
    let parts: Vec<&str> = header.split(',').collect();
    for part in parts.iter().rev() {
        let candidate: IpAddr = match part.trim().parse() {
            Ok(candidate) => candidate,
            Err(_) => return ip,
        };
        ip = candidate;
        if !trusted.iter().any(|p| p.contains(ip)) {
            break;
        }
    }
    ip
}

/// Atajo para una `SocketAddr` remota (lo que Axum entrega).
pub fn client_ip_from_remote(
    remote: std::net::SocketAddr,
    forwarded_for: Option<&str>,
    trusted: &[TrustedPrefix],
) -> IpAddr {
    client_ip(remote.ip(), forwarded_for, trusted)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn prefix(s: &str) -> TrustedPrefix {
        s.parse().unwrap()
    }

    #[test]
    fn prefix_contains_v4_and_v6() {
        assert!(prefix("192.168.0.0/16").contains(IpAddr::V4(Ipv4Addr::new(192, 168, 1, 5))));
        assert!(!prefix("192.168.0.0/16").contains(IpAddr::V4(Ipv4Addr::new(192, 169, 1, 5))));
        assert!(prefix("10.0.0.0/8").contains(IpAddr::V4(Ipv4Addr::new(10, 9, 9, 9))));
        assert!(prefix("::1/128").contains(IpAddr::V6(Ipv6Addr::LOCALHOST)));
        assert!("192.168.0.0".parse::<TrustedPrefix>().is_err());
        assert!("192.168.0.0/33".parse::<TrustedPrefix>().is_err());
        assert!("no-es-ip/24".parse::<TrustedPrefix>().is_err());
    }

    #[test]
    fn client_ip_walks_forwarded_for_while_trusted() {
        let trusted = vec![prefix("10.0.0.0/8"), prefix("172.16.0.0/12")];
        let proxy = IpAddr::V4(Ipv4Addr::new(10, 0, 0, 1));
        // Par no confiable: se ignora X-Forwarded-For.
        assert_eq!(
            client_ip(
                IpAddr::V4(Ipv4Addr::new(203, 0, 113, 7)),
                Some("198.51.100.9"),
                &trusted
            ),
            IpAddr::V4(Ipv4Addr::new(203, 0, 113, 7))
        );
        // Par confiable, un salto: la IP real.
        assert_eq!(
            client_ip(proxy, Some("198.51.100.9"), &trusted),
            IpAddr::V4(Ipv4Addr::new(198, 51, 100, 9))
        );
        // Cadena con dos proxies de confianza y la IP real al final.
        assert_eq!(
            client_ip(proxy, Some("198.51.100.9, 172.16.0.5"), &trusted),
            IpAddr::V4(Ipv4Addr::new(198, 51, 100, 9))
        );
        // Un salto no confiable en medio detiene el recorrido.
        assert_eq!(
            client_ip(
                proxy,
                Some("198.51.100.9, 203.0.113.1, 172.16.0.5"),
                &trusted
            ),
            IpAddr::V4(Ipv4Addr::new(203, 0, 113, 1))
        );
        // Sin cabecera: el par.
        assert_eq!(client_ip(proxy, None, &trusted), proxy);
    }
}
