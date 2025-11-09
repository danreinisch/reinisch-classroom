# Admin Upload & Troubleshooting Guide

This guide explains how the Admin Uploader works and how to troubleshoot common issues with Life Skills and other presentation uploads.

## How the Upload System Works

### State Management

The system uses `site/assets/data/site-state.json` to track all uploaded presentations. This file contains:
- **titles**: Display titles for each presentation slot
- **links**: URLs to access each presentation

### Upload Flow

1. **File Upload**: Admin selects files and uploads them via the Admin UI
2. **Batch Processing**: Large uploads are split into ~3.5MB batches to avoid serverless function limits
3. **State Merging**: The incremental-deploy function:
   - Fetches the **current committed version** of site-state.json from the repository
   - Merges only the specific slot being updated
   - Preserves all other slots unchanged
   - Preserves the existing title if the title field is intentionally left blank
4. **Index Creation**: Creates an `index.html` redirect file in the presentation directory
5. **Commit**: All changes are committed to GitHub in a single atomic operation
6. **Verification**: After upload, the system re-fetches site-state.json to verify the slot is live

### Title Preservation

When re-uploading a presentation:
- **If you enter a new title**: The new title will be saved
- **If you leave the title field blank**: The existing title will be preserved
- This prevents accidental title overwrites when you're just updating files

## Troubleshooting

### Problem: Presentation shows "Placeholder" even after successful upload

**Possible causes:**
1. Upload succeeded but deployment hasn't completed yet
2. Link is missing from site-state.json
3. Directory exists but wasn't properly registered

**Solutions:**
1. Wait 1-2 minutes for Netlify deployment to complete, then refresh the page
2. Use the **Audit Life Skills** button in Admin to check for mismatches
3. Check the upload log for verification status - it will show if the link was properly written

### Problem: Wrong title appears on a slot

**Possible causes:**
1. Title was overwritten during a previous upload
2. Manual edit to site-state.json had an error

**Solutions:**
1. Re-upload the presentation with the correct title
2. Manually edit `site/assets/data/site-state.json` and commit the fix
3. Use the Audit tool to verify all slots are correctly configured

### Problem: Duplicate titles on different slots

**Possible causes:**
1. Copy-paste error during upload
2. Old version of upload system that didn't preserve titles properly

**Solutions:**
1. Manually correct site-state.json (edit the titles array for the affected category)
2. Re-upload the affected presentation with the correct title
3. Always verify titles before clicking Upload

## Using the Audit Tool

The **Audit Life Skills** button performs a comprehensive check of all Life Skills presentation slots:

### What it checks:
- ✓ Title exists in site-state.json
- ✓ Link exists in site-state.json
- ✓ Directory actually exists on the server
- ✓ Mismatches between state and actual files

### How to use it:
1. Go to Admin Uploader (`/admin/`)
2. Click the **Audit Life Skills** button
3. Review the log output

### Interpreting results:

**Normal slots:**
```
Slot 01: "Nutrition & Grocery Shopping" → /life-skills/presentations/presentation-01/ ✓
Slot 06: Empty (no title, no link, no directory) ✓
```

**Problem slots:**
```
⚠ Slot 04: MISMATCH detected!
  Title: Understanding Your Paycheck
  Link: (empty)
  Directory exists: YES
  → Issue: Directory exists but no link in state
```

This means the presentation files exist but the link wasn't written to site-state.json. The defensive fallback in unit-grid.js will still show "Open presentation" if enabled.

## Defensive Fallback Feature

The `unit-grid.js` file includes a defensive check (enabled by default):
- When a title exists but the link is missing from site-state.json
- The system performs a HEAD request to check if the directory exists
- If the directory exists (returns 200 OK), the link is treated as live
- This provides a safety net for slots that weren't properly registered

**Configuration:**
```javascript
// In site/assets/js/unit-grid.js
const DEFENSIVE_SLOT_CHECK = true;  // Enabled by default
```

To disable this feature, change it to `false`.

## Best Practices

1. **Always verify uploads**: Check the verification log after each upload
2. **Use the Audit tool**: Run it periodically to catch configuration drift
3. **Don't leave title blank accidentally**: Only leave it blank if you want to keep the existing title
4. **Check the log**: The upload log shows detailed status for each step
5. **Wait for deployment**: Give Netlify 1-2 minutes to deploy after upload before checking the hub

## Technical Details

### State Merge Logic
```javascript
// Fetch existing state from repo
const state = await fetchStateFromRepo(owner, repo, branch, units);

// Preserve existing title if new title is blank
const existingTitle = state.categories[category].titles[slot - 1] || '';
const finalTitle = (title && String(title).trim()) ? title : existingTitle;

// Update only this specific slot
state.categories[category].titles[slot - 1] = finalTitle;
state.categories[category].links[slot - 1] = `/${unit.baseOut}/presentation-${num(slot)}/`;
```

This ensures:
- Only the target slot is modified
- All other slots remain unchanged
- Existing titles are preserved when appropriate
- The latest committed state is always used as the base

### Atomic Commits
All changes are committed in a single Git tree operation:
- Multiple files can be added/updated in one commit
- State file is always updated with presentation files
- No partial commits that could leave state inconsistent
- Retry logic handles concurrent modifications gracefully

## Getting Help

If you encounter issues not covered here:
1. Check the browser console for JavaScript errors
2. Review the upload log in the Admin UI
3. Run the Audit tool to identify mismatches
4. Check the GitHub commit history for the last successful upload
5. Verify that all expected files are in the presentation directory
