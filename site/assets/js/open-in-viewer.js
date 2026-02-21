/**
 * Open in Viewer - Shared Helper Module
 * Provides canonical viewer URL building and navigation helpers
 * Ensures consistent viewer launches across all sections
 */

(function (global) {
  'use strict';

  /**
   * Build canonical viewer URL
   * @param {string} srcPath - Relative same-origin path (must start with '/')
   * @param {object} opts - Optional parameters
   * @param {string} opts.return - Return URL (defaults to current page path+query)
   * @param {string} opts.title - Optional title parameter
   * @returns {string} Canonical viewer URL or empty string if invalid
   */
  function buildViewerUrl(srcPath, opts) {
    opts = opts || {};

    // Validate srcPath is a relative same-origin path
    if (!srcPath || typeof srcPath !== 'string') {
      console.error('[open-in-viewer] srcPath must be a non-empty string');
      return '';
    }

    if (!srcPath.startsWith('/')) {
      console.error('[open-in-viewer] srcPath must be a relative path starting with "/"');
      return '';
    }

    // Build query parameters
    const params = new URLSearchParams();
    
    // Add src (encoded)
    params.set('src', srcPath);
    
    // Add return parameter
    const returnUrl = opts.return || (window.location.pathname + window.location.search);
    params.set('return', returnUrl);
    
    // Add optional title
    if (opts.title && typeof opts.title === 'string' && opts.title.trim()) {
      params.set('title', opts.title);
    }

    // Build final URL
    const viewerUrl = '/viewer/?' + params.toString();
    
    return viewerUrl;
  }

  /**
   * Open content in viewer
   * @param {string} srcPath - Relative same-origin path (must start with '/')
   * @param {object} opts - Optional parameters (same as buildViewerUrl)
   */
  function openInViewer(srcPath, opts) {
    const viewerUrl = buildViewerUrl(srcPath, opts);
    
    if (!viewerUrl) {
      console.error('[open-in-viewer] Failed to build viewer URL');
      return;
    }

    console.log('[open-in-viewer] Navigating to:', viewerUrl);
    window.location.href = viewerUrl;
  }

  // ─── Inline overlay ────────────────────────────────────────────────────────

  var _viewerEl = null;
  var _presMode = false;

  var _STYLES = [
    '.rc-inline-viewer{position:fixed;inset:0;z-index:9999;display:none;flex-direction:column;background:var(--rc-base,#070a08);}',
    '.rc-inline-viewer.open{display:flex;}',
    '.rc-inline-viewer .pv-bar{display:flex;align-items:center;gap:10px;padding:8px 14px;',
    'background:linear-gradient(180deg,rgba(255,255,255,0.06),transparent 55%),var(--rc-glass,rgba(17,26,21,0.58));',
    'border-bottom:1px solid var(--rc-border-strong,rgba(255,255,255,0.14));',
    'backdrop-filter:blur(14px) saturate(125%);-webkit-backdrop-filter:blur(14px) saturate(125%);',
    'flex-shrink:0;}',
    '.rc-inline-viewer .pv-traffic-lights{display:flex;align-items:center;gap:7px;flex-shrink:0;}',
    '.rc-inline-viewer .pv-dot{width:13px;height:13px;border-radius:50%;border:none;cursor:pointer;padding:0;',
    'flex-shrink:0;transition:transform 0.1s ease,filter 0.1s ease;}',
    '.rc-inline-viewer .pv-dot:hover{transform:scale(1.15);filter:brightness(1.15);}',
    '.rc-inline-viewer .pv-dot:active{transform:scale(0.95);}',
    '.rc-inline-viewer .pv-dot:focus{outline:2px solid rgba(255,255,255,0.4);outline-offset:2px;}',
    '.rc-inline-viewer .pv-dot-red{background:#ff5f57;box-shadow:inset 0 0 0 0.5px rgba(0,0,0,0.3);}',
    '.rc-inline-viewer .pv-dot-yellow{background:#ffbd2e;box-shadow:inset 0 0 0 0.5px rgba(0,0,0,0.3);}',
    '.rc-inline-viewer .pv-dot-green{background:#28c840;box-shadow:inset 0 0 0 0.5px rgba(0,0,0,0.3);}',
    '.rc-inline-viewer .pv-title{font-size:12px;color:var(--rc-ink-dim,rgba(240,255,250,0.78));',
    'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1;min-width:0;',
    'font-family:var(--rc-font,system-ui,-apple-system,sans-serif);}',
    '.rc-inline-viewer .pv-frame{flex:1;position:relative;overflow:hidden;min-height:0;}',
    '.rc-inline-viewer .pv-iframe{position:absolute;inset:0;width:100%;height:100%;border:none;}',
    '.rc-inline-viewer.presentation-mode .pv-bar{display:none;}',
    '@media(max-width:768px){',
    '.rc-inline-viewer .pv-bar{padding:6px 10px;}',
    '.rc-inline-viewer .pv-dot{width:11px;height:11px;}',
    '.rc-inline-viewer .pv-title{font-size:11px;}',
    '}'
  ].join('');

  function _injectStyles() {
    if (document.getElementById('rc-inline-viewer-styles')) return;
    var s = document.createElement('style');
    s.id = 'rc-inline-viewer-styles';
    s.textContent = _STYLES;
    document.head.appendChild(s);
  }

  /**
   * Parse day number from a presentation URL path
   * e.g. /presentations/unit/presentation-04/index.html → 4
   */
  function _parseDayFromUrl(url) {
    var m = /presentation-(\d+)/i.exec(url || '');
    return m ? parseInt(m[1], 10) : null;
  }

  function _buildViewerEl() {
    if (_viewerEl) return _viewerEl;
    _injectStyles();

    var el = document.createElement('div');
    el.id = 'rc-inline-viewer';
    el.className = 'rc-inline-viewer';
    el.innerHTML =
      '<div class="pv-bar">' +
        '<div class="pv-traffic-lights">' +
          '<button class="pv-dot pv-dot-red"    id="pvDotClose" title="Close"             aria-label="Close"></button>' +
          '<button class="pv-dot pv-dot-yellow" id="pvDotPres"  title="Presentation Mode" aria-label="Toggle presentation mode"></button>' +
          '<button class="pv-dot pv-dot-green"  id="pvDotFull"  title="Full Screen"       aria-label="Toggle full screen"></button>' +
        '</div>' +
        '<div class="pv-title" id="pvInlineTitle"></div>' +
      '</div>' +
      '<div class="pv-frame">' +
        '<iframe class="pv-iframe" id="pvInlineIframe" ' +
          'sandbox="allow-scripts allow-same-origin allow-forms" ' +
          'allow="fullscreen" allowfullscreen ' +
          'title="Presentation content"></iframe>' +
      '</div>';

    document.body.appendChild(el);
    _viewerEl = el;

    el.querySelector('#pvDotClose').addEventListener('click', closeInlineViewer);
    el.querySelector('#pvDotPres').addEventListener('click', _togglePresMode);
    el.querySelector('#pvDotFull').addEventListener('click', _toggleFullscreen);

    document.addEventListener('keydown', function (e) {
      if (!_viewerEl || !_viewerEl.classList.contains('open')) return;
      if (e.key === 'Escape' && !document.fullscreenElement) {
        if (_presMode) { _togglePresMode(); } else { closeInlineViewer(); }
      }
      if ((e.key === 'p' || e.key === 'P') && e.altKey && !e.ctrlKey && !e.metaKey) {
        e.preventDefault(); _togglePresMode();
      }
      if ((e.key === 'f' || e.key === 'F') && e.altKey && !e.ctrlKey && !e.metaKey) {
        e.preventDefault(); _toggleFullscreen();
      }
    });

    return el;
  }

  function _togglePresMode() {
    if (!_viewerEl) return;
    _presMode = !_presMode;
    _viewerEl.classList.toggle('presentation-mode', _presMode);
  }

  function _toggleFullscreen() {
    if (!_viewerEl) return;
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(function () {});
    } else if (_viewerEl.requestFullscreen) {
      _viewerEl.requestFullscreen().catch(function () {});
    }
  }

  /**
   * Open content in an inline iframe overlay on the current page.
   * Falls back to full-page navigation if a same-page overlay cannot be created.
   * @param {string} srcPath - Relative same-origin path (must start with '/')
   * @param {object} opts    - { title: string }
   */
  function openInlineViewer(srcPath, opts) {
    opts = opts || {};

    if (!srcPath || typeof srcPath !== 'string' || !srcPath.startsWith('/')) {
      console.error('[open-in-viewer] openInlineViewer: srcPath must start with / — aborting, no overlay opened');
      return;
    }

    var el = _buildViewerEl();
    var iframe = el.querySelector('#pvInlineIframe');
    var titleEl = el.querySelector('#pvInlineTitle');

    // Normalise directory URLs
    var src = srcPath.endsWith('/') ? srcPath + 'index.html' : srcPath;
    iframe.src = src;

    // Build title string: "Presentation Title — Day N"
    var title = (opts.title || '').trim();
    var day = _parseDayFromUrl(srcPath);
    if (title && day !== null) {
      titleEl.textContent = title + ' \u2014 Day ' + day;
    } else if (day !== null) {
      titleEl.textContent = 'Day ' + day;
    } else {
      titleEl.textContent = title;
    }

    _presMode = false;
    el.classList.remove('presentation-mode');
    el.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  /**
   * Close the inline overlay viewer.
   */
  function closeInlineViewer() {
    if (!_viewerEl) return;
    var iframe = _viewerEl.querySelector('#pvInlineIframe');
    if (iframe) iframe.src = '';
    _viewerEl.classList.remove('open', 'presentation-mode');
    _presMode = false;
    document.body.style.overflow = '';
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(function () {});
    }
  }

  // Export to global scope
  global.buildViewerUrl = buildViewerUrl;
  global.openInViewer = openInViewer;
  global.openInlineViewer = openInlineViewer;
  global.closeInlineViewer = closeInlineViewer;

  // Also support module exports if available
  /* eslint-disable no-undef */
  if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
    module.exports = { buildViewerUrl, openInViewer, openInlineViewer, closeInlineViewer };
  }
  /* eslint-enable no-undef */
})(typeof window !== 'undefined' ? window : this);
