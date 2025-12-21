Mastercard Interview Prep — CSP-safe bundle

Why this exists:
Your site uses a Content Security Policy (CSP) that blocks inline <script> execution (no 'unsafe-inline').
So single-file HTML modules with inline JS will render but won't work.

Files:
- entry.html      -> wrapper your presentation shell can load (iframe)
- module.html     -> the actual app UI
- styles.css      -> all styling (no inline styles)
- app.js          -> all logic (no inline scripts)
- entry.css       -> makes the iframe full-screen

Install:
Copy ALL files into the same folder:
site/life-skills/presentations/presentation-32/
(or whichever presentation folder you want)

Test URLs after deploy:
.../presentation-32/entry.html
.../presentation-32/module.html

Notes:
- entry.html works even if your shell injects HTML into a div, because the iframe executes separately.
- Everything autosaves in localStorage per browser.
