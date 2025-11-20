#!/usr/bin/env bash
###############################################################################
# test-backup.sh
#
# Tests for the create-backup.sh script
# Validates all modes and functionality without creating large backups
###############################################################################

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

TESTS_PASSED=0
TESTS_FAILED=0
TEST_OUTPUT_DIR="/tmp/backup-tests-$$"

log_test() {
    echo -e "${YELLOW}[TEST]${NC} $*"
}

log_pass() {
    echo -e "${GREEN}[PASS]${NC} $*"
    TESTS_PASSED=$((TESTS_PASSED + 1))
}

log_fail() {
    echo -e "${RED}[FAIL]${NC} $*"
    TESTS_FAILED=$((TESTS_FAILED + 1))
}

# Cleanup function
cleanup() {
    rm -rf "$TEST_OUTPUT_DIR"
}

trap cleanup EXIT

# Setup
mkdir -p "$TEST_OUTPUT_DIR"
BACKUP_SCRIPT="./scripts/create-backup.sh"

if [[ ! -f "$BACKUP_SCRIPT" ]]; then
    log_fail "Backup script not found: $BACKUP_SCRIPT"
    exit 1
fi

echo "========================================="
echo "Testing create-backup.sh"
echo "========================================="
echo ""

###############################################################################
# Test 1: Help option
###############################################################################

log_test "Test 1: --help option shows usage information"
if $BACKUP_SCRIPT --help | grep -q "Usage:"; then
    log_pass "Help option works correctly"
else
    log_fail "Help option did not show usage information"
fi

###############################################################################
# Test 2: Dry-run mode
###############################################################################

log_test "Test 2: --dry-run mode does not create files"
TEST_DIR_2="$TEST_OUTPUT_DIR/test2"
mkdir -p "$TEST_DIR_2"

TEST_OUT_2=$(mktemp)
$BACKUP_SCRIPT --dry-run --output-dir "$TEST_DIR_2" > "$TEST_OUT_2" 2>&1

if grep -q "DRY RUN MODE" "$TEST_OUT_2"; then
    log_pass "Dry-run mode message displayed"
else
    log_fail "Dry-run mode message not displayed"
fi
rm -f "$TEST_OUT_2"

if [[ $(find "$TEST_DIR_2" -type f 2>/dev/null | wc -l) -eq 0 ]]; then
    log_pass "Dry-run mode did not create any files"
else
    log_fail "Dry-run mode created files when it shouldn't"
fi

###############################################################################
# Test 3: List-only mode
###############################################################################

log_test "Test 3: --list-only mode shows file list and exits"

TEST_OUT_3=$(mktemp)
$BACKUP_SCRIPT --list-only > "$TEST_OUT_3" 2>&1

if grep -q "LIST ONLY MODE" "$TEST_OUT_3"; then
    log_pass "List-only mode message displayed"
else
    log_fail "List-only mode message not displayed"
fi

if grep -q ".eslintignore" "$TEST_OUT_3"; then
    log_pass "List-only mode shows project files"
else
    log_fail "List-only mode did not show project files"
fi
rm -f "$TEST_OUT_3"

###############################################################################
# Test 4: Basic backup (no git bundle to save time)
###############################################################################

log_test "Test 4: Basic backup creates expected files"
$BACKUP_SCRIPT --no-git-bundle --output-dir "$TEST_OUTPUT_DIR" >/dev/null 2>&1

# Find the backup directory (should be only one)
BACKUP_DIR=$(find "$TEST_OUTPUT_DIR" -maxdepth 1 -type d -name "reinisch-classroom-backup-*" | head -1)

if [[ -z "$BACKUP_DIR" ]]; then
    log_fail "Backup directory not created"
else
    log_pass "Backup directory created: $(basename "$BACKUP_DIR")"
    
    # Check for expected files
    expected_files=(
        "env-manifest.json"
        "env-manifest.txt"
        "file-hashes.txt"
        "file-hashes.json"
        "project-inventory.txt"
        "project-inventory.json"
        "BACKUP_README.md"
    )
    
    for file in "${expected_files[@]}"; do
        if [[ -f "$BACKUP_DIR/$file" ]]; then
            log_pass "File exists: $file"
        else
            log_fail "File missing: $file"
        fi
    done
fi

###############################################################################
# Test 5: Environment manifest doesn't contain values
###############################################################################

log_test "Test 5: Environment manifest doesn't leak secret values"

if [[ -n "$BACKUP_DIR" ]] && [[ -f "$BACKUP_DIR/env-manifest.txt" ]]; then
    # Check that the manifest contains "length:" but not actual values
    if grep -q "length:" "$BACKUP_DIR/env-manifest.txt"; then
        log_pass "Environment manifest contains length metadata"
    else
        log_fail "Environment manifest missing length metadata"
    fi
    
    # Check for suspicious patterns that might indicate leaked values
    if grep -E "(password|secret|key)" "$BACKUP_DIR/env-manifest.txt" | grep -qv "length:"; then
        log_fail "Environment manifest may contain secret values"
    else
        log_pass "Environment manifest appears clean (no secret values)"
    fi
else
    log_fail "Environment manifest not found"
fi

###############################################################################
# Test 6: File hashes are valid
###############################################################################

log_test "Test 6: File hash inventory is valid"

if [[ -n "$BACKUP_DIR" ]] && [[ -f "$BACKUP_DIR/file-hashes.txt" ]]; then
    # Count number of hashes (skip header) - lines that start with 64 hex chars
    hash_count=$(tail -n +5 "$BACKUP_DIR/file-hashes.txt" | grep -cE "^[a-f0-9]{64}  " || true)
    
    if [[ $hash_count -gt 100 ]]; then
        log_pass "File hash inventory contains $hash_count valid SHA-256 hashes"
    else
        log_fail "File hash inventory contains too few hashes: $hash_count"
    fi
    
    # Verify first hash line format
    first_hash=$(tail -n +5 "$BACKUP_DIR/file-hashes.txt" | head -1)
    if [[ $first_hash =~ ^[a-f0-9]{64}[[:space:]] ]]; then
        log_pass "File hash format is correct (SHA-256)"
    else
        log_fail "File hash format is incorrect"
    fi
else
    log_fail "File hash inventory not found (BACKUP_DIR=$BACKUP_DIR)"
fi

###############################################################################
# Test 7: BACKUP_README exists and has content
###############################################################################

log_test "Test 7: BACKUP_README contains restore instructions"

if [[ -n "$BACKUP_DIR" ]] && [[ -f "$BACKUP_DIR/BACKUP_README.md" ]]; then
    if grep -q "Restore Instructions" "$BACKUP_DIR/BACKUP_README.md"; then
        log_pass "BACKUP_README contains restore instructions"
    else
        log_fail "BACKUP_README missing restore instructions"
    fi
    
    if grep -q "Security Notes" "$BACKUP_DIR/BACKUP_README.md"; then
        log_pass "BACKUP_README contains security notes"
    else
        log_fail "BACKUP_README missing security notes"
    fi
else
    log_fail "BACKUP_README not found"
fi

###############################################################################
# Test 8: JSON files are valid JSON
###############################################################################

log_test "Test 8: JSON files are valid"

if [[ -n "$BACKUP_DIR" ]]; then
    json_files=(
        "$BACKUP_DIR/env-manifest.json"
        "$BACKUP_DIR/file-hashes.json"
        "$BACKUP_DIR/project-inventory.json"
    )
    
    for json_file in "${json_files[@]}"; do
        if [[ -f "$json_file" ]]; then
            if python3 -m json.tool "$json_file" >/dev/null 2>&1; then
                log_pass "Valid JSON: $(basename "$json_file")"
            else
                log_fail "Invalid JSON: $(basename "$json_file")"
            fi
        fi
    done
fi

###############################################################################
# Summary
###############################################################################

echo ""
echo "========================================="
echo "Test Summary"
echo "========================================="
echo "Tests passed: $TESTS_PASSED"
echo "Tests failed: $TESTS_FAILED"
echo ""

if [[ $TESTS_FAILED -eq 0 ]]; then
    echo -e "${GREEN}All tests passed!${NC}"
    exit 0
else
    echo -e "${RED}Some tests failed!${NC}"
    exit 1
fi
