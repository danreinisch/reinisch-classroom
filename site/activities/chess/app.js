import { Chess, ChessStore, SLOT_COUNT, LEVELS, PIECE_NAMES, colorName, compactMove, gameStatus, makeSnapshot, parseGameCode } from './core.js';
import { LESSONS, CHALLENGES, exerciseGame, exerciseSolved } from './lessons.js';

const $ = id => document.getElementById(id);
let browserStorage;
try { browserStorage = window.localStorage; } catch { browserStorage = { getItem() { throw new Error('Browser storage is unavailable.'); }, setItem() { throw new Error('Browser storage is unavailable.'); } }; }
let session;
try { session = window.sessionStorage; } catch { session = { getItem() { return null; } }; }
const store = new ChessStore(browserStorage, session);
const meta = store.readMeta();
const preferences = {
  theme: ['forest', 'classic', 'ocean', 'contrast'].includes(meta.theme) ? meta.theme : 'forest',
  pieces: ['classic', 'modern', 'labeled', 'letters'].includes(meta.pieces) ? meta.pieces : 'classic',
  legal: meta.legal !== false,
  rotate: meta.rotate === true,
};
let play = { chess: new Chess(), options: { mode: 'computer', level: 'friendly', human: 'w' }, slot: null, revision: null };
let view = 'play';
let exercise = null;
let exerciseChess = null;
let solved = false;
let hintsUsed = 0;
let selected = null;
let hintSquares = [];
let flipped = false;
let pendingPromotion = null;
let worker = null;
let workerTimer = null;
let jobId = 0;
let thinking = false;
let saveError = '';
let sessionLocked = false;
let newSlotStates = [];
let imported = null;
let transferMode = 'copy';
let confirmedAction = null;
const completed = new Set(Array.isArray(meta.completed) ? meta.completed.filter(id => typeof id === 'string') : []);

const shapes = {
  p: '<circle cx="32" cy="17" r="8"/><path d="M25 28h14l-3 8 7 14H21l7-14z"/><path d="M19 51h26l2 6H17z"/>',
  r: '<path d="M18 9h7v8h5V9h5v8h5V9h7v16l-6 6v16H23V31l-5-6z"/><path d="M20 47h24l4 10H16zM23 26h18"/>',
  n: '<path d="M21 49c0-11 5-17 17-23l-9-5-8 10-9-3 7-15 14-5 1-5 7 8c9 7 11 17 6 29l-3 9z"/><path d="M19 49h28l3 8H16z"/><circle cx="29" cy="16" r="1.6" fill="currentColor" stroke="none"/>',
  b: '<path d="M32 6c-4 5-14 14-14 21 0 7 5 10 14 10s14-3 14-10C46 20 36 11 32 6zM36 17l-7 11"/><path d="M27 38h10l4 11H23zM20 50h24l5 7H15z"/>',
  q: '<path d="m15 20 8 6 9-13 9 13 8-6-7 26H22z"/><circle cx="13" cy="16" r="4"/><circle cx="32" cy="9" r="4"/><circle cx="51" cy="16" r="4"/><path d="M21 46h22l5 11H16zM23 38h18"/>',
  k: '<path d="M28 5h8v7h7v7h-7v8h-8v-8h-7v-7h7z"/><path d="M22 46c1-9-9-14-7-21 1-6 10-6 17 2 7-8 16-8 17-2 2 7-8 12-7 21zM21 47h22l5 10H16z"/>',
};

const modernShapes = {
  p: '<circle cx="32" cy="16" r="9"/><path d="M26 30h12l8 24H18z"/>',
  r: '<path d="M17 11h8v8h4v-8h6v8h4v-8h8v17H17zM23 29h18v18H23zM17 48h30v7H17z"/>',
  n: '<path d="m19 12 17-6 12 12-4 29H23l3-15 11-9-10-1-6 7-9-3zM17 48h30v7H17z"/><circle cx="31" cy="15" r="2"/>',
  b: '<path d="m32 5 13 19-13 13-13-13zM36 18l-8 9M27 38h10l9 17H18z"/>',
  q: '<path d="m13 15 12 9 7-17 7 17 12-9-9 29H22zM22 47h20l6 8H16z"/>',
  k: '<path d="M28 5h8v8h8v8h-8v8h-8v-8h-8v-8h8zM25 32h14l7 23H18z"/>',
};

function pieceMarkup(piece) {
  if (!piece) return '';
  if (preferences.pieces === 'letters') return `<span aria-hidden="true" class="piece-letter ${piece.color === 'b' ? 'black' : ''}">${piece.type.toUpperCase()}</span>`;
  return `<svg aria-hidden="true" viewBox="0 0 64 64" class="piece-${piece.color === 'w' ? 'white' : 'black'}">${(preferences.pieces === 'modern' ? modernShapes : shapes)[piece.type]}</svg>` +
    (preferences.pieces === 'labeled' ? `<span aria-hidden="true" class="piece-name">${PIECE_NAMES[piece.type]}</span>` : '');
}

function ensureSession() {
  if (sessionLocked) return false;
  if (store.isCurrent()) return true;
  sessionLocked = true;
  cancelComputer();
  for (const dialog of document.querySelectorAll('dialog[open]')) dialog.close();
  $('mainContent').hidden = true;
  $('sessionNotice').hidden = false;
  $('storageStatus').textContent = 'Return to Activities to continue with the current student login.';
  return false;
}

function activeChess() { return exercise ? exerciseChess : play.chess; }

function updateStorageStatus() {
  $('storageStatus').classList.toggle('failed', Boolean(saveError));
  if (saveError) $('storageStatus').textContent = `Saving needs attention: ${saveError} Your current game is still on screen.`;
  else if (!store.owner) $('storageStatus').textContent = 'Practice mode · Sign in through the Student Portal to use saved games and keep lesson progress.';
  else if (play.slot === null) $('storageStatus').textContent = 'This game is not in a slot. Use My games to copy its game code or start a game in a slot.';
  else $('storageStatus').textContent = `Game ${play.slot + 1} · ${play.revision ? 'Saved' : 'Saves after your first move'} on this device, in this browser · Three slots in My games`;
}

function savePlay() {
  if (!ensureSession() || !store.owner || play.slot === null) return;
  try {
    play.revision = store.writeSlot(play.slot, makeSnapshot(play.chess, play.options), play.revision);
    saveError = '';
    try { store.writeMeta({ activeSlot: play.slot }); } catch { /* The game itself is saved even if the preference fails. */ }
  } catch (error) { saveError = error.message || 'This browser could not save the game. Copy its game code from My games.'; }
  updateStorageStatus();
}

function renderBoard(focusSquare) {
  const chess = activeChess();
  const focused = focusSquare || (document.activeElement?.closest('#board') ? document.activeElement.dataset.square : null);
  const moves = selected ? chess.moves({ square: selected, verbose: true }) : [];
  const legal = new Set(moves.map(move => move.to));
  const history = chess.history({ verbose: true });
  const last = history.at(-1);
  const order = [];
  for (let row = 0; row < 8; row++) for (let col = 0; col < 8; col++) {
    order.push(String.fromCharCode(97 + (flipped ? 7 - col : col)) + (flipped ? row + 1 : 8 - row));
  }
  const fragment = document.createDocumentFragment();
  for (let index = 0; index < order.length; index++) {
    const square = order[index];
    const piece = chess.get(square);
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.square = square;
    button.className = 'square';
    button.classList.toggle('dark', ((square.charCodeAt(0) - 97) + Number(square[1])) % 2 === 1);
    button.classList.toggle('selected', selected === square);
    button.classList.toggle('legal', preferences.legal && legal.has(square));
    button.classList.toggle('occupied', Boolean(piece));
    button.classList.toggle('last', Boolean(last && [last.from, last.to].includes(square)));
    button.classList.toggle('hint', hintSquares.includes(square));
    button.classList.toggle('check', Boolean(piece?.type === 'k' && piece.color === chess.turn() && chess.isCheck()));
    button.setAttribute('aria-label', `${square}, ${piece ? `${colorName(piece.color)} ${PIECE_NAMES[piece.type]}` : 'empty'}${preferences.legal && legal.has(square) ? ', legal destination' : ''}`);
    button.setAttribute('aria-pressed', String(selected === square));
    button.tabIndex = square === (focused || (flipped ? 'e8' : 'e1')) ? 0 : -1;
    button.innerHTML = pieceMarkup(piece) + (index % 8 === 0 ? `<span aria-hidden="true" class="coord rank">${square[1]}</span>` : '') +
      (index >= 56 ? `<span aria-hidden="true" class="coord file">${square[0]}</span>` : '');
    fragment.append(button);
  }
  $('board').replaceChildren(fragment);
  if (focused) $('board').querySelector(`[data-square="${focused}"]`)?.focus({ preventScroll: true });
  $('positionStatus').textContent = exercise
    ? (solved ? 'Solved! Ready for the next position?' : `${colorName(chess.turn())} to move${chess.isCheck() ? ' · Your king is in check.' : '.'}`)
    : (thinking ? `${colorName(chess.turn())} · Computer is thinking…` : gameStatus(chess).text);
}

function renderPlayPanel() {
  const { chess, options, slot } = play;
  const history = chess.history({ verbose: true });
  $('modeLabel').textContent = options.mode === 'computer' ? 'Play the computer' : 'Two players · same device';
  $('gameTitle').textContent = slot === null ? 'Your next move.' : `Game ${slot + 1}`;
  $('gameDetails').textContent = options.mode === 'computer'
    ? `${LEVELS[options.level]} level · You play ${colorName(options.human)}.`
    : 'Take turns on this board. White moves first.';
  $('undoBtn').textContent = options.mode === 'computer' ? 'Undo turn' : 'Undo move';
  $('undoBtn').disabled = options.mode === 'computer' ? !history.some(move => move.color === options.human) : !history.length;
  $('hintBtn').disabled = thinking || gameStatus(chess).over || (options.mode === 'computer' && chess.turn() !== options.human);
  $('moveCount').textContent = history.length ? `${history.length} moves played` : 'New game';
  const fragment = document.createDocumentFragment();
  for (let i = 0; i < history.length; i += 2) {
    const li = document.createElement('li');
    for (const [j, text] of [`${i / 2 + 1}.`, history[i].san, history[i + 1]?.san || '…'].entries()) {
      const span = document.createElement('span'); span.textContent = text;
      if (j === 0) span.className = 'move-number';
      li.append(span);
    }
    fragment.append(li);
  }
  $('moveList').replaceChildren(fragment);
  $('moveList').scrollTop = $('moveList').scrollHeight;
}

function feedback(text) { $(exercise ? 'exerciseFeedback' : 'playFeedback').textContent = text; }

function cancelComputer() {
  jobId++;
  worker?.terminate(); worker = null;
  clearTimeout(workerTimer); workerTimer = null;
  thinking = false;
}

function engineRequest(isHint = false) {
  cancelComputer();
  if (!ensureSession() || view !== 'play' || exercise || gameStatus(play.chess).over) return;
  const id = jobId;
  const fen = play.chess.fen();
  const history = play.chess.history({ verbose: true }).map(compactMove);
  const fail = () => {
    if (id !== jobId) return;
    cancelComputer();
    $('retryComputerBtn').hidden = isHint;
    feedback(isHint ? 'The hint could not load. Try again.' : 'The computer paused. Use Retry computer move to continue.');
    renderBoard(); renderPlayPanel();
  };
  try {
    worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
    thinking = true;
    $('retryComputerBtn').hidden = true;
    worker.onerror = fail;
    worker.onmessage = event => {
      if (event.data.id !== id || id !== jobId || !ensureSession() || view !== 'play' || exercise || play.chess.fen() !== fen) return;
      const { move, error } = event.data;
      if (error || !move) { fail(); return; }
      const legal = play.chess.moves({ verbose: true }).find(candidate => candidate.from === move.from && candidate.to === move.to && candidate.promotion === move.promotion);
      if (!legal) { fail(); return; }
      cancelComputer();
      if (isHint) {
        hintSquares = [move.from, move.to];
        const reason = legal.san.includes('#') ? 'This gives checkmate.' : legal.captured ? `This captures a ${PIECE_NAMES[legal.captured]}. Check what your opponent could do next.` : legal.san.includes('+') ? 'This checks the opposing king.' : 'Look at the squares this piece would control and how your opponent could reply.';
        feedback(`Consider ${PIECE_NAMES[legal.piece]} ${move.from} to ${move.to}${move.promotion ? `, promoting to ${PIECE_NAMES[move.promotion]}` : ''}. ${reason}`);
      } else {
        const played = play.chess.move(move);
        hintSquares = [];
        feedback(`Computer played ${played.san}. ${gameStatus(play.chess).text}`);
        savePlay();
      }
      renderBoard(); renderPlayPanel();
    };
    workerTimer = setTimeout(fail, 6500);
    worker.postMessage({ id, moves: history, level: isHint ? 'challenge' : play.options.level, budgetMs: isHint ? 700 : play.options.level === 'challenge' ? 900 : 400 });
    renderBoard(); renderPlayPanel();
  } catch { fail(); }
}

function maybeComputer() {
  if (!thinking && view === 'play' && !exercise && play.options.mode === 'computer' && play.chess.turn() !== play.options.human && !gameStatus(play.chess).over) engineRequest();
}

function playMove(move) {
  if (!ensureSession()) return;
  const chess = activeChess();
  const played = chess.move(compactMove(move));
  selected = null; hintSquares = [];
  if (exercise) {
    if (exerciseSolved(exercise, played, chess)) {
      solved = true;
      completed.add(exercise.id);
      try { if (store.owner) store.complete(exercise.id); } catch { saveError = 'Lesson progress could not be saved in this browser.'; updateStorageStatus(); }
      $('exerciseSuccess').hidden = false;
      $('exerciseHintBtn').disabled = true;
      $('exerciseExplanation').textContent = exercise.explanation;
      feedback('You solved it! Read why the move works, then try the next position.');
    } else {
      chess.undo();
      feedback(`That is a legal move, but it does not solve this position. ${exercise.prompt}`);
    }
  } else {
    if (preferences.rotate && play.options.mode === 'local') flipped = chess.turn() === 'b';
    feedback(`${colorName(played.color)} played ${played.san}. ${gameStatus(chess).text}`);
    savePlay();
    renderPlayPanel();
  }
  renderBoard();
  if (!exercise) maybeComputer();
}

function selectSquare(square) {
  if (!ensureSession() || pendingPromotion || thinking || (exercise && solved)) return;
  const chess = activeChess();
  if (!exercise && (gameStatus(chess).over || (play.options.mode === 'computer' && chess.turn() !== play.options.human))) return;
  const piece = chess.get(square);
  if (selected === square) { selected = null; renderBoard(square); return; }
  if (selected) {
    const options = chess.moves({ square: selected, verbose: true }).filter(move => move.to === square);
    if (options.length) {
      if (options.some(move => move.promotion)) {
        pendingPromotion = options;
        $('promotionDialog').showModal();
      } else playMove(options[0]);
      return;
    }
  }
  if (piece?.color === chess.turn()) {
    selected = square; hintSquares = [];
    const moves = chess.moves({ square, verbose: true });
    feedback(`${colorName(piece.color)} ${PIECE_NAMES[piece.type]} on ${square}.${moves.length ? (preferences.legal ? ' Choose one of the highlighted squares.' : ' Choose a destination square.') : ' This piece has no legal moves right now.'}`);
  } else feedback(selected ? 'That move is not legal. Pieces cannot jump (except knights), and your king must stay safe. Choose another square.' : `Choose a ${colorName(chess.turn()).toLowerCase()} piece first.`);
  renderBoard(square);
}

function changeView(next) {
  if (!ensureSession()) return;
  cancelComputer(); exercise = null; selected = null; hintSquares = []; view = next;
  for (const button of document.querySelectorAll('[data-view]')) {
    if (button.dataset.view === next) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  }
  $('workspace').hidden = next !== 'play';
  $('catalog').hidden = !['learn', 'challenges'].includes(next);
  $('saves').hidden = next !== 'saves';
  $('playPanel').hidden = false; $('exercisePanel').hidden = true;
  if (next === 'play') {
    flipped = play.options.mode === 'computer' ? play.options.human === 'b' : preferences.rotate ? play.chess.turn() === 'b' : flipped;
    $('boardCaption').textContent = 'A little thinking. A great next move.';
    renderBoard(); renderPlayPanel(); maybeComputer();
  } else if (next === 'saves') renderSaves();
  else renderCatalog();
  updateStorageStatus();
}

function renderCatalog() {
  const isLearn = view === 'learn';
  const list = isLearn ? LESSONS : CHALLENGES;
  $('catalogEyebrow').textContent = isLearn ? 'Learn by making a move' : 'Small positions. Big ideas.';
  $('catalogTitle').textContent = isLearn ? 'One skill at a time.' : 'Find the winning idea.';
  $('catalogDescription').textContent = isLearn ? 'Start with the pieces, then try king safety and special moves. Every lesson is hands-on.' : 'Practice captures, forks, defense, and checkmate. Hints are always available.';
  $('catalogProgress').textContent = `${list.filter(item => completed.has(item.id)).length} of ${list.length} complete`;
  $('exerciseCards').replaceChildren();
  list.forEach(item => {
    const button = document.createElement('button');
    button.type = 'button'; button.className = `exercise-card${completed.has(item.id) ? ' complete' : ''}`;
    const tag = document.createElement('span'); tag.className = 'eyebrow'; tag.textContent = item.tag;
    const title = document.createElement('strong'); title.textContent = item.title;
    const status = document.createElement('span'); status.className = 'card-bottom'; status.textContent = completed.has(item.id) ? '✓ Complete · Practice again' : 'Try this position →';
    button.append(tag, title, status); button.addEventListener('click', () => openExercise(item));
    $('exerciseCards').append(button);
  });
}

function openExercise(item) {
  cancelComputer(); exercise = item; exerciseChess = exerciseGame(item); solved = false; hintsUsed = 0; selected = null; hintSquares = []; flipped = false;
  $('catalog').hidden = true; $('workspace').hidden = false; $('playPanel').hidden = true; $('exercisePanel').hidden = false;
  $('exerciseTag').textContent = item.tag; $('exerciseTitle').textContent = item.title; $('exercisePrompt').textContent = item.prompt;
  $('exerciseSuccess').hidden = true; $('exerciseHintBtn').disabled = false;
  $('allExercisesBtn').textContent = view === 'learn' ? '← All lessons' : '← All challenges';
  $('nextExerciseBtn').textContent = view === 'learn' ? 'Next lesson →' : 'Next challenge →';
  $('boardCaption').textContent = 'Practice position · Your saved game is kept';
  feedback('Take your time. You can ask for a hint.'); renderBoard();
}

function exerciseHint() {
  if (!exercise || solved) return;
  const index = Math.min(hintsUsed, exercise.hints.length - 1);
  feedback(exercise.hints[index]); hintsUsed++;
  if (hintsUsed >= exercise.hints.length) {
    const solution = exerciseChess.moves({ verbose: true }).find(move => {
      exerciseChess.move(move); const correct = exerciseSolved(exercise, move, exerciseChess); exerciseChess.undo(); return correct;
    });
    if (solution) hintSquares = [solution.from, solution.to];
    renderBoard();
  }
}

function getSlots() {
  if (!store.owner) return Array.from({ length: SLOT_COUNT }, () => ({ empty: true, revision: null }));
  return Array.from({ length: SLOT_COUNT }, (_, slot) => store.readSlot(slot));
}

function showNewGame(slot = null, incoming = null) {
  if (!ensureSession()) return;
  cancelComputer();
  if (view === 'play') { renderBoard(); renderPlayPanel(); }
  imported = incoming;
  $('newGameError').textContent = '';
  try { newSlotStates = getSlots(); } catch (error) { saveError = error.message; updateStorageStatus(); newSlotStates = []; }
  $('slotField').hidden = !store.owner;
  $('slotSelect').replaceChildren();
  for (let i = 0; i < SLOT_COUNT; i++) {
    const state = newSlotStates[i];
    const option = document.createElement('option'); option.value = String(i);
    option.textContent = `Game ${i + 1} · ${!state ? 'Saving unavailable' : state.empty ? 'Empty slot' : state.corrupt ? 'Unreadable save' : `${state.chess.history().length} moves saved`}`;
    $('slotSelect').append(option);
  }
  const empty = newSlotStates.findIndex(state => state.empty);
  $('slotSelect').value = String(slot ?? (empty >= 0 ? empty : play.slot ?? 0));
  $('modeSelect').value = incoming?.options.mode || play.options.mode;
  $('levelSelect').value = incoming?.options.level || play.options.level;
  $('sideSelect').value = incoming?.options.human || play.options.human;
  $('modeSelect').disabled = Boolean(incoming);
  $('levelSelect').disabled = Boolean(incoming);
  $('sideSelect').disabled = Boolean(incoming);
  $('newGameTitle').textContent = incoming ? 'Choose a slot for this game' : 'Set up your game';
  updateGameSetup(); $('newGameDialog').showModal();
}

function updateGameSetup() {
  $('computerOptions').hidden = $('modeSelect').value !== 'computer';
  const state = newSlotStates[Number($('slotSelect').value)];
  const replace = store.owner && state && !state.empty;
  $('replaceWarning').hidden = !replace;
  $('replaceWarning').textContent = `This will replace the saved game in Game ${Number($('slotSelect').value) + 1}. Choose an empty slot to keep it.`;
  $('startGameBtn').textContent = replace ? `Replace game & ${imported ? 'load' : 'start'}` : imported ? 'Load game' : 'Start game';
  $('startGameBtn').disabled = Boolean(store.owner && !state);
}

function startGame(event) {
  event.preventDefault(); if (!ensureSession()) return;
  const slot = store.owner ? Number($('slotSelect').value) : null;
  const next = { chess: imported?.chess || new Chess(), options: imported?.options || { mode: $('modeSelect').value, level: $('levelSelect').value, human: $('sideSelect').value }, slot, revision: slot === null ? null : newSlotStates[slot]?.revision };
  try {
    if (slot !== null) next.revision = store.writeSlot(slot, makeSnapshot(next.chess, next.options), next.revision);
  } catch (error) { $('newGameError').textContent = `Could not start a saved game: ${error.message}`; return; }
  cancelComputer(); play = next; saveError = ''; imported = null;
  try { if (store.owner) store.writeMeta({ activeSlot: slot }); } catch { /* Game save remains intact. */ }
  $('newGameDialog').close(); $('retryComputerBtn').hidden = true;
  $('playFeedback').textContent = play.options.mode === 'local' ? 'Two players, one board. White moves first. Flip the board whenever you need it.' : 'Take your time. Hints and Undo turn are available while you practice.';
  changeView('play');
}

function loadSlot(slot) {
  if (!ensureSession()) return;
  try {
    const state = store.readSlot(slot);
    if (state.empty || state.corrupt) throw new Error('This slot cannot be loaded. The current game was kept.');
    cancelComputer(); play = { chess: state.chess, options: state.options, slot, revision: state.revision }; saveError = '';
    try { store.writeMeta({ activeSlot: slot }); } catch { /* Loading remains available. */ }
    $('playFeedback').textContent = 'Game restored, including its complete move history.';
    $('retryComputerBtn').hidden = true; changeView('play');
  } catch (error) { saveError = error.message; updateStorageStatus(); }
}

function renderSaves() {
  $('saveCards').replaceChildren();
  let slots;
  try { slots = getSlots(); } catch (error) { saveError = error.message; updateStorageStatus(); slots = []; }
  for (let slot = 0; slot < SLOT_COUNT; slot++) {
    const state = slots[slot];
    const card = document.createElement('article'); card.className = `save-card${play.slot === slot ? ' active' : ''}`;
    const tag = document.createElement('p'); tag.className = 'eyebrow'; tag.textContent = play.slot === slot ? 'Current slot' : 'Saved game';
    const title = document.createElement('h3'); title.textContent = `Game ${slot + 1}`;
    const detail = document.createElement('p'); detail.className = 'muted';
    detail.textContent = !store.owner ? 'Sign in through the Student Portal to use this slot.' : !state ? 'This browser could not read saved games.' : state.empty ? 'An open spot for your next game.' : state.corrupt ? 'This save is unreadable. It has been kept. You can delete it to reuse this slot.' : `${state.options.mode === 'local' ? 'Two players' : `${LEVELS[state.options.level]} computer`} · ${state.chess.history().length} moves played. ${gameStatus(state.chess).text}`;
    card.append(tag, title, detail);
    if (state?.saved) { const date = document.createElement('p'); date.className = 'muted'; date.textContent = `Saved ${new Date(state.saved.savedAt).toLocaleString()}`; card.append(date); }
    const actions = document.createElement('div'); actions.className = 'button-row';
    const open = document.createElement('button'); open.type = 'button'; open.className = 'primary';
    open.textContent = state?.empty ? 'Start a game' : 'Resume game'; open.disabled = !store.owner || !state || Boolean(state.corrupt);
    open.addEventListener('click', () => state.empty ? showNewGame(slot) : loadSlot(slot)); actions.append(open);
    if (state && !state.empty) {
      const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = 'Delete'; remove.setAttribute('aria-label', `Delete Game ${slot + 1}`);
      remove.addEventListener('click', () => {
        $('confirmText').textContent = `Delete the saved game in Game ${slot + 1}? This cannot be undone.`;
        confirmedAction = () => {
          try {
            store.deleteSlot(slot, state.revision);
            if (play.slot === slot) { play.slot = null; play.revision = null; }
            saveError = ''; renderSaves(); updateStorageStatus();
          } catch (error) { saveError = error.message; updateStorageStatus(); }
        };
        $('confirmDialog').showModal();
      }); actions.append(remove);
    }
    card.append(actions); $('saveCards').append(card);
  }
}

function openTransfer(mode) {
  transferMode = mode; $('transferTitle').textContent = mode === 'copy' ? 'Take your game with you' : 'Bring back a game';
  $('transferHelp').textContent = mode === 'copy' ? 'Copy this code and keep it somewhere you can open on your other device. It contains chess moves and game settings, with no student code.' : 'Paste a code copied from Classroom Chess. You will choose a slot before it replaces anything.';
  $('gameCode').value = mode === 'copy' ? JSON.stringify(makeSnapshot(play.chess, play.options)) : '';
  $('gameCode').readOnly = mode === 'copy'; $('transferError').textContent = '';
  $('transferAction').textContent = mode === 'copy' ? 'Copy code' : 'Check & load game';
  $('transferDialog').showModal(); $('gameCode').focus(); if (mode === 'copy') $('gameCode').select();
}

async function transferAction() {
  if (!ensureSession()) return;
  if (transferMode === 'copy') {
    try { await navigator.clipboard.writeText($('gameCode').value); $('transferError').textContent = 'Copied. Paste this code somewhere you can keep it.'; }
    catch { $('gameCode').focus(); $('gameCode').select(); $('transferError').textContent = 'Use Ctrl+C (or Command+C) to copy the selected code.'; }
  } else {
    try { const incoming = parseGameCode($('gameCode').value); $('transferDialog').close(); showNewGame(null, incoming); }
    catch (error) { $('transferError').textContent = error.message; }
  }
}

function applyPreferences() {
  document.body.dataset.theme = preferences.theme;
  $('themeSelect').value = preferences.theme; $('piecesSelect').value = preferences.pieces;
  $('legalToggle').checked = preferences.legal; $('rotateToggle').checked = preferences.rotate;
  renderBoard();
}

function undo() {
  if (!ensureSession()) return;
  const history = play.chess.history({ verbose: true });
  if (play.options.mode === 'computer' && !history.some(move => move.color === play.options.human)) return;
  cancelComputer();
  const last = play.chess.undo();
  if (last && play.options.mode === 'computer' && last.color !== play.options.human) play.chess.undo();
  selected = null; hintSquares = [];
  if (preferences.rotate && play.options.mode === 'local') flipped = play.chess.turn() === 'b';
  $('retryComputerBtn').hidden = true;
  feedback('Move taken back. Try a different idea.'); savePlay(); renderBoard(); renderPlayPanel();
}

// Client session keys scope only local chess saves; they never authorize a server request.
document.addEventListener('click', event => {
  if (event.target.closest('a[href="/student/?tab=activities"]')) return;
  if (!ensureSession()) { event.preventDefault(); event.stopImmediatePropagation(); }
}, true);
document.addEventListener('visibilitychange', () => { if (!document.hidden) ensureSession(); });
window.addEventListener('pageshow', ensureSession);
window.addEventListener('pagehide', cancelComputer);
document.addEventListener('focusin', ensureSession);
document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => changeView(button.dataset.view)));
document.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => $(button.dataset.close).close()));
$('board').addEventListener('click', event => { const square = event.target.closest('[data-square]'); if (square) selectSquare(square.dataset.square); });
$('board').addEventListener('keydown', event => {
  const square = event.target.closest('[data-square]'); if (!square) return;
  if (event.key === 'Escape') { selected = null; hintSquares = []; renderBoard(square.dataset.square); return; }
  const buttons = [...$('board').children]; const index = buttons.indexOf(square);
  let next = index;
  if (event.key === 'ArrowLeft' && index % 8 > 0) next--;
  else if (event.key === 'ArrowRight' && index % 8 < 7) next++;
  else if (event.key === 'ArrowUp' && index >= 8) next -= 8;
  else if (event.key === 'ArrowDown' && index < 56) next += 8;
  else if (event.key === 'Home') next = index - index % 8;
  else if (event.key === 'End') next = index - index % 8 + 7;
  else if (!event.key.startsWith('Arrow')) return;
  event.preventDefault(); buttons.forEach(button => { button.tabIndex = -1; }); buttons[next].tabIndex = 0; buttons[next].focus();
});
$('flipBtn').addEventListener('click', () => { flipped = !flipped; renderBoard(); });
$('newGameBtn').addEventListener('click', () => showNewGame());
$('newGameForm').addEventListener('submit', startGame);
$('newGameDialog').addEventListener('close', () => maybeComputer());
$('modeSelect').addEventListener('change', updateGameSetup); $('slotSelect').addEventListener('change', updateGameSetup);
$('hintBtn').addEventListener('click', () => engineRequest(true)); $('undoBtn').addEventListener('click', undo);
$('retryComputerBtn').addEventListener('click', () => maybeComputer());
$('settingsBtn').addEventListener('click', () => $('settingsDialog').showModal());
for (const id of ['themeSelect', 'piecesSelect', 'legalToggle', 'rotateToggle']) $(id).addEventListener('change', () => {
  if (!ensureSession()) return;
  preferences.theme = $('themeSelect').value; preferences.pieces = $('piecesSelect').value; preferences.legal = $('legalToggle').checked; preferences.rotate = $('rotateToggle').checked;
  if (!exercise && preferences.rotate && play.options.mode === 'local') flipped = play.chess.turn() === 'b';
  try { if (store.owner) store.writeMeta(preferences); } catch { saveError = 'Board preferences could not be saved in this browser.'; updateStorageStatus(); }
  applyPreferences();
});
document.querySelectorAll('[data-promote]').forEach(button => button.addEventListener('click', () => {
  const move = pendingPromotion?.find(candidate => candidate.promotion === button.dataset.promote);
  pendingPromotion = null; $('promotionDialog').close(); if (move) playMove(move);
}));
$('promotionDialog').addEventListener('close', () => { pendingPromotion = null; renderBoard(); });
$('allExercisesBtn').addEventListener('click', () => changeView(view));
$('resetExerciseBtn').addEventListener('click', () => openExercise(exercise));
$('exerciseHintBtn').addEventListener('click', exerciseHint);
$('nextExerciseBtn').addEventListener('click', () => {
  const list = view === 'learn' ? LESSONS : CHALLENGES;
  const index = list.indexOf(exercise);
  if (index + 1 < list.length) openExercise(list[index + 1]); else changeView(view);
});
$('copyGameBtn').addEventListener('click', () => openTransfer('copy')); $('importGameBtn').addEventListener('click', () => openTransfer('import'));
$('transferAction').addEventListener('click', transferAction);
$('confirmAction').addEventListener('click', () => { $('confirmDialog').close(); confirmedAction?.(); confirmedAction = null; });

try {
  if (store.owner) {
    const slots = getSlots();
    const saved = Number.isInteger(meta.activeSlot) && slots[meta.activeSlot]?.saved ? meta.activeSlot : slots.findIndex(slot => slot.saved);
    if (saved >= 0) { const state = slots[saved]; play = { chess: state.chess, options: state.options, slot: saved, revision: state.revision }; }
    else { const empty = slots.findIndex(slot => slot.empty); play.slot = empty >= 0 ? empty : null; }
    if (slots.some(slot => slot.corrupt)) saveError = 'An unreadable save was kept in My games. Other slots are still available.';
  }
} catch (error) { saveError = error.message || 'Browser storage is unavailable.'; }
if (window.self !== window.top) $('backLink').hidden = true;
applyPreferences(); changeView('play');
