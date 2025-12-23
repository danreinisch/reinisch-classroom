# PR Logs

This directory contains curated pull-request (PR) merge logs used as durable context for maintenance, incident response, and future automation (including ChatGPT-assisted work).

## What belongs here
Each PR log should capture, at minimum:

- PR URL
- Title
- Merged at (UTC)
- Merge commit SHA
- Additions/Deletions (if known)
- Scope / goals
- Key changes (bullets)
- Files changed (paths)
- Testing notes
- Rollback notes
- Special constraints (e.g., CSP, auth, rate limits)

## Naming
- `PR-<number>.md` (e.g., `PR-310.md`)

## Notes
- If exact GitHub metadata (merged_at, merge_commit_sha, diffstat) is not known at time of writing, mark fields as `UNKNOWN` and update later.
