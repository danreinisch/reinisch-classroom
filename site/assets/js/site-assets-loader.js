/**
 * Site Assets Loader
 * Dynamically loads site.css and site.js based on current path
 * Replaces inline asset loading scripts for CSP compliance
 */

(function(){
  'use strict';
  
  // Determine root: if path contains "/site/", assets live under that; else assets are at root
  const root = location.pathname.indexOf('/site/') >= 0 
    ? location.pathname.slice(0, location.pathname.indexOf('/site/') + 6) 
    : '/';
  
  function addCSS(href) { 
    const link = document.createElement('link'); 
    link.rel = 'stylesheet'; 
    link.href = href; 
    document.head.appendChild(link); 
  }
  
  function addJS(src) { 
    const script = document.createElement('script'); 
    script.defer = true; 
    script.src = src; 
    document.head.appendChild(script); 
  }
  
  addCSS(root + 'assets/css/site.css');
  addJS(root + 'assets/js/site.js');
  
  console.log('[site-assets] Loaded from:', root);
})();
