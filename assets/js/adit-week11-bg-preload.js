/**
 * Week 11 Background Image Preloader
 * Creates and populates .bg-image elements before presentation-nav.js runs.
 * This ensures background slideshow works correctly by working around a timing
 * issue in presentation-nav.js where backgroundImage gets overwritten by cssText.
 * 
 * This script only runs on the Week 11 presentation page.
 */
(function () {
  'use strict';

  // Only run on Week 11 page
  if (!/\/presentations\/a-door-into-time\/presentation-11\//i.test(location.pathname)) {
    return;
  }

  // Run as early as possible to set up backgrounds before presentation-nav.js
  function init() {
    const bgSlideshow = document.getElementById('bgSlideshow') || 
                        document.querySelector('.bg-slideshow');
    
    if (!bgSlideshow) {
      console.warn('[Week 11 BG Preload] No background slideshow container found');
      return;
    }

    // Parse existing data-images or use defaults
    let imageFiles = [];
    const existingData = bgSlideshow.dataset.images;
    
    if (existingData) {
      try {
        imageFiles = JSON.parse(existingData);
      } catch (e) {
        console.warn('[Week 11 BG Preload] Failed to parse existing data-images:', e);
      }
    }
    
    // Fallback to expected image names if none found
    if (imageFiles.length === 0) {
      imageFiles = [
        'image1.jpg', 'image2.jpg', 'image3.jpg', 'image4.jpg', 'image5.jpg', 'image6.jpg',
        'image7.jpg', 'image8.jpg', 'image9.jpg', 'image10.jpg', 'image11.jpg'
      ];
    }

    // Create background image elements with proper styling
    imageFiles.forEach(function (img, index) {
      const div = document.createElement('div');
      div.className = 'bg-image';
      if (index === 0) {
        div.classList.add('active');
      }
      
      // Set all styles at once, including backgroundImage
      const opacity = (index === 0) ? '1' : '0';
      div.style.cssText =
        'position:absolute;top:0;left:0;width:100%;height:100%;' +
        'background-size:cover;background-position:center;' +
        'opacity:' + opacity + ';transition:opacity 2s ease-in-out;' +
        'background-image:url(\'' + img + '\');';
      
      bgSlideshow.appendChild(div);
    });

    // Clear data-images so presentation-nav.js won't try to create duplicates
    bgSlideshow.removeAttribute('data-images');
    
    console.log('[Week 11 BG Preload] Created ' + imageFiles.length + ' background elements');
  }

  // Run when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
