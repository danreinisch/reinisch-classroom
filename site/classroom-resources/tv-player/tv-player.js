(function () {
  'use strict';

  const params = new URLSearchParams(window.location.search);
  const src = params.get('src') || '';
  const requestedTitle = params.get('title') || 'Classroom Resource';
  const requestedReturn = params.get('return') || '/classroom-resources/display/';

  const allowed = /^\/classroom-resources\/[a-z0-9-]+\/?(?:[?#].*)?$/i.test(src) &&
    !src.startsWith('/classroom-resources/tv-player');

  const app = document.getElementById('tvApp');
  const slideHost = document.getElementById('slideHost');
  const titleEl = document.getElementById('tvTitle');
  const countEl = document.getElementById('tvCount');
  const prevBtn = document.getElementById('tvPrev');
  const nextBtn = document.getElementById('tvNext');
  const closeBtn = document.getElementById('tvClose');
  const closeDot = document.getElementById('tvCloseDot');
  const topDot = document.getElementById('tvPresentationDot');
  const fullscreenDot = document.getElementById('tvFullscreenDot');
  const overlay = document.getElementById('tvOverlay');
  const modalTitle = document.getElementById('tvModalTitle');
  const modalBody = document.getElementById('tvModalBody');
  const modalClose = document.getElementById('tvModalClose');
  const statusEl = document.getElementById('tvStatus');

  let sourceDoc = null;
  let slides = [];
  let index = 0;

  function safeReturnPath() {
    const valid = /^\/classroom-resources\/(?:display\/?)?(?:[?#].*)?$/i.test(requestedReturn);
    return valid ? requestedReturn : '/classroom-resources/display/';
  }

  function closePlayer() {
    window.location.href = safeReturnPath();
  }

  function scrollDocumentToTop() {
    try { window.scrollTo(0, 0); } catch (error) { /* no-op */ }
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    slideHost.scrollTop = 0;
  }

  function jumpToTop() {
    closeModal();
    scrollDocumentToTop();
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

  async function fetchText(url) {
    const response = await fetch(url, { cache: 'no-store', credentials: 'same-origin' });
    if (!response.ok) throw new Error(url + ' returned ' + response.status);
    return response.text();
  }

  function parseDocument(html) {
    return new DOMParser().parseFromString(html, 'text/html');
  }

  async function loadPlaybookDocument() {
    const base = '/classroom-resources/classroom-playbook/';
    const slideParts = ['slides-1.html', 'slides-2.html', 'slides-3.html'];
    const exampleParts = ['examples-1.html', 'examples-2.html', 'examples-3.html'];
    const [slideHtml, exampleHtml] = await Promise.all([
      Promise.all(slideParts.map(function (name) { return fetchText(base + name); })),
      Promise.all(exampleParts.map(function (name) { return fetchText(base + name); }))
    ]);

    const doc = document.implementation.createHTMLDocument('The Classroom Playbook');
    doc.body.innerHTML = '<main id="tvSourceSlides">' + slideHtml.join('\n') + '</main>' +
      '<div id="tvSourceTemplates">' + exampleHtml.join('\n') + '</div>';
    return doc;
  }

  async function loadSourceDocument() {
    if (src.startsWith('/classroom-resources/classroom-playbook/')) {
      return loadPlaybookDocument();
    }
    const html = await fetchText(src);
    return parseDocument(html);
  }

  function cleanClone(node) {
    const clone = node.cloneNode(true);
    const all = [clone].concat(Array.from(clone.querySelectorAll('*')));
    all.forEach(function (el) {
      el.removeAttribute('style');
      el.removeAttribute('id');
      el.removeAttribute('hidden');
      el.removeAttribute('aria-hidden');
      el.removeAttribute('tabindex');
      if (el.classList) el.classList.remove('active', 'motion-in');
    });
    clone.querySelectorAll('script,style,link,iframe,video,audio,canvas').forEach(function (el) { el.remove(); });
    return clone;
  }

  function renderSlide() {
    if (!slides.length) return;
    const sourceSlide = slides[index];
    const deck = sourceSlide.querySelector('.deck') || sourceSlide;
    const clone = cleanClone(deck);

    slideHost.replaceChildren(clone);
    titleEl.textContent = requestedTitle || (sourceDoc && sourceDoc.title) || 'Classroom Resource';
    countEl.textContent = (index + 1) + ' / ' + slides.length;
    prevBtn.disabled = index === 0;
    nextBtn.disabled = index === slides.length - 1;

    slideHost.querySelectorAll('[data-detail]').forEach(function (trigger) {
      trigger.addEventListener('click', function () { openDetail(trigger.getAttribute('data-detail')); });
    });
    slideHost.querySelectorAll('button:not([data-detail])').forEach(function (button) { button.type = 'button'; });

    window.requestAnimationFrame(scrollDocumentToTop);
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
    document.body.classList.add('modal-open');
    overlay.hidden = false;
    overlay.scrollTop = 0;
  }

  function closeModal() {
    overlay.hidden = true;
    modalBody.innerHTML = '';
    document.body.classList.remove('modal-open');
  }

  async function init() {
    if (!allowed) {
      setStatus('Classroom Display mode received an invalid presentation source.', true);
      return;
    }

    titleEl.textContent = requestedTitle;
    setStatus('Preparing presentation…');

    try {
      sourceDoc = await loadSourceDocument();
      slides = Array.from(sourceDoc.querySelectorAll('section.slide'));
      if (!slides.length) slides = Array.from(sourceDoc.querySelectorAll('.slide'));
      if (!slides.length) throw new Error('No slides found in source');

      setStatus('');
      app.classList.add('ready');
      renderSlide();
    } catch (error) {
      console.error('[Classroom Display] Could not prepare presentation:', error);
      setStatus('This presentation could not be prepared for Classroom Display mode. Refresh Classroom Resources and try again.', true);
    }
  }

  prevBtn.addEventListener('click', function () { move(-1); });
  nextBtn.addEventListener('click', function () { move(1); });
  closeBtn.addEventListener('click', closePlayer);
  closeDot.addEventListener('click', closePlayer);
  topDot.addEventListener('click', jumpToTop);
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
  let touchY = null;

  slideHost.addEventListener('touchstart', function (event) {
    if (!event.changedTouches || !event.changedTouches.length) return;
    touchX = event.changedTouches[0].clientX;
    touchY = event.changedTouches[0].clientY;
  }, { passive: true });

  slideHost.addEventListener('touchend', function (event) {
    if (touchX === null || touchY === null || !event.changedTouches || !event.changedTouches.length || !overlay.hidden) return;
    const dx = event.changedTouches[0].clientX - touchX;
    const dy = event.changedTouches[0].clientY - touchY;
    touchX = null;
    touchY = null;

    // Only treat a clearly horizontal gesture as slide navigation. Vertical
    // movement remains native document scrolling on the Newline.
    if (Math.abs(dx) > 90 && Math.abs(dx) > Math.abs(dy) * 1.4) {
      move(dx < 0 ? 1 : -1);
    }
  }, { passive: true });

  init();
})();
