(function(){
  'use strict';

  function wireViewerCards(){
    document.querySelectorAll('[data-viewer-src]').forEach(function(card){
      card.addEventListener('click', function(event){
        if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button === 1) return;

        var src = card.getAttribute('data-viewer-src');
        var title = card.getAttribute('data-viewer-title') || '';

        if (src && typeof window.openInlineViewer === 'function') {
          event.preventDefault();
          window.openInlineViewer(src, { title: title });
        }
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wireViewerCards);
  } else {
    wireViewerCards();
  }
})();
