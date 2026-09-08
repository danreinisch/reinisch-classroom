(() => {
  'use strict';

  const path =
    window.location.pathname
      .replace(/\/index\.html$/i, '/')
      .replace(/\/+$/, '') || '/';

  if (path !== '/teacher/students') {
    return;
  }

  const STYLE_ID =
    'tc-students-objective-evidence-polish';

  if (document.getElementById(STYLE_ID)) {
    return;
  }

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .st-objective-manual-form {
      border-color: rgba(110, 231, 183, 0.22);
      background: rgba(16, 185, 129, 0.055);
    }

    .st-objective-manual-grid input,
    .st-objective-manual-grid select,
    .st-objective-manual-wide input,
    .st-objective-manual-wide textarea {
      background: rgba(25, 84, 69, 0.48);
      border-color: rgba(110, 231, 183, 0.24);
      color: rgba(240, 253, 244, 0.97);
      caret-color: rgba(167, 243, 208, 0.98);
      color-scheme: dark;
      transition:
        background 0.15s ease,
        border-color 0.15s ease,
        box-shadow 0.15s ease;
    }

    .st-objective-manual-grid input::placeholder,
    .st-objective-manual-wide input::placeholder,
    .st-objective-manual-wide textarea::placeholder {
      color: rgba(209, 250, 229, 0.58);
      opacity: 1;
    }

    .st-objective-manual-grid input:hover,
    .st-objective-manual-grid select:hover,
    .st-objective-manual-wide input:hover,
    .st-objective-manual-wide textarea:hover {
      background: rgba(29, 96, 78, 0.54);
      border-color: rgba(110, 231, 183, 0.36);
    }

    .st-objective-manual-grid input:focus,
    .st-objective-manual-grid select:focus,
    .st-objective-manual-wide input:focus,
    .st-objective-manual-wide textarea:focus {
      outline: none;
      background: rgba(31, 109, 87, 0.60);
      border-color: rgba(74, 222, 128, 0.72);
      box-shadow: 0 0 0 2px rgba(34, 197, 94, 0.16);
    }

    .st-objective-manual-grid input:disabled,
    .st-objective-manual-grid select:disabled,
    .st-objective-manual-wide input:disabled,
    .st-objective-manual-wide textarea:disabled,
    .st-objective-manual-wide input[readonly],
    .st-objective-manual-wide textarea[readonly] {
      background: rgba(22, 69, 59, 0.42);
      border-color: rgba(110, 231, 183, 0.16);
      color: rgba(220, 252, 231, 0.72);
      opacity: 1;
    }

    .st-objective-manual-grid select option {
      background: #173f35;
      color: #f0fdf4;
    }
  `;

  document.head.appendChild(style);
})();
