// CSP-safe navigation for Vocabulary Review (Combined) - A Door Into Time
// No inline scripts. No inline onclick handlers.

document.addEventListener("DOMContentLoaded", () => {
  let currentSlide = 0;

  const slides = Array.from(document.querySelectorAll(".slide"));
  const totalSlides = slides.length;

  const slideContent = document.querySelector(".slide-content");
  const currentSlideEl = document.getElementById("currentSlide");
  const totalSlidesEl = document.getElementById("totalSlides");
  const prevBtn = document.getElementById("prevBtn");
  const nextBtn = document.getElementById("nextBtn");

  // Menu / jump buttons (may not exist if markup changes)
  const btnPart1 = document.getElementById("btnPart1");
  const btnPart2 = document.getElementById("btnPart2");
  const btnLast = document.getElementById("btnLast");
  const btnPart2Start = document.getElementById("btnPart2Start");
  const btnBackToMenu = document.getElementById("btnBackToMenu");

  if (totalSlidesEl) totalSlidesEl.textContent = String(totalSlides);

  function showSlide(n) {
    // Clamp
    if (n < 0) n = 0;
    if (n >= totalSlides) n = totalSlides - 1;

    currentSlide = n;

    slides.forEach((s) => s.classList.remove("active"));
    const active = slides[currentSlide];
    if (active) active.classList.add("active");

    // Scroll to top of the slide-content container
    if (slideContent) slideContent.scrollTop = 0;

    if (currentSlideEl) currentSlideEl.textContent = String(currentSlide + 1);

    if (prevBtn) prevBtn.disabled = currentSlide === 0;
    if (nextBtn) nextBtn.disabled = currentSlide === totalSlides - 1;
  }

  function changeSlide(direction) {
    showSlide(currentSlide + direction);
  }

  function goToSlide(index) {
    showSlide(index);
  }

  function goToMenu() {
    goToSlide(0);
  }

  function jumpToPart(partNumber) {
    if (partNumber === 1) {
      const idx = slides.findIndex((s) => s.dataset.part === "1-start");
      goToSlide(idx !== -1 ? idx : 1);
      return;
    }

    if (partNumber === 2) {
      const idx = slides.findIndex((s) => s.dataset.part === "2-start");
      if (idx !== -1) goToSlide(idx);
      return;
    }
  }

  function jumpToLastSlide() {
    goToSlide(totalSlides - 1);
  }

  // Wire up buttons
  if (prevBtn) prevBtn.addEventListener("click", () => changeSlide(-1));
  if (nextBtn) nextBtn.addEventListener("click", () => changeSlide(1));

  if (btnPart1) btnPart1.addEventListener("click", () => jumpToPart(1));
  if (btnPart2) btnPart2.addEventListener("click", () => jumpToPart(2));
  if (btnLast) btnLast.addEventListener("click", () => jumpToLastSlide());

  if (btnPart2Start) btnPart2Start.addEventListener("click", () => jumpToPart(2));
  if (btnBackToMenu) btnBackToMenu.addEventListener("click", () => goToMenu());

  // Keyboard navigation
  document.addEventListener("keydown", (event) => {
    const tag = event.target && event.target.tagName ? event.target.tagName.toLowerCase() : "";
    if (tag === "input" || tag === "textarea" || event.isComposing) return;

    if (event.key === "ArrowLeft") changeSlide(-1);
    if (event.key === "ArrowRight") changeSlide(1);
  });

  // Background slideshow
  let bgIndex = 0;
  const bgImages = Array.from(document.querySelectorAll(".background-slideshow img"));

  function rotateBackground() {
    if (!bgImages.length) return;
    bgImages[bgIndex].classList.remove("active");
    bgIndex = (bgIndex + 1) % bgImages.length;
    bgImages[bgIndex].classList.add("active");
  }

  // Kick things off
  showSlide(0);
  window.setInterval(rotateBackground, 8000);
});
