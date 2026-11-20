#Requires -Version 5.1
<#
.SYNOPSIS
  Automated Windows Local Setup for ContextLM (NotebookLMpoc)
.DESCRIPTION
  1. Checks for Administrator privileges (auto-elevates if needed so it can configure PostgreSQL).
  2. Auto-detects the active PostgreSQL installation on Windows (PostgreSQL 18 / 17 / 16 / 15).
  3. Resets the local 'postgres' user password to 'postgres', creates the 'contextlm' database,
     and restores scram-sha-256 authentication in pg_hba.conf.
  4. Creates or updates the local .env file with working DATABASE_URL and AUTH_SECRET.
  5. Runs npm install, npx prisma db push, and npm run db:seed.
#>

param(
  [switch]$MockMode,
  [switch]$NoStart
)

$ErrorActionPreference = "Stop"
Set-Location -Path $PSScriptRoot

Write-Host "`n============================================================" -ForegroundColor Cyan
Write-Host "  ContextLM — Automated Windows Setup" -ForegroundColor Cyan
Write-Host "============================================================`n" -ForegroundColor Cyan

# Check Administrator privileges (needed to edit pg_hba.conf & restart PostgreSQL service)
$currentPrincipal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
$isAdmin = $currentPrincipal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin -and -not $MockMode) {
  Write-Host "[!] Elevating PowerShell to Administrator to configure PostgreSQL..." -ForegroundColor Yellow
  $argList = "-NoExit -ExecutionPolicy Bypass -File `"$PSCommandPath`""
  if ($NoStart) { $argList += " -NoStart" }
  Start-Process powershell.exe -Verb RunAs -ArgumentList $argList
  exit
}

# 1. Configure PostgreSQL unless -MockMode was requested
$pgConfigured = $false
if (-not $MockMode) {
  Write-Host "[1/4] Detecting local PostgreSQL Windows service..." -ForegroundColor Cyan

  # Restore any leftover 'trust' rules in all installed versions first
  Get-ChildItem "C:\Program Files\PostgreSQL\*\data\pg_hba.conf" -ErrorAction SilentlyContinue | ForEach-Object {
    $hbaPath = $_.FullName
    $content = Get-Content $hbaPath
    if ($content -match '^(host\s+all\s+all\s+(127\.0\.0\.1/32|::1/128)\s+)trust') {
      ($content -replace '^(host\s+all\s+all\s+(127\.0\.0\.1/32|::1/128)\s+)trust', '${1}scram-sha-256') | Set-Content -Encoding ascii $hbaPath
    }
  }

  $pgServices = Get-CimInstance Win32_Service | Where-Object { $_.Name -like "*postgres*" }
  $activeService = $pgServices | Where-Object { $_.State -eq "Running" } | Select-Object -First 1
  if (-not $activeService) {
    $activeService = $pgServices | Sort-Object Name -Descending | Select-Object -First 1
  }

  if ($activeService) {
    Write-Host "      Found service: $($activeService.Name) ($($activeService.State))" -ForegroundColor Green

    # Extract installation directory from service PathName or fallback to highest version in Program Files
    $pgDir = $null
    if ($activeService.PathName -match '"([^"]+\\PostgreSQL\\[^\\]+)\\bin\\') {
      $pgDir = $Matches[1]
    }
    if (-not $pgDir -or -not (Test-Path $pgDir)) {
      $pgDir = (Get-ChildItem "C:\Program Files\PostgreSQL\*" -Directory | Sort-Object Name -Descending | Select-Object -First 1).FullName
    }

    $hbaFile = Join-Path $pgDir "data\pg_hba.conf"
    $psqlExe = Join-Path $pgDir "bin\psql.exe"

    if ((Test-Path $hbaFile) -and (Test-Path $psqlExe)) {
      Write-Host "      Configuring PostgreSQL at: $pgDir" -ForegroundColor Cyan

      # Temporarily set IPv4 & IPv6 localhost to trust
      (Get-Content $hbaFile) -replace '^(host\s+all\s+all\s+(127\.0\.0\.1/32|::1/128)\s+)(scram-sha-256|md5)', '${1}trust' | Set-Content -Encoding ascii $hbaFile
      Restart-Service -Name $activeService.Name -Force
      Start-Sleep -Seconds 2

      try {
        Write-Host "      Resetting 'postgres' password to 'postgres'..." -ForegroundColor Cyan
        & $psqlExe -h localhost -p 5432 -U postgres -c "ALTER USER postgres WITH PASSWORD 'postgres';" | Out-Null

        $dbExists = (& $psqlExe -h localhost -p 5432 -U postgres -tAc "SELECT 1 FROM pg_database WHERE datname='contextlm';").Trim()
        if ($dbExists -ne "1") {
          Write-Host "      Creating database 'contextlm'..." -ForegroundColor Cyan
          & $psqlExe -h localhost -p 5432 -U postgres -c "CREATE DATABASE contextlm;" | Out-Null
        } else {
          Write-Host "      Database 'contextlm' already exists." -ForegroundColor Green
        }
        $pgConfigured = $true
      } finally {
        # Always restore scram-sha-256 and restart
        (Get-Content $hbaFile) -replace '^(host\s+all\s+all\s+(127\.0\.0\.1/32|::1/128)\s+)trust', '${1}scram-sha-256' | Set-Content -Encoding ascii $hbaFile
        Restart-Service -Name $activeService.Name -Force
        Start-Sleep -Seconds 2
      }

      Write-Host "      PostgreSQL is ready! (Host: localhost, Port: 5432, User: postgres, Pass: postgres, DB: contextlm)" -ForegroundColor Green
    } else {
      Write-Warning "Could not locate pg_hba.conf or psql.exe under $pgDir. Falling back to DEMO_MOCK_MODE."
      $MockMode = $true
    }
  } else {
    Write-Warning "No PostgreSQL Windows service found. Enabling DEMO_MOCK_MODE so the app runs without PostgreSQL."
    $MockMode = $true
  }
}

# 2. Create or update .env
Write-Host "`n[2/4] Configuring .env file..." -ForegroundColor Cyan
$envFile = Join-Path $PSScriptRoot ".env"
$mockFlag = if ($MockMode) { "true" } else { "false" }

if (-not (Test-Path $envFile)) {
  $secret = -join ((48..57) + (65..90) + (97..122) | Get-Random -Count 40 | ForEach-Object { [char]$_ })
  @"
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/contextlm"
AUTH_SECRET="$secret"
AUTH_URL="http://localhost:3000"
OPENAI_API_KEY=""
OPENAI_PRIMARY_MODEL="gpt-4o-mini"
OPENAI_GUARDRAIL_MODEL="gpt-4o-mini"
DEMO_MOCK_MODE="$mockFlag"
NEXT_PUBLIC_DEMO_MOCK_MODE="$mockFlag"
"@ | Set-Content -Encoding utf8 $envFile
  Write-Host "      Created .env with DATABASE_URL=postgresql://postgres:postgres@localhost:5432/contextlm" -ForegroundColor Green
} else {
  $envText = Get-Content $envFile -Raw
  if ($pgConfigured) {
    $envText = $envText -replace 'DATABASE_URL="[^"]*"', 'DATABASE_URL="postgresql://postgres:postgres@localhost:5432/contextlm"'
  }
  if ($envText -notmatch "DEMO_MOCK_MODE=") {
    $envText += "`nDEMO_MOCK_MODE=`"$mockFlag`"`nNEXT_PUBLIC_DEMO_MOCK_MODE=`"$mockFlag`"`n"
  }
  Set-Content -Encoding utf8 $envFile $envText.TrimEnd()
  Write-Host "      Updated existing .env file." -ForegroundColor Green
}

# 3. Install dependencies & push Prisma schema
Write-Host "`n[3/4] Installing dependencies & syncing database schema..." -ForegroundColor Cyan
cmd /c "npm install"
if (-not $MockMode) {
  cmd /c "npm run db:push"
  cmd /c "npm run db:seed"
}

# 4. Launch development server
if (-not $NoStart) {
  Write-Host "`n[4/4] Starting ContextLM at http://localhost:3000 ..." -ForegroundColor Green
  Write-Host "      Default Admin Login: username = admin | password = admin`n" -ForegroundColor Yellow
  cmd /c "npm run dev"
}
