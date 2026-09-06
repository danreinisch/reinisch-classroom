# Classroom Chess

Classroom Chess adds one card to Student Portal Activities. It opens
`/activities/chess/` through the existing Viewer with its Activities return URL
and Exit Activity control. Existing portal and Viewer JavaScript is unchanged.

## Student features

- Play the computer as White or Black, or play two people on one device.
- Three selectable computer levels: Learning (random legal moves), Friendly
  (up to depth 2), and Challenge (up to depth 3). Search has a short time budget
  and runs in a Web Worker. These are casual practice levels, without Elo ratings.
- Twelve interactive lessons covering all pieces, check, castling, promotion,
  en passant, and checkmate. Eight challenges cover captures, forks, defense,
  promotion, and several mating patterns. Equivalent correct solutions count.
- Four board themes and four piece styles, including labeled and letter pieces.
  Optional legal-move highlights, board flipping, automatic turning for local
  two-player games, hints, and undo support different experience levels.
- Keyboard: arrow keys navigate the board, Enter/Space selects a piece or
  destination, Escape clears selection, and Home/End move within a board row.

## Save contract

Three game slots, preferences, and lesson/challenge completion are stored in
this browser on this device. This limitation is stated in the activity. Clearing
browser data removes these saves. There is no automatic cross-device sync.
Copy/paste game codes provide manual transfer without including a student code.

The existing `sessionStorage.rc_user_role` and `rc_user_code` identify the local
student save namespace, `rc_chess_v1:<code>:`. A guest may practice, but does not
read or write student saves. These client keys are a convenience boundary for
ungraded local games, not server authentication or protection against someone
with developer-tools access to that browser profile. No new server requests,
student records, assignment submissions, grades, auth behavior, or database
schema are introduced.

Each slot is a separate key. Autosave occurs after completed moves and undo.
The complete legal move sequence, mode, difficulty, and human color are saved;
replay preserves turn, castling rights, en passant, and repetition history.
Promotion is saved only after a piece is chosen. Lessons use a separate board
and cannot replace a saved game. Occupied slots show an explicit replacement
action, and deletion requires confirmation. Stale revisions are checked before
writing/deleting so an already changed slot is not silently overwritten.
Invalid saves are preserved, and failed writes show an error instead of claiming
success. Client session changes lock the old board before further actions.

## Rules and dependencies

The pinned, locally served chess.js 1.4.0 ESM build supplies move legality and
game-state rules. See `site/vendor/chessjs/README.md` for package integrity and
provenance and `LICENSE` for the BSD-2-Clause notice. The local build removes an
unused source-map URL and patches comment brace replacement to handle every
occurrence, fixing two CodeQL incomplete-escaping findings. The patch is covered
by a repeated/nested-brace PGN round-trip test and a versioned browser import.
There is no CDN, external game service, LLM,
chat, or online matchmaking. Board art is original SVG defined in the app.

These are untimed casual games. As disclosed in Quick rules, threefold repetition
and the fifty-move rule automatically end the game as draws, rather than requiring
tournament-style claims. Checkmate, stalemate, and insufficient material have
distinct messages. The king is never captured. All four promotions are supported.

## Verification

From the repository root:

```bash
node --test tests/student-chess.test.cjs
npx playwright test tests/student-chess.spec.js tests/student-activities-word-search.spec.js
npx eslint site/activities/chess/*.js tests/student-chess.test.cjs tests/student-chess.spec.js
```

The unit suite exercises opening perft counts, illegal and pinned moves, castling
restrictions, en passant (including an exposed king), all promotions, draw/mate
outcomes, history replay, save isolation, stale revisions, storage failure,
import validation, every authored position, alternate mates, and computer moves.
Browser checks use synthetic student identifiers and block remote resources and
all server-function calls. They cover the actual portal/Viewer round trip,
both player modes/colors, slot resume, cancellation of pending computer work,
tutorial feedback, promotion, customization, keyboard use, Chromebook fit,
small screens, corrupt saves, storage failure, session changes, and game transfer.
