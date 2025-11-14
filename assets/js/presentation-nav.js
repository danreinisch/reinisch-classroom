/**
 * Presentation Navigation Script (Enhanced Adaptive Version)
 * Handles slide navigation, background slideshow, and inter-presentation links
 * CSP-compliant (no inline scripts or event handlers)
 * 
 * Features:
 * - Adaptive selectors for navigation buttons and slides
 * - Graceful degradation when elements are missing
 * - Background slideshow with multiple selector support
 * - Keyboard navigation (when multiple slides present)
 * - Lightweight diagnostics on window.PRESENTATION_NAV
 */

(function () {
  'use strict';

  // Expose diagnostics for debugging
  window.PRESENTATION_NAV = {
    version: '2.0.0-adaptive',
    initialized: false,
    features: {
      slideNavigation: false,
      backgroundSlideshow: false,
      presentationLinks: false,
      keyboardNav: false,
    },
    warnings: [],
  };

  const diagnostics = window.PRESENTATION_NAV;

  function logWarning(message) {
    diagnostics.warnings.push(message);
    console.warn('[Presentation Nav]', message);
  }

  // Background slideshow management
  function initBackgroundSlideshow() {
    // Support multiple selectors: #bgSlideshow, .bg-slideshow, .background-image, etc.
    const bgSlideshow =
      document.getElementById('bgSlideshow') ||
      document.querySelector('.bg-slideshow') ||
      document.querySelector('.background-image');

    if (!bgSlideshow) {
      // Try to create a fallback container if body exists but no slideshow element
      const fallbackContainer = document.createElement('div');
      fallbackContainer.id = 'bgSlideshow';
      fallbackContainer.className = 'bg-slideshow';
      fallbackContainer.style.cssText =
        'position:fixed;top:0;left:0;width:100%;height:100%;z-index:-2;';
      document.body.insertBefore(fallbackContainer, document.body.firstChild);
      return initBackgroundSlideshowWithContainer(fallbackContainer);
    }

    return initBackgroundSlideshowWithContainer(bgSlideshow);
  }

  function initBackgroundSlideshowWithContainer(bgSlideshow) {
    // Get background images from data attribute or default patterns
    const imagesData = bgSlideshow.dataset.images;
    let bgImages = [];

    if (imagesData) {
      try {
        bgImages = JSON.parse(imagesData);
      } catch (e) {
        logWarning('Failed to parse background images data: ' + e.message);
      }
    }

    // Fallback: look for image1.jpg through image11.jpg pattern
    if (bgImages.length === 0) {
      // Probe for existence of images by attempting to add them
      // In a real scenario, we'd just add them and let the browser handle 404s gracefully
      for (let i = 1; i <= 11; i++) {
        bgImages.push('image' + i + '.jpg');
      }
    }

    if (bgImages.length === 0) {
      logWarning('No background images found');
      return;
    }

    let currentBgIndex = 0;

    // Create background image elements
    bgImages.forEach(function (img, index) {
      const div = document.createElement('div');
      div.className = 'bg-image';
      if (index === 0) div.classList.add('active');
      div.style.backgroundImage = "url('" + img + "')";
      // Apply base styles if not present
      if (!div.style.position) {
        div.style.cssText =
          'position:absolute;top:0;left:0;width:100%;height:100%;background-size:cover;background-position:center;opacity:0;transition:opacity 2s ease-in-out;';
        if (index === 0) div.style.opacity = '1';
      }
      bgSlideshow.appendChild(div);
    });

    // Rotate background every 8 seconds
    function rotateBg() {
      const bgElements = document.querySelectorAll('.bg-image');
      if (bgElements.length === 0) return;

      bgElements[currentBgIndex].classList.remove('active');
      bgElements[currentBgIndex].style.opacity = '0';
      currentBgIndex = (currentBgIndex + 1) % bgImages.length;
      bgElements[currentBgIndex].classList.add('active');
      bgElements[currentBgIndex].style.opacity = '1';
    }

    if (bgImages.length > 1) {
      setInterval(rotateBg, 8000);
      diagnostics.features.backgroundSlideshow = true;
    }
  }

  // Slide navigation management with adaptive selectors
  function initSlideNavigation() {
    let currentSlide = 0;
    // Support .slide and [data-slide] selectors
    const slides =
      document.querySelectorAll('.slide').length > 0
        ? document.querySelectorAll('.slide')
        : document.querySelectorAll('[data-slide]');

    const totalSlides = slides.length;

    // If no slides found, treat body as single slide (fallback, no navigation needed)
    if (totalSlides === 0) {
      logWarning('No slides found (.slide or [data-slide])');
      return;
    }

    const currentDisplay = document.getElementById('current');
    const totalDisplay = document.getElementById('total');

    // Adaptive button selection:
    // Support .nav-prev/.nav-next, #prevBtn/#nextBtn, [data-nav="prev|next"],
    // or buttons with text matching /Previous/i or /Next/i
    const prevBtn =
      document.querySelector('.nav-prev') ||
      document.getElementById('prevBtn') ||
      document.querySelector('[data-nav="prev"]') ||
      Array.from(document.querySelectorAll('button')).find(function (btn) {
        return /prev/i.test(btn.textContent);
      });

    const nextBtn =
      document.querySelector('.nav-next') ||
      document.getElementById('nextBtn') ||
      document.querySelector('[data-nav="next"]') ||
      Array.from(document.querySelectorAll('button')).find(function (btn) {
        return /next/i.test(btn.textContent);
      });

    if (totalDisplay) {
      totalDisplay.textContent = totalSlides;
    }

    function showSlide(n) {
      slides[currentSlide].classList.remove('active');
      if (slides[currentSlide].style) {
        slides[currentSlide].style.display = 'none';
      }
      currentSlide = (n + totalSlides) % totalSlides;
      slides[currentSlide].classList.add('active');
      if (slides[currentSlide].style) {
        slides[currentSlide].style.display = '';
      }

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
        nextBtn.setAttribute(
          'aria-disabled',
          currentSlide === totalSlides - 1 ? 'true' : 'false'
        );
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
    } else {
      logWarning('Previous button not found (tried .nav-prev, #prevBtn, [data-nav="prev"])');
    }

    if (nextBtn) {
      nextBtn.addEventListener('click', function () {
        changeSlide(1);
      });
    } else {
      logWarning('Next button not found (tried .nav-next, #nextBtn, [data-nav="next"])');
    }

    // Keyboard navigation (only if multiple slides)
    if (totalSlides > 1) {
      document.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowRight') {
          e.preventDefault();
          changeSlide(1);
        } else if (e.key === 'ArrowLeft') {
          e.preventDefault();
          changeSlide(-1);
        } else if (e.key === 'Home') {
          e.preventDefault();
          showSlide(0);
        } else if (e.key === 'End') {
          e.preventDefault();
          showSlide(totalSlides - 1);
        }
      });
      diagnostics.features.keyboardNav = true;
    }

    // Initialize first slide
    showSlide(0);
    diagnostics.features.slideNavigation = true;
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

    if (!prevLink && !nextLink && !homeBtn) {
      return; // No presentation links to initialize
    }

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
      // Manifest not found, will use path-based navigation
    }

    // Determine navigation targets
    let prevTarget = null;
    let nextTarget = null;
    let homeTarget = '/language-arts/'; // Default

    if (manifest && slideIndex > 0) {
      // Use manifest for navigation
      const presentations = manifest.presentations || [];
      const currentIndex = presentations.findIndex(function (p) {
        return p.index === slideIndex;
      });

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
            '/presentation-' + currentNum + '/',
            '/presentation-' + (currentNum - 1) + '/'
          );
        }

        if (currentNum < slideTotal || slideTotal === 0) {
          nextTarget = pathname.replace(
            '/presentation-' + currentNum + '/',
            '/presentation-' + (currentNum + 1) + '/'
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

    diagnostics.features.presentationLinks = true;
  }

  // Initialize all features on DOMContentLoaded
  document.addEventListener('DOMContentLoaded', function () {
    diagnostics.initialized = true;
    initBackgroundSlideshow();
    initSlideNavigation();
    initPresentationLinks();

    // Log summary if in debug mode
    if (window.location.search.includes('debug')) {
      console.log('[Presentation Nav] Initialized:', diagnostics);
    }
  });
})();
