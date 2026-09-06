import { Chess, compactMove } from './core.js';

const VALUES = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };

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

// This is a modest, bounded classroom opponent, not a rated tournament engine.
// It runs in a worker so Chromebook input remains responsive.
export function findMove(chess, level = 'friendly', budgetMs = 600, random = Math.random) {
  const moves = orderedMoves(chess);
  if (!moves.length || chess.isGameOver()) return null;
  if (level === 'starter') return compactMove(moves[Math.floor(random() * moves.length)]);
  const deadline = Date.now() + Math.min(1800, Math.max(50, budgetMs));
  const maxDepth = level === 'challenge' ? 3 : 2;
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
  let bestMove = moves[0];
  for (let depth = 1; depth <= maxDepth; depth++) {
    let bestScore = -Infinity;
    let candidate = bestMove;
    try {
      for (const move of moves) {
        if (Date.now() >= deadline) throw timedOut;
        chess.move(compactMove(move));
        let score;
        try { score = -search(depth - 1, -Infinity, Infinity, 1); } finally { chess.undo(); }
        if (score > bestScore) { bestScore = score; candidate = move; }
      }
      bestMove = candidate;
    } catch (error) {
      if (error !== timedOut) throw error;
      break;
    }
  }
  return compactMove(bestMove);
}

export function gameForEngine(moves) {
  const chess = new Chess();
  for (const move of moves) chess.move(move);
  return chess;
}
