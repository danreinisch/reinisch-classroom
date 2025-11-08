// Portal C UI Components
// Saved views, advanced filters, risk indicators, rollups, and PDF export UI

import { getFeatureFlag } from './feature-flags.js';
import { db } from './data-adapter.js';
import {
  computeRiskBadge,
  RiskBadge,
  applyAdvancedFilters,
  calculateDashboardSummary,
  calculateWeekOverWeekTrend,
  calculateAverageScoreTrend,
  aggregateByGranularity,
  Granularity,
  getSparklineDataFromBuckets,
  exportToCSV,
  createPDFMetadata,
  PortalCConstants
} from './portal-c-helpers.js';

/**
 * Render Saved Views Dropdown
 * @param {string} userCode - Student code
 * @param {HTMLElement} container - Container element
 * @param {Function} onSelect - Callback when view selected
 */
export async function renderSavedViewsDropdown(userCode, container, onSelect) {
  if (!getFeatureFlag('portalSavedViews')) {
    container.style.display = 'none';
    return;
  }
  
  container.innerHTML = '';
  
  // Fetch saved views
  const views = await db.listPortalSavedViews(userCode, 'assignments');
  
  // Create dropdown wrapper
  const wrapper = document.createElement('div');
  wrapper.className = 'saved-views-dropdown';
  wrapper.innerHTML = `
    <div class="saved-views-header">
      <label for="saved-view-select">Saved Views</label>
      <select id="saved-view-select" class="saved-view-select">
        <option value="">-- Select a view --</option>
        ${views.map(v => `<option value="${v.id}">${v.name}</option>`).join('')}
      </select>
    </div>
    <div class="saved-views-actions">
      <button class="btn small" id="save-view-btn">💾 Save Current</button>
      <button class="btn small" id="update-view-btn" disabled>✏️ Update</button>
      <button class="btn small" id="delete-view-btn" disabled>🗑️ Delete</button>
    </div>
  `;
  
  container.appendChild(wrapper);
  
  // Event handlers
  const select = wrapper.querySelector('#saved-view-select');
  const saveBtn = wrapper.querySelector('#save-view-btn');
  const updateBtn = wrapper.querySelector('#update-view-btn');
  const deleteBtn = wrapper.querySelector('#delete-view-btn');
  
  let currentViewId = null;
  
  select.addEventListener('change', async (e) => {
    const viewId = e.target.value;
    currentViewId = viewId;
    
    updateBtn.disabled = !viewId;
    deleteBtn.disabled = !viewId;
    
    if (viewId) {
      const view = await db.getPortalSavedView(userCode, viewId);
      if (view && onSelect) {
        onSelect(view.config);
      }
    }
  });
  
  saveBtn.addEventListener('click', async () => {
    const name = prompt('Enter a name for this view:');
    if (!name) return;
    
    // Get current config from UI (passed via callback)
    const config = getCurrentConfig(); // This should be provided by caller
    
    try {
      await db.createPortalSavedView(userCode, {
        name,
        view_type: 'assignments',
        config
      });
      
      // Refresh dropdown
      await renderSavedViewsDropdown(userCode, container, onSelect);
      showToast('View saved successfully', 'success');
    } catch (err) {
      console.error('Failed to save view:', err);
      showToast('Failed to save view', 'error');
    }
  });
  
  updateBtn.addEventListener('click', async () => {
    if (!currentViewId) return;
    
    const config = getCurrentConfig();
    
    try {
      await db.updatePortalSavedView(userCode, currentViewId, { config });
      showToast('View updated successfully', 'success');
    } catch (err) {
      console.error('Failed to update view:', err);
      showToast('Failed to update view', 'error');
    }
  });
  
  deleteBtn.addEventListener('click', async () => {
    if (!currentViewId) return;
    
    if (!confirm('Delete this view?')) return;
    
    try {
      await db.deletePortalSavedView(userCode, currentViewId);
      
      // Refresh dropdown
      currentViewId = null;
      await renderSavedViewsDropdown(userCode, container, onSelect);
      showToast('View deleted successfully', 'success');
    } catch (err) {
      console.error('Failed to delete view:', err);
      showToast('Failed to delete view', 'error');
    }
  });
  
  // Restore last used view from localStorage
  const lastUsedViewId = localStorage.getItem(`rc_last_view_${userCode}`);
  if (lastUsedViewId && views.some(v => v.id === lastUsedViewId)) {
    select.value = lastUsedViewId;
    select.dispatchEvent(new Event('change'));
  }
}

/**
 * Render Advanced Filters Drawer
 * @param {HTMLElement} container - Container element
 * @param {Object} currentFilters - Current filter state
 * @param {Function} onApply - Callback when filters applied
 */
export function renderAdvancedFiltersDrawer(container, currentFilters = {}, onApply) {
  if (!getFeatureFlag('portalAdvancedFilters')) {
    container.style.display = 'none';
    return;
  }
  
  container.innerHTML = '';
  
  const drawer = document.createElement('div');
  drawer.className = 'filter-drawer';
  drawer.innerHTML = `
    <div class="filter-drawer-header">
      <h3>Advanced Filters</h3>
      <button class="btn-close" aria-label="Close filters">✕</button>
    </div>
    <div class="filter-drawer-body">
      <!-- Score Range Filter -->
      <div class="filter-section">
        <h4>Score Range</h4>
        <div class="filter-row">
          <label>Min: <input type="number" id="score-min" min="0" max="100" value="${currentFilters.scoreMin ?? ''}" placeholder="0"></label>
          <label>Max: <input type="number" id="score-max" min="0" max="100" value="${currentFilters.scoreMax ?? ''}" placeholder="100"></label>
        </div>
      </div>
      
      <!-- Recency Filter -->
      <div class="filter-section">
        <h4>Recency</h4>
        <div class="filter-row">
          <label>
            <select id="recency-type">
              <option value="">-- Select --</option>
              <option value="graded" ${currentFilters.recencyType === 'graded' ? 'selected' : ''}>Graded</option>
              <option value="submitted" ${currentFilters.recencyType === 'submitted' ? 'selected' : ''}>Submitted</option>
            </select>
          </label>
          <label>
            within last
            <input type="number" id="recency-days" min="1" value="${currentFilters.recencyDays ?? ''}" placeholder="7">
            days
          </label>
        </div>
      </div>
      
      <!-- Source/Type Filter -->
      <div class="filter-section">
        <h4>Assignment Type</h4>
        <div class="filter-checkboxes">
          <label><input type="checkbox" id="type-standard" value="standard" ${currentFilters.types?.includes('standard') ? 'checked' : ''}> Standard</label>
          <label><input type="checkbox" id="type-practice" value="practice" ${currentFilters.types?.includes('practice') ? 'checked' : ''}> Practice</label>
          <label><input type="checkbox" id="type-project" value="project" ${currentFilters.types?.includes('project') ? 'checked' : ''}> Project</label>
        </div>
      </div>
      
      <!-- Overdue Streak Filter -->
      <div class="filter-section">
        <h4>Overdue Streak</h4>
        <label>
          Missing for at least
          <input type="number" id="overdue-days" min="1" value="${currentFilters.overdueDays ?? ''}" placeholder="4">
          days
        </label>
      </div>
    </div>
    <div class="filter-drawer-footer">
      <button class="btn small" id="clear-filters-btn">Clear All</button>
      <button class="btn small primary" id="apply-filters-btn">Apply Filters</button>
    </div>
  `;
  
  container.appendChild(drawer);
  
  // Event handlers
  const closeBtn = drawer.querySelector('.btn-close');
  const applyBtn = drawer.querySelector('#apply-filters-btn');
  const clearBtn = drawer.querySelector('#clear-filters-btn');
  
  closeBtn.addEventListener('click', () => {
    drawer.classList.remove('open');
  });
  
  applyBtn.addEventListener('click', () => {
    const filters = {
      scoreMin: parseFloat(drawer.querySelector('#score-min').value) || null,
      scoreMax: parseFloat(drawer.querySelector('#score-max').value) || null,
      recencyType: drawer.querySelector('#recency-type').value || null,
      recencyDays: parseInt(drawer.querySelector('#recency-days').value) || null,
      types: Array.from(drawer.querySelectorAll('.filter-checkboxes input:checked')).map(cb => cb.value),
      overdueDays: parseInt(drawer.querySelector('#overdue-days').value) || null
    };
    
    if (onApply) {
      onApply(filters);
    }
    
    drawer.classList.remove('open');
  });
  
  clearBtn.addEventListener('click', () => {
    drawer.querySelector('#score-min').value = '';
    drawer.querySelector('#score-max').value = '';
    drawer.querySelector('#recency-type').value = '';
    drawer.querySelector('#recency-days').value = '';
    drawer.querySelectorAll('.filter-checkboxes input').forEach(cb => cb.checked = false);
    drawer.querySelector('#overdue-days').value = '';
  });
}

/**
 * Render Risk Badge for an assignment
 * @param {Object} instance - Assignment instance
 * @param {Object} latestSubmission - Latest submission
 * @returns {string} HTML string for risk badge
 */
export function renderRiskBadge(instance, latestSubmission) {
  if (!getFeatureFlag('portalRiskIndicators')) {
    return '';
  }
  
  const risk = computeRiskBadge(instance, latestSubmission);
  
  if (!risk) return '';
  
  const badges = {
    [RiskBadge.MISSING]: '<span class="risk-badge missing" aria-label="Missing assignment">MISSING</span>',
    [RiskBadge.LATE]: '<span class="risk-badge late" aria-label="Late assignment">LATE</span>',
    [RiskBadge.LOW]: '<span class="risk-badge low" aria-label="Low score">LOW</span>'
  };
  
  return badges[risk] || '';
}

/**
 * Render Dashboard Summary Card
 * @param {Object} groupedAssignments - Assignments grouped by status
 * @param {Array} allAssignments - All assignments
 * @param {HTMLElement} container - Container element
 */
export function renderDashboardSummary(groupedAssignments, allAssignments, container) {
  if (!getFeatureFlag('portalRiskIndicators')) {
    container.style.display = 'none';
    return;
  }
  
  const summary = calculateDashboardSummary(groupedAssignments, allAssignments);
  
  container.innerHTML = `
    <div class="dashboard-summary-card">
      <h3>At a Glance</h3>
      <div class="summary-grid">
        <div class="summary-item missing">
          <div class="summary-value">${summary.missing}</div>
          <div class="summary-label">Missing</div>
        </div>
        <div class="summary-item late">
          <div class="summary-value">${summary.late}</div>
          <div class="summary-label">Late</div>
        </div>
        <div class="summary-item low-score">
          <div class="summary-value">${summary.lowScore}</div>
          <div class="summary-label">Low Score</div>
        </div>
        <div class="summary-item improvements">
          <div class="summary-value">${summary.improvements}</div>
          <div class="summary-label">Opportunities</div>
        </div>
      </div>
    </div>
  `;
}

/**
 * Render Trend Insights
 * @param {Array} submissions - All submissions
 * @param {HTMLElement} container - Container element
 */
export function renderTrendInsights(submissions, container) {
  if (!getFeatureFlag('portalRiskIndicators')) {
    container.style.display = 'none';
    return;
  }
  
  const weekTrend = calculateWeekOverWeekTrend(submissions);
  const scoreTrend = calculateAverageScoreTrend(submissions);
  
  const arrows = {
    up: '↗',
    down: '↘',
    flat: '→'
  };
  
  container.innerHTML = `
    <div class="trend-insights">
      <h4>Trends</h4>
      <div class="trend-item">
        <span class="trend-label">Submissions (Last Week):</span>
        <span class="trend-value ${weekTrend.direction}">
          ${weekTrend.lastWeekCount} ${arrows[weekTrend.direction]}
          <span class="trend-delta">(${weekTrend.delta >= 0 ? '+' : ''}${weekTrend.delta} vs prev week)</span>
        </span>
      </div>
      <div class="trend-item">
        <span class="trend-label">Average Score:</span>
        <span class="trend-value ${scoreTrend.direction}">
          ${scoreTrend.currentAvg.toFixed(1)}% ${arrows[scoreTrend.direction]}
          <span class="trend-delta">(${scoreTrend.delta >= 0 ? '+' : ''}${scoreTrend.delta.toFixed(1)}%)</span>
        </span>
      </div>
    </div>
  `;
}

/**
 * Render Rollup Toggle
 * @param {HTMLElement} container - Container element
 * @param {string} currentGranularity - Current granularity
 * @param {Function} onChange - Callback when granularity changes
 */
export function renderRollupToggle(container, currentGranularity = Granularity.DAILY, onChange) {
  if (!getFeatureFlag('portalRollups')) {
    container.style.display = 'none';
    return;
  }
  
  container.innerHTML = `
    <div class="rollup-toggle">
      <label>View by:</label>
      <div class="btn-group" role="group" aria-label="Granularity selection">
        <button class="btn small ${currentGranularity === Granularity.DAILY ? 'active' : ''}" data-granularity="${Granularity.DAILY}">Daily</button>
        <button class="btn small ${currentGranularity === Granularity.WEEKLY ? 'active' : ''}" data-granularity="${Granularity.WEEKLY}">Weekly</button>
        <button class="btn small ${currentGranularity === Granularity.MONTHLY ? 'active' : ''}" data-granularity="${Granularity.MONTHLY}">Monthly</button>
      </div>
    </div>
  `;
  
  container.querySelectorAll('.btn-group button').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const granularity = e.target.dataset.granularity;
      
      // Update active state
      container.querySelectorAll('.btn-group button').forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      
      if (onChange) {
        onChange(granularity);
      }
    });
  });
}

/**
 * Render Sparkline/Bar Strip
 * @param {Array} submissions - All graded submissions
 * @param {string} granularity - Current granularity
 * @param {HTMLElement} container - Container element
 */
export function renderSparkline(submissions, granularity, container) {
  if (!getFeatureFlag('portalRollups')) {
    container.style.display = 'none';
    return;
  }
  
  const buckets = aggregateByGranularity(submissions, granularity, 8);
  const sparklineData = getSparklineDataFromBuckets(buckets);
  
  const maxValue = Math.max(...sparklineData.map(d => d.value), 1);
  
  container.innerHTML = `
    <div class="sparkline-container">
      <div class="sparkline">
        ${sparklineData.map((d, i) => {
          const height = (d.value / maxValue) * 100;
          return `
            <div class="sparkline-bar" style="height: ${height}%" title="${d.label}: ${d.value.toFixed(1)}%">
              <span class="sparkline-value">${d.value > 0 ? d.value.toFixed(0) : ''}</span>
            </div>
          `;
        }).join('')}
      </div>
      <div class="sparkline-labels">
        ${sparklineData.map(d => `<span class="sparkline-label">${d.label}</span>`).join('')}
      </div>
    </div>
  `;
}

/**
 * Export to PDF
 * @param {string} studentName - Student name
 * @param {string} studentCode - Student code
 * @param {Array} assignments - Assignments to export
 * @param {Object} filters - Applied filters
 * @param {string} granularity - Current granularity
 */
export async function exportToPDF(studentName, studentCode, assignments, filters, granularity) {
  if (!getFeatureFlag('portalPdfExport')) {
    alert('PDF export is not enabled');
    return;
  }
  
  // For now, export as CSV (PDF library integration would be added later)
  const csv = exportToCSV(assignments, filters, granularity);
  const metadata = createPDFMetadata(studentName, studentCode, filters, granularity);
  
  // Create downloadable CSV file
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${studentCode}_assignments_${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  
  console.log('PDF metadata:', metadata);
  // TODO: Integrate jsPDF library for actual PDF generation
}

/**
 * Helper to show toast notifications
 */
function showToast(message, type = 'info') {
  // This should integrate with existing toast system from Portal B
  console.log(`[Toast ${type}]: ${message}`);
  // TODO: Implement actual toast UI
}

/**
 * Helper to get current config (placeholder - should be implemented by caller)
 */
function getCurrentConfig() {
  // This should be provided by the caller context
  return {};
}
