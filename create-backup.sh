#!/bin/bash

###############################################################################
# Reinisch Classroom - Full Project Backup Script
# 
# This script creates a complete backup of all project source code,
# organized and timestamped for archival purposes.
#
# Usage: ./create-backup.sh
# Output: backup-YYYY-MM-DD-HHMMSS.tar.gz
###############################################################################

set -e  # Exit on error

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Generate timestamp
TIMESTAMP=$(date +%Y-%m-%d-%H%M%S)
BACKUP_NAME="reinisch-classroom-backup-${TIMESTAMP}"
BACKUP_DIR="/tmp/${BACKUP_NAME}"

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Reinisch Classroom Backup Script${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Get current directory
PROJECT_ROOT=$(pwd)
echo -e "${YELLOW}Project root:${NC} ${PROJECT_ROOT}"
echo -e "${YELLOW}Backup name:${NC} ${BACKUP_NAME}"
echo ""

# Create backup directory
echo -e "${GREEN}Creating backup directory...${NC}"
mkdir -p "${BACKUP_DIR}"

# Create subdirectories for organization
echo -e "${GREEN}Creating organized structure...${NC}"
mkdir -p "${BACKUP_DIR}/source"
mkdir -p "${BACKUP_DIR}/documentation"
mkdir -p "${BACKUP_DIR}/database"
mkdir -p "${BACKUP_DIR}/config"
mkdir -p "${BACKUP_DIR}/tests"
mkdir -p "${BACKUP_DIR}/metadata"

# Copy source code
echo -e "${GREEN}Backing up source code...${NC}"
cp -r "${PROJECT_ROOT}/site" "${BACKUP_DIR}/source/" 2>/dev/null || true
cp -r "${PROJECT_ROOT}/web" "${BACKUP_DIR}/source/" 2>/dev/null || true
cp -r "${PROJECT_ROOT}/netlify" "${BACKUP_DIR}/source/" 2>/dev/null || true
cp -r "${PROJECT_ROOT}/assets" "${BACKUP_DIR}/source/" 2>/dev/null || true
cp -r "${PROJECT_ROOT}/scripts" "${BACKUP_DIR}/source/" 2>/dev/null || true
cp -r "${PROJECT_ROOT}/presentations" "${BACKUP_DIR}/source/" 2>/dev/null || true
cp -r "${PROJECT_ROOT}/prototypes" "${BACKUP_DIR}/source/" 2>/dev/null || true

# Copy documentation
echo -e "${GREEN}Backing up documentation...${NC}"
cp -r "${PROJECT_ROOT}/docs" "${BACKUP_DIR}/documentation/" 2>/dev/null || true
cp "${PROJECT_ROOT}"/*.md "${BACKUP_DIR}/documentation/" 2>/dev/null || true
cp "${PROJECT_ROOT}/PROJECT_MAP.md" "${BACKUP_DIR}/" 2>/dev/null || true

# Copy database schemas and migrations
echo -e "${GREEN}Backing up database schemas...${NC}"
cp -r "${PROJECT_ROOT}/supabase" "${BACKUP_DIR}/database/" 2>/dev/null || true

# Copy configuration files
echo -e "${GREEN}Backing up configuration files...${NC}"
cp "${PROJECT_ROOT}/package.json" "${BACKUP_DIR}/config/" 2>/dev/null || true
cp "${PROJECT_ROOT}/package-lock.json" "${BACKUP_DIR}/config/" 2>/dev/null || true
cp "${PROJECT_ROOT}/netlify.toml" "${BACKUP_DIR}/config/" 2>/dev/null || true
cp "${PROJECT_ROOT}/playwright.config.js" "${BACKUP_DIR}/config/" 2>/dev/null || true
cp "${PROJECT_ROOT}/.eslintrc.json" "${BACKUP_DIR}/config/" 2>/dev/null || true
cp "${PROJECT_ROOT}/.eslintignore" "${BACKUP_DIR}/config/" 2>/dev/null || true
cp "${PROJECT_ROOT}/.prettierrc.json" "${BACKUP_DIR}/config/" 2>/dev/null || true
cp "${PROJECT_ROOT}/.gitignore" "${BACKUP_DIR}/config/" 2>/dev/null || true
cp "${PROJECT_ROOT}/_headers" "${BACKUP_DIR}/config/" 2>/dev/null || true
cp "${PROJECT_ROOT}/index.html" "${BACKUP_DIR}/config/" 2>/dev/null || true
cp "${PROJECT_ROOT}/styles.css" "${BACKUP_DIR}/config/" 2>/dev/null || true

# Copy test files
echo -e "${GREEN}Backing up tests...${NC}"
cp -r "${PROJECT_ROOT}/tests" "${BACKUP_DIR}/tests/" 2>/dev/null || true

# Copy root-level scripts
echo -e "${GREEN}Backing up root scripts...${NC}"
cp "${PROJECT_ROOT}"/*.mjs "${BACKUP_DIR}/source/" 2>/dev/null || true
cp "${PROJECT_ROOT}"/*.js "${BACKUP_DIR}/source/" 2>/dev/null || true

# Create metadata file
echo -e "${GREEN}Creating backup metadata...${NC}"
cat > "${BACKUP_DIR}/metadata/BACKUP_INFO.txt" << EOF
Reinisch Classroom - Project Backup
====================================

Backup Created: ${TIMESTAMP}
Backup Name: ${BACKUP_NAME}
Project Root: ${PROJECT_ROOT}

Contents:
---------
- /source          : Application source code (site, web, netlify, assets, scripts)
- /documentation   : All project documentation (docs, *.md files)
- /database        : Database schemas and migrations (supabase)
- /config          : Configuration files (package.json, netlify.toml, etc.)
- /tests           : Test suites (Playwright tests)
- /metadata        : This file and file inventory

Project Overview:
-----------------
Reinisch Classroom is a comprehensive educational management platform
for special education classrooms. See PROJECT_MAP.md for complete
documentation.

Key Components:
---------------
- Student Portals (A, B, C)
- Teacher Center (unified interface)
- Admin Dashboard
- Curriculum Content (Language Arts, Life Skills, Math)
- Supabase Database
- Netlify Serverless Functions

Technology Stack:
-----------------
- Frontend: HTML5, CSS3, Vanilla JavaScript
- Backend: Netlify Functions, Netlify Edge Functions
- Database: Supabase (PostgreSQL)
- Testing: Playwright
- Deployment: Netlify

For more information, see PROJECT_MAP.md in the root of this backup.

Restoration Instructions:
-------------------------
1. Extract this archive to a directory
2. Navigate to the extracted directory
3. Install dependencies: npm install
4. Set up environment variables (see documentation)
5. Set up Supabase database (see database/supabase/README)
6. Deploy to Netlify or run locally

EOF

# Create file inventory
echo -e "${GREEN}Creating file inventory...${NC}"
cat > "${BACKUP_DIR}/metadata/FILE_INVENTORY.txt" << EOF
Reinisch Classroom - File Inventory
====================================
Generated: ${TIMESTAMP}

Directory Structure:
--------------------
EOF

# Add tree structure to inventory
cd "${BACKUP_DIR}"
if command -v tree &> /dev/null; then
    tree -L 3 -F >> "${BACKUP_DIR}/metadata/FILE_INVENTORY.txt"
else
    find . -type d | sort >> "${BACKUP_DIR}/metadata/FILE_INVENTORY.txt"
fi

echo "" >> "${BACKUP_DIR}/metadata/FILE_INVENTORY.txt"
echo "File Count by Type:" >> "${BACKUP_DIR}/metadata/FILE_INVENTORY.txt"
echo "-------------------" >> "${BACKUP_DIR}/metadata/FILE_INVENTORY.txt"

# Count files by extension
for ext in js mjs html css sql json md txt sh; do
    count=$(find "${BACKUP_DIR}" -name "*.${ext}" | wc -l)
    printf "%-10s: %d\n" ".${ext}" "$count" >> "${BACKUP_DIR}/metadata/FILE_INVENTORY.txt"
done

# Add total file count
total_files=$(find "${BACKUP_DIR}" -type f | wc -l)
echo "" >> "${BACKUP_DIR}/metadata/FILE_INVENTORY.txt"
echo "Total Files: ${total_files}" >> "${BACKUP_DIR}/metadata/FILE_INVENTORY.txt"

cd "${PROJECT_ROOT}"

# Create compressed archive
echo ""
echo -e "${GREEN}Creating compressed archive...${NC}"
tar -czf "${PROJECT_ROOT}/${BACKUP_NAME}.tar.gz" -C /tmp "${BACKUP_NAME}"

# Get archive size
ARCHIVE_SIZE=$(du -h "${PROJECT_ROOT}/${BACKUP_NAME}.tar.gz" | cut -f1)

# Clean up temporary directory
echo -e "${GREEN}Cleaning up...${NC}"
rm -rf "${BACKUP_DIR}"

# Success message
echo ""
echo -e "${BLUE}========================================${NC}"
echo -e "${GREEN}✓ Backup completed successfully!${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo -e "${YELLOW}Backup file:${NC} ${BACKUP_NAME}.tar.gz"
echo -e "${YELLOW}Size:${NC} ${ARCHIVE_SIZE}"
echo -e "${YELLOW}Location:${NC} ${PROJECT_ROOT}/${BACKUP_NAME}.tar.gz"
echo ""
echo -e "${YELLOW}Contents:${NC}"
echo "  - Source code (site, web, netlify, assets, scripts)"
echo "  - Documentation (docs, all .md files)"
echo "  - Database schemas and migrations"
echo "  - Configuration files"
echo "  - Test suites"
echo "  - Project map and metadata"
echo ""
echo -e "${BLUE}To extract:${NC}"
echo "  tar -xzf ${BACKUP_NAME}.tar.gz"
echo ""
echo -e "${BLUE}To view contents:${NC}"
echo "  tar -tzf ${BACKUP_NAME}.tar.gz | less"
echo ""

# Create a simple extraction script inside the backup
echo -e "${GREEN}Done!${NC}"
exit 0
