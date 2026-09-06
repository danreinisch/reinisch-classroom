const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');

let emptyGame, drop, replay, legalColumns, winningColumns, forkColumns, hintFor, snapshot, restore, parseGameCode, GameStore, chooseMove, EXERCISES, solutions, exerciseSolved;
before(async () => {
  ({ emptyGame, drop, replay, legalColumns, winningColumns, forkColumns, hintFor, snapshot, restore, parseGameCode, GameStore } = await import('../site/activities/four-in-a-row/core.js'));
  ({ chooseMove } = await import('../site/activities/four-in-a-row/engine.js'));
  ({ EXERCISES, solutions, exerciseSolved } = await import('../site/activities/four-in-a-row/exercises.js'));
});
const options = { mode: 'local', level: 'friendly', human: 1 };

test('the classic worker matches its sources and runs without newer browser APIs', () => {
  execFileSync(process.execPath, [path.join(__dirname, '../scripts/build-four-in-a-row-worker.mjs'), '--check']);
  const replies = [], self = { postMessage: data => replies.push(data) };
  vm.runInNewContext('Object.hasOwn = undefined;\n' + fs.readFileSync(path.join(__dirname, '../site/activities/four-in-a-row/worker.js'), 'utf8'), { self });
  self.onmessage({ data: { id: 9, moves: [0,6,1,6,2,5], level: 'challenge' } });
  assert.equal(replies[0].id, 9); assert.equal(replies[0].column, 3);
  self.onmessage({ data: { id: 10, moves: [], level: 'toString' } });
  assert.equal(replies[1].id, 10); assert.equal(replies[1].error, 'The computer paused. Try again.');
});

const DRAW = [4,0,1,3,5,1,6,0,2,5,6,3,4,3,4,6,6,6,6,0,1,4,1,5,5,4,2,4,1,2,0,0,3,1,3,5,3,2,2,2,0,5];
function memory() {
  const data = new Map();
  return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) };
}
function student(code = 'FOUR_TEST_A') {
  const session = memory(); session.setItem('rc_user_role', 'student'); session.setItem('rc_user_code', code); return session;
}

// Independent whole-board scanner checks the runtime's last-move algorithm.
function referenceWinner(board) {
  for (let row = 0; row < 6; row++) for (let col = 0; col < 7; col++) {
    const player = board[row * 7 + col]; if (!player) continue;
    for (const [dr, dc] of [[0,1],[1,0],[1,1],[1,-1]]) {
      let count = 0;
      for (let n = 0; n < 4; n++) {
        const r = row + n * dr, c = col + n * dc;
        if (r >= 0 && r < 6 && c >= 0 && c < 7 && board[r * 7 + c] === player) count++;
      }
      if (count === 4) return player;
    }
  }
  return 0;
}

test('pieces obey gravity, alternate turns, and leave earlier positions unchanged', () => {
  const initial = emptyGame(), first = drop(initial, 3), second = drop(first, 3);
  assert.equal(first.board[38], 1); assert.equal(second.board[31], 2);
  assert.deepEqual(initial.moves, []); assert.equal(initial.board[38], 0);
  assert.equal(first.board[31], 0); assert.equal(second.turn, 1);
});

test('invalid and full columns are rejected without adding a move', () => {
  for (const column of [-1,7,1.5,'2',null,undefined,NaN]) assert.throws(() => drop(emptyGame(), column));
  const full = replay([3,3,3,3,3,3]);
  assert.throws(() => drop(full, 3)); assert.equal(full.moves.length, 6);
  assert.deepEqual(legalColumns(full), [0,1,2,4,5,6]);
});

test('horizontal, vertical, and both diagonal wins terminate play', () => {
  for (const moves of [[0,6,1,6,2,5,3], [0,1,0,1,0,2,0], [0,1,1,2,4,2,2,3,4,3,5,3,3], [6,5,5,4,2,4,4,3,2,3,1,3,3]]) {
    const game = replay(moves); assert.equal(game.winner, 1); assert.equal(game.line.length, 4);
    assert.equal(game.draw, false); assert.deepEqual(legalColumns(game), []); assert.throws(() => drop(game, 0));
  }
});

test('a move connecting five highlights the complete winning line', () => {
  const game = replay([0,6,1,6,3,5,4,5,2]);
  assert.equal(game.winner, 1); assert.equal(game.line.length, 5);
  game.line.forEach(index => assert.equal(game.board[index], 1));
});

test('a full nonwinning board is a draw and restores as a completed game', () => {
  const game = replay(DRAW);
  assert.equal(referenceWinner(game.board), 0); assert.equal(game.draw, true);
  assert.equal(restore(snapshot(game, options)).game.draw, true);
  assert.throws(() => replay([...DRAW, 0])); assert.equal(chooseMove(game), null);
});

test('random legal games agree with an independent winner scan and never float pieces', () => {
  let seed = 47821;
  for (let round = 0; round < 160; round++) {
    let game = emptyGame();
    while (!game.winner && !game.draw) {
      seed = (Math.imul(seed,1664525) + 1013904223) >>> 0;
      const choices = legalColumns(game); game = drop(game, choices[seed % choices.length]);
      assert.equal(game.winner, referenceWinner(game.board));
      for (let row = 0; row < 5; row++) for (let col = 0; col < 7; col++) if (game.board[row * 7 + col]) assert.notEqual(game.board[(row + 1) * 7 + col], 0);
    }
  }
});

test('move history and computer settings round-trip for either player', () => {
  for (const human of [1,2]) {
    const game = replay([3,2,4,1]); const restored = parseGameCode(JSON.stringify(snapshot(game, { mode: 'computer', level: 'challenge', human })));
    assert.deepEqual(restored.game, game); assert.equal(restored.options.human, human); assert.equal(restored.options.level, 'challenge');
  }
});

test('malformed, oversized, impossible, and post-win game codes are refused', () => {
  assert.throws(() => parseGameCode('<script>bad</script>')); assert.throws(() => parseGameCode('x'.repeat(3001)));
  for (const change of [{version:2},{mode:'online'},{level:'__proto__'},{human:3},{moves:[0,0,0,0,0,0,0]},{moves:[0,6,1,6,2,5,3,4]},{moves:['3']},{moves:null}]) {
    assert.throws(() => restore({ ...snapshot(emptyGame(), options), ...change }));
  }
});

test('student saves are separate and guest practice cannot write a shared save', () => {
  const storage = memory(), a = new GameStore(storage, student()), b = new GameStore(storage, student('FOUR_TEST_B'));
  a.save(snapshot(replay([3]), options), null);
  assert.equal(a.readGame().game.moves.length, 1); assert.equal(b.readGame().kind, 'empty');
  assert.throws(() => new GameStore(storage, memory()).save(snapshot(emptyGame(), options), null));
});

test('a changed session cannot read or write the prior student’s game', () => {
  const session = student(), store = new GameStore(memory(), session);
  session.setItem('rc_user_code', 'FOUR_TEST_B');
  assert.equal(store.isCurrent(), false); assert.throws(() => store.readGame());
  assert.throws(() => store.save(snapshot(emptyGame(), options), null));
});

test('stale tabs cannot overwrite a newer game or an occupied save', () => {
  const store = new GameStore(memory(), student());
  const first = store.save(snapshot(replay([3]), options), null);
  store.save(snapshot(replay([3,2]), options), first);
  assert.throws(() => store.save(snapshot(replay([3,4]), options), first), /Another tab/);
  assert.throws(() => store.save(snapshot(emptyGame(), options), null), /Another tab/);
  assert.deepEqual(store.readGame().game.moves, [3,2]);
});

test('corrupt saves stay untouched until an explicit replacement uses their revision', () => {
  const storage = memory(), store = new GameStore(storage, student());
  storage.setItem(`${store.prefix}game`, '{broken');
  assert.equal(store.readGame().kind, 'corrupt'); assert.equal(storage.getItem(`${store.prefix}game`), '{broken');
  assert.throws(() => store.save(snapshot(emptyGame(), options), null));
  store.save(snapshot(emptyGame(), options), '{broken'); assert.equal(store.readGame().kind, 'saved');
});

test('failed writes and unavailable storage report failure without destroying the save', () => {
  const storage = memory(), store = new GameStore(storage, student());
  const revision = store.save(snapshot(replay([3]), options), null);
  storage.setItem = () => { throw new Error('Quota exceeded'); };
  assert.throws(() => store.save(snapshot(replay([3,2]), options), revision), /Quota/);
  assert.deepEqual(store.readGame().game.moves, [3]);
  storage.getItem = () => { throw new Error('Storage blocked'); };
  assert.throws(() => store.readGame(), /blocked/);
});

test('preferences and challenge progress merge without changing the saved game', () => {
  const store = new GameStore(memory(), student());
  store.save(snapshot(replay([0]), options), null);
  store.writeMeta({ theme: 'ocean', pieces: 'patterns' }); store.complete('first-drop'); store.writeMeta({ coach: false }); store.complete('first-drop');
  assert.deepEqual(store.readMeta(), { theme:'ocean', pieces:'patterns', completed:['first-drop'], coach:false });
  assert.deepEqual(store.readGame().game.moves, [0]);
});

test('hints explain immediate wins, blocks, double threats, and unavoidable threats', () => {
  assert.equal(hintFor(replay([6,0,6,1,6,2])).kind, 'win');
  assert.equal(hintFor(replay([0,1,0,1,2,1])).column, 1);
  const fork = EXERCISES.find(x => x.id === 'double-threat');
  assert.equal(hintFor(replay(fork.moves)).kind, 'fork');
  const danger = replay([6,1,6,2,5,3]);
  assert.equal(hintFor(danger).kind, 'danger'); assert.match(hintFor(danger).text, /cannot block both/);
  assert.equal(hintFor(replay(DRAW)), null);
});

test('every authored position is legal, solvable, and rejects a wrong legal choice', () => {
  assert.equal(EXERCISES.filter(x => x.section === 'learn').length, 4);
  assert.equal(EXERCISES.filter(x => x.section === 'challenges').length, 8);
  for (const item of EXERCISES) {
    const game = replay(item.moves), good = solutions(item);
    assert.equal(game.winner, 0, item.id); assert.equal(game.draw, false, item.id);
    assert.ok(good.length, item.id); assert.ok(legalColumns(game).some(c => !exerciseSolved(item, game, c)), item.id);
    if (item.kind === 'block') assert.ok(winningColumns(game, 3 - game.turn).length, item.id);
    for (const column of good) {
      const next = drop(game, column);
      if (item.kind === 'win') assert.equal(referenceWinner(next.board), game.turn, item.id);
      if (item.kind === 'block') for (const reply of legalColumns(next)) assert.notEqual(referenceWinner(drop(next, reply).board), next.turn, item.id);
    }
  }
});

test('alternate winning answers both complete the same challenge', () => {
  const item = EXERCISES.find(x => x.id === 'two-finishes'); assert.deepEqual(solutions(item), [0,4]);
});

test('double-threat solutions beat every possible opponent reply on the next move', () => {
  for (const item of EXERCISES.filter(x => x.kind === 'fork')) {
    const game = replay(item.moves); assert.deepEqual(forkColumns(game), solutions(item));
    for (const column of solutions(item)) {
      const next = drop(game, column);
      for (const reply of legalColumns(next)) {
        const response = drop(next, reply); assert.equal(response.winner, 0);
        assert.ok(legalColumns(response).some(c => referenceWinner(drop(response,c).board) === game.turn));
      }
    }
  }
});

test('all computer levels take a win before blocking and block a single immediate threat', () => {
  for (const level of ['learning','friendly','challenge']) {
    assert.equal(chooseMove(replay([6,0,6,1,6,2]), level), 6);
    assert.equal(chooseMove(replay([0,1,0,1,2,1]), level), 1);
  }
});

test('computer choices are legal and never mutate the input position', () => {
  for (const level of ['learning','friendly','challenge']) {
    const game = replay([3,3,2,4]), original = JSON.stringify(game);
    assert.ok(legalColumns(game).includes(chooseMove(game,level,80,() => .9)));
    assert.equal(JSON.stringify(game), original);
  }
  assert.throws(() => chooseMove(emptyGame(),'unknown'));
  assert.equal(chooseMove(replay([0,6,1,6,2,5,3])), null);
});

test('stronger computer levels find a forced win in the tactical positions', () => {
  for (const item of EXERCISES.filter(x => x.kind === 'fork')) {
    const game = replay(item.moves);
    for (const level of ['friendly','challenge']) {
      const next = drop(game, chooseMove(game,level,800));
      for (const reply of legalColumns(next)) {
        const response = drop(next,reply);
        assert.equal(response.winner,0);
        assert.ok(legalColumns(response).some(c => referenceWinner(drop(response,c).board) === game.turn), `${item.id} / ${level}`);
      }
    }
  }
});

test('Challenge agrees with exhaustive endgame outcomes', () => {
  function solve(game) {
    if (game.winner) return -1;
    if (game.draw) return 0;
    return Math.max(...legalColumns(game).map(c => -solve(drop(game,c))));
  }
  for (const count of [37,38,39,40]) {
    const game = replay(DRAW.slice(0,count));
    const selected = chooseMove(game,'challenge',400);
    assert.equal(-solve(drop(game,selected)),solve(game), `After ${count} moves`);
  }
});

test('the activity has one Viewer card, a return path, and local versioned assets', () => {
  const root = path.join(__dirname,'..');
  const portal = fs.readFileSync(path.join(root,'site/student/index.html'),'utf8');
  assert.equal((portal.match(/title=Four%20in%20a%20Row/g) || []).length,1);
  assert.match(portal,/src=%2Factivities%2Ffour-in-a-row%2F&amp;return=%2Fstudent%2F%3Ftab%3Dactivities/);
  for (const file of ['index.html','app.js','game.css','worker.js','core.js','engine.js','exercises.js']) assert.ok(fs.existsSync(path.join(root,'site/activities/four-in-a-row',file)));
  const html = fs.readFileSync(path.join(root,'site/activities/four-in-a-row/index.html'),'utf8');
  assert.match(html,/app\.js\?v=20260906-four-/);
  assert.doesNotMatch(html,/<script[^>]*src=["']https?:/i);
});
