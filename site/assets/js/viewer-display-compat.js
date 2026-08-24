(function () {
  'use strict';

  const params = new URLSearchParams(window.location.search);
  const override = (params.get('render') || '').toLowerCase();
  const requestedSrc = params.get('src') || '';
  const classroomResource = requestedSrc.startsWith('/classroom-resources/');
  const ua = navigator.userAgent || '';
  const coarsePointer = window.matchMedia && (
    window.matchMedia('(pointer: coarse)').matches ||
    window.matchMedia('(any-pointer: coarse)').matches
  );
  const noHover = window.matchMedia && window.matchMedia('(hover: none)').matches;
  const embeddedAndroid = /Android/i.test(ua);

  const safeMode = override === 'safe' ||
    (override !== 'full' && (embeddedAndroid || (coarsePointer && noHover)));

  if (!safeMode) {
    document.documentElement.classList.add('rc-display-full');
    return;
  }

  document.documentElement.classList.add('rc-display-safe');
  if (document.body) document.body.classList.add('rc-display-safe');

  // Keep the viewer chrome reliable on classroom displays, but only inject the
  // low-GPU presentation profile into Classroom Resources presentations.
  if (!classroomResource) {
    console.info('[viewer] Classroom display compatibility enabled for viewer chrome only');
    return;
  }

  const iframe = document.getElementById('contentIframe');
  if (!iframe) return;

  iframe.style.visibility = 'hidden';
  iframe.style.opacity = '0';

  let revealed = false;
  function reveal() {
    if (revealed) return;
    revealed = true;
    iframe.style.visibility = 'visible';
    iframe.style.opacity = '1';
  }

  function applySafePresentationProfile() {
    try {
      const doc = iframe.contentDocument;
      if (!doc || !doc.documentElement || !doc.head) {
        reveal();
        return;
      }

      doc.documentElement.classList.add('rc-display-safe');
      if (doc.body) doc.body.classList.add('rc-display-safe');

      if (doc.querySelector('link[data-rc-display-compat]')) {
        reveal();
        return;
      }

      const link = doc.createElement('link');
      link.rel = 'stylesheet';
      link.href = '/classroom-resources/display-compat.css?v=20260824-2';
      link.setAttribute('data-rc-display-compat', 'safe');
      link.addEventListener('load', function () {
        requestAnimationFrame(function () {
          requestAnimationFrame(reveal);
        });
      }, { once: true });
      link.addEventListener('error', reveal, { once: true });
      doc.head.appendChild(link);

      window.setTimeout(reveal, 1800);
    } catch (error) {
      console.warn('[viewer] Display compatibility profile could not be injected:', error);
      reveal();
    }
  }

  iframe.addEventListener('load', applySafePresentationProfile, true);

  console.info('[viewer] Classroom display compatibility mode enabled', {
    override: override || 'auto',
    android: embeddedAndroid,
    coarsePointer: Boolean(coarsePointer),
    noHover: Boolean(noHover),
    classroomResource: classroomResource
  });
})();
