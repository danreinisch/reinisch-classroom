# Four in a Row

Adds one card to Student Portal Activities. The game opens at
`/activities/four-in-a-row/` inside the existing Viewer, with the Activities
return URL and Exit Activity control. No shared portal or Viewer runtime changes
are needed.

## Play and practice

- Standard 7-column, 6-row gravity rules: connect four horizontally, vertically,
  or diagonally. The first win ends play; a full board without a winner is a draw.
- Two people can play on one device, or a student can use the bounded computer
  opponent with either player moving first.
- The computer has twelve real classroom profiles: First Drops, Rookie, Learning,
  Casual, Developing, Club, Skilled, Advanced, Expert, Master, Ruthless, and
  Canyon Boss. Every level takes an immediate win and blocks one immediate losing
  threat. The ladder then increases Four-specific center/window evaluation,
  alpha-beta search depth, time and node budgets, and tightens candidate selection
  while reducing deliberate move variance. This is a practice ladder, not a
  rating system or a claim of perfect play.
- First Drops uses no search after the immediate win/block/safety checks. Rookie
  starts at depth 1, Learning at depth 2, and Casual reaches depth 4. Skilled
  preserves the former Challenge envelope at depth 7, 850 ms, and 60,000 nodes.
  Levels 8–12 extend beyond that boundary, with Canyon Boss capped at depth 11,
  1,850 ms, and 180,000 nodes. An overall 2,200 ms search cap and the existing
  4.5-second UI failure guard keep the activity bounded.
- Existing `friendly` saves restore as Casual and existing `challenge` saves
  restore as Skilled. The existing `learning` key remains current.
- Search stays in the classic Web Worker, including the existing Safari 14 path.
  Iterative search retains its last completed result. Undo, view changes, dialogs,
  page hiding, or a newer move invalidate pending computer work before it can
  change the live game.
- Hints identify wins, immediate blocks, double threats, or a safe move to
  explore. Coach mode explains the hint. Forced-loss hints state the limitation.
- Four guided lessons and eight challenges. All positions are replayed from
  legal move histories. Equivalent answers satisfying the stated goal are
  accepted. Double-threat goals are distinct from other forced-win strategies.
- Five existing board themes and five existing piece-material treatments remain
  available. Column buttons support arrow keys, Home/End, Enter/Space, and 1–7
  shortcuts. Column descriptions expose their contents to screen readers.
- No timer, remote multiplayer, external game service, advertising, commercial
  assets, or additional package dependencies.

## Standard and HD Board

The existing normal Four in a Row page remains the default Standard experience.
`HD Board` opens an immersive presentation by moving the **same live board and
control panel DOM nodes** into an overlay. It does not create a second board,
controller, worker, or game state. Back restores those exact nodes to Standard,
so moves, saves, turn state, thinking state, undo history, and keyboard behavior
continue uninterrupted.

The immersive presentation adds a restrained annotated-canyon backdrop, a
manufactured frame with visible edge depth, deeper slot rims, disc thickness,
contact shadows, and material highlights. A shallow Four-specific perspective
camera exposes frame depth; Straight-on removes the transform. Zoom is bounded
to 85–125% in 5% steps, and Fit returns to 100%. Overflow is contained inside
the board stage rather than expanding the page.

The existing side controls become a narrow instrument panel. It is expanded on
larger screens and defaults collapsed below 900 px; on smaller screens an expanded
panel overlays rather than permanently shrinking the board. The current mode,
turn, New Game, undo, settings, hints, recent moves, quick rules, and game-code
controls remain the same live controls. In computer mode the panel also exposes
the current difficulty; changing it opens the existing New Game setup rather
than mutating a game in progress.

A deliberately faint reflection option is available only in immersive mode when
a compatible satin board/material combination is selected. High Contrast turns
off the decorative perspective/reflection treatment. Reduced Motion and
`prefers-reduced-motion` remove presentation transitions and animations; the
authoritative game state never depends on animation completion.

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
node scripts/build-four-in-a-row-worker.mjs --check
node --test tests/student-four-in-a-row.test.cjs tests/student-four-in-a-row-hd.test.cjs
npx playwright test tests/student-four-in-a-row.spec.js tests/student-four-in-a-row-hd.spec.js
npx eslint site/activities/four-in-a-row/*.js tests/student-four-in-a-row.test.cjs tests/student-four-in-a-row-hd.test.cjs tests/student-four-in-a-row.spec.js tests/student-four-in-a-row-hd.spec.js
```

Unit coverage checks gravity, both players, all win directions, five-piece
connections, terminal positions, a complete draw, seeded games against an
independent winner scanner, save validation/isolation/conflicts/failures,
authored exercises, tactical decisions, exhaustive endgame outcomes, all twelve
computer profiles, legal computer moves, immutable engine input, profile bounds,
and legacy difficulty migration.

Browser coverage uses synthetic sessions only. It covers Viewer launch/return,
autosave and reload, both computer sides, coaching, lessons, alternative challenge
answers, styles, keyboard input, Standard/Focus/HD state continuity, bounded zoom,
both HD cameras, panel collapse/expand, High Contrast, Reduced Motion, restrained
reflections, required desktop/tablet/mobile breakpoints, imports, and worker
failure or cancellation.

The activity includes fallbacks for browsers without native modal dialogs,
dynamic viewport units, CSS aspect ratios, or `Object.hasOwn`. Dialog fallback
coverage checks focus containment, Tab/Shift+Tab, Escape, and restored focus.
These missing-feature paths are simulated in Chromium; this is not a claim of
a test run on an actual Safari 14 device.

`worker-entry.js` is the worker source. Run
`node scripts/build-four-in-a-row-worker.mjs` after editing the rules, engine, or
entry point to regenerate `worker.js`. The unit suite rejects an outdated
bundle and executes it without module imports or `Object.hasOwn`.
