import { replay } from './core.js?v=20260906-four-1';
import { chooseMove } from './engine.js?v=20260906-four-1';

self.onmessage = event => {
  let id = null;
  try {
    const data = event.data;
    if (!data || !Number.isSafeInteger(data.id)) throw new Error('Invalid computer request.');
    id = data.id;
    const game = replay(data.moves);
    self.postMessage({ id, column: chooseMove(game, data.level, data.budgetMs) });
  } catch { self.postMessage({ id, error: 'The computer paused. Try again.' }); }
};
