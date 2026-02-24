# ============================================
# Phase 8.2 - SQL Migration Setup Script (PowerShell)
# ============================================
# Compatible with Windows PowerShell
# Usage: .\sql-migration-setup.ps1

param(
    [string]$DbHost = "localhost",
    [string]$DbPort = "5432",
    [string]$DbName = "cg_server",
    [string]$DbUser = "postgres",
    [string]$DbPassword = ""
)

Write-Host ""
Write-Host "========================================"
Write-Host "Phase 8.2 SQL Migration Setup"
Write-Host "========================================"
Write-Host ""

# Load environment variables from .env if exists
$envFile = ".env"
if (Test-Path $envFile) {
    Write-Host "Loading environment from .env..."
    Get-Content $envFile | ForEach-Object {
        if ($_ -match "^([^#].+)=(.*)$") {
            $name = $matches[1]
            $value = $matches[2]
            [System.Environment]::SetEnvironmentVariable($name, $value)
        }
    }
}

# Use environment variables if available
if ([System.Environment]::GetEnvironmentVariable("DB_HOST")) { 
    $DbHost = [System.Environment]::GetEnvironmentVariable("DB_HOST") 
}
if ([System.Environment]::GetEnvironmentVariable("DB_PORT")) { 
    $DbPort = [System.Environment]::GetEnvironmentVariable("DB_PORT") 
}
if ([System.Environment]::GetEnvironmentVariable("DB_NAME")) { 
    $DbName = [System.Environment]::GetEnvironmentVariable("DB_NAME") 
}
if ([System.Environment]::GetEnvironmentVariable("DB_USER")) { 
    $DbUser = [System.Environment]::GetEnvironmentVariable("DB_USER") 
}
if ([System.Environment]::GetEnvironmentVariable("DB_PASSWORD")) { 
    $DbPassword = [System.Environment]::GetEnvironmentVariable("DB_PASSWORD") 
}

Write-Host "Database Configuration:"
Write-Host "  Host: $DbHost"
Write-Host "  Port: $DbPort"
Write-Host "  Database: $DbName"
Write-Host "  User: $DbUser"
Write-Host ""

# Validate migration file exists
$MIGRATION_FILE = "src\migrations\sql\001_create_processed_actions_table.sql"

if (-not (Test-Path $MIGRATION_FILE)) {
    Write-Host "[ERROR] Migration file not found: $MIGRATION_FILE" -ForegroundColor Red
    exit 1
}

Write-Host "[OK] Migration file found: $MIGRATION_FILE" -ForegroundColor Green
Write-Host ""
Write-Host "Pre-migration checks:"
Write-Host "  1. Testing database connection..."

# Set password environment variable
$env:PGPASSWORD = $DbPassword

# Test connection
try {
    $output = psql -h $DbHost -p $DbPort -U $DbUser -d $DbName -c "SELECT 1" 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  [OK] Database connection successful" -ForegroundColor Green
    } else {
        Write-Host "  [ERROR] Connection failed" -ForegroundColor Red
        Write-Host "  Please verify DB credentials and try again"
        exit 1
    }
} catch {
    Write-Host "  [ERROR] Could not connect: $_" -ForegroundColor Red
    exit 1
}

Write-Host "  2. Checking if table already exists..."
try {
    $result = psql -h $DbHost -p $DbPort -U $DbUser -d $DbName -tc "SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'processed_actions';" 2>&1
    $tableExists = [int]($result.Trim())
    
    if ($tableExists -eq 1) {
        Write-Host "  [WARN] Table processed_actions already exists (will update)" -ForegroundColor Yellow
    } else {
        Write-Host "  [OK] Table will be created" -ForegroundColor Green
    }
} catch {
    Write-Host "  [WARN] Could not check table" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Executing migration..."
Write-Host ""

# Execute migration
try {
    $env:PGPASSWORD = $DbPassword
    $output = psql -h $DbHost -p $DbPort -U $DbUser -d $DbName -f $MIGRATION_FILE

    if ($LASTEXITCODE -ne 0) {
        Write-Host "[ERROR] Migration failed" -ForegroundColor Red
        Write-Host $output
        exit 1
    }
    
    Write-Host ""
    Write-Host "[OK] Migration executed successfully" -ForegroundColor Green
} catch {
    Write-Host ""
    Write-Host "[ERROR] Migration failed: $_" -ForegroundColor Red
    exit 1
}

# Post-migration validation
Write-Host ""
Write-Host "Post-migration validation:"
Write-Host ""

try {
    Write-Host "  1. Verifying table creation..."
    $result = psql -h $DbHost -p $DbPort -U $DbUser -d $DbName -tc "SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'processed_actions';" 2>&1
    $tableRows = [int]($result.Trim())
    
    if ($tableRows -eq 1) {
        Write-Host "     [OK] processed_actions table exists" -ForegroundColor Green
    } else {
        Write-Host "     [ERROR] Table not found" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "     [ERROR] Verification failed: $_" -ForegroundColor Red
}

try {
    Write-Host "  2. Verifying table structure..."
    $result = psql -h $DbHost -p $DbPort -U $DbUser -d $DbName -tc "SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'processed_actions';" 2>&1
    $columns = [int]($result.Trim())
    Write-Host "     [OK] Table has $columns columns" -ForegroundColor Green
} catch {
    Write-Host "     [WARN] Could not verify columns" -ForegroundColor Yellow
}

try {
    Write-Host "  3. Verifying indices..."
    $result = psql -h $DbHost -p $DbPort -U $DbUser -d $DbName -tc "SELECT COUNT(*) FROM pg_indexes WHERE tablename = 'processed_actions';" 2>&1
    $indices = [int]($result.Trim())
    Write-Host "     [OK] Table has $indices indices" -ForegroundColor Green
} catch {
    Write-Host "     [WARN] Could not verify indices" -ForegroundColor Yellow
}

try {
    Write-Host "  4. Verifying triggers..."
    $result = psql -h $DbHost -p $DbPort -U $DbUser -d $DbName -tc "SELECT COUNT(*) FROM information_schema.triggers WHERE event_object_table = 'processed_actions';" 2>&1
    $triggers = [int]($result.Trim())
    Write-Host "     [OK] Table has $triggers triggers" -ForegroundColor Green
} catch {
    Write-Host "     [WARN] Could not verify triggers" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "========================================"
Write-Host "Phase 8.2 SQL Migration Complete!" -ForegroundColor Green
Write-Host "========================================"
Write-Host ""
Write-Host "Next steps:"
Write-Host "  1. Start server: npm run dev"
Write-Host "  2. Run tests: npm test tests\phase8\integration.test.ts"
Write-Host "  3. Postman tests: Import postman-collection.json"
Write-Host "  4. Manual testing: See MANUAL-TESTING-CHECKLIST.md"
Write-Host ""

# Clean up
$env:PGPASSWORD = ""
