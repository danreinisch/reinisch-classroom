# Reinisch Classroom Local E2E Harness

This directory contains the minimum database harness used for isolated,
synthetic end-to-end certification of the Reinisch Classroom classroom-core
workflow.

## Purpose

The harness supports local certification of this chain:

Teacher Work creation and issue
→ target-only student visibility
→ autosave
→ close / login / resume
→ submit
→ auto-score
→ Teacher Review
→ grade
→ finalize
→ Gradebook
→ Student Portal result
→ progress evidence and provenance

No real student data belongs in this harness.

## Files

### schema.sql

Minimal schema required by the current classroom-core application runtime.

Important:

- It is intentionally outside `supabase/migrations/`.
- It must not be added to the production migration chain.
- It is based on current runtime contracts rather than conflicting historical migrations.
- It refuses to run unless `rc.local_e2e = '1'` is explicitly set.

### fixture.sql

Synthetic starting fixture containing:

- one synthetic teacher;
- one synthetic class;
- target student `E2E01`;
- non-target student `E2E99`;
- enrollment for `E2E01` only;
- one synthetic goal for `E2E01`;
- local-only synthetic student authentication records.

It deliberately creates no:

- assignment;
- assignment instance;
- teacher draft;
- submission;
- submission answer;
- goal progress row;
- goal data point.

Those records must be created through the application during E2E certification.

### reset-local-e2e.sh

Resets only the established standalone local E2E database.

It:

1. Verifies the expected local Supabase database container is running.
2. Verifies PostgreSQL is exposed only on localhost.
3. Sets `rc.local_e2e = '1'`.
4. Applies `schema.sql`.
5. Applies `fixture.sql`.
6. Prints fixture counts.

It does not:

- start Supabase;
- replay repository migrations;
- contact production;
- use production credentials.

## Expected local sandbox

The standalone Supabase sandbox is expected at:

    ~/.rc-local-e2e-supabase

Expected database container:

    supabase_db_rc-local-e2e-supabase

Expected PostgreSQL binding:

    127.0.0.1:54322

The sandbox must remain outside the Reinisch Classroom repository.

## Reset the local synthetic database

From the repository root:

    tests/local-e2e/reset-local-e2e.sh

A successful reset should produce:

- 1 teacher
- 1 class
- 2 students
- 1 class enrollment
- 1 goal
- 2 synthetic app users
- 0 assignments
- 0 assignment instances
- 0 submissions
- 0 goal progress rows
- 0 goal data points

## Synthetic identities

Local test identities:

- `teacher_local`
- `E2E01` — target student
- `E2E99` — non-target student

The synthetic student password is defined in `fixture.sql` for local test
reproducibility. It is not a production credential.

## Safety rules

Do not:

- replay historical Reinisch Classroom migrations into this sandbox;
- copy production data into this sandbox;
- use real student information;
- use production Supabase credentials;
- move `schema.sql` into `supabase/migrations/`;
- treat this minimal schema as the canonical production schema;
- run ordinary linked Netlify Dev against production Supabase for synthetic testing.

Application E2E runs must explicitly override Supabase and session environment
variables before Netlify functions load.

This harness prepares the database only. It does not automatically execute the
full classroom workflow.

## Certification checkpoint

The classroom-core chain was successfully certified locally on July 20, 2026
using synthetic data.

Certified:

- Teacher Work creation and issue;
- target-only assignment visibility;
- exact assignment-instance continuity;
- autosave and fresh-login resume;
- student submission;
- objective scoring;
- Teacher Review visibility;
- grade and finalize transitions;
- Gradebook score mapping;
- Student Portal finalized result;
- per-question result details;
- progress evidence tied to the exact assignment instance;
- non-target isolation.

This was an isolated local E2E certification, not a production E2E run.
