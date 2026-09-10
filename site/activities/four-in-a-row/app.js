import { ROWS, COLS, LEVELS, emptyGame, drop, replay, legalColumns, hintFor, snapshot, parseGameCode, GameStore, playerName } from './core.js?v=20260909-four-hd-2';
import { EXERCISES, exerciseSolved, solutions } from './exercises.js?v=20260908-four-hd-1';

const $ = id => document.getElementById(id);
const PIECE_SETS = new Set(['marble', 'wood', 'metal', 'canyon-stone', 'high-contrast']);
const BOARD_THEMES = new Set(['wood', 'canyon-classic', 'modern-slate', 'tournament-blue', 'high-contrast']);
const VISUAL_PREF_KEY = 'rc_four_hd_visual_v1';
const DROP_MS = 430;
const THINKING_PAUSE_MS = 680;
let storage, session;
try { storage = window.localStorage; } catch {
  const unavailable = () => { throw new Error('Browser storage is unavailable.'); };
  storage = { getItem: unavailable, setItem: unavailable, removeItem: unavailable };
}
try { session = window.sessionStorage; } catch { session = { getItem: () => null }; }
const store = new GameStore(storage, session);
const meta = store.readMeta();

function readVisualPreferences() {
  try {
    const value = JSON.parse(storage.getItem(VISUAL_PREF_KEY) || '{}');
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch { return {}; }
}

const browserVisual = readVisualPreferences();
const prefersReducedMotion = (() => {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
})();
const pickChoice = (key, allowed, fallback) => allowed.has(meta[key]) ? meta[key] : allowed.has(browserVisual[key]) ? browserVisual[key] : fallback;
const pickBoolean = (key, fallback) => typeof meta[key] === 'boolean' ? meta[key] : typeof browserVisual[key] === 'boolean' ? browserVisual[key] : fallback;
const preferences = {
  theme: pickChoice('theme', BOARD_THEMES, 'canyon-classic'),
  pieces: pickChoice('pieces', PIECE_SETS, 'marble'),
  coach: meta.coach !== false,
  animateDrops: pickBoolean('animateDrops', true),
  thinkingPause: pickBoolean('thinkingPause', true),
  reducedMotion: pickBoolean('reducedMotion', prefersReducedMotion),
  focusBoard: pickBoolean('focusBoard', false),
};
const completed = new Set(Array.isArray(meta.completed) ? meta.completed.filter(x => typeof x === 'string') : []);
let play = { game: emptyGame(), options: { mode: 'computer', level: 'casual', human: 1 } };
let revision = null, canSave = Boolean(store.owner), warning = '', locked = false;
let view = 'play', exercise = null, practice = null, solved = false, hintsUsed = 0;
let focusColumn = 3, hintColumn = null;
let worker = null, workerTimer = null, computerMoveTimer = null, jobId = 0, thinking = false, computerPaused = false;
let thinkingStartedAt = 0, thinkingColumn = null;
let settling = false, animateIndex = -1, dropTimer = null;
let setupRevision = null, setupCanSave = false, incoming = null, transferMode = 'copy';
const columnButtons = [];

// Older Safari has no native modal dialog. Keep the same controls, focus
// containment, Escape behavior, and close events without changing other pages.
function prepareDialogs() {
  const dialogs = [...document.querySelectorAll('dialog')];
  if (dialogs.every(dialog => typeof dialog.showModal === 'function' && typeof dialog.close === 'function')) return;
  const backdrop = document.createElement('div');
  backdrop.className = 'dialog-backdrop'; backdrop.hidden = true; document.body.append(backdrop);
  const app = document.querySelector('.game-app');
  let active = null, previousFocus = null;
  const controls = () => [...active.querySelectorAll('button, input, select, textarea, a[href], [tabindex]')]
    .filter(element => !element.disabled && element.tabIndex >= 0 && element.getClientRects().length);
  const focusFirst = () => (controls()[0] || active).focus();
  dialogs.forEach(dialog => {
    dialog.classList.add('dialog-fallback'); dialog.setAttribute('role', 'dialog'); dialog.tabIndex = -1;
    dialog.showModal = () => {
      if (active) active.close();
      previousFocus = document.activeElement; active = dialog;
      dialog.setAttribute('open', ''); dialog.setAttribute('aria-modal', 'true');
      backdrop.hidden = false; document.body.classList.add('dialog-fallback-open');
      focusFirst(); app.setAttribute('aria-hidden', 'true');
    };
    dialog.close = () => {
      if (!dialog.hasAttribute('open')) return;
      dialog.removeAttribute('open'); dialog.removeAttribute('aria-modal');
      active = null; backdrop.hidden = true; document.body.classList.remove('dialog-fallback-open');
      app.removeAttribute('aria-hidden');
      if (previousFocus?.isConnected) previousFocus.focus();
      dialog.dispatchEvent(new Event('close'));
    };
  });
  document.addEventListener('focusin', event => { if (active && !active.contains(event.target)) focusFirst(); });
  document.addEventListener('keydown', event => {
    if (!active) return;
    if (event.key === 'Escape') {
      event.preventDefault(); event.stopPropagation();
      if (active.dispatchEvent(new Event('cancel', { cancelable: true }))) active.close();
    } else if (event.key === 'Tab') {
      const elements = controls(), index = elements.indexOf(document.activeElement);
      event.preventDefault();
      (elements[(index + (event.shiftKey ? -1 : 1) + elements.length) % elements.length] || active).focus();
    }
  }, true);
}

function ensureSession() {
  if (locked) return false;
  if (store.isCurrent()) return true;
  locked = true; cancelComputer(); cancelDropAnimation();
  document.querySelectorAll('dialog[open]').forEach(dialog => dialog.close());
  $('mainContent').hidden = true; $('sessionNotice').hidden = false;
  $('storageStatus').textContent = 'Return to Activities to continue with the current student login.';
  return false;
}

function activeGame() { return exercise ? practice : play.game; }
function canPlay() {
  const game = activeGame();
  return !locked && !game.winner && !game.draw && !thinking && !settling && (!exercise || !solved) &&
    (Boolean(exercise) || play.options.mode === 'local' || game.turn === play.options.human);
}
function feedback(text) { $(exercise ? 'exerciseFeedback' : 'playFeedback').textContent = text; }

function updateStorageStatus() {
  if (locked) return;
  $('storageStatus').classList.toggle('failed', Boolean(warning));
  $('storageStatus').textContent = warning ? `Saving needs attention: ${warning} Your current game is still on screen.` :
    !store.owner ? 'Practice game · Open through the Student Portal to save with your student login.' :
    revision ? 'Game saved automatically · This browser on this device.' : 'Your game will save automatically · This browser on this device.';
}

function savePlay() {
  if (!ensureSession() || !store.owner || !canSave) return;
  try { revision = store.save(snapshot(play.game, play.options), revision); warning = ''; }
  catch (error) { warning = error.message; canSave = false; }
  updateStorageStatus();
}

function persistMeta(change) {
  if (!ensureSession() || !store.owner) return;
  try { store.writeMeta(change); } catch (error) { warning = error.message; updateStorageStatus(); }
}

function persistVisual(change) {
  if (!ensureSession()) return;
  try {
    storage.setItem(VISUAL_PREF_KEY, JSON.stringify({ ...readVisualPreferences(), ...change }));
  } catch (error) {
    if (!store.owner) { warning = error.message; updateStorageStatus(); }
  }
  if (store.owner) {
    try { store.writeMeta(change); } catch (error) { warning = error.message; updateStorageStatus(); }
  }
}

function applyPreferences() {
  document.body.dataset.theme = preferences.theme;
  document.body.dataset.boardTheme = preferences.theme;
  document.body.dataset.pieces = preferences.pieces;
  document.body.dataset.pieceSet = preferences.pieces;
  document.body.dataset.animateDrops = String(preferences.animateDrops);
  document.body.dataset.reducedMotion = String(preferences.reducedMotion);
  document.body.dataset.focusBoard = String(preferences.focusBoard);
  $('themeSelect').value = preferences.theme;
  $('piecesSelect').value = preferences.pieces;
  $('coachToggle').checked = preferences.coach;
  $('animateDropsToggle').checked = preferences.animateDrops;
  $('thinkingPauseToggle').checked = preferences.thinkingPause;
  $('reducedMotionToggle').checked = preferences.reducedMotion;
  $('focusBoardToggle').checked = preferences.focusBoard;
  $('focusBoardBtn').textContent = preferences.focusBoard ? 'Standard view' : 'Focus board';
  $('focusBoardBtn').setAttribute('aria-pressed', String(preferences.focusBoard));
  document.querySelectorAll('[data-piece-choice]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.pieceChoice === preferences.pieces)));
  document.querySelectorAll('[data-theme-choice]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.themeChoice === preferences.theme)));
  if (preferences.reducedMotion || !preferences.animateDrops) cancelDropAnimation();
  renderBoard(); renderPlayPanel();
}

function positionText(game) {
  if (exercise && solved) return 'Position complete. Nice move!';
  if (game.winner) {
    if (!exercise && play.options.mode === 'computer') return game.winner === play.options.human ? 'You connected four. You win!' : 'The computer connected four. Try another game!';
    return `${playerName(game.winner)} connected four!`;
  }
  if (game.draw) return 'A draw. The board is full with no four in a row.';
  if (settling) return 'Piece in motion…';
  if (thinking) return 'The computer is thinking…';
  if (!exercise && play.options.mode === 'computer') return game.turn === play.options.human ? `Your turn · ${playerName(game.turn)}` : computerPaused ? 'The computer paused. Choose Retry computer move.' : 'Computer’s turn.';
  return `${playerName(game.turn)}’s turn.`;
}

function renderStatusCard() {
  const card = $('turnCard');
  if (!card) return;
  const game = play.game;
  let player = game.turn;
  let title = `${playerName(player)}’s Turn`;
  let detail = 'Choose a column';
  if (game.winner) {
    player = game.winner;
    title = play.options.mode === 'computer' ? (game.winner === play.options.human ? 'You Win' : 'Computer Wins') : `${playerName(game.winner)} Wins`;
    detail = 'Four connected';
  } else if (game.draw) {
    title = 'Draw'; detail = 'The board is full';
  } else if (thinking) {
    player = game.turn; title = 'Computer is thinking…'; detail = 'Finding a great move';
  } else if (settling) {
    player = 3 - game.turn; title = 'Piece in motion'; detail = 'Settling into place';
  } else if (computerPaused) {
    player = game.turn; title = 'Computer paused'; detail = 'Retry the computer move';
  } else if (play.options.mode === 'computer') {
    if (game.turn === play.options.human) { title = 'Your Turn'; detail = 'Make your move'; }
    else { title = 'Computer Turn'; detail = 'Ready to think'; }
  }
  const disc = $('statusDisc');
  disc.className = `key-disc status-disc p${player}`;
  disc.textContent = '';
  $('turnHeadline').textContent = title;
  $('turnDetail').textContent = detail;
  card.classList.toggle('is-thinking', thinking);
  $('thinkingDots').hidden = !thinking;
}

function buildBoard() {
  for (let column = 0; column < COLS; column++) {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'column'; button.dataset.column = String(column);
    const number = document.createElement('span'); number.className = 'column-number'; number.textContent = String(column + 1); number.setAttribute('aria-hidden', 'true'); button.append(number);
    for (let row = 0; row < ROWS; row++) {
      const cell = document.createElement('span'); cell.className = 'cell'; cell.dataset.cell = String(row * COLS + column); cell.dataset.row = String(row); cell.setAttribute('aria-hidden', 'true');
      const piece = document.createElement('span'); piece.className = 'piece-surface'; cell.append(piece); button.append(cell);
    }
    button.addEventListener('click', () => { focusColumn = column; playColumn(column); });
    button.addEventListener('keydown', event => {
      let next = null;
      if (event.key === 'ArrowLeft') next = (column + COLS - 1) % COLS;
      if (event.key === 'ArrowRight') next = (column + 1) % COLS;
      if (event.key === 'Home') next = 0;
      if (event.key === 'End') next = COLS - 1;
      if (/^[1-7]$/.test(event.key)) { event.preventDefault(); focusColumn = Number(event.key) - 1; columnButtons[focusColumn].focus(); playColumn(focusColumn); return; }
      if (next !== null) { event.preventDefault(); focusColumn = next; renderBoard(); columnButtons[next].focus(); }
    });
    columnButtons.push(button); $('board').append(button);
  }
}

function renderBoard() {
  const game = activeGame(), available = legalColumns(game);
  $('board').dataset.settling = String(settling);
  columnButtons.forEach((button, column) => {
    const occupied = [];
    for (let row = ROWS - 1; row >= 0; row--) if (game.board[row * COLS + column]) occupied.push(playerName(game.board[row * COLS + column]));
    button.tabIndex = focusColumn === column ? 0 : -1;
    button.setAttribute('aria-disabled', String(!canPlay() || !available.includes(column)));
    button.setAttribute('aria-label', `Column ${column + 1}. ${occupied.length === ROWS ? 'Full.' : `${ROWS - occupied.length} empty spaces.`} ${occupied.length ? `Bottom to top: ${occupied.join(', ')}.` : 'Empty column.'}${hintColumn === column ? ' Hint column.' : ''}`);
    button.classList.toggle('hint', hintColumn === column);
    button.classList.toggle('thinking-target', thinking && thinkingColumn === column);
    for (const cell of button.querySelectorAll('.cell')) {
      const index = Number(cell.dataset.cell), player = game.board[index];
      cell.className = `cell${player ? ` p${player}` : ''}${game.line.includes(index) ? ' winner' : ''}${game.last === index ? ' last' : ''}${animateIndex === index ? ' dropping' : ''}`;
      cell.firstChild.textContent = '';
    }
  });
  $('positionStatus').textContent = positionText(game);
}

function canUndo() {
  return play.options.mode === 'local' ? play.game.moves.length > 0 : play.game.moves.some((_, index) => index % 2 + 1 === play.options.human);
}

function renderPlayPanel() {
  const { game, options } = play;
  $('modeLabel').textContent = options.mode === 'local' ? 'Two players · same device' : 'You vs Computer';
  $('gameTitle').textContent = game.winner || game.draw ? 'Another round?' : 'Find your four.';
  $('gameDetails').textContent = options.mode === 'local' ? 'Player 1 starts. Take turns choosing a column.' : `${LEVELS[options.level]} level · You are ${playerName(options.human)}.`;
  $('undoBtn').textContent = options.mode === 'local' ? 'Undo move' : 'Undo turn';
  $('undoBtn').disabled = !canUndo();
  $('hintBtn').disabled = !canPlay();
  $('retryBtn').hidden = !computerPaused;
  $('moveCount').textContent = game.moves.length ? `${game.moves.length} of 42 spaces` : 'New game';
  const fragment = document.createDocumentFragment();
  game.moves.forEach((column, index) => {
    const player = index % 2 + 1;
    const item = document.createElement('li');
    const moveNumber = document.createElement('span'); moveNumber.className = 'move-number'; moveNumber.textContent = String(index + 1);
    const who = document.createElement('span'); who.className = 'move-player';
    who.textContent = options.mode === 'computer' ? (player === options.human ? 'You' : 'Computer') : playerName(player);
    const where = document.createElement('span'); where.className = 'move-column'; where.textContent = `Column ${column + 1}`;
    const disc = document.createElement('i'); disc.className = `move-disc p${player}`; disc.setAttribute('aria-hidden', 'true');
    item.append(moveNumber, who, where, disc);
    item.setAttribute('aria-label', `Move ${index + 1}: ${playerName(player)}, column ${column + 1}`); fragment.append(item);
  });
  $('moveList').replaceChildren(fragment); $('moveList').scrollTop = $('moveList').scrollHeight;
  renderStatusCard();
}

function cancelDropAnimation() {
  clearTimeout(dropTimer); dropTimer = null; animateIndex = -1; settling = false;
}

function startDropAnimation(index, onSettled = null) {
  cancelDropAnimation();
  if (!preferences.animateDrops || preferences.reducedMotion || index < 0) {
    if (onSettled) onSettled();
    return;
  }
  animateIndex = index; settling = true;
  dropTimer = setTimeout(() => {
    dropTimer = null; animateIndex = -1; settling = false;
    renderBoard(); if (!exercise) renderPlayPanel();
    if (onSettled) onSettled();
  }, DROP_MS);
}

function stopWorkerOnly() {
  worker?.terminate(); worker = null;
  clearTimeout(workerTimer); workerTimer = null;
}

function cancelComputer() {
  jobId++; stopWorkerOnly();
  clearTimeout(computerMoveTimer); computerMoveTimer = null;
  thinking = false; thinkingColumn = null; thinkingStartedAt = 0;
}

function maybeComputer() {
  if (!ensureSession() || thinking || settling || document.hidden || document.querySelector('dialog[open]') || view !== 'play' || exercise || play.game.winner || play.game.draw || play.options.mode !== 'computer' || play.game.turn === play.options.human) return;
  cancelComputer();
  const id = jobId, history = play.game.moves.join(',');
  const fail = () => {
    if (id !== jobId) return;
    cancelComputer(); computerPaused = true;
    feedback('The computer paused. Choose Retry computer move, or Undo turn to keep exploring.');
    renderBoard(); renderPlayPanel();
  };
  try {
    worker = new Worker(new URL('./worker.js?v=20260909-four-hd-2', import.meta.url));
    thinking = true; thinkingStartedAt = Date.now(); computerPaused = false; thinkingColumn = null;
    worker.onerror = fail;
    worker.onmessage = event => {
      if (id !== jobId || !ensureSession() || view !== 'play' || exercise || history !== play.game.moves.join(',')) return;
      const data = event.data;
      if (!data || data.id !== id || data.error || !legalColumns(play.game).includes(data.column)) { fail(); return; }
      stopWorkerOnly(); thinkingColumn = data.column;
      renderBoard(); renderPlayPanel();
      const minimum = preferences.thinkingPause ? (preferences.reducedMotion ? 260 : THINKING_PAUSE_MS) : 0;
      const wait = Math.max(0, minimum - (Date.now() - thinkingStartedAt));
      computerMoveTimer = setTimeout(() => {
        computerMoveTimer = null;
        if (id !== jobId || !ensureSession() || view !== 'play' || exercise || history !== play.game.moves.join(',')) return;
        play.game = drop(play.game, data.column); hintColumn = null; thinking = false; thinkingColumn = null;
        feedback(`Computer played column ${data.column + 1}. ${play.game.winner || play.game.draw ? positionText(play.game) : 'Look for your four and check the other player’s next move.'}`);
        startDropAnimation(play.game.last);
        savePlay(); renderBoard(); renderPlayPanel();
      }, wait);
    };
    workerTimer = setTimeout(fail, 4500);
    worker.postMessage({ id, moves: play.game.moves, level: play.options.level });
    renderBoard(); renderPlayPanel();
  } catch { fail(); }
}

function playColumn(column) {
  if (!ensureSession() || !canPlay()) return;
  const game = activeGame();
  if (!legalColumns(game).includes(column)) { feedback('That column is full. Choose a column with an empty space.'); return; }
  hintColumn = null;
  if (exercise) {
    if (!exerciseSolved(exercise, practice, column)) {
      feedback(exercise.kind === 'win' ? 'That move does not connect four yet. Try another column.' : exercise.kind === 'block' ? 'The other player would still have a winning move. Look for a different block.' : exercise.kind === 'drop' ? 'Try the middle column: column 4.' : 'That move does not create two safe winning threats. Try another idea, or ask for a hint.');
      renderBoard(); return;
    }
    practice = drop(practice, column); solved = true; completed.add(exercise.id);
    try { if (store.owner) store.complete(exercise.id); } catch (error) { warning = `Your result is on screen, but progress could not save: ${error.message}`; updateStorageStatus(); }
    $('exerciseSuccess').hidden = false; $('exerciseHintBtn').disabled = true; $('exerciseExplanation').textContent = exercise.explanation;
    feedback('You found a correct move. Take a look at why it works.'); startDropAnimation(practice.last); renderBoard(); return;
  }
  const player = play.game.turn;
  play.game = drop(play.game, column); computerPaused = false;
  $('coachLabel').textContent = 'A moment to think';
  feedback(play.game.winner || play.game.draw ? positionText(play.game) : `${playerName(player)} played column ${column + 1}.`);
  startDropAnimation(play.game.last, () => { if (play.options.mode === 'computer') maybeComputer(); });
  savePlay(); renderBoard(); renderPlayPanel();
  if (!settling && play.options.mode === 'computer') maybeComputer();
}

function undo() {
  if (!ensureSession() || exercise || !canUndo()) return;
  cancelComputer(); cancelDropAnimation(); computerPaused = false; hintColumn = null;
  const moves = play.game.moves.slice();
  do { moves.pop(); } while (play.options.mode === 'computer' && moves.length && moves.length % 2 + 1 !== play.options.human);
  play.game = replay(moves); feedback('Move taken back. Try a different idea.'); savePlay(); renderBoard(); renderPlayPanel();
  $('coachLabel').textContent = 'A moment to think';
}

function showHint() {
  if (!ensureSession() || !canPlay()) return;
  const hint = hintFor(play.game);
  if (!hint) return;
  hintColumn = hint.column; $('coachLabel').textContent = preferences.coach ? 'Why this helps' : 'A move to explore';
  feedback(preferences.coach || hint.kind === 'danger' ? hint.text : `Try the highlighted column: ${hint.column + 1}. Turn on Coach mode for an explanation.`);
  renderBoard();
}

function changeView(next) {
  if (!ensureSession()) return;
  cancelComputer(); cancelDropAnimation(); view = next; exercise = null; practice = null; solved = false; hintColumn = null;
  document.querySelectorAll('[data-view]').forEach(button => {
    if (button.dataset.view === next) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current');
  });
  $('workspace').hidden = next !== 'play'; $('catalog').hidden = next === 'play';
  $('playPanel').hidden = false; $('exercisePanel').hidden = true;
  if (next === 'play') { $('boardCaption').textContent = 'One good move can change the game.'; renderBoard(); renderPlayPanel(); maybeComputer(); }
  else renderCatalog();
  updateStorageStatus();
}

function renderCatalog() {
  const list = EXERCISES.filter(item => item.section === view), learning = view === 'learn';
  $('catalogEyebrow').textContent = learning ? 'Learn by taking a turn' : 'A small board. A good idea.';
  $('catalogTitle').textContent = learning ? 'Four simple lessons.' : 'Find your next move.';
  $('catalogDescription').textContent = learning ? 'Try a drop, build a line, and learn to block. Your current game is kept.' : 'Win this turn, stop a threat, or think one move ahead. Hints are always available.';
  $('catalogProgress').textContent = `${list.filter(item => completed.has(item.id)).length} of ${list.length} complete`;
  $('exerciseCards').replaceChildren();
  list.forEach(item => {
    const button = document.createElement('button'); button.type = 'button'; button.dataset.exercise = item.id; button.className = `exercise-card${completed.has(item.id) ? ' complete' : ''}`;
    const tag = document.createElement('span'); tag.className = 'eyebrow'; tag.textContent = item.tag;
    const title = document.createElement('strong'); title.textContent = item.title;
    const status = document.createElement('span'); status.className = 'card-bottom'; status.textContent = completed.has(item.id) ? '✓ Complete · Practice again' : 'Try this position →';
    button.append(tag, title, status); button.addEventListener('click', () => openExercise(item)); $('exerciseCards').append(button);
  });
}

function openExercise(item) {
  if (!ensureSession()) return;
  cancelComputer(); cancelDropAnimation(); exercise = item; practice = replay(item.moves); solved = false; hintsUsed = 0; hintColumn = null;
  $('catalog').hidden = true; $('workspace').hidden = false; $('playPanel').hidden = true; $('exercisePanel').hidden = false;
  $('exerciseTitle').textContent = item.title; $('exerciseTag').textContent = item.tag; $('exercisePrompt').textContent = item.prompt;
  $('allExercisesBtn').textContent = view === 'learn' ? '← All lessons' : '← All challenges';
  $('nextExerciseBtn').textContent = view === 'learn' ? 'Next lesson →' : 'Next challenge →';
  $('exerciseSuccess').hidden = true; $('exerciseHintBtn').disabled = false; $('boardCaption').textContent = 'Practice position · Your saved game is kept';
  feedback(`Your turn as ${playerName(practice.turn)}. Take your time.`); renderBoard();
}

function exerciseHint() {
  if (!ensureSession() || !exercise || solved) return;
  feedback(exercise.hints[Math.min(hintsUsed, exercise.hints.length - 1)]); hintsUsed++;
  if (hintsUsed >= exercise.hints.length) hintColumn = solutions(exercise)[0];
  renderBoard();
}

function showSetup(imported = null) {
  if (!ensureSession()) return;
  cancelComputer(); cancelDropAnimation(); incoming = imported; setupRevision = null; setupCanSave = false;
  let saved = null;
  if (store.owner) {
    try { saved = store.readGame(); setupRevision = saved.revision; setupCanSave = true; }
    catch (error) { warning = error.message; updateStorageStatus(); }
  }
  $('newGameError').textContent = '';
  $('modeSelect').value = imported?.options.mode || play.options.mode;
  $('levelSelect').value = imported?.options.level || play.options.level;
  $('humanSelect').value = String(imported?.options.human || play.options.human);
  for (const id of ['modeSelect', 'levelSelect', 'humanSelect']) $(id).disabled = Boolean(imported);
  $('computerOptions').hidden = $('modeSelect').value !== 'computer';
  const replacesSave = Boolean(saved && saved.kind !== 'empty');
  $('replaceWarning').hidden = !replacesSave && !play.game.moves.length;
  $('replaceWarning').textContent = saved?.kind === 'corrupt' ? 'The saved game cannot be read and has been kept. Starting will replace that unreadable save.' : replacesSave ? 'Starting will replace your saved game. Copy its game code first if you want to keep it.' : 'Starting will replace the game on screen. Copy its game code first if you want to keep it.';
  $('newGameTitle').textContent = imported ? 'Bring back this game' : 'Set up your game';
  $('startGameBtn').textContent = replacesSave ? `Replace saved game & ${imported ? 'load' : 'start'}` : imported ? 'Load game' : 'Start game';
  renderBoard(); renderPlayPanel(); $('newGameDialog').showModal();
}

function startGame(event) {
  event.preventDefault(); if (!ensureSession()) return;
  const next = incoming || { game: emptyGame(), options: { mode: $('modeSelect').value, level: $('levelSelect').value, human: Number($('humanSelect').value) } };
  let nextRevision = null;
  try { if (setupCanSave) nextRevision = store.save(snapshot(next.game, next.options), setupRevision); }
  catch (error) { $('newGameError').textContent = `Could not save: ${error.message} Your current game was kept.`; return; }
  cancelComputer(); cancelDropAnimation(); play = next; revision = nextRevision; canSave = setupCanSave; incoming = null; hintColumn = null; computerPaused = false;
  warning = store.owner && !setupCanSave ? 'This browser cannot save. You can still play and copy a game code.' : '';
  $('newGameDialog').close(); $('playFeedback').textContent = 'Look for your own four, then check the other player’s next move.'; $('coachLabel').textContent = 'A moment to think'; changeView('play');
}

function openTransfer(mode) {
  if (!ensureSession()) return;
  cancelComputer(); cancelDropAnimation(); transferMode = mode;
  $('transferTitle').textContent = mode === 'copy' ? 'Take your game with you' : 'Bring back a game';
  $('transferHelp').textContent = mode === 'copy' ? 'Copy this code somewhere you can find it later. It contains moves and game settings, with no student code.' : 'Paste a Four in a Row game code. You will confirm before it replaces your current saved game.';
  $('gameCode').value = mode === 'copy' ? JSON.stringify(snapshot(play.game, play.options)) : '';
  $('gameCode').readOnly = mode === 'copy'; $('transferError').textContent = '';
  $('transferAction').textContent = mode === 'copy' ? 'Copy code' : 'Check game code';
  renderBoard(); renderPlayPanel(); $('transferDialog').showModal();
}

function setVisualPreference(key, value) {
  if (!ensureSession()) return;
  preferences[key] = value;
  applyPreferences();
  persistVisual({ [key]: value });
}

prepareDialogs();
document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => changeView(button.dataset.view)));
document.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => $(button.dataset.close).close()));
document.querySelectorAll('dialog').forEach(dialog => dialog.addEventListener('close', () => { if (ensureSession()) { renderBoard(); renderPlayPanel(); maybeComputer(); } }));
$('newGameBtn').addEventListener('click', () => showSetup());
$('newGameForm').addEventListener('submit', startGame);
$('modeSelect').addEventListener('change', () => { $('computerOptions').hidden = $('modeSelect').value !== 'computer'; });
$('undoBtn').addEventListener('click', undo); $('hintBtn').addEventListener('click', showHint);
$('retryBtn').addEventListener('click', maybeComputer);
$('settingsBtn').addEventListener('click', () => { if (ensureSession()) { cancelComputer(); renderBoard(); renderPlayPanel(); $('settingsDialog').showModal(); } });
$('settingsShortcutBtn').addEventListener('click', () => $('settingsBtn').click());
$('themeSelect').addEventListener('change', () => setVisualPreference('theme', $('themeSelect').value));
$('piecesSelect').addEventListener('change', () => setVisualPreference('pieces', $('piecesSelect').value));
document.querySelectorAll('[data-theme-choice]').forEach(button => button.addEventListener('click', () => setVisualPreference('theme', button.dataset.themeChoice)));
document.querySelectorAll('[data-piece-choice]').forEach(button => button.addEventListener('click', () => setVisualPreference('pieces', button.dataset.pieceChoice)));
$('animateDropsToggle').addEventListener('change', () => setVisualPreference('animateDrops', $('animateDropsToggle').checked));
$('thinkingPauseToggle').addEventListener('change', () => setVisualPreference('thinkingPause', $('thinkingPauseToggle').checked));
$('reducedMotionToggle').addEventListener('change', () => setVisualPreference('reducedMotion', $('reducedMotionToggle').checked));
$('focusBoardToggle').addEventListener('change', () => setVisualPreference('focusBoard', $('focusBoardToggle').checked));
$('focusBoardBtn').addEventListener('click', () => setVisualPreference('focusBoard', !preferences.focusBoard));
$('coachToggle').addEventListener('change', () => { if (!ensureSession()) return; preferences.coach = $('coachToggle').checked; persistMeta({ coach: preferences.coach }); if (hintColumn !== null) showHint(); });
$('allExercisesBtn').addEventListener('click', () => changeView(view));
$('exerciseHintBtn').addEventListener('click', exerciseHint);
$('resetExerciseBtn').addEventListener('click', () => { if (exercise) openExercise(exercise); });
$('nextExerciseBtn').addEventListener('click', () => {
  const list = EXERCISES.filter(item => item.section === view), index = list.indexOf(exercise);
  if (index >= 0 && index + 1 < list.length) openExercise(list[index + 1]); else changeView(view);
});
$('copyBtn').addEventListener('click', () => openTransfer('copy'));
$('pasteBtn').addEventListener('click', () => openTransfer('paste'));
$('transferAction').addEventListener('click', async () => {
  if (!ensureSession()) return;
  if (transferMode === 'copy') {
    $('gameCode').focus(); $('gameCode').select();
    try { await navigator.clipboard.writeText($('gameCode').value); $('transferError').textContent = 'Game code copied.'; }
    catch { $('transferError').textContent = 'The code is selected. Use Copy from your browser or press Ctrl+C / Command+C.'; }
  } else {
    try { const parsed = parseGameCode($('gameCode').value); $('transferDialog').close(); showSetup(parsed); }
    catch (error) { $('transferError').textContent = error.message; }
  }
});
window.addEventListener('pagehide', () => { cancelComputer(); cancelDropAnimation(); });
window.addEventListener('pageshow', () => { if (ensureSession()) maybeComputer(); });
window.addEventListener('focus', () => { if (ensureSession()) maybeComputer(); });
window.addEventListener('storage', ensureSession);
document.addEventListener('visibilitychange', () => { if (document.hidden) { cancelComputer(); cancelDropAnimation(); renderBoard(); renderPlayPanel(); } else if (ensureSession()) maybeComputer(); });

if (store.owner) {
  try {
    const saved = store.readGame(); revision = saved.revision;
    if (saved.kind === 'saved') play = { game: saved.game, options: saved.options };
    if (saved.kind === 'corrupt') { canSave = false; warning = 'An unreadable saved game was kept. Choose New game to explicitly replace it.'; }
  } catch (error) { canSave = false; warning = error.message; }
}
if (window.self !== window.top) $('backLink').hidden = true;
buildBoard(); applyPreferences(); changeView('play');