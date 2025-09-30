(function () {
  // Only run on Week 6 page
  if (!/\/presentations\/a-door-into-time\/presentation-06\/?$/i.test(location.pathname)) return;

  function onReady(fn){ if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn); else fn(); }

  onReady(async function () {
    const slots = Array.from(document.querySelectorAll('.bg-image'));
    if (!slots.length) return;

    // Images live next to index.html; we’ll try multiple extensions
    const bases = ['image1','image2','image3','image4','image5','image6'];
    const exts  = ['.jpg', '.jpeg', '.png', '.webp'];

    // Helper: preload one URL
    function preload(url) {
      return new Promise((resolve) => {
        const im = new Image();
        im.onload = () => resolve({ url, ok: true });
        im.onerror = () => resolve({ url, ok: false });
        im.src = url;
      });
    }

    // Try extensions in order and return the first that exists
    async function findExistingFor(base) {
      for (const ext of exts) {
        const res = await preload(base + ext);
        if (res.ok) return res.url;
      }
      return null;
    }

    // Match your CSS gradient + image layering
    function applyBackground(el, url) {
      el.style.backgroundImage =
        "linear-gradient(rgba(0,0,0,0.2), rgba(0,0,0,0.3)), url('" + url + "')";
      el.style.backgroundSize = 'cover';
      el.style.backgroundPosition = 'center';
    }

    // Initial load (handles having only some available at first)
    const found = [];
    for (const base of bases) {
      const url = await findExistingFor(base);
      found.push(url);
    }

    // Assign into the .bg-image slots, in order
    for (let i = 0; i < slots.length && i < found.length; i++) {
      if (found[i]) applyBackground(slots[i], found[i]);
    }

    // Keep checking every 20s for missing images until all 6 are found
    const needed = Math.min(slots.length, bases.length);
    const retry = setInterval(async () => {
      let filled = 0;
      for (let i = 0; i < needed; i++) {
        const hasBg = !!slots[i].style.backgroundImage;
        if (!hasBg) {
          const url = await findExistingFor(bases[i]);
          if (url) applyBackground(slots[i], url);
        }
        if (slots[i].style.backgroundImage) filled++;
      }
      if (filled >= needed) clearInterval(retry);
    }, 20000);
  });
})();
