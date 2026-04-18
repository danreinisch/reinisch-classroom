#!/usr/bin/env bash
# check-cache-bust.sh
#
# PURPOSE:
#   Ensures that whenever a JS file referenced with a ?v= cache-bust query
#   string in a portal HTML file is modified in a PR, the corresponding ?v=
#   value in the HTML was also bumped in the same PR.
#
# HOW IT WORKS:
#   1. Parses all portal HTML files (site/student/index.html and any sibling
#      index.html files under site/) for <script> tags whose src contains
#      /web/<file>.js?v=<version>.
#   2. Uses `git diff --name-only origin/main...HEAD` to determine which files
#      changed in this PR.
#   3. For each JS file that changed AND is referenced with ?v= in an HTML file,
#      checks whether the ?v= value for that reference was also changed in the
#      same diff.
#   4. Exits non-zero and lists offending scripts if any bumps are missing.
#
# HOW TO FIX A FAILURE:
#   Find the <script> tag in the portal HTML file that loads the changed JS file,
#   and update its ?v= parameter to a new value (e.g. today's date: YYYYMMDD or
#   YYYYMMDD-<description>). The comment above the script tags in each HTML file
#   explains the required format.
#
# REQUIREMENTS:
#   - Must be run inside a git repository with fetch-depth: 0 so origin/main is
#     available for the diff.
#   - Bash 4+, grep, sed (standard on GitHub Actions runners).

set -euo pipefail

BASE_REF="${BASE_REF:-origin/main}"
PORTAL_HTML_GLOB="site/student/index.html"

# ---- Collect all portal HTML files ----
PORTAL_HTMLS=()
while IFS= read -r -d '' f; do
  PORTAL_HTMLS+=("$f")
done < <(find site -name "index.html" -path "*/student*" -print0 2>/dev/null)

# Fallback: always include the primary student portal
if [[ ${#PORTAL_HTMLS[@]} -eq 0 ]]; then
  PORTAL_HTMLS=("site/student/index.html")
fi

# ---- Get files changed in this PR ----
CHANGED_FILES=$(git diff --name-only "${BASE_REF}...HEAD" 2>/dev/null || git diff --name-only HEAD~1...HEAD 2>/dev/null || echo "")

if [[ -z "$CHANGED_FILES" ]]; then
  echo "ℹ️  No changed files detected (possibly running on main). Skipping cache-bust check."
  exit 0
fi

FAILURES=()

for HTML_FILE in "${PORTAL_HTMLS[@]}"; do
  if [[ ! -f "$HTML_FILE" ]]; then
    continue
  fi

  # Find all <script src="/web/<file>.js?v=<version>"> in this HTML
  while IFS= read -r line; do
    # Extract the JS path (e.g. web/student-portal-init.js) and version
    js_path=$(echo "$line" | grep -oP '(?<=/web/)[^?]+(?=\?v=)' || true)
    version=$(echo "$line" | grep -oP '(?<=\?v=)[^"'"'"' >]+' || true)

    if [[ -z "$js_path" || -z "$version" ]]; then
      continue
    fi

    full_js_path="site/web/${js_path}"

    # Check if this JS file was changed in the PR
    if echo "$CHANGED_FILES" | grep -qF "$full_js_path"; then
      # Check whether the ?v= value for this script was changed in the HTML diff
      html_diff=$(git diff "${BASE_REF}...HEAD" -- "$HTML_FILE" 2>/dev/null || true)
      if [[ -z "$html_diff" ]]; then
        FAILURES+=("  ❌ ${full_js_path} changed but ${HTML_FILE} was NOT modified (cache-bust not bumped)")
        continue
      fi

      # Look for an added line (starts with +) that contains this JS file with ?v=
      added_version=$(echo "$html_diff" | grep "^+" | grep -oP "(?<=/web/${js_path}\?v=)[^\"' >]+" | head -1 || true)
      removed_version=$(echo "$html_diff" | grep "^-" | grep -oP "(?<=/web/${js_path}\?v=)[^\"' >]+" | head -1 || true)

      if [[ -z "$added_version" && -z "$removed_version" ]]; then
        FAILURES+=("  ❌ ${full_js_path} changed but ?v= for it in ${HTML_FILE} was NOT bumped (still: ?v=${version})")
      elif [[ "$added_version" == "$removed_version" ]]; then
        FAILURES+=("  ❌ ${full_js_path} changed but ?v= in ${HTML_FILE} was not changed (old=new: ?v=${version})")
      fi
    fi
  done < <(grep -oP '<script[^>]+src="/web/[^"]+\?v=[^"]*"[^>]*>' "$HTML_FILE" 2>/dev/null || true)
done

if [[ ${#FAILURES[@]} -gt 0 ]]; then
  echo ""
  echo "🚨 Cache-bust check FAILED!"
  echo "   The following JS files were modified in this PR but their ?v= cache-bust"
  echo "   strings in the portal HTML were not bumped:"
  echo ""
  for f in "${FAILURES[@]}"; do
    echo "$f"
  done
  echo ""
  echo "👉 To fix: open the HTML file listed above, find the <script> tag for the"
  echo "   changed JS file, and update its ?v= to a new value (e.g. $(date +%Y%m%d))."
  echo "   Example: ?v=20260331  →  ?v=$(date +%Y%m%d)"
  echo ""
  exit 1
fi

echo "✅ Cache-bust check passed — all modified JS files have a bumped ?v= string."
exit 0
