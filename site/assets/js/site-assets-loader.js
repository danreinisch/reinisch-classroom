(()=>{'use strict';

  // CSP-compliant dynamic asset loader for site shell.
  // Always use root-only /assets paths (no /site root detection).
  const CSS_HREF='/assets/css/site.css';
  const JS_SRC='/assets/js/site.js';

  const ensureCssLoaded=(href)=>{
    // avoid duplicates
    const links=[...document.querySelectorAll('link[rel="stylesheet"]')];
    if(links.some(l=>(l.getAttribute('href')||'')===href)) return;

    const link=document.createElement('link');
    link.rel='stylesheet';
    link.href=href;
    document.head.appendChild(link);
  };

  const ensureJsLoaded=(src)=>{
    // avoid duplicates
    const scripts=[...document.querySelectorAll('script[src]')];
    if(scripts.some(s=>(s.getAttribute('src')||'')===src)) return;

    const script=document.createElement('script');
    script.src=src;
    // keep CSP compliance: no inline code, no dynamic eval
    // (type/module left unspecified to match server-delivered asset)
    document.head.appendChild(script);
  };

  // Load required assets
  ensureCssLoaded(CSS_HREF);
  ensureJsLoaded(JS_SRC);

})();
