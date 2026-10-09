param([ValidateSet('prepare', 'start', 'test')][string]$Mode = 'start')
$ErrorActionPreference = 'Stop'
$repo = Split-Path $PSScriptRoot -Parent
$runtime = Join-Path (Split-Path $repo -Parent) 'Visitors-local'
& "$PSScriptRoot/setup-local.ps1" -StartOnly
$env:PATH = "$runtime/pgsql/bin;$env:PATH"
$suffix = if ($Mode -eq 'test') { 'test' } else { 'dev' }
$env:DOTENV_CONFIG_PATH = Join-Path $repo ".env.logmaster-$suffix.local"
$env:LOG_LEVEL = 'warn'
Push-Location $repo
try {
    if ($Mode -ne 'start') {
        & pnpm --dir server exec ts-node src/scripts/prepare-local.ts
        if ($LASTEXITCODE) { throw 'Preparing local database failed' }
    }
    if ($Mode -eq 'test') {
        $env:NODE_ENV = 'test'
        & pnpm --dir server exec vitest run --config vitest.integration.config.ts
        if ($LASTEXITCODE) { throw 'Integration tests failed' }
    } elseif ($Mode -eq 'start') {
        & pnpm run start:legacy
        if ($LASTEXITCODE) { throw 'Local server failed' }
    }
} finally { Pop-Location }
