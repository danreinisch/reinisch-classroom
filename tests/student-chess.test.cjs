const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

let Chess, ChessStore, gameStatus, makeSnapshot, restoreSnapshot, parseGameCode, findMove, LESSONS, CHALLENGES, exerciseGame, exerciseSolved;
before(async () => {
  ({ Chess, ChessStore, gameStatus, makeSnapshot, restoreSnapshot, parseGameCode } = await import('../site/activities/chess/core.js'));
  ({ findMove } = await import('../site/activities/chess/engine.js'));
  ({ LESSONS, CHALLENGES, exerciseGame, exerciseSolved } = await import('../site/activities/chess/lessons.js'));
});

const options = { mode: 'computer', level: 'friendly', human: 'w' };
function memoryStorage() {
  const values = new Map();
  return { values, getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
}
function student(code = 'CHESS_TEST_A') {
  const session = memoryStorage(); session.setItem('rc_user_role', 'student'); session.setItem('rc_user_code', code); return session;
}
function game(moves = []) { const chess = new Chess(); moves.forEach(move => chess.move(move)); return chess; }

test('legal move generation agrees with standard opening perft counts', () => {
  const chess = game();
  function perft(depth) {
    if (!depth) return 1;
    let nodes = 0;
    for (const move of chess.moves()) { chess.move(move); nodes += perft(depth - 1); chess.undo(); }
    return nodes;
  }
  assert.equal(perft(1), 20); assert.equal(perft(2), 400); assert.equal(perft(3), 8902);
});

test('rejects impossible moves, wrong-turn moves, and moves leaving the king in check', () => {
  const chess = game();
  assert.throws(() => chess.move({ from: 'e2', to: 'e5' }));
  assert.throws(() => chess.move({ from: 'e7', to: 'e5' }));
  const pinned = new Chess('k3r3/8/8/8/8/8/4R3/4K3 w - - 0 1');
  assert.throws(() => pinned.move({ from: 'e2', to: 'd2' }));
});

test('castling moves king and rook and refuses castling through, into, or out of check', () => {
  const legal = new Chess('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
  legal.move('O-O'); assert.equal(legal.get('g1').type, 'k'); assert.equal(legal.get('f1').type, 'r');
  for (const fen of ['k4r2/8/8/8/8/8/8/4K2R w K - 0 1', 'k5r1/8/8/8/8/8/8/4K2R w K - 0 1', 'k3r3/8/8/8/8/8/8/4K2R w K - 0 1']) {
    assert.throws(() => new Chess(fen).move('O-O'));
  }
});

test('moving a rook away and back does not restore castling rights', () => {
  const chess = new Chess('4k3/8/8/8/8/8/8/4K2R w K - 0 1');
  ['Rh2', 'Kd7', 'Rh1', 'Ke8'].forEach(move => chess.move(move));
  assert.throws(() => chess.move('O-O'));
});

test('en passant captures the passed pawn, expires, and cannot expose the king', () => {
  const chess = game(['e4', 'a6', 'e5', 'd5']);
  const restored = restoreSnapshot(makeSnapshot(chess, options)).chess;
  restored.move('exd6'); assert.equal(restored.get('d5'), undefined); assert.equal(restored.get('d6').type, 'p');
  chess.move('Nf3'); chess.move('a5'); assert.throws(() => chess.move('exd6'));
  const pinned = new Chess('k3r3/8/8/3pP3/8/8/8/4K3 w - d6 0 1');
  assert.throws(() => pinned.move('exd6'));
});

test('promotion supports all four choices and refuses a king promotion', () => {
  for (const promotion of ['q', 'r', 'b', 'n']) {
    const chess = new Chess('7k/P7/8/8/8/8/8/7K w - - 0 1');
    chess.move({ from: 'a7', to: 'a8', promotion }); assert.equal(chess.get('a8').type, promotion);
  }
  assert.throws(() => new Chess('7k/P7/8/8/8/8/8/7K w - - 0 1').move({ from: 'a7', to: 'a8', promotion: 'k' }));
});

test('checkmate and stalemate have distinct outcomes and no move follows mate', () => {
  const mate = game(['f3', 'e5', 'g4', 'Qh4#']);
  assert.match(gameStatus(mate).text, /Checkmate.*Black wins/);
  assert.equal(mate.moves().length, 0);
  const stale = new Chess('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1');
  assert.match(gameStatus(stale).text, /stalemate/);
  assert.equal(stale.isCheck(), false);
});

test('repetition survives a save/load round trip, with casual draw semantics', () => {
  const chess = game(['Nf3', 'Nf6', 'Ng1', 'Ng8', 'Nf3', 'Nf6', 'Ng1', 'Ng8']);
  const restored = restoreSnapshot(makeSnapshot(chess, options)).chess;
  assert.match(gameStatus(restored).text, /three times/);
  assert.deepEqual(restored.history(), chess.history());
  assert.throws(() => restoreSnapshot({ ...makeSnapshot(chess, options), moves: [...makeSnapshot(chess, options).moves, { from: 'e2', to: 'e4' }] }));
});

test('detects material and fifty-move draws', () => {
  assert.match(gameStatus(new Chess('7k/8/8/8/8/8/8/7K w - - 0 1')).text, /not enough pieces/);
  assert.match(gameStatus(new Chess('7k/8/8/8/8/8/8/R6K w - - 100 51')).text, /Fifty moves/);
});

test('save/load retains move history, turn, and castling rights', () => {
  const chess = game(['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Nf6', 'O-O']);
  const restored = restoreSnapshot(makeSnapshot(chess, { ...options, human: 'b' }));
  assert.equal(restored.chess.fen(), chess.fen());
  assert.deepEqual(restored.chess.history(), chess.history());
  assert.equal(restored.options.human, 'b');
  restored.chess.undo(); assert.equal(restored.chess.get('e1').type, 'k');
});

test('all three slots remain separate, and student B cannot load student A through the save API', () => {
  const storage = memoryStorage(); const session = student(); const store = new ChessStore(storage, session);
  [['e4'], ['d4'], ['Nf3']].forEach((moves, slot) => store.writeSlot(slot, makeSnapshot(game(moves), options), null));
  assert.equal(store.readSlot(0).chess.history()[0], 'e4');
  assert.equal(store.readSlot(1).chess.history()[0], 'd4');
  assert.equal(store.readSlot(2).chess.history()[0], 'Nf3');
  const other = new ChessStore(storage, student('CHESS_TEST_B'));
  assert.equal(other.readSlot(0).empty, true);
  assert.throws(() => store.readSlot(3)); assert.throws(() => store.readSlot(-1));
});

test('session changes and guest sessions cannot write games under another student', () => {
  const storage = memoryStorage(); const session = student(); const store = new ChessStore(storage, session);
  session.setItem('rc_user_code', 'CHESS_TEST_B');
  assert.throws(() => store.writeSlot(0, makeSnapshot(game(), options), null));
  assert.throws(() => store.readSlot(0));
  assert.throws(() => new ChessStore(storage, memoryStorage()).writeSlot(0, makeSnapshot(game(), options), null));
  assert.equal(storage.values.size, 0);
});

test('stale tabs cannot silently overwrite or delete a newer saved game', () => {
  const storage = memoryStorage(); const store = new ChessStore(storage, student());
  const revision = store.writeSlot(0, makeSnapshot(game(['e4']), options), null);
  store.writeSlot(0, makeSnapshot(game(['e4', 'e5']), options), revision);
  assert.throws(() => store.writeSlot(0, makeSnapshot(game(['d4']), options), revision), /another tab/);
  assert.throws(() => store.deleteSlot(0, revision), /another tab/);
  assert.deepEqual(store.readSlot(0).chess.history(), ['e4', 'e5']);
});

test('unreadable saves are preserved until explicitly replaced or deleted', () => {
  const storage = memoryStorage(); const store = new ChessStore(storage, student());
  storage.setItem(store.slotKey(0), '{broken');
  assert.equal(store.readSlot(0).corrupt, true);
  assert.equal(storage.getItem(store.slotKey(0)), '{broken');
  assert.throws(() => store.writeSlot(0, makeSnapshot(game(), options), null));
  store.deleteSlot(0, '{broken'); assert.equal(store.readSlot(0).empty, true);
});

test('storage failure is reported rather than pretending to save', () => {
  const storage = memoryStorage(); storage.setItem = () => { throw new Error('Quota exceeded'); };
  const store = new ChessStore(storage, student());
  assert.throws(() => store.writeSlot(0, makeSnapshot(game(), options), null), /Quota/);
});

test('game-code import validates before touching any saved game', () => {
  assert.throws(() => parseGameCode('<script>alert(1)</script>'));
  assert.throws(() => parseGameCode('x'.repeat(90001)), /large/);
  assert.throws(() => parseGameCode(JSON.stringify({ ...makeSnapshot(game(), options), moves: [{ from: 'e2', to: 'e5' }] })), /illegal/);
  assert.throws(() => parseGameCode(JSON.stringify({ ...makeSnapshot(game(), options), mode: '__proto__' })));
  const code = JSON.stringify(makeSnapshot(game(['d4', 'd5']), options));
  assert.deepEqual(parseGameCode(code).chess.history(), ['d4', 'd5']);
  assert.doesNotMatch(code, /CHESS_TEST|student|owner/);
});

test('board preferences and lesson completion merge without erasing each other', () => {
  const store = new ChessStore(memoryStorage(), student());
  store.writeMeta({ theme: 'ocean', pieces: 'modern', activeSlot: 2 });
  store.complete('pawn-step'); store.complete('pawn-step'); store.complete('rook');
  assert.deepEqual(store.readMeta().completed, ['pawn-step', 'rook']);
  assert.equal(store.readMeta().theme, 'ocean'); assert.equal(store.readMeta().activeSlot, 2);
});

test('every authored lesson and challenge is solvable and rejects at least one wrong legal move', () => {
  const all = [...LESSONS, ...CHALLENGES];
  assert.equal(LESSONS.length, 12); assert.equal(CHALLENGES.length, 8);
  assert.equal(new Set(all.map(item => item.id)).size, all.length);
  for (const exercise of all) {
    const chess = exerciseGame(exercise); let correct = 0, wrong = 0;
    for (const move of chess.moves({ verbose: true })) {
      chess.move(move); if (exerciseSolved(exercise, move, chess)) correct++; else wrong++; chess.undo();
    }
    assert.ok(correct > 0, `${exercise.id} has no solution`);
    if (exercise.id !== 'check') assert.ok(wrong > 0, `${exercise.id} accepts every move`);
  }
});

test('mate challenges accept alternate correct solutions', () => {
  const exercise = CHALLENGES.find(item => item.id === 'c-queen-mate');
  for (const san of ['Qg7#', 'Qh7#', 'Qf8#', 'Qe8#']) {
    const chess = exerciseGame(exercise); const move = chess.move(san);
    assert.equal(exerciseSolved(exercise, move, chess), true, san);
  }
});

test('all computer levels return legal moves and leave the input game unchanged', () => {
  for (const level of ['starter', 'friendly', 'challenge']) {
    const chess = game(['e4', 'e5', 'Nf3']); const fen = chess.fen(); const history = chess.history();
    const move = findMove(chess, level, 100, () => 0.4);
    assert.equal(chess.fen(), fen); assert.deepEqual(chess.history(), history);
    assert.ok(chess.move(move));
  }
});

test('computer finds immediate mate and returns no move after game over', () => {
  const chess = new Chess('6k1/5ppp/8/8/8/8/8/4R1K1 w - - 0 1');
  chess.move(findMove(chess, 'friendly', 300)); assert.ok(chess.isCheckmate());
  assert.equal(findMove(chess), null);
});

test('Activities integration preserves the existing viewer return contract and local assets', () => {
  const root = path.resolve(__dirname, '..');
  const html = fs.readFileSync(path.join(root, 'site/student/index.html'), 'utf8');
  assert.equal((html.match(/title=Classroom%20Chess/g) || []).length, 1);
  assert.match(html, /src=%2Factivities%2Fchess%2F&amp;return=%2Fstudent%2F%3Ftab%3Dactivities&amp;title=Classroom%20Chess&amp;activity=1/);
  for (const title of ['Open Word Search', 'Open Skill Builder', 'Open Chess']) assert.ok(html.includes(title));
  const app = fs.readFileSync(path.join(root, 'site/activities/chess/app.js'), 'utf8');
  assert.doesNotMatch(app, /fetch\(|supabase|localStorage\.clear\(|sessionStorage\.setItem/);
  assert.ok(fs.existsSync(path.join(root, 'site/vendor/chessjs/LICENSE')));
});

test('vendored comment cleanup round-trips repeated and nested braces through PGN', () => {
  for (const comment of ['First {idea}, then {{another}}.', '}} {extra}\n{last}', 'Plain chess comment']) {
    const chess = game();
    chess.setComment(comment);
    assert.doesNotMatch(chess.getComment(), /[{}]/);
    const restored = new Chess(); restored.loadPgn(chess.pgn());
    // PGN import normalizes comment line breaks to spaces.
    assert.equal(restored.getComment(), chess.getComment().replace(/\n/g, ' '));
    assert.equal(restored.fen(), chess.fen());
  }
  const chess = game(); chess.setComment('First {idea}, then {{another}}.');
  assert.equal(chess.getComment(), 'First [idea], then [[another]].');
});
