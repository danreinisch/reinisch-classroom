/**
 * Presentation Navigation Script
 * Handles slide navigation, background slideshow, and inter-presentation links
 * CSP-compliant (no inline scripts or event handlers)
 * Enhanced with adaptive markup detection and robust error handling
 */

(function () {
  'use strict';

  // Global diagnostics object
  window.PRESENTATION_NAV = {
    status: 'initializing',
    errors: [],
    warnings: [],
    slideCount: 0,
    backgroundInitialized: false,
    navigationInitialized: false
  };

  /**
   * Log diagnostic message
   */
  function logDiagnostic(level, message) {
    const msg = `[presentation-nav] ${message}`;
    if (level === 'error') {
      console.error(msg);
      window.PRESENTATION_NAV.errors.push(message);
    } else if (level === 'warn') {
      console.warn(msg);
      window.PRESENTATION_NAV.warnings.push(message);
    } else {
      console.log(msg);
    }
  }

  // Background slideshow management
  function initBackgroundSlideshow() {
    try {
      // Try to find existing background container with multiple selectors
      let bgSlideshow = document.getElementById('bgSlideshow') ||
                        document.querySelector('.bg-slideshow') ||
                        document.querySelector('.background-slideshow') ||
                        document.querySelector('.bgImage');

      // If no container exists, create one
      if (!bgSlideshow) {
        logDiagnostic('warn', 'No background container found, creating #bgSlideshow');
        bgSlideshow = document.createElement('div');
        bgSlideshow.id = 'bgSlideshow';
        bgSlideshow.style.position = 'fixed';
        bgSlideshow.style.top = '0';
        bgSlideshow.style.left = '0';
        bgSlideshow.style.width = '100%';
        bgSlideshow.style.height = '100%';
        bgSlideshow.style.zIndex = '-2';
        document.body.insertBefore(bgSlideshow, document.body.firstChild);
      }

      // Ensure it has an ID for future reference
      if (!bgSlideshow.id) {
        bgSlideshow.id = 'bgSlideshow';
      }

      // Get background images from data attribute or default patterns
      const imagesData = bgSlideshow.dataset.images;
      let bgImages = [];

      if (imagesData) {
        try {
          bgImages = JSON.parse(imagesData);
          logDiagnostic('info', `Loaded ${bgImages.length} images from data-images attribute`);
        } catch (e) {
          logDiagnostic('warn', 'Failed to parse background images data: ' + e.message);
        }
      }

      // Check for preload links
      if (bgImages.length === 0) {
        const preloadLinks = document.querySelectorAll('link[rel="preload"][as="image"]');
        if (preloadLinks.length > 0) {
          bgImages = Array.from(preloadLinks).map(link => link.href);
          logDiagnostic('info', `Loaded ${bgImages.length} images from preload links`);
        }
      }

      // Fallback: look for image1.jpg through image11.jpg pattern
      if (bgImages.length === 0) {
        for (let i = 1; i <= 11; i++) {
          bgImages.push(`image${i}.jpg`);
        }
        logDiagnostic('info', 'Using default image1.jpg...image11.jpg pattern');
      }

      let currentBgIndex = 0;

      // Create background image elements only if container is empty
      const existingBgImages = bgSlideshow.querySelectorAll('.bg-image, .background-image');
      if (existingBgImages.length === 0) {
        bgImages.forEach((img, index) => {
          const div = document.createElement('div');
          div.className = 'bg-image';
          if (index === 0) div.classList.add('active');
          div.style.backgroundImage = `url('${img}')`;
          bgSlideshow.appendChild(div);
        });
      } else {
        // Standardize existing images by adding .bg-image class
        existingBgImages.forEach((elem, index) => {
          if (!elem.classList.contains('bg-image')) {
            elem.classList.add('bg-image');
          }
          if (index === 0 && !elem.classList.contains('active')) {
            elem.classList.add('active');
          }
        });
        logDiagnostic('info', `Standardized ${existingBgImages.length} existing background images`);
      }

      // Rotate background every 8 seconds
      function rotateBg() {
        const bgElements = document.querySelectorAll('.bg-image');
        if (bgElements.length === 0) return;

        bgElements[currentBgIndex].classList.remove('active');
        currentBgIndex = (currentBgIndex + 1) % bgElements.length;
        bgElements[currentBgIndex].classList.add('active');
      }

      if (bgImages.length > 1 || existingBgImages.length > 1) {
        setInterval(rotateBg, 8000);
        window.PRESENTATION_NAV.backgroundInitialized = true;
        logDiagnostic('info', 'Background slideshow initialized');
      } else {
        logDiagnostic('warn', 'Background slideshow disabled (less than 2 images)');
      }
    } catch (error) {
      logDiagnostic('error', 'Background slideshow initialization failed: ' + error.message);
    }
  }

  // Slide navigation management
  function initSlideNavigation() {
    try {
      let currentSlide = 0;
      
      // Adaptive slide detection: .slide OR [data-slide] attribute
      let slides = Array.from(document.querySelectorAll('.slide'));
      
      // Fallback: look for elements with data-slide attribute
      if (slides.length === 0) {
        const dataSlides = Array.from(document.querySelectorAll('[data-slide]'));
        if (dataSlides.length > 0) {
          // Add .slide class to standardize
          dataSlides.forEach(elem => elem.classList.add('slide'));
          slides = dataSlides;
          logDiagnostic('info', `Found ${slides.length} slides via [data-slide] attribute`);
        }
      }

      const totalSlides = slides.length;

      if (totalSlides === 0) {
        logDiagnostic('warn', 'No slides found, navigation disabled');
        window.PRESENTATION_NAV.slideCount = 0;
        return;
      }

      window.PRESENTATION_NAV.slideCount = totalSlides;
      logDiagnostic('info', `Found ${totalSlides} slides`);

      // Find or create slide counter elements
      let currentDisplay = document.getElementById('current');
      let totalDisplay = document.getElementById('total');
      
      if (!currentDisplay || !totalDisplay) {
        const counter = document.querySelector('.slide-counter');
        if (counter && !currentDisplay) {
          currentDisplay = document.createElement('span');
          currentDisplay.id = 'current';
          counter.prepend(currentDisplay);
        }
        if (counter && !totalDisplay) {
          totalDisplay = document.createElement('span');
          totalDisplay.id = 'total';
          counter.appendChild(totalDisplay);
        }
      }

      if (totalDisplay) {
        totalDisplay.textContent = totalSlides;
      }

      // Adaptive button binding: multiple selectors for flexibility
      const prevBtn = document.querySelector('.nav-prev') || 
                      document.querySelector('#prevBtn') || 
                      document.querySelector('[data-nav="prev"]');
      const nextBtn = document.querySelector('.nav-next') || 
                      document.querySelector('#nextBtn') || 
                      document.querySelector('[data-nav="next"]');

      if (!prevBtn && !nextBtn) {
        logDiagnostic('warn', 'No navigation buttons found');
      }

      function showSlide(n) {
        slides[currentSlide].classList.remove('active');
        currentSlide = (n + totalSlides) % totalSlides;
        slides[currentSlide].classList.add('active');

        if (currentDisplay) {
          currentDisplay.textContent = currentSlide + 1;
        }

        // Update button states with boundary handling
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

      // Enhanced keyboard navigation with Home/End support
      document.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowRight' || e.key === ' ') {
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

      // Initialize first slide
      showSlide(0);
      window.PRESENTATION_NAV.navigationInitialized = true;
      logDiagnostic('info', 'Slide navigation initialized');
    } catch (error) {
      logDiagnostic('error', 'Slide navigation initialization failed: ' + error.message);
    }
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
    try {
      // Support multiple selectors for flexibility
      const prevLink = document.querySelector('.nav-prev-presentation') || 
                       document.querySelector('[data-nav="prev-presentation"]');
      const nextLink = document.querySelector('.nav-next-presentation') || 
                       document.querySelector('[data-nav="next-presentation"]');
      const homeBtn = document.querySelector('.nav-home') || 
                      document.querySelector('[data-nav="home"]');

      if (!prevLink && !nextLink && !homeBtn) {
        logDiagnostic('info', 'No inter-presentation navigation found');
        return;
      }

      // Get current presentation info from data attributes
      const container = document.querySelector('.presentation-container') || document.body;
      const slideIndex = parseInt(container.dataset.slideIndex || '0', 10);
      const slideTotal = parseInt(container.dataset.slideTotal || '0', 10);

      // Try to load presentations manifest
      let manifest = null;
      try {
        // Try both /assets and /site/assets paths
        let response = await fetch('/assets/data/presentations.json');
        if (!response.ok) {
          response = await fetch('/site/assets/data/presentations.json');
        }
        if (response.ok) {
          manifest = await response.json();
          logDiagnostic('info', 'Loaded presentations manifest');
        }
      } catch (e) {
        logDiagnostic('info', 'Presentations manifest not found, using path-based navigation');
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

      logDiagnostic('info', 'Inter-presentation navigation initialized');
    } catch (error) {
      logDiagnostic('error', 'Inter-presentation navigation failed: ' + error.message);
    }
  }

  // Initialize all features on DOMContentLoaded
  document.addEventListener('DOMContentLoaded', function () {
    try {
      logDiagnostic('info', 'Initializing presentation navigation...');
      initBackgroundSlideshow();
      initSlideNavigation();
      initPresentationLinks();
      window.PRESENTATION_NAV.status = 'initialized';
      logDiagnostic('info', 'Presentation navigation initialization complete');
    } catch (error) {
      window.PRESENTATION_NAV.status = 'failed';
      logDiagnostic('error', 'Fatal initialization error: ' + error.message);
    }
  });
})();
