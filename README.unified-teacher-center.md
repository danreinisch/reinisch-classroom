# Unified Teacher Center

This unified Teacher Center runs on **localStorage by default** and supports an optional Supabase backend.

## Overview

The Teacher Center is a single-page application that consolidates all teacher workflows:
- **Assignments** – Create and manage assignments
- **Results** – View student progress and submissions
- **Hub** – Dashboard with KPIs and notifications
- **Classes** – Manage students and class rosters
- **Upload** – Upload resources and materials
- **IEP Progress** – Track IEP goals and progress entries
- **Events** – Schedule IEP meetings and evaluations
- **Student Portal Manager** – Manage student access and passwords
- **Settings** – Teacher profile, share PIN, and notifications

## Local Development (Default)

1. **Open** `prototypes/teacher-center-unified.html` directly in a browser
2. **No build step** required – it's a standalone HTML file
3. **No Supabase keys** needed – localStorage is used by default
4. **Default teacher password**: `teacher123`

The app imports:
- `web/data-adapter.js` – Adapter that uses localStorage or Supabase based on availability
- `web/supabase-client.js` – Minimal client (no-op unless env keys provided)

## Optional Supabase Backend

To enable the Supabase backend:

1. **Set up a Supabase project** at [supabase.com](https://supabase.com)
2. **Run the schema migration**:
   ```bash
   # In your Supabase SQL editor, run:
   # supabase/schema/001_init.sql
   ```
3. **Configure environment variables** in `teacher-center-unified.html`:
   ```javascript
   window.SUPABASE_URL = 'https://your-project.supabase.co';
   window.SUPABASE_ANON_KEY = 'your-anon-key';
   ```
4. **Reload the page** – the adapter will detect Supabase and use it instead of localStorage

### Database Schema

The schema (`supabase/schema/001_init.sql`) includes:
- Core tables: `classes`, `students`, `goals`, `assignments`, `assignment_instances`, `progress_entries`, `events`, `settings`, `notifications`
- RLS policies for authenticated users
- Helper RPCs: `set_student_password()`, `verify_student_password()` (bcrypt)

## Student Passwords

- **LocalStorage mode**: Student passwords are stored in plaintext (OK for local dev)
- **Supabase mode**: Student passwords are bcrypt-hashed via RPC functions
- Student passwords remain **local-only for now**; Supabase RPCs are scaffolded for later optional use

## Migration Checklist

This is a work-in-progress scaffold. Remaining work:

- [ ] Add unchanged reference copies under `prototypes/`:
  - `reinisch_classroom_v8_2.html`
  - `reinisch_classroom_v6_1.html`
- [ ] Port v8.2 tabs: Assignments, Results, Hub, Classes, Upload
- [ ] Add IEP & Evaluations (Events) and Share Link flows (from v6.1)
- [ ] Wire IEP Progress and Student Portal Manager to the adapter (local first)
- [ ] Settings pane (teacher profile, share PIN, notifications)
- [ ] Optional: Supabase toggle for adapter (keep student passwords local for now)

## Architecture

```
prototypes/teacher-center-unified.html
  └─ imports web/data-adapter.js
       └─ imports web/supabase-client.js
            └─ uses Supabase if keys present, else returns null

data-adapter.js:
  - Exports `db` object with methods like listStudents(), addProgress(), etc.
  - If Supabase is available, uses remote methods
  - Otherwise, falls back to localStorage methods
  - Student passwords remain local for now
```

## Testing

1. Open `prototypes/teacher-center-unified.html` in a browser
2. Enter teacher password (`teacher123`)
3. Navigate through tabs
4. Verify no console errors
5. Data persists in localStorage between page reloads

## Notes

- This PR will remain **open and unmerged** until the Teacher Center is fully functional
- Development will continue inside this PR
- No merge to `main` until complete
