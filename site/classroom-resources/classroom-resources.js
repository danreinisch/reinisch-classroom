(function(){
  'use strict';

  function mediaMatches(query){
    try {
      return Boolean(window.matchMedia && window.matchMedia(query).matches);
    } catch (error) {
      return false;
    }
  }

  function shouldUseClassroomDisplay(){
    var params = new URLSearchParams(window.location.search);
    var override = (params.get('display') || params.get('render') || '').toLowerCase();

    if (override === 'full' || override === 'desktop') return false;
    if (override === 'tv' || override === 'safe' || override === 'display') return true;

    var ua = navigator.userAgent || '';
    var platform = navigator.platform || '';
    var android = /Android/i.test(ua) || /Android/i.test(platform);
    var touchPoints = Number(navigator.maxTouchPoints || 0);
    var coarsePointer = mediaMatches('(pointer: coarse)') || mediaMatches('(any-pointer: coarse)');
    var noHover = mediaMatches('(hover: none)') || mediaMatches('(any-hover: none)');

    // Newline's embedded Chrome identifies as Android. The touch-only fallback
    // also covers classroom displays whose user agent has been customized.
    return android || (touchPoints > 0 && coarsePointer && noHover);
  }

  function buildClassroomDisplayUrl(src, title){
    var params = new URLSearchParams();
    params.set('src', src);
    params.set('title', title || 'Classroom Resource');
    params.set('return', '/classroom-resources/?display=tv');
    params.set('rev', '20260824-3');
    return '/classroom-resources/tv-player/?' + params.toString();
  }

  function isModifiedClick(event){
    return event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button === 1;
  }

  function wireViewerCards(){
    var classroomDisplay = shouldUseClassroomDisplay();
    document.documentElement.setAttribute('data-classroom-display-mode', classroomDisplay ? 'tv' : 'full');

    document.querySelectorAll('[data-viewer-src]').forEach(function(card){
      var src = card.getAttribute('data-viewer-src');
      var title = card.getAttribute('data-viewer-title') || '';
      if (!src) return;

      if (classroomDisplay) {
        var target = buildClassroomDisplayUrl(src, title);

        // Change the actual href as well as handling the click. If JavaScript's
        // event path behaves oddly on embedded Chrome, normal link navigation
        // still lands in the TV-safe player instead of the inline iframe.
        card.setAttribute('href', target);
        card.setAttribute('data-classroom-display-target', 'true');

        card.addEventListener('click', function(event){
          if (isModifiedClick(event)) return;
          event.preventDefault();
          window.location.assign(target);
        });
        return;
      }

      card.addEventListener('click', function(event){
        if (isModifiedClick(event)) return;

        if (typeof window.openInlineViewer === 'function') {
          event.preventDefault();
          window.openInlineViewer(src, { title: title });
        }
      });
    });

    console.info('[Classroom Resources] presentation launch mode:', classroomDisplay ? 'classroom-display' : 'full');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wireViewerCards);
  } else {
    wireViewerCards();
  }
})();
