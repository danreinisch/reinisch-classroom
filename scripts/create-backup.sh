#!/usr/bin/env bash
###############################################################################
# create-backup.sh
#
# Comprehensive backup script for reinisch-classroom project.
# Creates a complete, reconstructable backup including:
# - Full Git history (git bundle)
# - Environment variable metadata (names + lengths only, NO VALUES)
# - Optional Supabase schema export
# - File hash inventory (SHA-256) for integrity verification
# - JSON and text inventories
# - Detailed restore instructions
#
# Usage:
#   ./scripts/create-backup.sh [OPTIONS]
#
# Options:
#   --no-git-bundle         Skip Git bundle creation
#   --supabase-schema       Include Supabase schema export (opt-in)
#   --dry-run               Show what would be backed up without creating files
#   --list-only             List files that would be backed up and exit
#   --output-dir DIR        Output directory for backup (default: ./backups)
#   --help                  Show this help message
#
# Environment Variables:
#   INCLUDE_GIT_BUNDLE=1    Include Git bundle (default: 1)
#   INCLUDE_ENV_MANIFEST=1  Include environment manifest (default: 1)
#   INCLUDE_SUPABASE_SCHEMA=0  Include Supabase schema (default: 0, opt-in)
#   INCLUDE_FILE_HASHES=1   Include file hash inventory (default: 1)
#   DRY_RUN=0               Dry run mode (default: 0)
#   LIST_ONLY=0             List-only mode (default: 0)
#
###############################################################################

set -euo pipefail

# Default configuration
INCLUDE_GIT_BUNDLE="${INCLUDE_GIT_BUNDLE:-1}"
INCLUDE_ENV_MANIFEST="${INCLUDE_ENV_MANIFEST:-1}"
INCLUDE_SUPABASE_SCHEMA="${INCLUDE_SUPABASE_SCHEMA:-0}"
INCLUDE_FILE_HASHES="${INCLUDE_FILE_HASHES:-1}"
DRY_RUN="${DRY_RUN:-0}"
LIST_ONLY="${LIST_ONLY:-0}"
OUTPUT_DIR="./backups"
BACKUP_TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

###############################################################################
# Helper Functions
###############################################################################

log_info() {
    echo -e "${BLUE}[INFO]${NC} $*"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $*"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $*"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $*"
}

show_help() {
    cat << EOF
Usage: $0 [OPTIONS]

Create a comprehensive backup of the reinisch-classroom project.

Options:
  --no-git-bundle         Skip Git bundle creation
  --supabase-schema       Include Supabase schema export (opt-in)
  --dry-run               Show what would be backed up without creating files
  --list-only             List files that would be backed up and exit
  --output-dir DIR        Output directory for backup (default: ./backups)
  --help                  Show this help message

Environment Variables:
  INCLUDE_GIT_BUNDLE=1    Include Git bundle (default: 1)
  INCLUDE_ENV_MANIFEST=1  Include environment manifest (default: 1)
  INCLUDE_SUPABASE_SCHEMA=0  Include Supabase schema (default: 0, opt-in)
  INCLUDE_FILE_HASHES=1   Include file hash inventory (default: 1)
  DRY_RUN=0               Dry run mode (default: 0)
  LIST_ONLY=0             List-only mode (default: 0)

Examples:
  # Basic backup with defaults
  $0

  # Dry run to see what would be backed up
  $0 --dry-run

  # List files that would be backed up
  $0 --list-only

  # Full backup including Supabase schema
  $0 --supabase-schema

  # Backup without Git history
  $0 --no-git-bundle --output-dir /tmp/my-backup

EOF
}

###############################################################################
# Parse Arguments
###############################################################################

while [[ $# -gt 0 ]]; do
    case $1 in
        --no-git-bundle)
            INCLUDE_GIT_BUNDLE=0
            shift
            ;;
        --supabase-schema)
            INCLUDE_SUPABASE_SCHEMA=1
            shift
            ;;
        --dry-run)
            DRY_RUN=1
            shift
            ;;
        --list-only)
            LIST_ONLY=1
            shift
            ;;
        --output-dir)
            OUTPUT_DIR="$2"
            shift 2
            ;;
        --help)
            show_help
            exit 0
            ;;
        *)
            log_error "Unknown option: $1"
            show_help
            exit 1
            ;;
    esac
done

###############################################################################
# Validate Environment
###############################################################################

cd "$PROJECT_ROOT" || exit 1

if [[ ! -d .git ]]; then
    log_error "Not a Git repository. Please run from the project root."
    exit 1
fi

# Check for required commands
REQUIRED_COMMANDS=("git" "sha256sum" "date")
for cmd in "${REQUIRED_COMMANDS[@]}"; do
    if ! command -v "$cmd" &> /dev/null; then
        log_error "Required command not found: $cmd"
        exit 1
    fi
done

###############################################################################
# Setup Backup Directory
###############################################################################

BACKUP_NAME="reinisch-classroom-backup-${BACKUP_TIMESTAMP}"
BACKUP_PATH="${OUTPUT_DIR}/${BACKUP_NAME}"

if [[ "$DRY_RUN" -eq 1 ]]; then
    log_info "DRY RUN MODE - No files will be created"
elif [[ "$LIST_ONLY" -eq 1 ]]; then
    log_info "LIST ONLY MODE - Showing files that would be backed up"
else
    mkdir -p "$BACKUP_PATH"
    log_info "Created backup directory: $BACKUP_PATH"
fi

###############################################################################
# List/Count Files to Backup
###############################################################################

get_project_files() {
    # Get all tracked files in Git, excluding certain directories
    git ls-files | grep -v -E '^(node_modules/|\.git/|backups/|dist/|build/)'
}

PROJECT_FILES=$(get_project_files)
FILE_COUNT=$(echo "$PROJECT_FILES" | wc -l)

if [[ "$LIST_ONLY" -eq 1 ]]; then
    log_info "Files that would be backed up (${FILE_COUNT} files):"
    echo ""
    echo "$PROJECT_FILES"
    echo ""
    log_info "Total: ${FILE_COUNT} files"
    exit 0
fi

log_info "Backing up ${FILE_COUNT} project files"

###############################################################################
# Create Git Bundle
###############################################################################

create_git_bundle() {
    local bundle_file="$BACKUP_PATH/repository.bundle"
    
    if [[ "$DRY_RUN" -eq 1 ]]; then
        log_info "[DRY RUN] Would create Git bundle: $bundle_file"
        return
    fi
    
    log_info "Creating Git bundle with full history..."
    
    # Create bundle with all branches and tags
    git bundle create "$bundle_file" --all
    
    local bundle_size=$(du -h "$bundle_file" | cut -f1)
    log_success "Git bundle created: $bundle_file (${bundle_size})"
}

if [[ "$INCLUDE_GIT_BUNDLE" -eq 1 ]]; then
    create_git_bundle
else
    log_info "Skipping Git bundle creation (--no-git-bundle)"
fi

###############################################################################
# Create Environment Variable Manifest
###############################################################################

create_env_manifest() {
    local manifest_file="$BACKUP_PATH/env-manifest.json"
    local manifest_txt="$BACKUP_PATH/env-manifest.txt"
    
    if [[ "$DRY_RUN" -eq 1 ]]; then
        log_info "[DRY RUN] Would create environment manifest: $manifest_file"
        return
    fi
    
    log_info "Creating environment variable manifest (metadata only, NO VALUES)..."
    
    # Get all environment variables and create metadata
    local env_vars=()
    local env_json="["
    local first=1
    
    # Read all environment variables
    while IFS='=' read -r name value; do
        # Skip if name is empty
        [[ -z "$name" ]] && continue
        
        # Calculate length of value
        local value_length=${#value}
        
        # Add to arrays
        env_vars+=("$name")
        
        # Build JSON
        if [[ $first -eq 1 ]]; then
            first=0
        else
            env_json+=","
        fi
        
        env_json+=$(cat <<EOF

  {
    "name": "$name",
    "value_length": $value_length,
    "present": true
  }
EOF
)
    done < <(env | sort)
    
    env_json+=$'\n]'
    
    # Write JSON manifest
    echo "$env_json" > "$manifest_file"
    
    # Write text manifest
    {
        echo "Environment Variable Manifest"
        echo "Generated: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
        echo "======================================"
        echo ""
        echo "Total environment variables: ${#env_vars[@]}"
        echo ""
        echo "Variables (name and value length only):"
        echo "--------------------------------------"
        
        for var_name in "${env_vars[@]}"; do
            # Get the value to calculate length
            local var_value="${!var_name:-}"
            local length=${#var_value}
            printf "%-40s length: %d\n" "$var_name" "$length"
        done
        
        echo ""
        echo "NOTE: This manifest contains ONLY variable names and value lengths."
        echo "NO ACTUAL VALUES are stored for security reasons."
    } > "$manifest_txt"
    
    log_success "Environment manifest created: $manifest_file"
    log_success "Environment manifest (text): $manifest_txt"
}

if [[ "$INCLUDE_ENV_MANIFEST" -eq 1 ]]; then
    create_env_manifest
else
    log_info "Skipping environment manifest creation"
fi

###############################################################################
# Export Supabase Schema
###############################################################################

export_supabase_schema() {
    local schema_dir="$BACKUP_PATH/supabase-schema"
    
    if [[ "$DRY_RUN" -eq 1 ]]; then
        log_info "[DRY RUN] Would export Supabase schema to: $schema_dir"
        return
    fi
    
    mkdir -p "$schema_dir"
    
    log_info "Exporting Supabase schema..."
    
    # Try supabase CLI first
    if command -v supabase &> /dev/null; then
        log_info "Using Supabase CLI to export schema..."
        
        # Check if we're in a Supabase project
        if [[ -f supabase/config.toml ]]; then
            # Try to dump the schema using supabase CLI
            if supabase db dump --schema public > "$schema_dir/schema.sql" 2>/dev/null; then
                log_success "Schema exported via Supabase CLI: $schema_dir/schema.sql"
            else
                log_warning "Supabase CLI dump failed, falling back to copying existing schema files"
                copy_existing_schema "$schema_dir"
            fi
        else
            log_warning "No Supabase config found, copying existing schema files"
            copy_existing_schema "$schema_dir"
        fi
    else
        log_warning "Supabase CLI not found, copying existing schema files"
        copy_existing_schema "$schema_dir"
    fi
}

copy_existing_schema() {
    local schema_dir="$1"
    
    # Copy existing schema files from the repository
    if [[ -d supabase ]]; then
        log_info "Copying Supabase directory contents..."
        cp -r supabase/* "$schema_dir/" 2>/dev/null || true
        log_success "Existing Supabase files copied to: $schema_dir"
    else
        log_warning "No Supabase directory found in repository"
    fi
}

if [[ "$INCLUDE_SUPABASE_SCHEMA" -eq 1 ]]; then
    export_supabase_schema
else
    log_info "Skipping Supabase schema export (use --supabase-schema to include)"
fi

###############################################################################
# Generate File Hash Inventory
###############################################################################

generate_file_hashes() {
    local hashes_file="$BACKUP_PATH/file-hashes.txt"
    local hashes_json="$BACKUP_PATH/file-hashes.json"
    
    if [[ "$DRY_RUN" -eq 1 ]]; then
        log_info "[DRY RUN] Would generate file hash inventory: $hashes_file"
        return
    fi
    
    log_info "Generating SHA-256 file hash inventory..."
    
    # Create text format header
    {
        echo "File Hash Inventory (SHA-256)"
        echo "Generated: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
        echo "======================================"
        echo ""
    } > "$hashes_file"
    
    # Create JSON format
    local json_content="{"
    json_content+=$'\n  "generated_at": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'",'
    json_content+=$'\n  "total_files": '$FILE_COUNT','
    json_content+=$'\n  "files": ['
    
    local file_index=0
    local temp_file_list=$(mktemp)
    echo "$PROJECT_FILES" > "$temp_file_list"
    
    local total_files=$(wc -l < "$temp_file_list")
    local progress_interval=50
    
    while IFS= read -r file; do
        if [[ -f "$file" ]]; then
            # Get hash, avoiding pipefail issues
            local hash_output
            hash_output=$(sha256sum "$file" 2>/dev/null) || continue
            local hash=${hash_output%% *}
            
            # Add to text file
            echo "$hash  $file" >> "$hashes_file"
            
            # Add to JSON
            if [[ $file_index -gt 0 ]]; then
                json_content+=","
            fi
            json_content+=$'\n    {'
            json_content+=$'\n      "path": "'"$file"'",'
            json_content+=$'\n      "sha256": "'"$hash"'"'
            json_content+=$'\n    }'
            
            file_index=$((file_index + 1))
            
            # Show progress every N files
            if (( file_index % progress_interval == 0 )); then
                log_info "Progress: $file_index / $total_files files hashed"
            fi
        fi
    done < "$temp_file_list"
    
    rm -f "$temp_file_list"
    
    json_content+=$'\n  ]'
    json_content+=$'\n}'
    
    echo "$json_content" > "$hashes_json"
    
    log_success "File hash inventory created: $hashes_file"
    log_success "File hash inventory (JSON): $hashes_json"
}

if [[ "$INCLUDE_FILE_HASHES" -eq 1 ]]; then
    generate_file_hashes
else
    log_info "Skipping file hash inventory generation"
fi

###############################################################################
# Create Project File Inventory
###############################################################################

create_project_inventory() {
    local inventory_file="$BACKUP_PATH/project-inventory.txt"
    local inventory_json="$BACKUP_PATH/project-inventory.json"
    
    if [[ "$DRY_RUN" -eq 1 ]]; then
        log_info "[DRY RUN] Would create project inventory: $inventory_file"
        return
    fi
    
    log_info "Creating project file inventory..."
    
    # Text format
    {
        echo "Project File Inventory"
        echo "Generated: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
        echo "======================================"
        echo ""
        echo "Total files: $FILE_COUNT"
        echo ""
        echo "Files:"
        echo "------"
        echo "$PROJECT_FILES"
    } > "$inventory_file"
    
    # JSON format
    local json_content="{"
    json_content+=$'\n  "generated_at": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'",'
    json_content+=$'\n  "total_files": '$FILE_COUNT','
    json_content+=$'\n  "files": ['
    
    local file_index=0
    local temp_file_list=$(mktemp)
    echo "$PROJECT_FILES" > "$temp_file_list"
    
    while IFS= read -r file; do
        if [[ $file_index -gt 0 ]]; then
            json_content+=","
        fi
        json_content+=$'\n    "'"$file"'"'
        file_index=$((file_index + 1))
    done < "$temp_file_list"
    
    rm -f "$temp_file_list"
    
    json_content+=$'\n  ]'
    json_content+=$'\n}'
    
    echo "$json_content" > "$inventory_json"
    
    log_success "Project inventory created: $inventory_file"
    log_success "Project inventory (JSON): $inventory_json"
}

if [[ "$DRY_RUN" -ne 1 ]]; then
    create_project_inventory
fi

###############################################################################
# Create Backup README
###############################################################################

create_backup_readme() {
    local readme_file="$BACKUP_PATH/BACKUP_README.md"
    
    if [[ "$DRY_RUN" -eq 1 ]]; then
        log_info "[DRY RUN] Would create backup README: $readme_file"
        return
    fi
    
    log_info "Creating backup README with restore instructions..."
    
    cat > "$readme_file" << 'EOF'
# Reinisch Classroom - Backup Archive

This backup was created using the comprehensive backup script from the reinisch-classroom project.

## Backup Contents

This archive contains:

1. **Git Repository Bundle** (`repository.bundle`) - Full Git history with all branches and tags
2. **Environment Variable Manifest** (`env-manifest.json`, `env-manifest.txt`) - Metadata about environment variables (names and lengths only, NO VALUES)
3. **Supabase Schema** (`supabase-schema/`) - Database schema, migrations, and SQL files (if included)
4. **File Hash Inventory** (`file-hashes.txt`, `file-hashes.json`) - SHA-256 hashes for integrity verification
5. **Project Inventory** (`project-inventory.txt`, `project-inventory.json`) - List of all backed-up files

## Security Notes

⚠️ **IMPORTANT SECURITY INFORMATION** ⚠️

- This backup contains **NO SECRET VALUES** or credentials
- Environment manifest includes only variable names and value lengths
- You must separately secure your environment variables and credentials
- Store this backup in a secure location
- Consider encrypting the backup archive (see Encryption section below)

## Restore Instructions

### 1. Restore Git Repository

To restore the complete Git repository with full history:

```bash
# Clone from the bundle
git clone repository.bundle reinisch-classroom-restored
cd reinisch-classroom-restored

# Verify the repository
git log --oneline -10
git branch -a
git tag
```

### 2. Restore Project Files

If you need to restore specific files (without Git history):

```bash
# Extract files from the bundle
git clone --no-checkout repository.bundle temp-repo
cd temp-repo
git checkout HEAD

# Copy files to your target location
cp -r * /path/to/restore/location/
```

### 3. Verify File Integrity

Use the file hash inventory to verify no files were corrupted:

```bash
# Verify all files using the hash inventory
cd /path/to/restored/project
sha256sum -c /path/to/backup/file-hashes.txt

# Or verify a specific file
grep "path/to/file" /path/to/backup/file-hashes.txt | sha256sum -c
```

### 4. Restore Environment Variables

The environment manifest shows which variables were present but **NOT their values**.

Review `env-manifest.txt` or `env-manifest.json` to see:
- Which environment variables were configured
- The length of each variable's value (for validation)

You must:
1. Restore actual values from your secure credential storage
2. Verify value lengths match the manifest
3. Set up environment variables in your deployment platform

Example validation:

```bash
# Check if a variable length matches the manifest
actual_length=${#SUPABASE_URL}
echo "Actual length: $actual_length"
# Compare with length in env-manifest.txt
```

### 5. Restore Supabase Schema

If Supabase schema was included in the backup:

```bash
# If you have the Supabase CLI:
cd reinisch-classroom-restored
cp -r /path/to/backup/supabase-schema/* supabase/

# Apply migrations
supabase db reset

# Or manually apply schema
psql -h your-db-host -U postgres -d your-database -f /path/to/backup/supabase-schema/schema.sql
```

### 6. Install Dependencies

After restoring the repository:

```bash
cd reinisch-classroom-restored
npm ci
```

### 7. Verify Restore

Run the project's verification scripts:

```bash
# Lint code
npm run lint

# Run tests
npm run test

# Check for environment leaks
npm run postbuild
```

## Encryption (Optional)

For additional security, consider encrypting the backup archive.

### Using zip with AES encryption:

```bash
# Create encrypted zip (requires zip with crypto support)
zip -r -e backup-encrypted.zip reinisch-classroom-backup-TIMESTAMP/

# Decrypt and extract
unzip backup-encrypted.zip
```

### Using age encryption (recommended):

```bash
# Install age: https://github.com/FiloSottile/age
# Encrypt the backup directory
tar czf - reinisch-classroom-backup-TIMESTAMP/ | age -r age1... > backup.tar.gz.age

# Decrypt
age -d -i ~/.age/key.txt backup.tar.gz.age | tar xzf -
```

### Using GPG:

```bash
# Encrypt with GPG
tar czf - reinisch-classroom-backup-TIMESTAMP/ | gpg -c > backup.tar.gz.gpg

# Decrypt
gpg -d backup.tar.gz.gpg | tar xzf -
```

## Best Practices

1. **Regular Backups**: Run backups regularly (daily, weekly, or before major changes)
2. **Verify Backups**: Always verify backup integrity using the hash inventory
3. **Secure Storage**: Store backups in multiple secure locations (encrypted storage, offline storage)
4. **Test Restores**: Periodically test the restore process to ensure backups are valid
5. **Document Secrets**: Maintain a separate secure record of environment variables and credentials
6. **Version Control**: Keep track of which backup corresponds to which deployment/version

## Backup Metadata

EOF

    # Add backup metadata
    {
        echo "- **Backup Created**: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
        echo "- **Git Branch**: $(git branch --show-current 2>/dev/null || echo 'N/A')"
        echo "- **Git Commit**: $(git rev-parse HEAD 2>/dev/null || echo 'N/A')"
        echo "- **Total Files**: $FILE_COUNT"
        echo "- **Includes Git Bundle**: $([[ $INCLUDE_GIT_BUNDLE -eq 1 ]] && echo 'Yes' || echo 'No')"
        echo "- **Includes Environment Manifest**: $([[ $INCLUDE_ENV_MANIFEST -eq 1 ]] && echo 'Yes' || echo 'No')"
        echo "- **Includes Supabase Schema**: $([[ $INCLUDE_SUPABASE_SCHEMA -eq 1 ]] && echo 'Yes' || echo 'No')"
        echo "- **Includes File Hashes**: $([[ $INCLUDE_FILE_HASHES -eq 1 ]] && echo 'Yes' || echo 'No')"
    } >> "$readme_file"
    
    cat >> "$readme_file" << 'EOF'

## Support

For issues with backup or restore, refer to the project documentation or contact the repository maintainers.

## License

This backup contains the same license terms as the original reinisch-classroom project.

---

**Remember**: This backup is only as secure as where and how you store it. Always use encryption and secure storage for production backups!
EOF
    
    log_success "Backup README created: $readme_file"
}

if [[ "$DRY_RUN" -ne 1 ]]; then
    create_backup_readme
fi

###############################################################################
# Summary
###############################################################################

echo ""
echo "========================================="
if [[ "$DRY_RUN" -eq 1 ]]; then
    log_info "DRY RUN COMPLETE"
    echo ""
    log_info "No files were created. Run without --dry-run to create actual backup."
else
    log_success "BACKUP COMPLETE"
    echo ""
    log_info "Backup location: $BACKUP_PATH"
    log_info "Backup size: $(du -sh "$BACKUP_PATH" | cut -f1)"
    
    echo ""
    echo "Backup contents:"
    ls -lh "$BACKUP_PATH"
    
    echo ""
    log_info "To verify file integrity, run:"
    echo "  cd $PROJECT_ROOT"
    echo "  sha256sum -c $BACKUP_PATH/file-hashes.txt"
    
    echo ""
    log_info "For restore instructions, see:"
    echo "  $BACKUP_PATH/BACKUP_README.md"
fi
echo "========================================="
echo ""

exit 0
