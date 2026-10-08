param([switch]$StartOnly)
$ErrorActionPreference = 'Stop'
$repo = Split-Path $PSScriptRoot -Parent
$runtime = Join-Path (Split-Path $repo -Parent) 'Visitors-local'
New-Item -ItemType Directory -Force $runtime | Out-Null
function RandomSecret { $bytes = New-Object byte[] 32; [Security.Cryptography.RandomNumberGenerator]::Fill($bytes); [Convert]::ToHexString($bytes).ToLower() }
function Download($url, $destination) {
    if (!(Test-Path -LiteralPath $destination)) {
        & curl.exe --fail --location --retry 3 --silent --show-error $url --output $destination
        if ($LASTEXITCODE) { throw "Download failed: $url" }
    }
}
$pgBin = Join-Path $runtime 'pgsql/bin'
if (!(Test-Path "$pgBin/pg_ctl.exe")) {
    Download 'https://get.enterprisedb.com/postgresql/postgresql-16.15-1-windows-x64-binaries.zip' "$runtime/postgresql.zip"
    Expand-Archive -LiteralPath "$runtime/postgresql.zip" -DestinationPath $runtime -Force
}
if (!(Test-Path "$runtime/mailpit.exe")) {
    Download 'https://github.com/axllent/mailpit/releases/download/v1.31.4/mailpit-windows-amd64.zip' "$runtime/mailpit.zip"
    Expand-Archive -LiteralPath "$runtime/mailpit.zip" -DestinationPath $runtime -Force
}
$adminPasswordFile = Join-Path $runtime 'postgres.password'
if (!(Test-Path $adminPasswordFile)) { RandomSecret | Set-Content -LiteralPath $adminPasswordFile -NoNewline }
$env:PGPASSWORD = Get-Content -LiteralPath $adminPasswordFile -Raw
$data = Join-Path $runtime 'pgdata'
if (!(Test-Path "$data/PG_VERSION")) {
    & "$pgBin/initdb.exe" -D $data -U postgres --encoding=UTF8 --auth=scram-sha-256 --pwfile=$adminPasswordFile
    if ($LASTEXITCODE) { throw 'initdb failed' }
    Add-Content -LiteralPath "$data/postgresql.conf" -Value "`nlisten_addresses = '127.0.0.1'`nport = 55432"
}
& "$pgBin/pg_ctl.exe" status -D $data *> $null
if ($LASTEXITCODE) {
    & "$pgBin/pg_ctl.exe" start -D $data -l "$runtime/postgresql.log" -w
    if ($LASTEXITCODE) { throw 'PostgreSQL failed to start' }
}
if (!(Get-NetTCPConnection -LocalAddress 127.0.0.1 -LocalPort 1025 -State Listen -ErrorAction SilentlyContinue)) {
    Start-Process -FilePath "$runtime/mailpit.exe" -ArgumentList '--smtp', '127.0.0.1:1025', '--listen', '127.0.0.1:8025', '--database', "$runtime/mailpit.db" -WindowStyle Hidden -RedirectStandardOutput "$runtime/mailpit.log" -RedirectStandardError "$runtime/mailpit-error.log" | Out-Null
}
$env:PATH = "$pgBin;$env:PATH"
if (!$StartOnly) {
    foreach ($suffix in @('dev', 'test', 'restore_test')) {
        $name = "logmaster_$suffix"
        $configPath = Join-Path $repo ".env.logmaster-$suffix.local"
        if (!(Test-Path $configPath)) {
            $password = RandomSecret
            $seedPassword = 'Local!8aA' + (RandomSecret).Substring(0, 16)
            @("DB_HOST=127.0.0.1", 'DB_PORT=55432', "DB_NAME=$name", "DB_USER=$name", "DB_PASSWORD=$password", 'NODE_ENV=development', 'PORT=3000', "JWT_SECRET=$(RandomSecret)", "ENCRYPTION_KEY=$(RandomSecret)", "EDIT_PASSWORD=$seedPassword", "BACKUP_PASSWORD=$(RandomSecret)", "BACKUP_PATH=$runtime/backups/$suffix", "DB_PATH=$runtime/data/$suffix", 'RETENTION_ENABLED=false', 'SMTP_HOST=127.0.0.1', 'SMTP_PORT=1025', 'SMTP_SECURE=false', 'EMAIL_FROM=logmaster@example.test', 'APP_URL=http://localhost:5173', "SEED_ADMIN_PASSWORD=$seedPassword", "SEED_OPERADOR_PASSWORD=$seedPassword", "SEED_GUARD_PASSWORD=$seedPassword", "SEED_AUDITOR_PASSWORD=$seedPassword", "SEED_DEMO_PASSWORD=$seedPassword", "SEED_ROOT_PASSWORD=$seedPassword") | Set-Content -LiteralPath $configPath -Encoding utf8
        }
        $password = ((Get-Content $configPath | Where-Object { $_ -like 'DB_PASSWORD=*' }) -split '=', 2)[1]
        if ($password -notmatch '^[a-f0-9]{64}$') { throw 'Local database credentials must use the generated hexadecimal password' }
        $exists = & "$pgBin/psql.exe" -h 127.0.0.1 -p 55432 -U postgres -d postgres -Atc "SELECT 1 FROM pg_roles WHERE rolname='$name'"
        if (!$exists) {
            & "$pgBin/psql.exe" -h 127.0.0.1 -p 55432 -U postgres -d postgres -v ON_ERROR_STOP=1 -c "CREATE ROLE $name LOGIN PASSWORD '$password'"
            if ($LASTEXITCODE) { throw 'Creating local role failed' }
        }
        $exists = & "$pgBin/psql.exe" -h 127.0.0.1 -p 55432 -U postgres -d postgres -Atc "SELECT 1 FROM pg_database WHERE datname='$name'"
        if (!$exists) {
            & "$pgBin/createdb.exe" -h 127.0.0.1 -p 55432 -U postgres -O $name $name
            if ($LASTEXITCODE) { throw 'Creating local database failed' }
        }
    }
}
Remove-Item Env:PGPASSWORD
Write-Host 'PostgreSQL: 127.0.0.1:55432; Mailpit: http://127.0.0.1:8025'
