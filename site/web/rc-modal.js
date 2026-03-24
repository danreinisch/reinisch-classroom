/**
 * rc-modal.js — Shared styled modal utilities
 * Exposes rcAlert() and rcConfirm() as globals on window.
 * These replace native alert() and confirm() with themed, Promise-based alternatives.
 */
(function () {
  'use strict';

  // Inject styles once
  if (!document.getElementById('rc-modal-styles')) {
    const style = document.createElement('style');
    style.id = 'rc-modal-styles';
    style.textContent = `
      .rc-modal-backdrop {
        display: flex;
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.75);
        z-index: 10000;
        align-items: center;
        justify-content: center;
        backdrop-filter: blur(2px);
      }
      .rc-modal {
        background: rgba(18, 18, 22, 0.98);
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 16px;
        padding: 28px 32px;
        max-width: 440px;
        max-height: 85vh;
        overflow-y: auto;
        width: 90%;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.6);
        backdrop-filter: blur(12px);
        color: rgba(255, 255, 255, 0.9);
        font-family: inherit;
      }
      .rc-modal-title {
        font-size: 17px;
        font-weight: 700;
        margin: 0 0 12px 0;
        color: rgba(255, 255, 255, 0.95);
      }
      .rc-modal-message {
        font-size: 14px;
        line-height: 1.6;
        margin: 0 0 24px 0;
        color: rgba(255, 255, 255, 0.75);
        white-space: pre-wrap;
      }
      .rc-modal-actions {
        display: flex;
        gap: 10px;
        justify-content: flex-end;
      }
      .rc-modal-btn {
        padding: 8px 18px;
        border-radius: 8px;
        border: 1px solid rgba(255, 255, 255, 0.15);
        background: rgba(255, 255, 255, 0.08);
        color: rgba(255, 255, 255, 0.85);
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        transition: background 0.15s, border-color 0.15s;
      }
      .rc-modal-btn:hover {
        background: rgba(255, 255, 255, 0.14);
        border-color: rgba(255, 255, 255, 0.25);
      }
      .rc-modal-btn-primary {
        background: rgba(99, 102, 241, 0.85);
        border-color: rgba(99, 102, 241, 0.6);
        color: #fff;
      }
      .rc-modal-btn-primary:hover {
        background: rgba(99, 102, 241, 1);
      }
      .rc-modal-btn-danger {
        background: rgba(239, 68, 68, 0.15);
        border-color: rgba(239, 68, 68, 0.4);
        color: rgba(239, 68, 68, 0.9);
      }
      .rc-modal-btn-danger:hover {
        background: rgba(239, 68, 68, 0.22);
      }
    `;
    document.head.appendChild(style);
  }

  /**
   * Escape a string for safe insertion into HTML content.
   * @param {string} str - Raw string to escape
   * @returns {string} HTML-safe string
   */
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = String(str);
    return div.innerHTML;
  }

  /**
   * Show a styled alert modal. Returns a Promise that resolves when the user dismisses it.
   * @param {string} title - Modal title
   * @param {string} message - Modal message
   * @returns {Promise<void>}
   */
  function rcAlert(title, message) {
    return new Promise((resolve) => {
      const backdrop = document.createElement('div');
      backdrop.className = 'rc-modal-backdrop';
      backdrop.innerHTML = `
        <div class="rc-modal" role="dialog" aria-modal="true" aria-labelledby="rc-modal-title">
          <div class="rc-modal-title" id="rc-modal-title">${escapeHtml(title)}</div>
          <div class="rc-modal-message">${escapeHtml(message)}</div>
          <div class="rc-modal-actions">
            <button class="rc-modal-btn rc-modal-btn-primary" id="rc-modal-ok-btn">OK</button>
          </div>
        </div>
      `;
      document.body.appendChild(backdrop);

      const okBtn = backdrop.querySelector('#rc-modal-ok-btn');
      okBtn.focus();

      const cleanup = () => {
        backdrop.remove();
        resolve();
      };

      okBtn.addEventListener('click', cleanup);

      backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) cleanup();
      });

      backdrop.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === 'Escape') {
          e.preventDefault();
          cleanup();
        }
      });
    });
  }

  /**
   * Show a styled confirmation modal. Returns a Promise<boolean>.
   * @param {string} title - Modal title
   * @param {string} message - Modal message
   * @param {string} [confirmLabel='Confirm'] - Label for the confirm button
   * @param {object} [options={}] - Options
   * @param {boolean} [options.danger=false] - Use danger styling for the confirm button
   * @returns {Promise<boolean>} true if confirmed, false if cancelled
   */
  function rcConfirm(title, message, confirmLabel = 'Confirm', options = {}) {
    return new Promise((resolve) => {
      const isDanger = options.danger || false;
      const confirmBtnClass = isDanger
        ? 'rc-modal-btn rc-modal-btn-danger'
        : 'rc-modal-btn rc-modal-btn-primary';

      const backdrop = document.createElement('div');
      backdrop.className = 'rc-modal-backdrop';
      backdrop.innerHTML = `
        <div class="rc-modal" role="dialog" aria-modal="true" aria-labelledby="rc-modal-title">
          <div class="rc-modal-title" id="rc-modal-title">${escapeHtml(title)}</div>
          <div class="rc-modal-message">${escapeHtml(message)}</div>
          <div class="rc-modal-actions">
            <button class="rc-modal-btn" id="rc-modal-cancel-btn">Cancel</button>
            <button class="${confirmBtnClass}" id="rc-modal-confirm-btn">${escapeHtml(confirmLabel)}</button>
          </div>
        </div>
      `;
      document.body.appendChild(backdrop);

      const confirmBtn = backdrop.querySelector('#rc-modal-confirm-btn');
      const cancelBtn = backdrop.querySelector('#rc-modal-cancel-btn');
      confirmBtn.focus();

      const cleanup = (result) => {
        backdrop.remove();
        resolve(result);
      };

      confirmBtn.addEventListener('click', () => cleanup(true));
      cancelBtn.addEventListener('click', () => cleanup(false));

      backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) cleanup(false);
      });

      backdrop.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          cleanup(true);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          cleanup(false);
        }
      });
    });
  }

  /**
   * Show a styled prompt modal. Returns a Promise<string|null>.
   * @param {string} title - Modal title
   * @param {string} message - Modal message
   * @param {string} [defaultValue=''] - Default input value
   * @returns {Promise<string|null>} Input value if confirmed, null if cancelled
   */
  function rcPrompt(title, message, defaultValue = '') {
    return new Promise((resolve) => {
      const backdrop = document.createElement('div');
      backdrop.className = 'rc-modal-backdrop';
      backdrop.innerHTML = `
        <div class="rc-modal" role="dialog" aria-modal="true" aria-labelledby="rc-modal-title">
          <div class="rc-modal-title" id="rc-modal-title">${escapeHtml(title)}</div>
          <div class="rc-modal-message">${escapeHtml(message)}</div>
          <div style="margin-bottom:20px">
            <input id="rc-modal-prompt-input" type="text"
              style="width:100%;box-sizing:border-box;padding:8px 10px;border-radius:8px;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.08);color:rgba(255,255,255,.9);font-size:14px;font-family:inherit;"
              value="${escapeHtml(defaultValue)}" autocomplete="off" />
          </div>
          <div class="rc-modal-actions">
            <button class="rc-modal-btn" id="rc-modal-cancel-btn">Cancel</button>
            <button class="rc-modal-btn rc-modal-btn-primary" id="rc-modal-ok-btn">OK</button>
          </div>
        </div>
      `;
      document.body.appendChild(backdrop);

      const input = backdrop.querySelector('#rc-modal-prompt-input');
      const okBtn = backdrop.querySelector('#rc-modal-ok-btn');
      const cancelBtn = backdrop.querySelector('#rc-modal-cancel-btn');
      input.focus();
      input.select();

      const cleanup = (result) => {
        backdrop.remove();
        resolve(result);
      };

      okBtn.addEventListener('click', () => cleanup(input.value));
      cancelBtn.addEventListener('click', () => cleanup(null));

      backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) cleanup(null);
      });

      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          cleanup(input.value);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          cleanup(null);
        }
      });
    });
  }

  window.rcAlert = rcAlert;
  window.rcConfirm = rcConfirm;
  window.rcPrompt = rcPrompt;
})();
