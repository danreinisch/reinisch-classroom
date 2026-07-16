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
  var _clockInterval = null;
  var _classClockCtrl = null; // { start, stop } from window.RCClassClock

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
    'font-family:var(--rc-font,system-ui,-apple-system,sans-serif);text-align:center;}',
    '.rc-inline-viewer .pv-clock{font-size:12px;color:var(--rc-ink-dim,rgba(240,255,250,0.78));',
    'white-space:nowrap;font-family:var(--rc-font,system-ui,-apple-system,sans-serif);',
    'font-variant-numeric:tabular-nums;flex-shrink:0;}',
    '.rc-inline-viewer .pv-frame{flex:1;position:relative;overflow:hidden;min-height:0;}',
    '.rc-inline-viewer .pv-iframe{position:absolute;inset:0;width:100%;height:100%;border:none;}',
    '/* presentation-mode: pv-bar stays visible; pv-frame flex:1 fills remaining space */',
    '@media(max-width:768px){',
    '.rc-inline-viewer .pv-bar{padding:6px 10px;}',
    '.rc-inline-viewer .pv-dot{width:11px;height:11px;}',
    '.rc-inline-viewer .pv-title{font-size:11px;}',
    '.rc-inline-viewer .pv-clock{font-size:10px;}',
    '}'
  ].join('');

  function _injectStyles() {
    if (document.getElementById('rc-inline-viewer-styles')) return;
    var s = document.createElement('style');
    s.id = 'rc-inline-viewer-styles';
    s.textContent = _STYLES;
    document.head.appendChild(s);
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
        '<div class="pv-clock" id="pvInlineClock"></div>' +
      '</div>' +
      '<div class="pv-frame">' +
        '<iframe class="pv-iframe" id="pvInlineIframe" tabindex="0" ' +
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
    if (_presMode) {
      // Exit browser fullscreen first if active
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(function () {});
      }
    }
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

  function _updateClock() {
    var clockEl = document.getElementById('pvInlineClock');
    if (!clockEl) return;
    var now = new Date();
    clockEl.textContent = now.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    });
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

    function focusPresentationFrame() {
      window.requestAnimationFrame(function () {
        try {
          iframe.focus({ preventScroll: true });
        } catch {
          iframe.focus();
        }
      });
    }

    iframe.addEventListener(
      'load',
      focusPresentationFrame,
      { once: true }
    );

    // Normalise directory URLs
    var src = srcPath.endsWith('/') ? srcPath + 'index.html' : srcPath;
    iframe.src = src;

    // Set title
    var title = (opts.title || '').trim();
    titleEl.textContent = title;

    _presMode = false;
    el.classList.remove('presentation-mode');
    el.classList.add('open');
    document.body.style.overflow = 'hidden';
    focusPresentationFrame();

    // Start clock — use class clock if available, otherwise fall back to simple time
    if (!_classClockCtrl && window.RCClassClock) {
      var pvBar = el.querySelector('.pv-bar');
      var simpleClock = el.querySelector('#pvInlineClock');
      if (simpleClock) simpleClock.style.display = 'none';
      _classClockCtrl = window.RCClassClock.attachToBar(pvBar);
    }
    if (_classClockCtrl) {
      _classClockCtrl.start();
    } else {
      _updateClock();
      _clockInterval = setInterval(_updateClock, 1000);
    }
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
    // Stop clock
    if (_classClockCtrl) {
      _classClockCtrl.stop();
    } else if (_clockInterval) {
      clearInterval(_clockInterval);
      _clockInterval = null;
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
