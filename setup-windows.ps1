#Requires -Version 5.1
param(
  [switch]$NoStart
)

$ErrorActionPreference = "Stop"
Set-Location -Path $PSScriptRoot

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  ContextLM - Supabase Cloud Database Setup (Windows)" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

$envFile = Join-Path -Path $PSScriptRoot -ChildPath ".env"

# Preserve existing OPENAI_API_KEY, GOOGLE_CLIENT_ID, and GOOGLE_CLIENT_SECRET if already configured
$existingOpenAiKey = ""
$existingGoogleId = ""
$existingGoogleSecret = ""
if (Test-Path -Path $envFile) {
  foreach ($envLine in (Get-Content -Path $envFile)) {
    if ($envLine -match '^OPENAI_API_KEY=(.*)$') {
      $existingOpenAiKey = $Matches[1].Trim('"').Trim("'")
    }
    if ($envLine -match '^GOOGLE_CLIENT_ID=(.*)$') {
      $existingGoogleId = $Matches[1].Trim('"').Trim("'")
    }
    if ($envLine -match '^GOOGLE_CLIENT_SECRET=(.*)$') {
      $existingGoogleSecret = $Matches[1].Trim('"').Trim("'")
    }
  }
}

Write-Host "[1/3] Writing .env with Supabase connection strings..." -ForegroundColor Cyan
$envLines = @(
  '# Connect to Postgres via the shared transaction-mode pooler (IPv4-only)',
  'DATABASE_URL="postgresql://postgres.kzyywkufxqfqqphsjwre:Zxcv597!Zxcv597@aws-1-ap-southeast-2.pooler.supabase.com:6543/postgres?pgbouncer=true"',
  '',
  '# Connect to Postgres via the shared session-mode pooler (used for migrations)',
  'DIRECT_URL="postgresql://postgres.kzyywkufxqfqqphsjwre:Zxcv597!Zxcv597@aws-1-ap-southeast-2.pooler.supabase.com:5432/postgres"',
  '',
  'AUTH_SECRET="contextlm-local-dev-secret-key-2026-secure-token"',
  'AUTH_URL="http://localhost:3000"',
  ('OPENAI_API_KEY="' + $existingOpenAiKey + '"'),
  'OPENAI_PRIMARY_MODEL="gpt-4o-mini"',
  'OPENAI_GUARDRAIL_MODEL="gpt-4o-mini"',
  ('GOOGLE_CLIENT_ID="' + $existingGoogleId + '"'),
  ('GOOGLE_CLIENT_SECRET="' + $existingGoogleSecret + '"')
)
Set-Content -Path $envFile -Value $envLines -Encoding utf8
Write-Host "      .env saved with Supabase DATABASE_URL and DIRECT_URL." -ForegroundColor Green

Write-Host ""
Write-Host "[2/3] Syncing Prisma schema, purging mock users/data, and seeding only admin..." -ForegroundColor Cyan
cmd.exe /c "npm install"
cmd.exe /c "npm run db:push"
cmd.exe /c "npm run db:seed"

if (-not $NoStart) {
  Write-Host ""
  Write-Host "[3/3] Starting ContextLM at http://localhost:3000 ..." -ForegroundColor Green
  Write-Host "      Admin Login: username = admin | password = admin" -ForegroundColor Yellow
  Write-Host ""
  cmd.exe /c "npm run dev"
}
