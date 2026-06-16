# LAN Setup — LogMaster

## How LAN Access Works

The system auto-detects the host machine's LAN IP and configures CORS so other devices on the same network can access the web interface.

## Automatic Configuration

When you run `scripts\start.bat`:

1. It calls `scripts\auto-env.bat` (always, not just on first run)
2. `auto-env.bat` detects the current DHCP IP via `ipconfig`
3. Sets `ALLOWED_ORIGINS` in `.env` to include `http://<LAN-IP>:80`, `http://<LAN-IP>:5173`, etc.
4. These vars are passed to the server container via `docker-compose.yml`

## Manual Configuration

```env
ALLOWED_ORIGINS=http://192.168.1.100:80,http://192.168.1.100:5173
```

Or via `scripts\auto-env.bat` directly:
```batch
scripts\auto-env.bat
```

## Access from Another PC

1. On the host, run: `scripts\status.bat`
2. Note the LAN IP (e.g., `192.168.1.108`)
3. On another device in the same network, open: `http://192.168.1.108`

## SSL / HTTPS on LAN

If you need HTTPS on LAN:
1. Run `scripts\setup-ssl.bat` to generate self-signed certs
2. Access via `https://192.168.1.108` (accept browser warning)

For production with a real domain, use Let's Encrypt:
```bash
certbot certonly --standalone -d mydomain.com
```

## Troubleshooting

| Symptom | Fix |
|---|---|
| CORS errors in browser | Re-run `scripts\auto-env.bat` and restart |
| IP changed (DHCP) | Just re-run `scripts\start.bat` |
| Port already in use | Change `CLIENT_HTTP_PORT` in `.env` |
| Can't reach from phone | Ensure devices are on same subnet |
