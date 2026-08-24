(function () {
  'use strict';

  const params = new URLSearchParams(window.location.search);
  const override = (params.get('render') || '').toLowerCase();
  const requestedSrc = params.get('src') || '';
  const requestedTitle = params.get('title') || 'Classroom Resource';
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

  if (classroomResource) {
    const target = '/classroom-resources/tv-player/?src=' +
      encodeURIComponent(requestedSrc) + '&title=' + encodeURIComponent(requestedTitle);
    window.location.replace(target);
    return;
  }

  document.documentElement.classList.add('rc-display-safe');
  if (document.body) document.body.classList.add('rc-display-safe');

  console.info('[viewer] Classroom display compatibility enabled for viewer chrome only', {
    override: override || 'auto',
    android: embeddedAndroid,
    coarsePointer: Boolean(coarsePointer),
    noHover: Boolean(noHover)
  });
})();
