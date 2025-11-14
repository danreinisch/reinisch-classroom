/**
 * Presentation Navigation Script
 * Handles slide navigation, background slideshow, and inter-presentation links
 * CSP-compliant (no inline scripts or event handlers)
 */

(function () {
  'use strict';

  // Background slideshow management
  function initBackgroundSlideshow() {
    const bgSlideshow = document.getElementById('bgSlideshow');
    if (!bgSlideshow) return;

    // Get background images from data attribute or default patterns
    const imagesData = bgSlideshow.dataset.images;
    let bgImages = [];

    if (imagesData) {
      try {
        bgImages = JSON.parse(imagesData);
      } catch (e) {
        console.warn('Failed to parse background images data:', e);
      }
    }

    // Fallback: look for image1.jpg through image11.jpg pattern
    if (bgImages.length === 0) {
      for (let i = 1; i <= 11; i++) {
        bgImages.push(`image${i}.jpg`);
      }
    }

    let currentBgIndex = 0;

    // Create background image elements
    bgImages.forEach((img, index) => {
      const div = document.createElement('div');
      div.className = 'bg-image';
      if (index === 0) div.classList.add('active');
      div.style.backgroundImage = `url('${img}')`;
      bgSlideshow.appendChild(div);
    });

    // Rotate background every 8 seconds
    function rotateBg() {
      const bgElements = document.querySelectorAll('.bg-image');
      if (bgElements.length === 0) return;

      bgElements[currentBgIndex].classList.remove('active');
      currentBgIndex = (currentBgIndex + 1) % bgImages.length;
      bgElements[currentBgIndex].classList.add('active');
    }

    setInterval(rotateBg, 8000);
  }

  // Slide navigation management
  function initSlideNavigation() {
    let currentSlide = 0;
    const slides = document.querySelectorAll('.slide');
    const totalSlides = slides.length;

    if (totalSlides === 0) return;

    const currentDisplay = document.getElementById('current');
    const totalDisplay = document.getElementById('total');
    const prevBtn = document.querySelector('.nav-prev');
    const nextBtn = document.querySelector('.nav-next');

    if (totalDisplay) {
      totalDisplay.textContent = totalSlides;
    }

    function showSlide(n) {
      slides[currentSlide].classList.remove('active');
      currentSlide = (n + totalSlides) % totalSlides;
      slides[currentSlide].classList.add('active');

      if (currentDisplay) {
        currentDisplay.textContent = currentSlide + 1;
      }

      // Update button states
      if (prevBtn) {
        prevBtn.disabled = currentSlide === 0;
        prevBtn.setAttribute('aria-disabled', currentSlide === 0 ? 'true' : 'false');
      }

      if (nextBtn) {
        nextBtn.disabled = currentSlide === totalSlides - 1;
        nextBtn.setAttribute('aria-disabled', currentSlide === totalSlides - 1 ? 'true' : 'false');
      }
    }

    function changeSlide(direction) {
      if (direction === 1 && currentSlide < totalSlides - 1) {
        showSlide(currentSlide + 1);
      } else if (direction === -1 && currentSlide > 0) {
        showSlide(currentSlide - 1);
      }
    }

    // Add event listeners for navigation buttons
    if (prevBtn) {
      prevBtn.addEventListener('click', function () {
        changeSlide(-1);
      });
    }

    if (nextBtn) {
      nextBtn.addEventListener('click', function () {
        changeSlide(1);
      });
    }

    // Keyboard navigation
    document.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowRight' || e.key === ' ') {
        e.preventDefault();
        changeSlide(1);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        changeSlide(-1);
      }
    });

    // Initialize first slide
    showSlide(0);
  }

  // Helper: Parse slide information from pathname
  function parseSlideFromPath(pathname) {
    // Try to extract presentation number from path like:
    // /presentations/a-door-into-time/presentation-11/...
    const match = pathname.match(/\/presentation-(\d+)\//);
    if (match) {
      return parseInt(match[1], 10);
    }
    return null;
  }

  // Inter-presentation navigation (between different weeks)
  async function initPresentationLinks() {
    const prevLink = document.querySelector('.nav-prev-presentation');
    const nextLink = document.querySelector('.nav-next-presentation');
    const homeBtn = document.querySelector('.nav-home');

    if (!prevLink && !nextLink && !homeBtn) return;

    // Get current presentation info from data attributes
    const container = document.querySelector('.presentation-container') || document.body;
    const slideIndex = parseInt(container.dataset.slideIndex || '0', 10);
    const slideTotal = parseInt(container.dataset.slideTotal || '0', 10);

    // Try to load presentations manifest
    let manifest = null;
    try {
      const response = await fetch('/site/assets/data/presentations.json');
      if (response.ok) {
        manifest = await response.json();
      }
    } catch (e) {
      console.log('Presentations manifest not found, using path-based navigation');
    }

    // Determine navigation targets
    let prevTarget = null;
    let nextTarget = null;
    let homeTarget = '/language-arts/'; // Default

    if (manifest && slideIndex > 0) {
      // Use manifest for navigation
      const presentations = manifest.presentations || [];
      const currentIndex = presentations.findIndex((p) => p.index === slideIndex);

      if (currentIndex > 0) {
        prevTarget = presentations[currentIndex - 1].path;
      }

      if (currentIndex >= 0 && currentIndex < presentations.length - 1) {
        nextTarget = presentations[currentIndex + 1].path;
      }

      if (manifest.homeLink) {
        homeTarget = manifest.homeLink;
      }
    } else {
      // Fallback: parse from pathname
      const pathname = window.location.pathname;
      const currentNum = parseSlideFromPath(pathname);

      if (currentNum !== null) {
        if (currentNum > 1) {
          prevTarget = pathname.replace(
            `/presentation-${currentNum}/`,
            `/presentation-${currentNum - 1}/`
          );
        }

        if (currentNum < slideTotal || slideTotal === 0) {
          nextTarget = pathname.replace(
            `/presentation-${currentNum}/`,
            `/presentation-${currentNum + 1}/`
          );
        }
      }

      // Detect home based on path
      if (pathname.includes('/language-arts/')) {
        homeTarget = '/language-arts/';
      } else if (pathname.includes('/life-skills/')) {
        homeTarget = '/life-skills/';
      }
    }

    // Setup prev link
    if (prevLink) {
      if (prevTarget) {
        prevLink.href = prevTarget;
        prevLink.removeAttribute('disabled');
        prevLink.setAttribute('aria-disabled', 'false');
      } else {
        prevLink.disabled = true;
        prevLink.setAttribute('aria-disabled', 'true');
        prevLink.style.cursor = 'not-allowed';
      }
    }

    // Setup next link
    if (nextLink) {
      if (nextTarget) {
        nextLink.href = nextTarget;
        nextLink.removeAttribute('disabled');
        nextLink.setAttribute('aria-disabled', 'false');
      } else {
        nextLink.disabled = true;
        nextLink.setAttribute('aria-disabled', 'true');
        nextLink.style.cursor = 'not-allowed';
      }
    }

    // Setup home button
    if (homeBtn) {
      if (homeBtn.tagName === 'BUTTON') {
        homeBtn.addEventListener('click', function () {
          window.location.href = homeTarget;
        });
      } else {
        homeBtn.href = homeTarget;
      }
    }
  }

  // Initialize all features on DOMContentLoaded
  document.addEventListener('DOMContentLoaded', function () {
    initBackgroundSlideshow();
    initSlideNavigation();
    initPresentationLinks();
  });
})();
