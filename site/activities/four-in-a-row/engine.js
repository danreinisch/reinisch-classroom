import { ROWS, COLS, normalizeLevel, drop, legalColumns, winningColumns, other } from './core.js?v=20260909-four-hd-2';

const ORDER = [3, 2, 4, 1, 5, 0, 6];
const WINDOWS = [];
for (let row = 0; row < ROWS; row++) for (let col = 0; col < COLS; col++) {
  for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
    if (row + 3 * dr >= ROWS || col + 3 * dc < 0 || col + 3 * dc >= COLS) continue;
    WINDOWS.push(Array.from({ length: 4 }, (_, i) => (row + i * dr) * COLS + col + i * dc));
  }
}

export const LEVEL_PROFILES = Object.freeze({
  'first-drops': Object.freeze({ maxDepth: 0, budgetMs: 70, nodeLimit: 600, choiceWindow: 7, mistakeRate: 1, centerWeight: 0 }),
  rookie: Object.freeze({ maxDepth: 1, budgetMs: 100, nodeLimit: 1500, choiceWindow: 6, mistakeRate: 0.9, centerWeight: 1 }),
  learning: Object.freeze({ maxDepth: 2, budgetMs: 150, nodeLimit: 3500, choiceWindow: 5, mistakeRate: 0.7, centerWeight: 2 }),
  casual: Object.freeze({ maxDepth: 4, budgetMs: 350, nodeLimit: 18000, choiceWindow: 3, mistakeRate: 0.35, centerWeight: 5 }),
  developing: Object.freeze({ maxDepth: 5, budgetMs: 450, nodeLimit: 28000, choiceWindow: 3, mistakeRate: 0.22, centerWeight: 5.5 }),
  club: Object.freeze({ maxDepth: 6, budgetMs: 650, nodeLimit: 45000, choiceWindow: 2, mistakeRate: 0.1, centerWeight: 6 }),
  skilled: Object.freeze({ maxDepth: 7, budgetMs: 850, nodeLimit: 60000, choiceWindow: 1, mistakeRate: 0, centerWeight: 6.5 }),
  advanced: Object.freeze({ maxDepth: 8, budgetMs: 1050, nodeLimit: 80000, choiceWindow: 1, mistakeRate: 0, centerWeight: 7 }),
  expert: Object.freeze({ maxDepth: 8, budgetMs: 1250, nodeLimit: 100000, choiceWindow: 1, mistakeRate: 0, centerWeight: 7.5 }),
  master: Object.freeze({ maxDepth: 9, budgetMs: 1450, nodeLimit: 125000, choiceWindow: 1, mistakeRate: 0, centerWeight: 8 }),
  ruthless: Object.freeze({ maxDepth: 10, budgetMs: 1650, nodeLimit: 150000, choiceWindow: 1, mistakeRate: 0, centerWeight: 8.5 }),
  'canyon-boss': Object.freeze({ maxDepth: 11, budgetMs: 1850, nodeLimit: 180000, choiceWindow: 1, mistakeRate: 0, centerWeight: 9 }),
});

function evaluate(game, profile) {
  const player = game.turn, opponent = other(player);
  let score = 0;
  for (let row = 0; row < ROWS; row++) {
    if (game.board[row * COLS + 3] === player) score += profile.centerWeight;
    else if (game.board[row * COLS + 3] === opponent) score -= profile.centerWeight;
  }
  for (const cells of WINDOWS) {
    let us = 0, them = 0;
    for (const cell of cells) {
      if (game.board[cell] === player) us++;
      else if (game.board[cell] === opponent) them++;
    }
    if (!them) score += [0, 1, 8, 65, 10000][us];
    if (!us) score -= [0, 1, 8, 65, 10000][them];
  }
  return score;
}

function boundedRandomIndex(length, random) {
  if (length <= 1) return 0;
  const roll = Number(random());
  const bounded = Number.isFinite(roll) ? Math.min(0.999999999, Math.max(0, roll)) : 0;
  return Math.floor(bounded * length);
}

function chooseScoredColumn(scored, profile, random) {
  if (!scored.length) return null;
  const ranked = [...scored].sort((a, b) => b.score - a.score || ORDER.indexOf(a.column) - ORDER.indexOf(b.column));
  const window = ranked.slice(0, Math.max(1, Math.min(profile.choiceWindow, ranked.length)));
  if (window.length === 1 || profile.mistakeRate <= 0) return window[0].column;
  const roll = Number(random());
  if (Number.isFinite(roll) && roll >= profile.mistakeRate) return window[0].column;
  const alternatives = window.slice(1);
  return alternatives[boundedRandomIndex(alternatives.length, random)]?.column ?? window[0].column;
}

// Bounded classroom opponent: all levels preserve tactical basics, then differ
// through search depth, node/time budgets, candidate width, and deliberate variance.
// Search runs in the existing worker so student devices stay responsive.
export function chooseMove(game, level = 'casual', budgetMs, random = Math.random) {
  const key = normalizeLevel(level);
  if (!key || !Object.prototype.hasOwnProperty.call(LEVEL_PROFILES, key)) throw new Error('Unknown computer level.');
  const profile = LEVEL_PROFILES[key];
  const legal = ORDER.filter(c => legalColumns(game).includes(c));
  if (!legal.length) return null;

  const wins = winningColumns(game);
  if (wins.length) return wins[0];
  const threats = winningColumns(game, other(game.turn));
  if (threats.length === 1) return threats[0];

  // Preserve the existing opponent's safety rail: if at least one move avoids
  // handing over an immediate win, do not choose a move that loses at once.
  const safe = legal.filter(c => winningColumns(drop(game, c)).length === 0);
  const candidates = safe.length ? safe : legal;
  if (profile.maxDepth === 0) return candidates[boundedRandomIndex(candidates.length, random)];

  const requestedBudget = Number.isFinite(budgetMs) ? budgetMs : profile.budgetMs;
  const deadline = Date.now() + Math.min(2200, Math.max(30, requestedBudget));
  const stopped = {};
  let nodes = 0;
  function search(state, depth, alpha, beta, ply) {
    nodes++;
    if (nodes >= profile.nodeLimit || (nodes % 64 === 0 && Date.now() >= deadline)) throw stopped;
    if (state.winner) return -100000 + ply;
    if (state.draw) return 0;
    if (!depth) return evaluate(state, profile);
    let best = -Infinity;
    for (const column of ORDER) {
      if (state.board[column]) continue;
      const score = -search(drop(state, column), depth - 1, -beta, -alpha, ply + 1);
      best = Math.max(best, score);
      alpha = Math.max(alpha, score);
      if (alpha >= beta) break;
    }
    return best;
  }

  let completedScores = candidates.map(column => ({
    column,
    score: -evaluate(drop(game, column), profile),
  }));
  for (let depth = 1; depth <= profile.maxDepth; depth++) {
    const scored = [];
    try {
      let best = -Infinity;
      for (const column of candidates) {
        if (Date.now() >= deadline) throw stopped;
        const score = -search(drop(game, column), depth - 1, -Infinity, -best, 1);
        scored.push({ column, score });
        best = Math.max(best, score);
      }
      completedScores = scored;
      if (best > 90000) break;
    } catch (error) {
      if (error !== stopped) throw error;
      break;
    }
  }
  return chooseScoredColumn(completedScores, profile, random) ?? candidates[0];
}
