# Supabase Setup & Reliability

This guide covers setting up Supabase integration, troubleshooting connectivity, and understanding the reactive client architecture.

## Quick Setup

1. **Get your Supabase credentials**
   - Go to your Supabase project dashboard
   - Navigate to Project Settings → API
   - Copy your Project URL and anon (public) key

2. **Apply the database schema**
   - In Supabase SQL Editor, run the schema files in order:
     - `supabase/schema/001_init.sql`
     - `supabase/schema/002_phase_a_assignments.sql`
   - These create the necessary tables, functions, and policies

3. **Configure in the Hub**
   - Go to Hub → Settings
   - Paste your Project URL and anon key
   - Check "Use Supabase"
   - Click Save
   - **No page reload required** - the client rebuilds automatically!

4. **Test connectivity**
   - Click "Test Connection" button
   - You should see "OK" status
   - Use "Try again" to recheck quickly if needed

## How It Works

### Reactive Client Architecture

The Supabase client automatically rebuilds when settings change:

- **On Save**: When you save settings in the Hub, a `rc:remote-config-changed` event triggers client rebuild
- **On Toggle**: Enabling/disabling Supabase instantly rebuilds the client
- **Cross-Tab**: Changes in one browser tab automatically sync to other tabs via `storage` events

This means:
- No page reload needed after changing settings
- Pull/seed operations work immediately after Save
- Toggle OFF disables Supabase; toggle ON re-enables it instantly
- Status chips update in real-time

### Multi-CDN Fallback

The client tries multiple CDN sources for the Supabase library:
1. esm.sh (primary)
2. jsDelivr (backup)
3. unpkg (backup)

If all CDNs fail (e.g., network restrictions), the app falls back to localStorage mode.

### Optional Vendor Bundle

For environments with strict CDN restrictions:
1. Download `@supabase/supabase-js@2` as ESM bundle
2. Save to `/site/vendor/supabase-js@2.mjs`
3. Uncomment the vendor fallback in `site/web/supabase-client.js`

## Troubleshooting

### "Not Configured" Error
- Ensure you've entered both URL and anon key
- Check that "Use Supabase" toggle is ON
- Click Test Connection to verify

### Connection Fails
- Verify your Project URL is correct (should end with `.supabase.co`)
- Check that your anon key is valid (starts with `eyJ`)
- Ensure your Supabase project is not paused
- Check browser console for network errors

### "Unauthorized" Error (401/403)
- Your anon key may be invalid or expired
- Regenerate the key in Supabase dashboard → Settings → API
- Update the key in Hub settings

### CDN Blocked
- If all CDN sources fail, you'll see a console warning
- The app will fall back to localStorage mode
- Consider using the vendor bundle option (see above)

### Cross-Tab Not Working
- Ensure localStorage is not disabled in browser settings
- Check that both tabs are on the same domain
- Look for `[supabase-client] Storage changed in another tab` in console

### Data Not Persisting
- Verify your RLS (Row Level Security) policies allow the operation
- Check Supabase logs for policy violations
- See `supabase/sql-extras/04_dev_policies_open.sql` for permissive dev policies
- See `supabase/sql-extras/04_prod_policies_recommended.sql` for safer production policies

## Performance & Optional Features

### Performance Indexes
Run `supabase/sql-extras/00_performance_indexes.sql` to add helpful indexes on:
- Foreign keys (student_id, class_id, etc.)
- Lookup columns (code fields)
- Common query patterns (date ranges)

These improve query performance for classroom-scale traffic (hundreds of records).

### Bulk Operations (Optional)
If you need server-side bulk operations:
- See `supabase/sql-extras/03_optional_bulk_rpcs.sql`
- Provides bulk upsert functions using `SECURITY DEFINER`
- Call from service role or authenticated context
- Example: `bulk_upsert_students(jsonb_array)`

### RLS Policies

**Development** (`04_dev_policies_open.sql`):
- Open read/write access for anon key
- Fast iteration and testing
- **Not recommended for production**

**Production** (`04_prod_policies_recommended.sql`):
- Anon key: read-only access
- Authenticated users: read/write access
- Service role: full access (bypasses RLS)

Choose the policy set that matches your deployment stage.

## Security Notes

- **Never commit secrets**: Anon key is safe to expose publicly
- **Service role key**: Keep this secret! Never expose in client-side code
- **RLS policies**: Always enable and configure appropriate policies for production
- **Logging**: The app only logs key lengths/masked previews, never full keys

## API Reference

### Client Functions

```javascript
import { getSupabase, testConnection } from './web/supabase-client.js';

// Get current client (returns null if not configured)
const supabase = getSupabase();

// Test connectivity
const result = await testConnection();
// Returns: { ok: true } or { ok: false, error: 'reason', detail: '...' }
```

### Retry Helper

```javascript
import { withRetry } from './site/web/supabase-util.js';

// Wrap operations that may have transient failures
const result = await withRetry(
  async () => supabase.from('students').select('*'),
  { retries: 2, baseDelayMs: 250 }
);
```

Default retry behavior:
- 2 retries (3 total attempts)
- Exponential backoff: 250ms, 500ms, 1000ms
- Jitter: +0-100ms random per attempt

## Support

For issues or questions:
1. Check browser console for detailed error messages
2. Verify your Supabase project status in the dashboard
3. Review the schema files to ensure all migrations were applied
4. Check RLS policies if data operations fail

The reactive client provides immediate feedback through status chips and console logging to help diagnose issues quickly.
