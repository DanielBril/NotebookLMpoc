#Requires -Version 5.1
param(
  [switch]$MockMode,
  [switch]$NoStart
)

$ErrorActionPreference = "Stop"
Set-Location -Path $PSScriptRoot

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  ContextLM - Automated Windows Setup" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

# Check Administrator privileges (needed to edit pg_hba.conf and restart PostgreSQL service)
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($identity)
$adminRole = [Security.Principal.WindowsBuiltInRole]::Administrator
$isAdmin = $principal.IsInRole($adminRole)

if ((-not $isAdmin) -and (-not $MockMode)) {
  Write-Host "[!] Opening Administrator PowerShell to configure PostgreSQL..." -ForegroundColor Yellow
  $scriptPath = $PSCommandPath
  $argString = '-NoExit -ExecutionPolicy Bypass -File "' + $scriptPath + '"'
  if ($NoStart) {
    $argString = $argString + ' -NoStart'
  }
  Start-Process -FilePath "powershell.exe" -Verb RunAs -ArgumentList $argString
  exit
}

$pgConfigured = $false

if (-not $MockMode) {
  Write-Host "[1/4] Detecting local PostgreSQL Windows service..." -ForegroundColor Cyan

  # Restore any leftover trust rules across all installed PostgreSQL versions first
  $allHba = Get-ChildItem -Path "C:\Program Files\PostgreSQL\*\data\pg_hba.conf" -ErrorAction SilentlyContinue
  foreach ($hbaItem in $allHba) {
    $lines = Get-Content -Path $hbaItem.FullName
    $updatedLines = foreach ($line in $lines) {
      if (($line -match '^host\s+all\s+all') -and ($line -match '\s+trust\s*$')) {
        $line -replace '\s+trust\s*$', ' scram-sha-256'
      } else {
        $line
      }
    }
    Set-Content -Path $hbaItem.FullName -Value $updatedLines -Encoding ascii
  }

  $pgServices = Get-CimInstance -ClassName Win32_Service | Where-Object { $_.Name -like "*postgres*" }
  $activeService = $pgServices | Where-Object { $_.State -eq "Running" } | Select-Object -First 1
  if (-not $activeService) {
    $activeService = $pgServices | Sort-Object -Property Name -Descending | Select-Object -First 1
  }

  if ($activeService) {
    Write-Host ("      Found service: " + $activeService.Name + " (" + $activeService.State + ")") -ForegroundColor Green

    # Locate matching PostgreSQL directory in Program Files
    $pgDirs = Get-ChildItem -Path "C:\Program Files\PostgreSQL\*" -Directory -ErrorAction SilentlyContinue | Sort-Object -Property Name -Descending
    $selectedDir = $null
    foreach ($dir in $pgDirs) {
      if ($activeService.Name -like ("*" + $dir.Name + "*")) {
        $selectedDir = $dir.FullName
        break
      }
    }
    if ((-not $selectedDir) -and ($pgDirs.Count -gt 0)) {
      $selectedDir = $pgDirs[0].FullName
    }

    if ($selectedDir) {
      $hbaFile = Join-Path -Path $selectedDir -ChildPath "data\pg_hba.conf"
      $psqlExe = Join-Path -Path $selectedDir -ChildPath "bin\psql.exe"

      if ((Test-Path -Path $hbaFile) -and (Test-Path -Path $psqlExe)) {
        Write-Host ("      Configuring PostgreSQL in: " + $selectedDir) -ForegroundColor Cyan

        # Temporarily set localhost IPv4 and IPv6 host lines to trust
        $origLines = Get-Content -Path $hbaFile
        $trustLines = foreach ($line in $origLines) {
          if (($line -match '^host\s+all\s+all') -and ($line -match '(scram-sha-256|md5)\s*$')) {
            $line -replace '(scram-sha-256|md5)\s*$', 'trust'
          } else {
            $line
          }
        }
        Set-Content -Path $hbaFile -Value $trustLines -Encoding ascii
        Restart-Service -Name $activeService.Name -Force
        Start-Sleep -Seconds 2

        try {
          Write-Host "      Setting 'postgres' password to 'postgres'..." -ForegroundColor Cyan
          $alterSql = "ALTER USER postgres WITH PASSWORD 'postgres';"
          & $psqlExe -h localhost -p 5432 -U postgres -c $alterSql | Out-Null

          $checkSql = "SELECT 1 FROM pg_database WHERE datname='contextlm';"
          $dbCheck = (& $psqlExe -h localhost -p 5432 -U postgres -tAc $checkSql) | Out-String
          if ($dbCheck.Trim() -ne "1") {
            Write-Host "      Creating database 'contextlm'..." -ForegroundColor Cyan
            $createSql = "CREATE DATABASE contextlm;"
            & $psqlExe -h localhost -p 5432 -U postgres -c $createSql | Out-Null
          } else {
            Write-Host "      Database 'contextlm' already exists." -ForegroundColor Green
          }
          $pgConfigured = $true
        } finally {
          # Restore scram-sha-256 and restart service
          $lockedLines = foreach ($line in (Get-Content -Path $hbaFile)) {
            if (($line -match '^host\s+all\s+all') -and ($line -match '\s+trust\s*$')) {
              $line -replace '\s+trust\s*$', ' scram-sha-256'
            } else {
              $line
            }
          }
          Set-Content -Path $hbaFile -Value $lockedLines -Encoding ascii
          Restart-Service -Name $activeService.Name -Force
          Start-Sleep -Seconds 2
        }

        Write-Host "      PostgreSQL is ready! (localhost:5432, user: postgres, pass: postgres, db: contextlm)" -ForegroundColor Green
      } else {
        Write-Warning "Could not find pg_hba.conf or psql.exe. Falling back to DEMO_MOCK_MODE."
        $MockMode = $true
      }
    } else {
      Write-Warning "No PostgreSQL installation folder found. Falling back to DEMO_MOCK_MODE."
      $MockMode = $true
    }
  } else {
    Write-Warning "No PostgreSQL service found. Falling back to DEMO_MOCK_MODE."
    $MockMode = $true
  }
}

Write-Host ""
Write-Host "[2/4] Writing .env configuration..." -ForegroundColor Cyan
$envFile = Join-Path -Path $PSScriptRoot -ChildPath ".env"
$mockValue = if ($MockMode) { "true" } else { "false" }

# Preserve existing OPENAI_API_KEY if user already set one in .env
$existingOpenAiKey = ""
if (Test-Path -Path $envFile) {
  foreach ($envLine in (Get-Content -Path $envFile)) {
    if ($envLine -match '^OPENAI_API_KEY=(.*)$') {
      $existingOpenAiKey = $Matches[1].Trim('"').Trim("'")
    }
  }
}

$envLines = @(
  'DATABASE_URL="postgresql://postgres:postgres@localhost:5432/contextlm"',
  'AUTH_SECRET="contextlm-local-dev-secret-key-2026-secure-token"',
  'AUTH_URL="http://localhost:3000"',
  ('OPENAI_API_KEY="' + $existingOpenAiKey + '"'),
  'OPENAI_PRIMARY_MODEL="gpt-4o-mini"',
  'OPENAI_GUARDRAIL_MODEL="gpt-4o-mini"',
  ('DEMO_MOCK_MODE="' + $mockValue + '"'),
  ('NEXT_PUBLIC_DEMO_MOCK_MODE="' + $mockValue + '"')
)
Set-Content -Path $envFile -Value $envLines -Encoding utf8
Write-Host "      Saved .env successfully." -ForegroundColor Green

Write-Host ""
Write-Host "[3/4] Installing packages and syncing Prisma database..." -ForegroundColor Cyan
cmd.exe /c "npm install"
if (-not $MockMode) {
  cmd.exe /c "npm run db:push"
  cmd.exe /c "npm run db:seed"
}

if (-not $NoStart) {
  Write-Host ""
  Write-Host "[4/4] Starting ContextLM at http://localhost:3000 ..." -ForegroundColor Green
  Write-Host "      Default Admin Login: username = admin | password = admin" -ForegroundColor Yellow
  Write-Host ""
  cmd.exe /c "npm run dev"
}
