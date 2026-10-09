param([ValidateSet('prepare', 'start', 'server', 'test', 'backup', 'backup-monitor')][string]$Mode = 'start')
$ErrorActionPreference = 'Stop'
$repo = Split-Path $PSScriptRoot -Parent
$runtime = Join-Path (Split-Path $repo -Parent) 'Visitors-local'
& "$PSScriptRoot/setup-local.ps1" -StartOnly
$env:PG_BIN_PATH = Join-Path $runtime 'pgsql/bin'
$env:PATH = "$env:PG_BIN_PATH;$env:PATH"
if (!$env:DOTENV_CONFIG_PATH) {
    $suffix = if ($Mode -eq 'test') { 'go_test' } else { 'go_dev' }
    $env:DOTENV_CONFIG_PATH = Join-Path $repo ".env.logmaster-$suffix.local"
}
if (!(Test-Path -LiteralPath $env:DOTENV_CONFIG_PATH)) { throw 'Ejecuta pnpm local:setup para crear los entornos independientes.' }
function RunGo([string[]]$Arguments) {
    & go @Arguments
    if ($LASTEXITCODE) { throw "Go falló: $($Arguments -join ' ')" }
}
Push-Location (Join-Path $repo 'server-go')
try {
    if ($Mode -eq 'prepare') { RunGo -Arguments @('run', './cmd/logmaster', 'migrate') }
    elseif ($Mode -eq 'test') { RunGo -Arguments @('run', './cmd/logmaster', 'migrate-test') }
    if ($Mode -eq 'prepare') { RunGo -Arguments @('run', './cmd/logmaster', 'seed') }
    elseif ($Mode -eq 'test') {
        $env:LOGMASTER_DB_TEST = 'true'
        $env:LOGMASTER_RESTORE_ENV = Join-Path $repo '.env.logmaster-restore_test.local'
        RunGo -Arguments @('test', './...', '-count=1')
        RunGo -Arguments @('vet', './...')
    } elseif ($Mode -eq 'start') {
        RunGo -Arguments @('run', './cmd/logmaster', 'check')
        Push-Location $repo
        try { & pnpm exec concurrently --kill-others-on-fail 'pnpm run server' 'pnpm run client'; if ($LASTEXITCODE) { throw 'El entorno local falló' } }
        finally { Pop-Location }
    } else {
        $command = if ($Mode -eq 'server') { 'serve' } else { $Mode }
        RunGo -Arguments @('run', './cmd/logmaster', $command)
    }
} finally { Pop-Location }
