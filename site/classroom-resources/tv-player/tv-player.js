(function () {
  'use strict';

  const params = new URLSearchParams(window.location.search);
  const src = params.get('src') || '';
  const requestedTitle = params.get('title') || 'Classroom Resource';

  const allowed = /^\/classroom-resources\/[a-z0-9-]+\/?(?:[?#].*)?$/i.test(src) &&
    !src.startsWith('/classroom-resources/tv-player');

  const app = document.getElementById('tvApp');
  const sourceFrame = document.getElementById('sourceFrame');
  const slideHost = document.getElementById('slideHost');
  const titleEl = document.getElementById('tvTitle');
  const countEl = document.getElementById('tvCount');
  const prevBtn = document.getElementById('tvPrev');
  const nextBtn = document.getElementById('tvNext');
  const closeBtn = document.getElementById('tvClose');
  const closeDot = document.getElementById('tvCloseDot');
  const presentationDot = document.getElementById('tvPresentationDot');
  const fullscreenDot = document.getElementById('tvFullscreenDot');
  const overlay = document.getElementById('tvOverlay');
  const modalTitle = document.getElementById('tvModalTitle');
  const modalBody = document.getElementById('tvModalBody');
  const modalClose = document.getElementById('tvModalClose');
  const statusEl = document.getElementById('tvStatus');

  let sourceDoc = null;
  let slides = [];
  let index = 0;
  let loadTimer = null;

  function closePlayer() {
    window.location.href = '/classroom-resources/';
  }

  function togglePresentationView() {
    app.classList.toggle('presentation-view');
  }

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else if (document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen();
      }
    } catch (error) {
      console.warn('[Classroom Display] Fullscreen request was not available:', error);
    }
  }

  function setStatus(message, isError) {
    statusEl.textContent = message || '';
    statusEl.classList.toggle('error', Boolean(isError));
    statusEl.hidden = !message;
  }

  function cleanClone(node) {
    const clone = node.cloneNode(true);
    const all = [clone, ...clone.querySelectorAll('*')];
    all.forEach(function (el) {
      el.removeAttribute('style');
      el.removeAttribute('id');
      el.removeAttribute('hidden');
      el.removeAttribute('aria-hidden');
      el.removeAttribute('tabindex');
      if (el.classList) el.classList.remove('active', 'motion-in');
    });
    clone.querySelectorAll('script,style,link,iframe').forEach(function (el) { el.remove(); });
    return clone;
  }

  function renderSlide() {
    if (!slides.length) return;
    const sourceSlide = slides[index];
    const deck = sourceSlide.querySelector('.deck') || sourceSlide;
    const clone = cleanClone(deck);

    slideHost.replaceChildren(clone);
    titleEl.textContent = requestedTitle || sourceDoc.title || 'Classroom Resource';
    countEl.textContent = (index + 1) + ' / ' + slides.length;
    prevBtn.disabled = index === 0;
    nextBtn.disabled = index === slides.length - 1;

    slideHost.querySelectorAll('[data-detail]').forEach(function (trigger) {
      trigger.addEventListener('click', function () { openDetail(trigger.getAttribute('data-detail')); });
    });
    slideHost.querySelectorAll('button:not([data-detail])').forEach(function (button) { button.type = 'button'; });
    slideHost.scrollTop = 0;
  }

  function move(delta) {
    const nextIndex = Math.max(0, Math.min(slides.length - 1, index + delta));
    if (nextIndex === index) return;
    index = nextIndex;
    closeModal();
    renderSlide();
  }

  function openDetail(id) {
    if (!sourceDoc || !id) return;
    const source = sourceDoc.getElementById(id);
    if (!source) return;

    const root = source.tagName === 'TEMPLATE' ? source.content.cloneNode(true) : source.cloneNode(true);
    const titleNode = root.querySelector ? root.querySelector('[data-title]') : null;
    const bodyNode = root.querySelector ? root.querySelector('[data-body]') : null;

    modalTitle.textContent = titleNode ? titleNode.textContent.trim() : 'Example';
    modalBody.innerHTML = bodyNode ? bodyNode.innerHTML : '';
    modalBody.querySelectorAll('*').forEach(function (el) {
      el.removeAttribute('style');
      el.removeAttribute('id');
    });
    overlay.hidden = false;
  }

  function closeModal() {
    overlay.hidden = true;
    modalBody.innerHTML = '';
  }

  function findSlides() {
    try {
      sourceDoc = sourceFrame.contentDocument;
      if (!sourceDoc) return false;
      slides = Array.from(sourceDoc.querySelectorAll('section.slide'));
      if (!slides.length) slides = Array.from(sourceDoc.querySelectorAll('.slide'));
      return slides.length > 0;
    } catch (error) {
      return false;
    }
  }

  function finishLoad() {
    if (!findSlides()) return false;
    window.clearTimeout(loadTimer);
    sourceFrame.setAttribute('aria-hidden', 'true');
    setStatus('');
    app.classList.add('ready');
    renderSlide();
    return true;
  }

  function pollForSlides(attempt) {
    if (finishLoad()) return;
    if (attempt >= 30) {
      setStatus('This presentation could not be prepared for Classroom Display mode.', true);
      return;
    }
    loadTimer = window.setTimeout(function () { pollForSlides(attempt + 1); }, 100);
  }

  if (!allowed) {
    setStatus('Classroom Display mode received an invalid presentation source.', true);
    return;
  }

  titleEl.textContent = requestedTitle;
  sourceFrame.addEventListener('load', function () { pollForSlides(0); }, { once: true });
  sourceFrame.src = src;

  prevBtn.addEventListener('click', function () { move(-1); });
  nextBtn.addEventListener('click', function () { move(1); });
  closeBtn.addEventListener('click', closePlayer);
  closeDot.addEventListener('click', closePlayer);
  presentationDot.addEventListener('click', togglePresentationView);
  fullscreenDot.addEventListener('click', toggleFullscreen);
  modalClose.addEventListener('click', closeModal);
  overlay.addEventListener('click', function (event) { if (event.target === overlay) closeModal(); });

  document.addEventListener('keydown', function (event) {
    if (!overlay.hidden) {
      if (event.key === 'Escape') closeModal();
      return;
    }
    if (event.key === 'ArrowRight' || event.key === 'PageDown' || event.key === ' ') {
      event.preventDefault(); move(1);
    } else if (event.key === 'ArrowLeft' || event.key === 'PageUp') {
      event.preventDefault(); move(-1);
    } else if (event.key === 'Home') {
      event.preventDefault(); index = 0; renderSlide();
    } else if (event.key === 'End') {
      event.preventDefault(); index = slides.length - 1; renderSlide();
    } else if (event.key === 'Escape') {
      closePlayer();
    }
  });

  let touchX = null;
  slideHost.addEventListener('touchstart', function (event) {
    if (event.changedTouches && event.changedTouches.length) touchX = event.changedTouches[0].clientX;
  }, { passive: true });
  slideHost.addEventListener('touchend', function (event) {
    if (touchX === null || !event.changedTouches || !event.changedTouches.length || !overlay.hidden) return;
    const dx = event.changedTouches[0].clientX - touchX;
    touchX = null;
    if (Math.abs(dx) > 90) move(dx < 0 ? 1 : -1);
  }, { passive: true });
})();
