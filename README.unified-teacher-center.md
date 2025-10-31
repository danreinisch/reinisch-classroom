# Unified Teacher Center (Work-in-Progress)

This branch merges the two existing modules into a single Teacher Center, keeping localStorage for now and scaffolding a Supabase backend for later.

What’s included (target)
- Student Portal Manager (from v8.2)
- IEP Progress (v8.2 base layout)
- IEP & Evaluations (Events) (from v6.1)
- Passwords (local only for now)
- Assignments, Results, Assignment Hub, Classes, Upload, Data Import/Export (from v8.2)
- Settings (from v6.1): teacher profile, share PIN, notifications
- Share Link flow (from v6.1) for colleagues to add progress (percent-only)

Local dev
- Open `prototypes/teacher-center-unified.html` in Chrome/Edge/Firefox.
- By default, the app uses localStorage.
- When ready to test Supabase, add:
  <script>
    window.SUPABASE_URL = 'https://YOUR-PROJECT.supabase.co';
    window.SUPABASE_ANON_KEY = 'ey...';
  </script>
  before loading `web/supabase-client.js` and `web/data-adapter.js`.

Supabase setup (optional)
1) Create a Supabase project.
2) In Project Settings → API, copy Project URL and anon key.
3) In SQL Editor, run `supabase/schema/001_init.sql`.
4) The app still runs locally without Supabase; flipping to Supabase can be done incrementally.

Incremental migration checklist
- [ ] Port v8.2 Assignments, Results, Hub, Classes, Upload into the unified UI.
- [ ] Wire IEP Progress and Student Portal Manager to the adapter (local first).
- [ ] Implement Share Link and Events flows end-to-end in unified UI.
- [ ] Settings toggle: opt into Supabase (keep student passwords local for now).
- [ ] Optional: Supabase Storage for file uploads (attach module/presentation).