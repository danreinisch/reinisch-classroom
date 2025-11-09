# Life Skills Upload Process & Troubleshooting

## Overview

This guide covers the Life Skills presentation upload process, verification steps, and troubleshooting for upload reliability issues.

## Upload Process

### 1. Access Admin Uploader
- Navigate to `/admin` and sign in
- Select "Life Skills" from the Category dropdown
- Choose a slot (1-32) from the Slot dropdown
  - Open slots show "XX — Open"
  - Taken slots show "XX — [Current Title]"

### 2. Prepare Your Files
- Add your presentation HTML file(s) and any assets (images, etc.)
- Use drag-and-drop or the file/folder pickers
- The system will automatically batch large uploads

### 3. Upload with Title
- Enter a descriptive title for the presentation
- Click "Upload" button
- Monitor the log panel for progress:
  - Encoding progress for each file
  - Batch upload status
  - Verification results

### 4. Verification
After upload completes, the system automatically:
- Waits 2 seconds for deployment
- Fetches the updated `site-state.json`
- Verifies the slot link and title are present
- Logs verification results

**Success indicators:**
```
✓ Verification SUCCESS: Slot XX is live!
  Title: "[Your Title]"
  Link: /life-skills/presentations/presentation-XX/
```

**Warning indicators:**
```
⚠ Verification WARNING: Slot XX link or title is missing
```
This may resolve after the next Netlify deployment (1-2 minutes).

## State Management

### How State is Preserved

The upload function (`incremental-deploy.js`) implements robust state management:

1. **Fetch Existing State**: Before updating, the function fetches the latest committed `site-state.json` from the repository
2. **Merge Logic**: Only the uploaded slot is updated; all other slots remain unchanged
3. **Title Preservation**: If you re-upload a slot with a blank title, the existing title is preserved
4. **Atomic Writes**: State updates are committed atomically with the file uploads

### State File Location
- Live: `/assets/data/site-state.json`
- Source: `site/assets/data/site-state.json`

## Audit Tool

The **Audit Life Skills** button performs a comprehensive check of all 32 Life Skills slots:

### What It Checks
For each slot, it verifies:
- ✓ Title presence in site-state.json
- ✓ Link presence in site-state.json
- ✓ Directory existence via HEAD request
- ⚠ Mismatches between state and actual directories

### Running an Audit
1. Click "Audit Life Skills" button in Admin panel
2. Review the log output for each slot
3. Mismatches are flagged with `⚠` warnings

### Common Audit Results

**Empty slot (normal):**
```
Slot XX: Empty (no title, no link, no directory) ✓
```

**Complete slot (ideal):**
```
Slot XX: "[Title]" → /life-skills/presentations/presentation-XX/ ✓
```

**Mismatch (needs attention):**
```
⚠ Slot XX: MISMATCH detected!
  Title: (empty)
  Link: (empty)
  Directory exists: YES
  → Issue: Directory exists but no link in state
```

## Troubleshooting

### Hub Shows "Placeholder" But Upload Succeeded

**Symptoms:**
- Admin verification shows success
- Hub (/life-skills/) still shows "Placeholder"

**Causes & Solutions:**

1. **Cache Issue**
   - Hard refresh the hub page (Ctrl+Shift+R / Cmd+Shift+R)
   - Clear browser cache
   - Wait 1-2 minutes for Netlify deployment

2. **State Not Deployed Yet**
   - Wait 2-3 minutes for Netlify to rebuild
   - Check verification log for warnings
   - Run Audit Life Skills to verify directory exists

3. **Defensive Slot Check**
   - The hub (`unit-grid.js`) has fallback logic
   - If a directory exists but link is missing, it will probe with HEAD request
   - This auto-promotes existing directories to active cards

### Re-uploading Overwrites Title

**Expected Behavior:**
- Uploading with a title: Updates to new title
- Uploading with blank title: Preserves existing title
- Uploading with blank when no existing title: Returns error

**To Preserve Title:**
- Leave the title field blank when re-uploading
- Or re-enter the same title

### Directory Exists But No Link in State

**Diagnosis:**
1. Run Audit Life Skills
2. Look for slots showing:
   ```
   Directory exists: YES
   Link in state: (empty)
   ```

**Solutions:**
1. Re-upload the slot with proper title (recommended)
2. Or manually edit `site/assets/data/site-state.json` and commit
3. Hub's defensive check should still show "Open presentation" after a page refresh

### Batch Upload Failed Mid-Process

**Symptoms:**
- Some batches succeeded
- Later batches failed
- Partial files uploaded

**Recovery:**
1. Check the log for which batch failed
2. Re-upload the entire slot (will replace all files)
3. System will overwrite partial uploads

**Prevention:**
- Keep total upload size under 50MB when possible
- Compress large images before uploading
- Use fewer large files per upload

## Technical Details

### File Structure
```
site/
  life-skills/
    presentations/
      presentation-01/
        index.html          # Redirect page (auto-generated)
        [your-files].html   # Your presentation
        images/             # Your assets
      presentation-02/
        ...
```

### State Format
```json
{
  "categories": {
    "life": {
      "slots": 32,
      "titles": [
        "Title for slot 1",
        "Title for slot 2",
        ...
      ],
      "links": [
        "/life-skills/presentations/presentation-01/",
        "/life-skills/presentations/presentation-02/",
        ...
      ]
    }
  }
}
```

### Hub Card Logic (`unit-grid.js`)

The hub uses a defensive checking strategy:

1. Load `site-state.json`
2. For each slot:
   - If title and link exist: Show "Open presentation" button
   - If title exists but no link: Probe directory with HEAD request
     - If directory exists (200): Auto-set link, show "Open presentation"
     - If directory missing (404): Show "Placeholder"
   - If no title: Show "Placeholder"

This ensures uploads appear even if state update was delayed or missed.

### Debug Overlay

To quickly verify state data on any hub page, add `?debugState=1` to the URL:

```
/life-skills/?debugState=1
```

This displays a debug overlay in the top-right corner showing:
- First 10 slots with their titles and links
- Last updated timestamp
- Real-time state from site-state.json

Useful for:
- Verifying uploads without running an audit
- Checking state after deployment
- Troubleshooting display issues

## Best Practices

1. **Always Enter a Title**: Even when re-uploading, include the title to avoid potential issues
2. **Verify After Upload**: Check the verification log for success message
3. **Run Audit Periodically**: Use Audit Life Skills to catch any state inconsistencies
4. **Wait for Deployment**: Allow 1-2 minutes after upload before testing the hub
5. **Keep Files Organized**: Use clear file names and folder structures
6. **Compress Images**: Reduce upload time and site load time

## Support

If you encounter persistent issues:
1. Run Audit Life Skills and save the log
2. Check browser console for errors
3. Verify network connectivity
4. Contact site administrator with:
   - Slot number
   - Upload timestamp
   - Error messages from log
   - Audit results
