# Setup - LogMaster (Sistema de Gestion de Visitantes)

## 1. Requisitos

- Node.js 20+
- npm 9+
- PostgreSQL 16 instalado y corriendo
- Windows 10/11 recomendado

## 2. Clonar e instalar

```bash
git clone <repo-url>
cd Visitors
npm run install-all
```

## 3. Variables de entorno

Copiar `.env.example` a `.env` (unica fuente de verdad):

```bash
copy .env.example .env
```

O usar el script automatico:

```bash
scripts\auto-env.bat
```

Variables minimas requeridas:

```env
PORT=3000
NODE_ENV=development

# PostgreSQL
DB_HOST=localhost
DB_PORT=5432
DB_NAME=visitors
DB_USER=postgres
DB_PASSWORD=postgres

# Seguridad
JWT_SECRET=<128-hex>
ENCRYPTION_KEY=<64-hex>

# Tokens
JWT_ACCESS_EXPIRATION=15m
JWT_REFRESH_EXPIRATION=7d
BCRYPT_ROUNDS=12
MAX_LOGIN_ATTEMPTS=5
LOCKOUT_DURATION_MINUTES=15
```

## 4. Generacion de claves seguras

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"  # 64-hex
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"  # 128-hex
```

Uso sugerido:

- `ENCRYPTION_KEY`: 64-hex
- `JWT_SECRET`: 128-hex

## 5. Ejecucion en desarrollo

Desde la raiz:

```bash
npm run dev
```

Esto inicia:

- Cliente en `http://localhost:5173`
- API en `http://localhost:3000`

## 6. Build y validacion

Frontend:

```bash
npm --prefix client run build
```

Backend (type-check):

```bash
npm --prefix server exec -- tsc -p server/tsconfig.json --noEmit
```

## 7. Email / SMTP

Para habilitar recuperacion de contrasena por correo:

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=tu-email@gmail.com
SMTP_PASSWORD=tu-app-password
EMAIL_FROM=noreply@tudominio.com
APP_URL=http://localhost:5173
```

Sin SMTP configurado, los correos se registran en logs (no se envian).

## 8. CI/CD (GitHub Actions)

El pipeline automatico en `.github/workflows/ci.yml` ejecuta en cada push/PR:

1. Tests del servidor (con PostgreSQL en service container)
2. Tests del cliente
3. Lint (ESLint)
4. Build

## 9. Pre-commit Hooks (Husky)

Los hooks de Husky v9 ejecutan automaticamente antes de cada commit:

- `npm run lint` en cliente y servidor
- `npx tsc --noEmit` en cliente y servidor
- `npm test` en cliente y servidor

Se salta en ramas `main`, `develop`, `master`.

## 10. Ejecutar Electron

Modo desarrollo:

```bash
npm run electron:dev
```

Arranque Electron (requiere build de piezas):

```bash
npm run electron:start
```

## 12. Scripts utiles

Raiz:

- `npm run dev`
- `npm run electron:dev`
- `npm run electron:start`
- `npm run dist`
- `npm run build:server`

Servidor:

- `npm --prefix server run dev`
- `npm --prefix server run seed`
- `npm --prefix server run seed:clean`
- `npm --prefix server run db:reset`

Cliente:

- `npm --prefix client run dev`
- `npm --prefix client run build`
- `npm --prefix client run test`

## 13. Usuarios base (desarrollo)

El seeder asegura usuarios base al iniciar backend.

- `trebolmaster` (root)
- `Admin@trebol.com` (admin)
- `operador` (operador)
- `auditor` (auditor)
- `demo` (demo)

Nota:

- Algunos usuarios pueden exigir cambio obligatorio de contrasena en primer login.

## 14. Troubleshooting rapido

1. Error de clave de cifrado:

- Verificar formato hex y longitud de variables criticas.

2. API no levanta:

- Confirmar `PORT` libre.
- Revisar salida de `npm --prefix server run dev`.

3. Frontend no conecta:

- Confirmar que backend este en `localhost:3000`.
- Verificar CORS permitido para `localhost:5173`.

4. Swagger no disponible:

- Abrir `http://localhost:3000/api-docs`.
