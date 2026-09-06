import { ROWS, COLS, LEVELS, drop, legalColumns, winningColumns, other } from './core.js?v=20260906-four-1';

const ORDER = [3, 2, 4, 1, 5, 0, 6];
const WINDOWS = [];
for (let row = 0; row < ROWS; row++) for (let col = 0; col < COLS; col++) {
  for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
    if (row + 3 * dr >= ROWS || col + 3 * dc < 0 || col + 3 * dc >= COLS) continue;
    WINDOWS.push(Array.from({ length: 4 }, (_, i) => (row + i * dr) * COLS + col + i * dc));
  }
}

function evaluate(game) {
  const player = game.turn, opponent = other(player);
  let score = 0;
  for (let r = 0; r < ROWS; r++) score += game.board[r * COLS + 3] === player ? 5 : game.board[r * COLS + 3] === opponent ? -5 : 0;
  for (const cells of WINDOWS) {
    let us = 0, them = 0;
    for (const cell of cells) { if (game.board[cell] === player) us++; else if (game.board[cell] === opponent) them++; }
    if (!them) score += [0, 1, 8, 65, 10000][us];
    if (!us) score -= [0, 1, 8, 65, 10000][them];
  }
  return score;
}

// Iterative search keeps the last fully searched result. Both time and node
// limits are enforced; a stopped search never replaces a completed result.
export function chooseMove(game, level = 'friendly', budgetMs = 450, random = Math.random) {
  if (!Object.hasOwn(LEVELS, level)) throw new Error('Unknown computer level.');
  const legal = ORDER.filter(c => legalColumns(game).includes(c));
  if (!legal.length) return null;
  const wins = winningColumns(game);
  if (wins.length) return wins[0];
  const threats = winningColumns(game, other(game.turn));
  if (threats.length === 1) return threats[0];
  const safe = legal.filter(c => winningColumns(drop(game, c)).length === 0);
  const candidates = safe.length ? safe : legal;
  if (level === 'learning') return candidates[Math.min(candidates.length - 1, Math.max(0, Math.floor(random() * candidates.length)))];
  const deadline = Date.now() + Math.min(1200, Math.max(30, Number.isFinite(budgetMs) ? budgetMs : 450));
  const stopped = {};
  let nodes = 0;
  function search(state, depth, alpha, beta, ply) {
    nodes++;
    if (nodes >= 60000 || (nodes % 64 === 0 && Date.now() >= deadline)) throw stopped;
    if (state.winner) return -100000 + ply;
    if (state.draw) return 0;
    if (!depth) return evaluate(state);
    let best = -Infinity;
    for (const column of ORDER) {
      if (state.board[column]) continue;
      const score = -search(drop(state, column), depth - 1, -beta, -alpha, ply + 1);
      best = Math.max(best, score); alpha = Math.max(alpha, score);
      if (alpha >= beta) break;
    }
    return best;
  }
  let bestColumn = candidates[0];
  for (let depth = 1; depth <= (level === 'challenge' ? 7 : 4); depth++) {
    let best = -Infinity, nextColumn = bestColumn;
    try {
      for (const column of candidates) {
        const score = -search(drop(game, column), depth - 1, -Infinity, -best, 1);
        if (score > best) { best = score; nextColumn = column; }
      }
      bestColumn = nextColumn;
      if (best > 90000) break;
    } catch (error) { if (error !== stopped) throw error; break; }
  }
  return bestColumn;
}
