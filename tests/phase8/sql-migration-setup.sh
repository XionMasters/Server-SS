#!/bin/bash
# ============================================
# Phase 8.2 - SQL Migration Setup Script
# ============================================
# Este script ejecuta la migración SQL para crear la tabla processed_actions
# 
# Uso: bash sql-migration-setup.sh
# O en Windows PowerShell: .\sql-migration-setup.ps1

set -e  # Exit on error

echo "🔄 Phase 8.2 SQL Migration Setup"
echo "=================================="

# Colors
RED='\\033[0;31m'
GREEN='\\033[0;32m'
YELLOW='\\033[1;33m'
NC='\\033[0m' # No Color

# Load environment variables from .env (if exists)
if [ -f .env ]; then
  echo "📄 Loading environment variables from .env..."
  # export $(cat .env | grep -v '#' | xargs)
  source .env
fi

# Database configuration
DB_HOST=${DB_HOST:-localhost}
DB_PORT=${DB_PORT:-5432}
DB_NAME=${DB_NAME:-cg_server}
DB_USER=${DB_USER:-postgres}
DB_PASSWORD=${DB_PASSWORD}

echo ""
echo "📊 Database Configuration:"
echo "   Host: $DB_HOST"
echo "   Port: $DB_PORT"
echo "   Database: $DB_NAME"
echo "   User: $DB_USER"
echo ""

# Validate that migration file exists
MIGRATION_FILE="src/migrations/sql/001_create_processed_actions_table.sql"

if [ ! -f "$MIGRATION_FILE" ]; then
  echo -e "${RED}❌ Migration file not found: $MIGRATION_FILE${NC}"
  exit 1
fi

echo "✅ Migration file found: $MIGRATION_FILE"
echo ""

# Pre-migration validation
echo "🔍 Pre-migration checks:"
echo "   1. Testing database connection..."

PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "SELECT 1" > /dev/null 2>&1

if [ $? -eq 0 ]; then
  echo -e "   ${GREEN}✓ Database connection successful${NC}"
else
  echo -e "   ${RED}✗ Database connection failed${NC}"
  echo "   Verify DB_HOST, DB_PORT, DB_USER, DB_PASSWORD"
  exit 1
fi

echo "   2. Checking if processed_actions table already exists..."

TABLE_EXISTS=$(PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -tc "SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'processed_actions';" | tr -d ' ')

if [ "$TABLE_EXISTS" -eq 1 ]; then
  echo -e "   ${YELLOW}⚠️  Table processed_actions already exists${NC}"
  echo "   Migration will update indices and triggers"
else
  echo -e "   ${GREEN}✓ Table does not exist yet (will be created)${NC}"
fi

echo ""
echo "🚀 Executing migration..."
echo ""

# Execute migration
PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f "$MIGRATION_FILE"

if [ $? -eq 0 ]; then
  echo ""
  echo -e "${GREEN}✅ Migration completed successfully!${NC}"
else
  echo ""
  echo -e "${RED}❌ Migration failed${NC}"
  exit 1
fi

# Post-migration validation
echo ""
echo "🔍 Post-migration validation:"
echo ""

# Check table exists
echo "   1. Verifying table creation..."
TABLE_ROWS=$(PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -tc "SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'processed_actions';" | tr -d ' ')

if [ "$TABLE_ROWS" -eq 1 ]; then
  echo -e "      ${GREEN}✓ processed_actions table exists${NC}"
else
  echo -e "      ${RED}✗ processed_actions table not found${NC}"
  exit 1
fi

# Check columns
echo "   2. Verifying table structure..."
COLUMNS=$(PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -tc "SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'processed_actions';" | tr -d ' ')

echo -e "      ${GREEN}✓ Table has $COLUMNS columns${NC}"

# Check indices
echo "   3. Verifying indices..."
INDICES=$(PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -tc "SELECT COUNT(*) FROM pg_indexes WHERE tablename = 'processed_actions';" | tr -d ' ')

echo -e "      ${GREEN}✓ Table has $INDICES indices${NC}"

# Check triggers
echo "   4. Verifying triggers..."
TRIGGERS=$(PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -tc "SELECT COUNT(*) FROM information_schema.triggers WHERE event_object_table = 'processed_actions';" | tr -d ' ')

echo -e "      ${GREEN}✓ Table has $TRIGGERS triggers${NC}"

echo ""
echo "=================================="
echo -e "${GREEN}🎉 Phase 8.2 SQL Migration Complete!${NC}"
echo "=================================="
echo ""
echo "📋 Next steps:"
echo "   1. Verify ProcessedAction model is synced in Sequelize"
echo "   2. Start the server: npm run dev"
echo "   3. Run manual tests from MANUAL-TESTING-CHECKLIST.md"
echo "   4. Check database with validation queries"
echo ""
