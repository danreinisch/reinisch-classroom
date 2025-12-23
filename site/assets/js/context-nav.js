/**
 * Context Navigation - Right Sidebar Hierarchical Navigation
 * Phase 302D: Provides context-driven navigation based on current route
 * Builds navigation for Language Arts, Life Skills, Toolkits, Math Toolkit
 * All items open via canonical /viewer/?src=...&return=... pattern
 */

(function () {
  'use strict';

  // State
  let currentSection = null;

  /**
   * Initialize context navigation
   */
  function initContextNav() {
    // Check if context nav should be enabled for this page
    if (!shouldEnableContextNav()) {
      return;
    }

    // Detect current section
    currentSection = detectSection();
    if (!currentSection) {
      console.log('[context-nav] No section detected for this page');
      return;
    }

    console.log('[context-nav] Initializing for section:', currentSection);

    // Create and inject context nav UI
    createContextNavUI();

    // Add body class for layout adjustment
    document.body.classList.add('has-context-nav');

    // Setup event handlers
    setupEventHandlers();

    // Load and render content based on section
    loadContextData();
  }

  /**
   * Check if context nav should be enabled for current page
   */
  function shouldEnableContextNav() {
    const path = window.location.pathname;
    
    // Enable for these paths
    const enablePaths = [
      '/language-arts/',
      '/life-skills/',
      '/language-arts/toolkit/',
      '/math-toolkit/',
      '/language-arts/a-door-into-time/',
      '/language-arts/return-from-kragdon-ah/',
      '/language-arts/assignment-hub/'
    ];

    return enablePaths.some(p => path.startsWith(p));
  }

  /**
   * Detect current section from URL
   */
  function detectSection() {
    const path = window.location.pathname;

    if (path.startsWith('/language-arts/toolkit/')) {
      return 'language-arts-toolkit';
    }
    if (path.startsWith('/language-arts/a-door-into-time/')) {
      return 'language-arts-adit';
    }
    if (path.startsWith('/language-arts/return-from-kragdon-ah/')) {
      return 'language-arts-rfk';
    }
    if (path.startsWith('/language-arts/assignment-hub/')) {
      return 'language-arts-ah';
    }
    if (path.startsWith('/language-arts/')) {
      return 'language-arts';
    }
    if (path.startsWith('/life-skills/')) {
      return 'life-skills';
    }
    if (path.startsWith('/math-toolkit/')) {
      return 'math-toolkit';
    }

    return null;
  }

  /**
   * Create context nav UI structure
   */
  function createContextNavUI() {
    const rail = document.createElement('nav');
    rail.className = 'context-nav-rail';
    rail.setAttribute('aria-label', 'Context navigation');

    rail.innerHTML = `
      <div class="context-nav-header">
        <div class="context-nav-title">Quick Access</div>
        <div class="context-nav-subtitle">Navigate within this section</div>
      </div>
      <div class="context-nav-content">
        <div class="context-nav-loading">Loading...</div>
      </div>
    `;

    document.body.appendChild(rail);

    // Create mobile toggle button
    const toggle = document.createElement('button');
    toggle.className = 'context-nav-toggle';
    toggle.setAttribute('aria-label', 'Toggle context navigation');
    toggle.innerHTML = '<span class="context-nav-toggle-icon">☰</span>';
    document.body.appendChild(toggle);
  }

  /**
   * Setup event handlers
   */
  function setupEventHandlers() {
    const rail = document.querySelector('.context-nav-rail');
    const toggle = document.querySelector('.context-nav-toggle');

    if (!rail) return;

    // Mobile toggle handler
    if (toggle) {
      toggle.addEventListener('click', () => {
        rail.classList.toggle('open');
      });
    }

    // Close on outside click (mobile)
    document.addEventListener('click', (e) => {
      if (window.innerWidth > 1024) return;
      
      if (!rail.contains(e.target) && (!toggle || !toggle.contains(e.target))) {
        rail.classList.remove('open');
      }
    });

    // Handle item clicks (delegate to content area)
    rail.addEventListener('click', (e) => {
      const item = e.target.closest('.context-nav-item');
      if (!item) return;

      const srcPath = item.dataset.src;
      if (!srcPath) {
        console.warn('[context-nav] Item has no src path');
        return;
      }

      // Use canonical viewer launch pattern via open-in-viewer.js helper
      if (typeof window.openInViewer === 'function') {
        const returnUrl = window.location.pathname + window.location.search;
        window.openInViewer(srcPath, { 
          return: returnUrl,
          title: item.dataset.title || ''
        });
      } else {
        console.error('[context-nav] openInViewer not available');
      }
    });
  }

  /**
   * Load context data based on section
   */
  async function loadContextData() {
    try {
      if (currentSection === 'language-arts') {
        await loadLanguageArtsUnits();
      } else if (currentSection.startsWith('language-arts-')) {
        // Specific unit page
        await loadLanguageArtsUnit(currentSection);
      } else if (currentSection === 'life-skills') {
        await loadLifeSkillsPresentations();
      } else if (currentSection === 'language-arts-toolkit') {
        await loadLanguageArtsToolkit();
      } else if (currentSection === 'math-toolkit') {
        await loadMathToolkit();
      } else {
        renderEmpty('No navigation items available');
      }
    } catch (err) {
      console.error('[context-nav] Error loading data:', err);
      renderEmpty('Failed to load navigation');
    }
  }

  /**
   * Load Language Arts units overview
   */
  async function loadLanguageArtsUnits() {
    const units = [
      {
        id: 'adit',
        name: 'A Door Into Time',
        path: '/language-arts/a-door-into-time/'
      },
      {
        id: 'rfk',
        name: 'Return from Kragdon-Ah',
        path: '/language-arts/return-from-kragdon-ah/'
      },
      {
        id: 'ah',
        name: 'Assignment Hub',
        path: '/language-arts/assignment-hub/'
      }
    ];

    renderUnitsOverview(units);
  }

  /**
   * Load specific Language Arts unit presentations
   */
  async function loadLanguageArtsUnit(_section) {
    // Try to load from unit grid data or parse from page
    const presentations = await extractPresentationsFromPage();
    
    if (presentations && presentations.length > 0) {
      renderPresentations(presentations);
    } else {
      renderEmpty('No presentations available');
    }
  }

  /**
   * Extract presentations from current page's unit grid
   */
  async function extractPresentationsFromPage() {
    // Wait a bit for unit-grid.js to populate the page
    await new Promise(resolve => setTimeout(resolve, 500));

    const presentations = [];
    const gridElement = document.getElementById('grid');
    
    if (!gridElement) {
      console.log('[context-nav] No grid element found');
      return presentations;
    }

    // Look for presentation cards/links
    const cards = gridElement.querySelectorAll('.card, [data-src]');
    
    cards.forEach((card) => {
      const srcPath = card.dataset.src || card.getAttribute('href');
      const title = card.querySelector('.t, .title')?.textContent?.trim() || 
                    card.textContent?.trim() || 
                    'Untitled';
      
      if (srcPath && srcPath.startsWith('/')) {
        presentations.push({
          id: presentations.length + 1,
          name: title,
          src: srcPath
        });
      }
    });

    console.log('[context-nav] Extracted', presentations.length, 'presentations from page');
    return presentations;
  }

  /**
   * Load Life Skills presentations
   */
  async function loadLifeSkillsPresentations() {
    const presentations = await extractPresentationsFromPage();
    
    if (presentations && presentations.length > 0) {
      renderPresentations(presentations);
    } else {
      renderEmpty('No presentations available');
    }
  }

  /**
   * Load Language Arts Toolkit modules
   */
  async function loadLanguageArtsToolkit() {
    const presentations = await extractPresentationsFromPage();
    
    if (presentations && presentations.length > 0) {
      renderPresentations(presentations, 'Toolkit Modules');
    } else {
      renderEmpty('No toolkit modules available');
    }
  }

  /**
   * Load Math Toolkit modules
   */
  async function loadMathToolkit() {
    // Wait for math-toolkit-loader.js to populate modules
    await new Promise(resolve => setTimeout(resolve, 800));

    const modules = [];
    const modulesContainer = document.getElementById('modules');
    
    if (!modulesContainer) {
      renderEmpty('No modules available');
      return;
    }

    // Look for module cards
    const cards = modulesContainer.querySelectorAll('.card-link');
    
    cards.forEach((link) => {
      const title = link.querySelector('.desc')?.textContent?.trim() || 'Untitled Module';
      const href = link.getAttribute('href');
      
      if (href && href.startsWith('/')) {
        modules.push({
          id: modules.length + 1,
          name: title,
          src: href
        });
      }
    });

    if (modules.length > 0) {
      renderPresentations(modules, 'Math Modules');
    } else {
      renderEmpty('No modules available yet');
    }
  }

  /**
   * Render units overview (for language arts index)
   */
  function renderUnitsOverview(units) {
    const content = document.querySelector('.context-nav-content');
    if (!content) return;

    content.innerHTML = '';

    const section = document.createElement('div');
    section.className = 'context-nav-section';

    const title = document.createElement('div');
    title.className = 'context-nav-section-title';
    title.textContent = 'Units';
    section.appendChild(title);

    const items = document.createElement('div');
    items.className = 'context-nav-items';

    units.forEach(unit => {
      const link = document.createElement('a');
      link.className = 'context-nav-item';
      link.href = unit.path;
      link.innerHTML = `
        <span class="context-nav-item-icon">📚</span>
        <span class="context-nav-item-label">${escapeHtml(unit.name)}</span>
      `;
      items.appendChild(link);
    });

    section.appendChild(items);
    content.appendChild(section);
  }

  /**
   * Render presentations/modules list
   */
  function renderPresentations(presentations, sectionTitle = 'Presentations') {
    const content = document.querySelector('.context-nav-content');
    if (!content) return;

    content.innerHTML = '';

    const section = document.createElement('div');
    section.className = 'context-nav-section';

    const title = document.createElement('div');
    title.className = 'context-nav-section-title';
    title.textContent = sectionTitle;
    section.appendChild(title);

    const items = document.createElement('div');
    items.className = 'context-nav-items';

    presentations.forEach(pres => {
      const item = document.createElement('button');
      item.className = 'context-nav-item';
      item.dataset.src = pres.src;
      item.dataset.title = pres.name;
      item.innerHTML = `
        <span class="context-nav-item-icon">▶</span>
        <span class="context-nav-item-label">${escapeHtml(pres.name)}</span>
      `;
      items.appendChild(item);
    });

    section.appendChild(items);
    content.appendChild(section);
  }

  /**
   * Render empty state
   */
  function renderEmpty(message) {
    const content = document.querySelector('.context-nav-content');
    if (!content) return;

    content.innerHTML = `
      <div class="context-nav-empty">${escapeHtml(message)}</div>
    `;
  }

  /**
   * Escape HTML to prevent XSS
   */
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Public API
   */
  window.ContextNav = {
    init: initContextNav,
    refresh: loadContextData
  };

  // Auto-initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initContextNav);
  } else {
    initContextNav();
  }
})();
