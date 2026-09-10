import { Chess } from '../../vendor/chessjs/chess.js?v=1.4.0-rc1';

export { Chess };
export const SLOT_COUNT = 3;
export const MAX_MOVES = 1600;
export const PIECE_NAMES = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };

export const COMPUTER_LEVELS = Object.freeze([
  Object.freeze({ key: 'first-steps', label: 'First Steps' }),
  Object.freeze({ key: 'beginner', label: 'Beginner' }),
  Object.freeze({ key: 'learning', label: 'Learning' }),
  Object.freeze({ key: 'casual', label: 'Casual' }),
  Object.freeze({ key: 'developing', label: 'Developing' }),
  Object.freeze({ key: 'club', label: 'Club' }),
  Object.freeze({ key: 'skilled', label: 'Skilled' }),
  Object.freeze({ key: 'advanced', label: 'Advanced' }),
  Object.freeze({ key: 'expert', label: 'Expert' }),
  Object.freeze({ key: 'master', label: 'Master' }),
  Object.freeze({ key: 'ruthless', label: 'Ruthless' }),
  Object.freeze({ key: 'canyon-boss', label: 'Canyon Boss' }),
]);

const CURRENT_LEVEL_KEYS = new Set(COMPUTER_LEVELS.map(level => level.key));
export const LEGACY_LEVEL_ALIASES = Object.freeze({
  starter: 'first-steps',
  friendly: 'casual',
  challenge: 'skilled',
});

// LEVELS remains a simple label lookup because the existing UI and save cards consume it.
// Legacy keys stay readable while restoreSnapshot migrates them to current keys.
export const LEVELS = Object.freeze({
  'first-steps': 'First Steps',
  beginner: 'Beginner',
  learning: 'Learning',
  casual: 'Casual',
  developing: 'Developing',
  club: 'Club',
  skilled: 'Skilled',
  advanced: 'Advanced',
  expert: 'Expert',
  master: 'Master',
  ruthless: 'Ruthless',
  'canyon-boss': 'Canyon Boss',
  starter: 'First Steps',
  friendly: 'Casual',
  challenge: 'Skilled',
});

export function normalizeLevel(level) {
  if (CURRENT_LEVEL_KEYS.has(level)) return level;
  return LEGACY_LEVEL_ALIASES[level] || null;
}

export const colorName = color => color === 'w' ? 'White' : 'Black';

// Casual classroom games automatically draw at three repetitions or 50 moves.
// Keep the complete move history: a FEN alone cannot preserve repetition rights.
export function gameStatus(chess) {
  if (chess.isCheckmate()) return { over: true, text: `Checkmate. ${colorName(chess.turn() === 'w' ? 'b' : 'w')} wins!` };
  if (chess.isStalemate()) return { over: true, text: 'Draw by stalemate. No legal moves, but the king is not in check.' };
  if (chess.isInsufficientMaterial()) return { over: true, text: 'Draw. There are not enough pieces left to give checkmate.' };
  if (chess.isThreefoldRepetition()) return { over: true, text: 'Draw. The same position has occurred three times.' };
  if (chess.isDrawByFiftyMoves()) return { over: true, text: 'Draw. Fifty moves by each side without a pawn move or capture.' };
  return { over: false, text: `${colorName(chess.turn())} to move${chess.isCheck() ? ' — your king is in check!' : '.'}` };
}

export function compactMove(move) {
  return { from: move.from, to: move.to, ...(move.promotion ? { promotion: move.promotion } : {}) };
}

export function makeSnapshot(chess, options) {
  return {
    version: 1,
    moves: chess.history({ verbose: true }).map(compactMove),
    mode: options.mode,
    level: normalizeLevel(options.level) || options.level,
    human: options.human,
  };
}

export function restoreSnapshot(value) {
  const level = normalizeLevel(value?.level);
  if (!value || value.version !== 1 || !Array.isArray(value.moves) || value.moves.length > MAX_MOVES ||
      !['computer', 'local'].includes(value.mode) || !level || !['w', 'b'].includes(value.human)) {
    throw new Error('This game code is not a supported Classroom Chess game.');
  }
  const chess = new Chess();
  for (const move of value.moves) {
    if (!move || !/^[a-h][1-8]$/.test(move.from) || !/^[a-h][1-8]$/.test(move.to) ||
        (move.promotion !== undefined && !['q', 'r', 'b', 'n'].includes(move.promotion)) || gameStatus(chess).over) {
      throw new Error('This saved game contains an invalid move. The existing game was kept.');
    }
    const legal = chess.moves({ square: move.from, verbose: true }).find(candidate =>
      candidate.to === move.to && candidate.promotion === move.promotion);
    if (!legal) throw new Error('This saved game contains an illegal move. The existing game was kept.');
    chess.move(compactMove(legal));
  }
  return { chess, options: { mode: value.mode, level, human: value.human } };
}

export function parseGameCode(text) {
  if (typeof text !== 'string' || text.length > 90000) throw new Error('That game code is too large.');
  let value;
  try { value = JSON.parse(text); } catch { throw new Error('Paste a complete game code copied from Classroom Chess.'); }
  const restored = restoreSnapshot(value);
  return { ...restored, snapshot: makeSnapshot(restored.chess, restored.options) };
}

export function sessionOwner(session) {
  try {
    const role = session.getItem('rc_user_role');
    const code = session.getItem('rc_user_code');
    return role === 'student' && typeof code === 'string' && /^[a-z0-9_-]{1,32}$/i.test(code)
      ? code.toUpperCase() : null;
  } catch { return null; }
}

export class ChessStore {
  constructor(storage, session) {
    this.storage = storage;
    this.session = session;
    this.owner = sessionOwner(session);
    this.prefix = this.owner ? `rc_chess_v1:${this.owner}:` : null;
  }
  isCurrent() { return this.owner === sessionOwner(this.session); }
  check() {
    if (!this.owner || !this.isCurrent()) throw new Error('Return to the Student Portal and sign in to save games.');
  }
  slotKey(slot) {
    if (!Number.isInteger(slot) || slot < 0 || slot >= SLOT_COUNT) throw new Error('Choose one of the three game slots.');
    return `${this.prefix}slot:${slot}`;
  }
  readSlot(slot) {
    this.check();
    const raw = this.storage.getItem(this.slotKey(slot));
    if (raw === null) return { empty: true, revision: null };
    try {
      const saved = JSON.parse(raw);
      if (typeof saved.revision !== 'string' || !Number.isFinite(saved.savedAt)) throw new Error('Invalid save');
      const restored = restoreSnapshot(saved.game);
      return { ...restored, saved, revision: raw, empty: false };
    } catch { return { corrupt: true, revision: raw, empty: false }; }
  }
  writeSlot(slot, game, expectedRevision) {
    this.check();
    restoreSnapshot(game);
    const key = this.slotKey(slot);
    if (this.storage.getItem(key) !== expectedRevision) {
      throw new Error('This slot changed in another tab. Copy your game code before loading that slot again.');
    }
    const saved = { revision: `${Date.now()}-${Math.random().toString(36).slice(2)}`, savedAt: Date.now(), game };
    const raw = JSON.stringify(saved);
    this.storage.setItem(key, raw);
    return raw;
  }
  deleteSlot(slot, expectedRevision) {
    this.check();
    const key = this.slotKey(slot);
    if (this.storage.getItem(key) !== expectedRevision) throw new Error('This slot changed in another tab. Open My games again.');
    this.storage.removeItem(key);
  }
  readMeta() {
    if (!this.owner || !this.isCurrent()) return {};
    try {
      const data = JSON.parse(this.storage.getItem(`${this.prefix}meta`) || '{}');
      return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
    } catch { return {}; }
  }
  writeMeta(change) {
    this.check();
    this.storage.setItem(`${this.prefix}meta`, JSON.stringify({ ...this.readMeta(), ...change }));
  }
  complete(id) {
    this.check();
    const meta = this.readMeta();
    const completed = Array.isArray(meta.completed) ? meta.completed.filter(x => typeof x === 'string').slice(0, 100) : [];
    this.writeMeta({ completed: [...new Set([...completed, id])] });
  }
}

export function describeMove(move, chess) {
  const piece = PIECE_NAMES[move.piece];
  let text = `${colorName(move.color)} ${piece}: ${move.from} to ${move.to}.`;
  if (move.flags.includes('k') || move.flags.includes('q')) text = `${colorName(move.color)} castles. The king and rook move together.`;
  if (move.captured) text += ` Captured a ${PIECE_NAMES[move.captured]}.`;
  if (move.flags.includes('e')) text += ' En passant: the pawn that just moved two squares is captured.';
  if (move.promotion) text += ` Promoted to a ${PIECE_NAMES[move.promotion]}.`;
  if (chess.isCheckmate()) text += ' Checkmate!';
  else if (chess.isCheck()) text += ' Check! The king must be protected.';
  return text;
}
