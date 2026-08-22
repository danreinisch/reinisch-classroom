(function(){
  // ── SVG icon strings (20px sidebar, 18px topbar) ──────────────────────────
  var SVG_ATTRS = 'fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';

  function icon20(body){
    return '<svg width="20" height="20" viewBox="0 0 24 24" '+SVG_ATTRS+'>'+body+'</svg>';
  }
  function icon18(body){
    return '<svg width="18" height="18" viewBox="0 0 24 24" '+SVG_ATTRS+'>'+body+'</svg>';
  }

  var I = {
    home18: icon18('<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline>'),
    menu18: icon18('<line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line>'),
    home:   icon20('<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline>'),
    book:   icon20('<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>'),
    life:   icon20('<path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"></path><path d="M9 18h6"></path><path d="M10 22h4"></path>'),
    calc:   icon20('<rect x="4" y="2" width="16" height="20" rx="2"></rect><line x1="8" y1="6" x2="16" y2="6"></line><line x1="16" y1="14" x2="16" y2="18"></line><path d="M16 10h.01"></path><path d="M12 10h.01"></path><path d="M8 10h.01"></path><path d="M12 14h.01"></path><path d="M8 14h.01"></path><path d="M12 18h.01"></path><path d="M8 18h.01"></path>'),
    resources: icon20('<path d="M3 6a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><path d="M8 12h8"></path><path d="M8 16h5"></path>'),
    teacher:icon20('<rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><path d="M21 15l-5-5L5 21"></path>'),
    student:icon20('<path d="M22 10v6M2 10l10-5 10 5-10 5z"></path><path d="M6 12v5c3 3 9 3 12 0v-5"></path>'),
    wrench: icon20('<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"></path>'),
    clip:   icon20('<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path><rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect>'),
  };

  // ── Nav configs ────────────────────────────────────────────────────────────
  var MAIN_NAV = [
    { href: '/',                    label: 'Home',                icon: I.home      },
    { href: '/language-arts/',      label: 'Language Arts',       icon: I.book      },
    { href: '/life-skills/',        label: 'Transitional Skills', icon: I.life      },
    { href: '/classroom-resources/',label: 'Classroom Resources', icon: I.resources },
    { href: '/toolkits/',           label: 'Toolkits',            icon: I.wrench    },
    { href: '/teacher/',            label: 'Teacher',             icon: I.teacher   },
    { href: '/substitute/',         label: 'Substitute',          icon: I.clip      },
    { href: '/student/',            label: 'Student',             icon: I.student   },
  ];

  var LA_NAV = [
    { href: '/',                       label: 'Home',                icon: I.home      },
    { href: '/language-arts/',         label: 'Language Arts',       icon: I.book      },
    { href: '/classroom-resources/',   label: 'Classroom Resources', icon: I.resources },
    { href: '/language-arts/toolkit/', label: 'Toolkit',             icon: I.wrench    },
    { href: '/toolkits/',              label: 'All Toolkits',        icon: I.wrench    },
  ];

  function activeLanguageArtsCollections(units){
    return (units || [])
      .filter(function(unit){
        return unit &&
          unit.section === 'language-arts' &&
          unit.id !== 'toolkit' &&
          (unit.status || 'active') === 'active';
      })
      .sort(function(a, b){
        var aOrder = Number.isFinite(Number(a.sortOrder)) ? Number(a.sortOrder) : 0;
        var bOrder = Number.isFinite(Number(b.sortOrder)) ? Number(b.sortOrder) : 0;
        if (aOrder !== bOrder) return aOrder - bOrder;
        return String(a.title || '').localeCompare(String(b.title || ''));
      });
  }

  function collectionHref(unit){
    var path = String(unit && unit.pagePath || '').trim();

    if (path === '/language-arts/collection/') {
      return path + '?collection=' + encodeURIComponent(String(unit && unit.id || ''));
    }

    return path || '/language-arts/';
  }

  async function appendLanguageArtsCollections(){
    if (!location.pathname.startsWith('/language-arts/')) return;

    var nav = document.querySelector('.tc-sidebar .tc-nav');
    if (!nav || nav.querySelector('[data-collection-nav="true"]')) return;

    try {
      var response = await fetch('/assets/data/units.json?t=' + Date.now(), {
        cache: 'no-store'
      });
      if (!response.ok) return;

      var data = await response.json();
      var collections = activeLanguageArtsCollections(
        Array.isArray(data.units) ? data.units : []
      );

      var insertBefore = nav.querySelector('a[data-href="/toolkits/"]');

      collections.forEach(function(unit){
        var href = collectionHref(unit);
        var html =
          '<a href="' + esc(href) + '" data-href="' + esc(href) + '"' +
          ' data-collection-nav="true">' +
          '<span class="tc-icon">' + I.book + '</span>' +
          '<span class="tc-label">' + esc(unit.title || unit.id) + '</span>' +
          '</a>';

        if (insertBefore) {
          insertBefore.insertAdjacentHTML('beforebegin', html);
        } else {
          nav.insertAdjacentHTML('beforeend', html);
        }
      });
    } catch (_) {
      // Keep base navigation available if the registry cannot be loaded.
    }
  }

  function injectClassroomResourcesSpotlight(){
    if (location.pathname !== '/' && location.pathname !== '/index.html') return;
    if (document.getElementById('home-classroom-resources-feature')) return;

    var ticker = document.querySelector('.ticker-bar');
    if (!ticker) return;

    if (!document.getElementById('home-classroom-resources-feature-style')) {
      var style = document.createElement('style');
      style.id = 'home-classroom-resources-feature-style';
      style.textContent =
        '.home-classroom-resource{display:grid;grid-template-columns:auto 1fr auto;gap:16px;align-items:center;margin:18px 0 8px;padding:16px 18px;border-radius:15px;border:1px solid rgba(45,212,191,.22);border-left:3px solid rgba(45,212,191,.72);background:linear-gradient(100deg,rgba(45,212,191,.075),rgba(96,165,250,.035));color:inherit;text-decoration:none;transition:transform .18s ease,border-color .18s ease,background .18s ease;}' +
        '.home-classroom-resource:hover,.home-classroom-resource:focus-visible{transform:translateY(-2px);border-color:rgba(45,212,191,.48);background:linear-gradient(100deg,rgba(45,212,191,.12),rgba(96,165,250,.06));outline:none;}' +
        '.home-classroom-resource-icon{display:grid;place-items:center;width:42px;height:42px;border-radius:12px;background:rgba(45,212,191,.10);color:#5eead4;}' +
        '.home-classroom-resource-kicker{font-size:.66rem;font-weight:800;letter-spacing:.09em;text-transform:uppercase;color:rgba(94,234,212,.9);margin-bottom:3px;}' +
        '.home-classroom-resource-title{font-size:1rem;font-weight:800;color:var(--rc-ink);}' +
        '.home-classroom-resource-desc{font-size:.82rem;color:var(--rc-ink-dim);margin-top:2px;}' +
        '.home-classroom-resource-action{white-space:nowrap;font-size:.84rem;font-weight:750;color:rgba(147,197,253,.95);}' +
        '@media(max-width:700px){.home-classroom-resource{grid-template-columns:auto 1fr}.home-classroom-resource-action{grid-column:2;white-space:normal}.home-classroom-resource-desc{display:none}}';
      document.head.appendChild(style);
    }

    var feature = document.createElement('a');
    feature.id = 'home-classroom-resources-feature';
    feature.className = 'home-classroom-resource';
    feature.href = '/classroom-resources/classroom-playbook/';
    feature.innerHTML =
      '<span class="home-classroom-resource-icon" aria-hidden="true">' + I.resources + '</span>' +
      '<span><span class="home-classroom-resource-kicker">Featured Classroom Resource</span>' +
      '<span class="home-classroom-resource-title">The Classroom Playbook</span>' +
      '<span class="home-classroom-resource-desc">Expectations, routines, technology, help, resets — and what to do when things go sideways.</span></span>' +
      '<span class="home-classroom-resource-action">Launch Presentation →</span>';

    ticker.insertAdjacentElement('afterend', feature);
  }

  // ── Helpers ────────────────────────────────────────────────────────────────
  function esc(s){
    return String(s)
      .replace(/&/g,'&amp;')
      .replace(/</g,'&lt;')
      .replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;');
  }

  function chooseNav(){
    return location.pathname.startsWith('/language-arts/') ? LA_NAV : MAIN_NAV;
  }

  function buildNavItem(item){
    return '<a href="'+esc(item.href)+'" data-href="'+esc(item.href)+'">'
      +'<span class="tc-icon">'+item.icon+'</span>'
      +'<span class="tc-label">'+esc(item.label)+'</span>'
      +'</a>';
  }

  function getTitle(app){
    var t = app.getAttribute('data-page-title');
    if(t) return t;
    var raw = document.title || '';
    return raw.split(/\s*[–—|]\s*/)[0].trim() || 'Reinisch Classroom';
  }

  function buildTopbar(title){
    return '<header class="tc-topbar">'
      +'<button class="tc-btn" id="tcSidebarToggle" aria-label="Toggle sidebar" aria-expanded="false">'+I.menu18+'</button>'
      +'<a class="tc-btn" href="/" aria-label="Home">'+I.home18+'</a>'
      +'<div class="tc-title">'+esc(title)+'</div>'
      +'</header>';
  }

  function buildSidebar(navItems){
    return '<aside class="tc-sidebar" aria-label="Navigation">'
      +'<nav class="tc-nav">'
      +navItems.map(buildNavItem).join('')
      +'</nav>'
      +'</aside>';
  }

  // ── Inject ─────────────────────────────────────────────────────────────────
  function inject(){
    var app = document.querySelector('.tc-app');
    if(!app) return;

    var navItems = chooseNav();
    var title    = getTitle(app);
    var topbarHTML  = buildTopbar(title);
    var sidebarHTML = buildSidebar(navItems);

    var existingTopbar  = app.querySelector('header.tc-topbar');
    var shell           = app.querySelector('.tc-shell');
    var existingSidebar = shell ? shell.querySelector('aside.tc-sidebar') : null;

    if(existingTopbar){
      existingTopbar.outerHTML = topbarHTML;
    } else {
      app.insertAdjacentHTML('afterbegin', topbarHTML);
    }

    if(existingSidebar){
      // Don't overwrite sidebars that have custom data-tab navigation (e.g., Student Portal)
      var hasCustomTabs = existingSidebar.querySelector('[data-tab]');
      if(!hasCustomTabs){
        existingSidebar.outerHTML = sidebarHTML;
      }
    } else if(shell){
      shell.insertAdjacentHTML('afterbegin', sidebarHTML);
    }
    setTimeout(function() {
      document.dispatchEvent(new CustomEvent('rc-nav-ready'));
    }, 0);

    appendLanguageArtsCollections();
    injectClassroomResourcesSpotlight();
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', inject);
  } else {
    inject();
  }
})();
