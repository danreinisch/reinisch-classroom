import { Chess } from './core.js';

export const LESSONS = [
  {
    id: 'pawn-step', title: 'Meet the pawn', tag: '01 · The pieces',
    prompt: 'White moves first. Move the pawn from e2 to e4. Select the piece, then its destination.',
    explanation: 'A pawn moves forward one square. From its starting square, it may move two if both squares are empty. Pawns never move backward.',
    hints: ['Find the pawn in front of the white king.', 'Select e2, then e4.'],
    target: { from: 'e2', to: 'e4' },
  },
  {
    id: 'pawn-capture', title: 'Pawns capture differently', tag: '02 · The pieces',
    fen: 'k7/8/8/3p4/4P3/8/8/7K w - - 0 1',
    prompt: 'The white pawn is on e4. Capture the black pawn on d5.',
    explanation: 'Pawns move straight ahead, but capture one square diagonally forward. They cannot capture straight ahead.',
    hints: ['Look one square diagonally forward from e4.', 'Select e4, then d5.'],
    target: { from: 'e4', to: 'd5' },
  },
  {
    id: 'rook', title: 'Rooks travel straight', tag: '03 · The pieces',
    fen: 'k7/8/8/8/3R4/8/P7/7K w - - 0 1',
    prompt: 'Move the rook from d4 to d7.',
    explanation: 'Rooks move any number of clear squares along a row or column. They cannot jump over pieces.',
    hints: ['Stay in the d column.', 'Select d4, then d7.'], target: { from: 'd4', to: 'd7' },
  },
  {
    id: 'bishop', title: 'Bishops use diagonals', tag: '04 · The pieces',
    fen: 'k7/8/8/8/3B4/8/P7/7K w - - 0 1',
    prompt: 'Move the bishop from d4 to g7.',
    explanation: 'A bishop follows diagonals and stays on the same square color for the entire game. It cannot jump over pieces.',
    hints: ['Follow the diagonal up and to the right.', 'Select d4, then g7.'], target: { from: 'd4', to: 'g7' },
  },
  {
    id: 'knight', title: 'Knights can jump', tag: '05 · The pieces',
    fen: 'k7/8/8/8/3N4/2P1P3/8/7K w - - 0 1',
    prompt: 'Move the knight from d4 to f5.',
    explanation: 'A knight moves in an L: two squares in one direction and one to the side. It is the only piece that jumps over other pieces.',
    hints: ['Move two columns right and one row up.', 'Select d4, then f5.'], target: { from: 'd4', to: 'f5' },
  },
  {
    id: 'queen', title: 'The queen combines moves', tag: '06 · The pieces',
    fen: 'k7/8/8/8/3Q4/8/8/7K w - - 0 1',
    prompt: 'Move the queen from d4 to g7.',
    explanation: 'The queen combines a rook and a bishop: straight lines and diagonals, for any number of clear squares. She cannot jump.',
    hints: ['The queen can use the diagonal toward g7.', 'Select d4, then g7.'], target: { from: 'd4', to: 'g7' },
  },
  {
    id: 'king', title: 'Keep the king safe', tag: '07 · The pieces',
    fen: 'k7/8/8/8/3K4/8/6p1/8 w - - 0 1',
    prompt: 'Move the white king from d4 to e5.',
    explanation: 'The king moves one square in any direction. It may never move onto a square attacked by an opponent.',
    hints: ['Choose the neighboring square diagonally ahead.', 'Select d4, then e5.'], target: { from: 'd4', to: 'e5' },
  },
  {
    id: 'check', title: 'Get out of check', tag: '08 · King safety',
    fen: 'k3r3/8/8/8/8/8/8/4K3 w - - 0 1',
    prompt: 'The rook is checking your king. Move the king to any safe square.',
    explanation: 'Check means the king is attacked. You must move the king, capture the attacker, or block the attack. Here, moving off the e column works.',
    hints: ['The black rook attacks the entire e column.', 'Try moving the king from e1 to d1.'], target: { from: 'e1' },
  },
  {
    id: 'castle', title: 'Castle for safety', tag: '09 · Special moves',
    fen: 'r3k2r/ppp2ppp/8/8/8/8/PPP2PPP/R3K2R w KQkq - 0 1',
    prompt: 'Castle on the king side: move your king from e1 to g1. The rook will follow.',
    explanation: 'Castling moves the king two squares toward a rook. Neither piece may have moved, the path must be clear, and the king cannot castle out of, through, or into check.',
    hints: ['Select the king, not the rook.', 'Select e1, then g1.'], target: { from: 'e1', to: 'g1' },
  },
  {
    id: 'promotion', title: 'Promote a pawn', tag: '10 · Special moves',
    fen: '7k/P7/8/8/8/8/8/7K w - - 0 1',
    prompt: 'Move a7 to a8, then choose a queen, rook, bishop, or knight.',
    explanation: 'A pawn reaching the farthest row must become a queen, rook, bishop, or knight. You can choose a piece even if none of your pieces have been captured.',
    hints: ['The pawn is one step from the farthest row.', 'Select a7, then a8, and choose a piece.'], target: { from: 'a7', to: 'a8' },
  },
  {
    id: 'en-passant', title: 'The en passant capture', tag: '11 · Special moves',
    fen: '7k/8/8/3pP3/8/8/8/7K w - d6 0 2',
    prompt: 'Black just moved d7 to d5. Move your pawn from e5 to d6 to capture it en passant.',
    explanation: 'When an opposing pawn moves two squares past your pawn, you may capture it as if it moved one. You must do so immediately on your next move.',
    hints: ['The capture lands on the square the black pawn passed over.', 'Select e5, then d6.'], target: { from: 'e5', to: 'd6' },
  },
  {
    id: 'first-mate', title: 'Finish with checkmate', tag: '12 · Putting it together',
    fen: '7k/5Q2/6K1/8/8/8/8/8 w - - 0 1',
    prompt: 'Give checkmate in one move. Your queen and king can work together.',
    explanation: 'Checkmate means the king is in check and there is no legal way out. The king is never captured. Any move that gives checkmate solves this lesson.',
    hints: ['Use the queen to check the king while covering its escape squares.', 'Try the queen from f7 to g7.'], mate: true,
  },
];

export const CHALLENGES = [
  {
    id: 'c-free-queen', title: 'Spot the free queen', tag: 'Warm-up · Capture',
    fen: '7k/8/3q4/8/8/3R4/8/7K w - - 0 1',
    prompt: 'White to move. Capture the undefended black queen.',
    explanation: 'Look along your rook’s open column. An undefended queen is a valuable capture.',
    hints: ['Look up the d column.', 'Try d3 to d6.'], capture: 'q',
  },
  {
    id: 'c-knight-fork', title: 'One knight, two threats', tag: 'Tactics · Fork',
    fen: '8/3k1q2/8/8/8/5N2/8/6K1 w - - 0 1',
    prompt: 'Find a knight move that attacks both the black king and queen.',
    explanation: 'A fork attacks two pieces at once. Because the king is in check, Black must answer the check first.',
    hints: ['Imagine the knight on e5. What would it attack?', 'Try f3 to e5.'], fork: ['d7', 'f7'],
  },
  {
    id: 'c-back-rank', title: 'The back-rank trap', tag: 'Checkmate in 1',
    fen: '6k1/5ppp/8/8/8/8/8/4R1K1 w - - 0 1',
    prompt: 'Give checkmate with the rook. Black’s own pawns block the king’s escape.',
    explanation: 'A king can be trapped behind its own pawns. The rook controls the back rank while the pawns block every escape.',
    hints: ['The eighth rank is clear.', 'Try e1 to e8.'], mate: true,
  },
  {
    id: 'c-queen-mate', title: 'King and queen teamwork', tag: 'Checkmate in 1',
    fen: '7k/5Q2/6K1/8/8/8/8/8 w - - 0 1',
    prompt: 'Give checkmate in one move. There is more than one correct solution.',
    explanation: 'Your king protects nearby squares while the queen delivers check and removes the escape routes.',
    hints: ['Bring the queen close to the black king, with protection.', 'Try f7 to g7.'], mate: true,
  },
  {
    id: 'c-rook-team', title: 'Two rooks, one finish', tag: 'Checkmate in 1',
    fen: '7k/R7/8/8/8/8/8/1R5K w - - 0 1',
    prompt: 'Use your two rooks to give checkmate in one move.',
    explanation: 'One rook cuts off the seventh rank. The other can deliver check along the eighth rank.',
    hints: ['Keep the rook on a7 guarding the seventh rank.', 'Try b1 to b8.'], mate: true,
  },
  {
    id: 'c-knight-mate', title: 'A knight gets through', tag: 'Checkmate in 1',
    fen: '6rk/6pp/3N4/8/8/8/8/7K w - - 0 1',
    prompt: 'The black king is boxed in. Find checkmate with the knight.',
    explanation: 'A knight can jump into a position other pieces cannot reach. Here, Black’s own pieces leave its king with no escape.',
    hints: ['Which knight move from d6 would attack h8?', 'Try d6 to f7.'], mate: true,
  },
  {
    id: 'c-promote', title: 'Turn a pawn into a threat', tag: 'Special move · Promotion',
    fen: '7k/1P6/8/8/8/8/8/7K w - - 0 1',
    prompt: 'Promote the pawn to a queen and give check.',
    explanation: 'The new queen attacks along the eighth rank immediately. Always look at the result of a promotion before choosing your piece.',
    hints: ['Advance the pawn to the eighth rank.', 'Try b7 to b8, then choose Queen.'], target: { from: 'b7', to: 'b8', promotion: 'q' },
  },
  {
    id: 'c-capture-checker', title: 'Capture the checking piece', tag: 'Defense · Escape check',
    fen: 'k7/8/8/8/8/8/4r3/3QK3 w - - 0 1',
    prompt: 'Your king is in check. Capture the attacking rook with your queen.',
    explanation: 'Moving the king is not the only answer to check. A safe capture of the checking piece also removes the threat.',
    hints: ['Your queen is next to the checking rook.', 'Try d1 to e2.'], target: { from: 'd1', to: 'e2' },
  },
];

export function exerciseGame(exercise) { return new Chess(exercise.fen); }

export function exerciseSolved(exercise, move, chess) {
  if (exercise.mate) return chess.isCheckmate();
  if (exercise.capture) return move.captured === exercise.capture;
  if (exercise.fork) return move.piece === 'n' && exercise.fork.every(square => chess.attackers(square, move.color).includes(move.to));
  return Object.entries(exercise.target).every(([key, value]) => move[key] === value);
}
