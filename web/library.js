// library.js - Helper module for loading Admin Library content

/**
 * Fetch JSON from a path with cache: 'no-store'
 * @param {string} path - Path to JSON file
 * @returns {Promise<Object>} Parsed JSON object
 */
export async function fetchJSON(path) {
  const response = await fetch(path, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Failed to fetch ${path}: ${response.status} ${response.statusText}`);
  }
  return await response.json();
}

/**
 * Resolve path relative to current page location
 * If we're in /prototypes/, prefix '../' to reach repo root
 * @param {string} path - Repo-relative path
 * @returns {string} Resolved path
 */
function resolvePath(path) {
  if (location.pathname.includes('/prototypes/')) {
    return '../' + path;
  }
  return path;
}

/**
 * Load presentations from a root directory
 * @param {string} rootDir - Root directory path (e.g., 'REINISCHCLASSROOM P U B L I S H E R/LANGUAGE ARTS/A Door Into Time ')
 * @returns {Promise<Array>} Array of presentation items with normalized fields
 */
export async function listPresentations(rootDir) {
  // Ensure rootDir ends with /
  if (!rootDir.endsWith('/')) {
    rootDir += '/';
  }
  
  const jsonPath = resolvePath(rootDir + 'presentations.json');
  const data = await fetchJSON(jsonPath);
  
  // Normalize items with all expected fields
  const series = data.series || 'Presentations';
  const items = (data.items || []).map(item => ({
    week: item.week || null,
    title: item.title || '',
    date: item.date || '',
    slug: item.slug || '',
    summary: item.summary || '',
    page: item.page || '',
    hero: item.hero || '',
    images: item.images || [],
    series: series
  }));
  
  return items;
}

/**
 * List library items by type
 * Extensible structure for future module types
 * @param {Object} options
 * @param {string} options.type - Type of library items (e.g., 'presentations')
 * @param {string} options.root - Root directory path
 * @returns {Promise<Array>} Array of library items
 */
export async function listLibraryItems({ type, root }) {
  if (type === 'presentations') {
    return await listPresentations(root);
  }
  
  // Future extension point for other types
  // if (type === 'modules') { return await listModules(root); }
  
  throw new Error(`Unsupported library type: ${type}`);
}
