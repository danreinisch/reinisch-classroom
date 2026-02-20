// Sidebar FOUC prevention — must run synchronously in <head>
// Reads saved sidebar state and applies tc-collapsed class before first paint
try {
  if (localStorage.getItem('rc_public_sidebar') !== 'expanded') {
    document.documentElement.classList.add('tc-collapsed');
  }
} catch (_) {
  document.documentElement.classList.add('tc-collapsed');
}
