# LAN Setup — LogMaster

## How LAN Access Works

The system auto-detects the host machine's LAN IP and configures CORS so other devices on the same network can access the web interface.

## Automatic Configuration

When you run `npm run dev`:

1. The Vite dev server binds to all interfaces (`host: true`)
2. The Express server accepts connections from `ALLOWED_ORIGINS` in `.env`
3. Other devices on the same network can access the web interface

## Manual Configuration

Add your LAN IP to `.env`:

```env
ALLOWED_ORIGINS=http://192.168.1.100:5173,http://192.168.1.100:3000
```

## Access from Another PC

1. On the host, run: `scripts\status.bat`
2. Note the LAN IP (e.g., `192.168.1.108`)
3. On another device in the same network, open: `http://192.168.1.108:5173`

## Troubleshooting

| Symptom | Fix |
|---|---|
| CORS errors in browser | Add your LAN IP to `ALLOWED_ORIGINS` in `.env` and restart |
| IP changed (DHCP) | Update `ALLOWED_ORIGINS` with the new IP and restart |
| Port already in use | Change `PORT` in `.env` for server, or `--port` for Vite |
| Can't reach from phone | Ensure devices are on same subnet and firewall allows ports 3000/5173 |
