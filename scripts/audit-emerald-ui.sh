#!/bin/bash
# Emerald Hub UI Audit Script
# Checks Hub pages for correct scope markers, CSS loading, and absence of pill/bubble styling

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

PASS_COUNT=0
FAIL_COUNT=0
WARN_COUNT=0

print_pass() {
    echo -e "${GREEN}✓ PASS${NC}: $1"
    ((PASS_COUNT++))
}

print_fail() {
    echo -e "${RED}✗ FAIL${NC}: $1"
    ((FAIL_COUNT++))
}

print_warn() {
    echo -e "${YELLOW}⚠ WARN${NC}: $1"
    ((WARN_COUNT++))
}

print_section() {
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "$1"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
}

# Check arguments
if [ $# -lt 2 ]; then
    echo "Usage: $0 <repo-root> <site-dir-name>"
    echo "Example: $0 . site"
    exit 1
fi

REPO_ROOT="$1"
SITE_DIR="$2"
HUB_DIR="$REPO_ROOT/$SITE_DIR/hub"
CSS_DIR="$REPO_ROOT/$SITE_DIR/assets/css"
WEB_DIR="$REPO_ROOT/$SITE_DIR/web"

cd "$REPO_ROOT"

print_section "TASK 0: Baseline & File Structure"

# Check Hub directory exists
if [ -d "$HUB_DIR" ]; then
    print_pass "Hub directory exists: $HUB_DIR"
else
    print_fail "Hub directory not found: $HUB_DIR"
fi

# Check Hub pages
HUB_PAGES=$(find "$HUB_DIR" -name "*.html" 2>/dev/null || true)
if [ -n "$HUB_PAGES" ]; then
    print_pass "Found Hub HTML pages:"
    echo "$HUB_PAGES" | while read -r page; do
        echo "  - $page"
    done
else
    print_fail "No HTML pages found in Hub directory"
fi

# Check CSS files exist
if [ -f "$CSS_DIR/rc-emerald-dashboard-theme.css" ]; then
    print_pass "Found rc-emerald-dashboard-theme.css"
else
    print_fail "Missing rc-emerald-dashboard-theme.css"
fi

if [ -f "$CSS_DIR/rc-emerald-bridge.css" ]; then
    print_pass "Found rc-emerald-bridge.css"
else
    print_fail "Missing rc-emerald-bridge.css"
fi

# Check boot/init files
if [ -f "$WEB_DIR/hub-theme-boot.js" ]; then
    print_pass "Found hub-theme-boot.js"
else
    print_fail "Missing hub-theme-boot.js"
fi

if [ -f "$WEB_DIR/hub-init.js" ]; then
    print_pass "Found hub-init.js"
else
    print_warn "hub-init.js not found (may be optional)"
fi

print_section "TASK 1: Scope Marker & CSS Loading"

# Check for scope marker in Hub pages
find "$HUB_DIR" -name "*.html" | while read -r page; do
    if grep -q 'data-rc-app="hub"' "$page"; then
        print_pass "$(basename "$page"): Has data-rc-app=\"hub\" scope marker"
    else
        print_fail "$(basename "$page"): Missing data-rc-app=\"hub\" scope marker"
    fi
    
    # Check CSS loading order
    if grep -q 'rc-emerald-dashboard-theme.css' "$page"; then
        print_pass "$(basename "$page"): Loads rc-emerald-dashboard-theme.css"
    else
        print_fail "$(basename "$page"): Missing rc-emerald-dashboard-theme.css"
    fi
    
    if grep -q 'rc-emerald-bridge.css' "$page"; then
        print_pass "$(basename "$page"): Loads rc-emerald-bridge.css"
    else
        print_fail "$(basename "$page"): Missing rc-emerald-bridge.css"
    fi
    
    # Check CSS loading order (theme should come before bridge)
    THEME_LINE=$(grep -n 'rc-emerald-dashboard-theme.css' "$page" | cut -d: -f1 | head -1)
    BRIDGE_LINE=$(grep -n 'rc-emerald-bridge.css' "$page" | cut -d: -f1 | head -1)
    
    if [ -n "$THEME_LINE" ] && [ -n "$BRIDGE_LINE" ]; then
        if [ "$THEME_LINE" -lt "$BRIDGE_LINE" ]; then
            print_pass "$(basename "$page"): CSS files in correct order (theme before bridge)"
        else
            print_fail "$(basename "$page"): CSS files in wrong order (bridge before theme)"
        fi
    fi
done

print_section "TASK 2: Pill/Bubble Elimination"

# Check for pill/bubble border-radius in Hub scope
PILL_RADIUS_ISSUES=$(grep -rn "border-radius:\s*\(999\|9999\)" "$HUB_DIR" "$CSS_DIR" 2>/dev/null || true)
if [ -z "$PILL_RADIUS_ISSUES" ]; then
    print_pass "No pill/bubble border-radius (999/9999px) found in Hub files"
else
    print_fail "Found pill/bubble border-radius:"
    echo "$PILL_RADIUS_ISSUES" | while read -r line; do
        echo "  $line"
    done
fi

# Check for pill/chip/bubble classnames in Hub HTML
PILL_CLASS_ISSUES=$(grep -rn '\(class="[^"]*\(pill\|chip\|bubble\)[^"]*"\|class='"'"'[^'"'"']*\(pill\|chip\|bubble\)[^'"'"']*'"'"'\)' "$HUB_DIR" 2>/dev/null || true)
if [ -z "$PILL_CLASS_ISSUES" ]; then
    print_pass "No pill/chip/bubble classnames found in Hub HTML"
else
    print_warn "Found potential pill/chip/bubble classnames in Hub HTML:"
    echo "$PILL_CLASS_ISSUES" | while read -r line; do
        echo "  $line"
    done
fi

# Check for pill/chip references in CSS (within Hub scope)
PILL_CSS_REFS=$(grep -n '\.\(pill\|chip\|bubble\)' "$CSS_DIR/rc-emerald-bridge.css" "$CSS_DIR/rc-emerald-dashboard-theme.css" 2>/dev/null || true)
if [ -z "$PILL_CSS_REFS" ]; then
    print_pass "No pill/chip/bubble CSS classes found in Emerald CSS files"
else
    print_warn "Found pill/chip/bubble CSS class references:"
    echo "$PILL_CSS_REFS" | while read -r line; do
        echo "  $line"
    done
fi

print_section "TASK 3: Five Crummy Pages Check"

# Check if the five pages are accessible/present in Hub
# These are typically rendered dynamically within Hub, so we check for their container elements
HUB_INDEX="$HUB_DIR/index.html"
if [ -f "$HUB_INDEX" ]; then
    # Assignments
    if grep -q 'data-tab="assignments"' "$HUB_INDEX"; then
        print_pass "Found Assignments page container (data-tab=\"assignments\")"
    else
        print_warn "Assignments page container not found"
    fi
    
    # Upload & IEP Goal Mapping
    if grep -q 'data-tab="upload"' "$HUB_INDEX"; then
        print_pass "Found Upload page container (data-tab=\"upload\")"
    else
        print_warn "Upload page container not found"
    fi
    
    # Data Import/Export
    if grep -q 'data-tab="data"' "$HUB_INDEX"; then
        print_pass "Found Data Import/Export page container (data-tab=\"data\")"
    else
        print_warn "Data Import/Export page container not found"
    fi
    
    # Student Manager
    if grep -q 'data-tab="studentManager"' "$HUB_INDEX"; then
        print_pass "Found Student Manager page container (data-tab=\"studentManager\")"
    else
        print_warn "Student Manager page container not found"
    fi
    
    # Settings
    if grep -q 'data-tab="settings"' "$HUB_INDEX"; then
        print_pass "Found Settings page container (data-tab=\"settings\")"
    else
        print_warn "Settings page container not found"
    fi
fi

print_section "TASK 4: Safety Guardrails"

# Check that no IDs were changed (this is a placeholder - actual implementation would need git diff)
if git rev-parse --git-dir > /dev/null 2>&1; then
    ID_CHANGES=$(git diff --cached -U0 | grep -E '^[+-].*id="' || true)
    if [ -z "$ID_CHANGES" ]; then
        print_pass "No ID attribute changes detected in staged changes"
    else
        print_fail "ID attribute changes detected:"
        echo "$ID_CHANGES"
    fi
fi

# Check that only allowed files are in scope
if git rev-parse --git-dir > /dev/null 2>&1; then
    CHANGED_FILES=$(git diff --name-only --cached 2>/dev/null || git diff --name-only 2>/dev/null || true)
    if [ -n "$CHANGED_FILES" ]; then
        echo ""
        echo "Changed files:"
        echo "$CHANGED_FILES" | while read -r file; do
            # Check if file is in allowed scope
            if [[ "$file" =~ ^site/hub/ ]] || \
               [[ "$file" =~ ^site/assets/css/rc-emerald- ]] || \
               [[ "$file" =~ ^site/web/hub-(theme-boot|init)\.js$ ]] || \
               [[ "$file" =~ ^scripts/audit-emerald-ui\.sh$ ]]; then
                print_pass "File in allowed scope: $file"
            else
                print_warn "File outside allowed scope: $file"
            fi
        done
    fi
fi

print_section "SUMMARY"

echo ""
echo "Passed:  $PASS_COUNT"
echo "Failed:  $FAIL_COUNT"
echo "Warnings: $WARN_COUNT"
echo ""

if [ $FAIL_COUNT -eq 0 ]; then
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${GREEN}  ✓ AUDIT PASSED${NC}"
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    exit 0
else
    echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${RED}  ✗ AUDIT FAILED${NC}"
    echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    exit 1
fi
