import { findMove, gameForEngine } from './engine.js';

self.onmessage = event => {
  let id = null;
  try {
    const data = event.data;
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Invalid computer request.');
    id = data.id;
    const { moves, level, budgetMs } = data;
    const chess = gameForEngine(moves);
    self.postMessage({ id, move: findMove(chess, level, budgetMs) });
  } catch {
    self.postMessage({ id, error: 'The computer could not choose a move. Try again.' });
  }
};
