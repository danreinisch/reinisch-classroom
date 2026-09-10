import { Chess, compactMove, normalizeLevel } from './core.js?v=20260909-chess-levels-1';

const VALUES = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };

export const LEVEL_PROFILES = Object.freeze({
  'first-steps': Object.freeze({ maxDepth: 0, budgetMs: 80, choiceWindow: 99, mistakeRate: 1 }),
  beginner: Object.freeze({ maxDepth: 1, budgetMs: 120, choiceWindow: 12, mistakeRate: 0.85 }),
  learning: Object.freeze({ maxDepth: 1, budgetMs: 180, choiceWindow: 8, mistakeRate: 0.65 }),
  casual: Object.freeze({ maxDepth: 2, budgetMs: 320, choiceWindow: 6, mistakeRate: 0.45 }),
  developing: Object.freeze({ maxDepth: 2, budgetMs: 450, choiceWindow: 4, mistakeRate: 0.25 }),
  club: Object.freeze({ maxDepth: 3, budgetMs: 650, choiceWindow: 3, mistakeRate: 0.12 }),
  skilled: Object.freeze({ maxDepth: 3, budgetMs: 900, choiceWindow: 2, mistakeRate: 0.05 }),
  advanced: Object.freeze({ maxDepth: 4, budgetMs: 1150, choiceWindow: 2, mistakeRate: 0.02 }),
  expert: Object.freeze({ maxDepth: 4, budgetMs: 1450, choiceWindow: 1, mistakeRate: 0 }),
  master: Object.freeze({ maxDepth: 5, budgetMs: 1800, choiceWindow: 1, mistakeRate: 0 }),
  ruthless: Object.freeze({ maxDepth: 5, budgetMs: 2300, choiceWindow: 1, mistakeRate: 0 }),
  'canyon-boss': Object.freeze({ maxDepth: 6, budgetMs: 3000, choiceWindow: 1, mistakeRate: 0 }),
});

function evaluate(chess) {
  let score = 0;
  for (const row of chess.board()) for (const piece of row) {
    if (!piece) continue;
    const file = piece.square.charCodeAt(0) - 97;
    const rank = Number(piece.square[1]) - 1;
    const center = 3.5 - (Math.abs(3.5 - file) + Math.abs(3.5 - rank)) / 2;
    const progress = piece.color === 'w' ? rank : 7 - rank;
    const position = piece.type === 'p' ? progress * 8 : ['n', 'b'].includes(piece.type) ? center * 14 : 0;
    score += (VALUES[piece.type] + position) * (piece.color === chess.turn() ? 1 : -1);
  }
  return score;
}

function orderedMoves(chess) {
  return chess.moves({ verbose: true }).sort((a, b) => {
    const rank = move => (move.captured ? 10 * VALUES[move.captured] - VALUES[move.piece] : 0) +
      (move.promotion ? VALUES[move.promotion] : 0) + (move.san.includes('#') ? 100000 : 0);
    return rank(b) - rank(a);
  });
}

function boundedRandomIndex(length, random) {
  if (length <= 1) return 0;
  const roll = Number(random());
  const bounded = Number.isFinite(roll) ? Math.min(0.999999999, Math.max(0, roll)) : 0;
  return Math.floor(bounded * length);
}

function chooseScoredMove(scored, profile, random) {
  if (!scored.length) return null;
  const ranked = [...scored].sort((a, b) => b.score - a.score);
  const window = ranked.slice(0, Math.max(1, Math.min(profile.choiceWindow, ranked.length)));
  if (window.length === 1 || profile.mistakeRate <= 0) return window[0].move;
  const roll = Number(random());
  if (Number.isFinite(roll) && roll >= profile.mistakeRate) return window[0].move;
  const alternatives = window.slice(1);
  return alternatives[boundedRandomIndex(alternatives.length, random)]?.move || window[0].move;
}

// This is a bounded classroom opponent, not a rated tournament engine.
// The twelve profiles deliberately scale move selection, search depth, and thinking budget.
// Search remains in a worker so classroom devices stay responsive.
export function findMove(chess, level = 'casual', budgetMs, random = Math.random) {
  const moves = orderedMoves(chess);
  if (!moves.length || chess.isGameOver()) return null;

  // Even the gentlest opponent should finish a mate-in-one it can already see.
  const immediateMate = moves.find(move => move.san.includes('#'));
  if (immediateMate) return compactMove(immediateMate);

  const key = normalizeLevel(level) || 'casual';
  const profile = LEVEL_PROFILES[key];
  if (profile.maxDepth === 0) return compactMove(moves[boundedRandomIndex(moves.length, random)]);

  const requestedBudget = Number.isFinite(budgetMs) ? budgetMs : profile.budgetMs;
  const deadline = Date.now() + Math.min(3000, Math.max(50, requestedBudget));
  let nodes = 0;
  const timedOut = {};

  function search(depth, alpha, beta, ply) {
    nodes++;
    if (nodes % 32 === 0 && Date.now() >= deadline) throw timedOut;
    if (chess.isCheckmate()) return -100000 + ply;
    if (chess.isDraw()) return 0;
    if (depth === 0) return evaluate(chess);
    let best = -Infinity;
    for (const move of orderedMoves(chess)) {
      chess.move(compactMove(move));
      let score;
      try { score = -search(depth - 1, -beta, -alpha, ply + 1); } finally { chess.undo(); }
      best = Math.max(best, score);
      alpha = Math.max(alpha, score);
      if (alpha >= beta) break;
    }
    return best;
  }

  let completedScores = moves.map(move => ({ move, score: 0 }));
  for (let depth = 1; depth <= profile.maxDepth; depth++) {
    const scored = [];
    try {
      for (const move of moves) {
        if (Date.now() >= deadline) throw timedOut;
        chess.move(compactMove(move));
        let score;
        try { score = -search(depth - 1, -Infinity, Infinity, 1); } finally { chess.undo(); }
        scored.push({ move, score });
      }
      completedScores = scored;
    } catch (error) {
      if (error !== timedOut) throw error;
      break;
    }
  }

  return compactMove(chooseScoredMove(completedScores, profile, random) || moves[0]);
}

export function gameForEngine(moves) {
  const chess = new Chess();
  for (const move of moves) chess.move(move);
  return chess;
}
