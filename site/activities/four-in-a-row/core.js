export const ROWS = 6;
export const COLS = 7;
export const LEVELS = { learning: 'Learning', friendly: 'Friendly', challenge: 'Challenge' };
export const other = player => 3 - player;
export const playerName = player => `Player ${player}`;

export function emptyGame() {
  return { board: Array(ROWS * COLS).fill(0), moves: [], turn: 1, winner: 0, line: [], draw: false, last: -1 };
}

export function landingRow(board, column) {
  if (!Number.isInteger(column) || column < 0 || column >= COLS) return -1;
  for (let row = ROWS - 1; row >= 0; row--) if (!board[row * COLS + column]) return row;
  return -1;
}

function winningLine(board, row, column, player) {
  const result = new Set();
  for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
    const cells = [row * COLS + column];
    for (const sign of [-1, 1]) {
      let r = row + dr * sign, c = column + dc * sign;
      while (r >= 0 && r < ROWS && c >= 0 && c < COLS && board[r * COLS + c] === player) {
        cells.push(r * COLS + c); r += dr * sign; c += dc * sign;
      }
    }
    if (cells.length >= 4) cells.forEach(cell => result.add(cell));
  }
  return [...result];
}

export function legalColumns(game) {
  return game.winner || game.draw ? [] : Array.from({ length: COLS }, (_, c) => c).filter(c => !game.board[c]);
}

export function drop(game, column) {
  if (game.winner || game.draw) throw new Error('This game is finished. Start a new game to play again.');
  const row = landingRow(game.board, column);
  if (row < 0) throw new Error('Choose a column with an empty space.');
  const board = game.board.slice();
  const last = row * COLS + column;
  board[last] = game.turn;
  const line = winningLine(board, row, column, game.turn);
  const moves = [...game.moves, column];
  const winner = line.length ? game.turn : 0;
  return { board, moves, turn: other(game.turn), winner, line, draw: !winner && moves.length === ROWS * COLS, last };
}

export function replay(moves) {
  if (!Array.isArray(moves) || moves.length > ROWS * COLS) throw new Error('This game contains an invalid move history.');
  let game = emptyGame();
  for (const column of moves) game = drop(game, column);
  return game;
}

export function winningColumns(game, player = game.turn) {
  if (game.winner || game.draw) return [];
  return legalColumns(game).filter(column => {
    const row = landingRow(game.board, column);
    const board = game.board.slice(); board[row * COLS + column] = player;
    return winningLine(board, row, column, player).length > 0;
  });
}

export function forkColumns(game) {
  return legalColumns(game).filter(column => {
    const next = drop(game, column);
    return !next.winner && !next.draw && winningColumns(next).length === 0 && winningColumns(next, game.turn).length >= 2;
  });
}

const centerOrder = [3, 2, 4, 1, 5, 0, 6];
export function hintFor(game) {
  if (game.winner || game.draw) return null;
  const wins = winningColumns(game);
  if (wins.length) return { column: wins[0], text: `Column ${wins[0] + 1} connects four of your pieces. Take the win!`, kind: 'win' };
  const threats = winningColumns(game, other(game.turn));
  if (threats.length === 1) return { column: threats[0], text: `${playerName(other(game.turn))} can win in column ${threats[0] + 1}. Drop there to block that winning move.`, kind: 'block' };
  if (threats.length > 1) return { column: threats[0], text: `${playerName(other(game.turn))} has winning moves in columns ${threats.map(c => c + 1).join(' and ')}. One piece cannot block both. Try Undo to explore an earlier move.`, kind: 'danger' };
  const forks = forkColumns(game);
  if (forks.length) return { column: forks[0], text: `Column ${forks[0] + 1} creates two different places to win next turn. Your opponent can block only one.`, kind: 'fork' };
  const safe = legalColumns(game).filter(c => winningColumns(drop(game, c)).length === 0);
  const column = centerOrder.find(c => safe.includes(c)) ?? legalColumns(game)[0];
  return { column, text: safe.length ? `Explore column ${column + 1}. It avoids giving your opponent a win on their next move. Columns near the middle can connect in more directions.` : 'Every available move gives your opponent a winning reply. Try Undo to investigate the move before this one.', kind: safe.length ? 'explore' : 'danger' };
}

export function snapshot(game, options) {
  return { version: 1, moves: game.moves.slice(), mode: options.mode, level: options.level, human: options.human };
}

export function restore(value) {
  if (!value || value.version !== 1 || !['local', 'computer'].includes(value.mode) ||
      !Object.prototype.hasOwnProperty.call(LEVELS, value.level) || ![1, 2].includes(value.human)) throw new Error('This is not a supported Four in a Row game.');
  return { game: replay(value.moves), options: { mode: value.mode, level: value.level, human: value.human } };
}

export function parseGameCode(text) {
  if (typeof text !== 'string' || text.length > 3000) throw new Error('That game code is too large.');
  let data;
  try { data = JSON.parse(text); } catch { throw new Error('Paste a complete Four in a Row game code.'); }
  return restore(data);
}

export function sessionOwner(session) {
  try {
    const code = session.getItem('rc_user_code');
    return session.getItem('rc_user_role') === 'student' && typeof code === 'string' && /^[a-z0-9_-]{1,32}$/i.test(code) ? code.toUpperCase() : null;
  } catch { return null; }
}

export class GameStore {
  constructor(storage, session) {
    this.storage = storage; this.session = session; this.owner = sessionOwner(session);
    this.prefix = this.owner ? `rc_four_v1:${this.owner}:` : null;
  }
  isCurrent() { return this.owner === sessionOwner(this.session); }
  check() {
    if (!this.owner || !this.isCurrent()) throw new Error('Return to Activities and open the game with your current student login.');
  }
  readGame() {
    this.check();
    const raw = this.storage.getItem(`${this.prefix}game`);
    if (raw === null) return { kind: 'empty', revision: null };
    try {
      const value = JSON.parse(raw);
      if (!value || typeof value.revision !== 'string' || !Number.isFinite(value.savedAt)) throw new Error('Invalid save');
      return { kind: 'saved', revision: raw, ...restore(value.game) };
    } catch { return { kind: 'corrupt', revision: raw }; }
  }
  save(game, expectedRevision) {
    this.check(); restore(game);
    const key = `${this.prefix}game`;
    if (this.storage.getItem(key) !== expectedRevision) throw new Error('Another tab changed your saved game. Copy your game code before reopening Four in a Row.');
    const raw = JSON.stringify({ revision: `${Date.now()}-${Math.random().toString(36).slice(2)}`, savedAt: Date.now(), game });
    this.storage.setItem(key, raw);
    return raw;
  }
  readMeta() {
    if (!this.owner || !this.isCurrent()) return {};
    try {
      const meta = JSON.parse(this.storage.getItem(`${this.prefix}meta`) || '{}');
      return meta && typeof meta === 'object' && !Array.isArray(meta) ? meta : {};
    } catch { return {}; }
  }
  writeMeta(change) {
    this.check();
    this.storage.setItem(`${this.prefix}meta`, JSON.stringify({ ...this.readMeta(), ...change }));
  }
  complete(id) {
    const data = this.readMeta();
    const completed = Array.isArray(data.completed) ? data.completed.filter(x => typeof x === 'string').slice(0, 100) : [];
    this.writeMeta({ completed: [...new Set([...completed, id])] });
  }
}
