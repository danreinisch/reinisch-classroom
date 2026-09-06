import { findMove, gameForEngine } from './engine.js';

self.onmessage = event => {
  const { id, moves, level, budgetMs } = event.data;
  try {
    const chess = gameForEngine(moves);
    self.postMessage({ id, move: findMove(chess, level, budgetMs) });
  } catch {
    self.postMessage({ id, error: 'The computer could not choose a move. Try again.' });
  }
};
