# Four in a Row

Adds one card to Student Portal Activities. The game opens at
`/activities/four-in-a-row/` inside the existing Viewer, with the Activities
return URL and Exit Activity control. No shared portal or Viewer runtime changes
are needed.

## Play and practice

- Standard 7-column, 6-row gravity rules: connect four horizontally, vertically,
  or diagonally. The first win ends play; a full board without a winner is a draw.
- Two people on one device, or a computer opponent with either player moving
  first. Learning takes immediate wins and blocks and otherwise varies its moves.
  Friendly searches up to four plies; Challenge searches up to seven. These are
  bounded practice opponents, with no claim of perfect play or a rating.
- The computer searches in a module Web Worker. Iterative search retains its
  last completed result, with a 60,000-node limit and at most a 1,200 ms requested
  search budget. The UI timeout is 4.5 seconds. A failed response offers retry;
  undo, view changes, dialogs, and page hiding cancel the pending request.
- Hints identify wins, immediate blocks, double threats, or a safe move to
  explore. Coach mode explains the hint. Forced-loss hints state the limitation.
- Four guided lessons and eight challenges. All positions are replayed from
  legal move histories. Equivalent answers satisfying the stated goal are
  accepted. Double-threat goals are distinct from other forced-win strategies.
- Four board themes and four piece styles. Players have different marks as well
  as colors. Column buttons support arrow keys, Home/End, Enter/Space, and 1–7
  shortcuts. Column descriptions expose their contents to screen readers.
- No timer, remote multiplayer, external chess/game service, advertising,
  commercial assets, or additional package dependencies.

## Save behavior

One current game autosaves after each completed move and undo. Student identity
uses the existing session-only `rc_user_role` and `rc_user_code` convention.
The local prefix is `rc_four_v1:<STUDENT_CODE>:` with separate `game` and `meta`
entries. Metadata contains theme, piece style, coach preference, and completed
practice IDs. Challenges never replace the current game.

Saves remain in this browser on this device. Clearing browser data removes them.
Copy/paste game codes provide manual transfer; exported codes contain only moves
and game settings. Guest play stays in memory and does not use a shared save.
This is local save separation, not a new authentication or authorization system.

Saved games include the complete move sequence and validated options. Restore
rejects out-of-range/full-column moves, moves after the game ends, unsupported
settings, and oversized codes. Unreadable saves remain intact until the student
explicitly replaces them. A new game or import labels replacement before writing.

The previous raw save is checked before each write so a detected stale tab
cannot silently replace a newer game. Storage errors keep the current board and
show an unsaved warning. Game codes can preserve that in-memory position. Session
changes lock the old board before it can write under another student's identity.

There are no database, server function, authentication, RLS, environment, or
deployment configuration changes.

## Verification

```bash
node --test tests/student-four-in-a-row.test.cjs
npx playwright test tests/student-four-in-a-row.spec.js tests/student-chess.spec.js tests/student-activities-word-search.spec.js
npx eslint site/activities/four-in-a-row/*.js tests/student-four-in-a-row.test.cjs tests/student-four-in-a-row.spec.js
```

Unit coverage checks gravity, both players, all win directions, five-piece
connections, terminal positions, a complete draw, 160 seeded games against an
independent winner scanner, save validation/isolation/conflicts/failures,
authored exercises, tactical decisions, and exhaustive endgame outcomes.

Browser coverage uses synthetic sessions only. It covers Viewer launch/return,
autosave and reload, both computer sides, coaching, lessons, alternative challenge
answers, styles, keyboard input, Chromebook/mobile layouts, blocked/quota-limited
storage, corrupt saves, stale tabs, session changes, imports, and worker failure
or cancellation. Existing Chess, Word Search, and Skill Builder browser cases
also run as integration checks.
