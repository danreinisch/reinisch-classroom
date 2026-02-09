// ============================================================================
// IEP Progress Grid V2 (Phases 2-5)
// ============================================================================
// Spreadsheet-like grid with:
// - Multi-quarter selection
// - Column virtualization for horizontal scrolling
// - Collapsible goal-area grouping
// - Enhanced filtering and search
// - Baseline, Current, Delta, Trend metrics
// - CSV export
// - Inline editing (Phase 4)
// - Bulk add modal (Phase 4)
// - Assignment-goal mapping (Phase 5)
// - Realtime refresh (Phase 5)
// ============================================================================

import { getFeatureFlag } from './feature-flags.js';
import { isRealtimeDisabled } from './runtime-config.js';

export class ProgressGridV2 {
  constructor(dataAdapter, options = {}) {
    this.db = dataAdapter;
    this.options = {
      trendThreshold: options.trendThreshold || 5, // percentage points
      columnBufferSize: options.columnBufferSize || 5, // extra columns to render
      debounceMs: options.debounceMs || 300,
      teacherEmail: options.teacherEmail || 'teacher@example.com', // For collected_by
      userId: options.userId || 'default_user', // Phase 6-8: For saved views
      // Phase 6-8: Risk indicator thresholds (configurable)
      riskThresholds: {
        missingDataDaysRed: 14,
        missingDataDaysAmber: 7,
        belowTargetRed: 10, // percentage points
        belowTargetAmber: 10, // percentage points
        negativeTrendPoints: 3 // number of consecutive points
      },
      ...options
    };
    
    // State
    this.filters = {
      studentCodes: [],
      classCodes: [],
      goalAreas: [],
      quarters: [], // Empty means current quarter
      dateRange: { start: null, end: null },
      searchText: '',
      // Phase 6-8: Advanced filters
      valueRange: { min: null, max: null }, // Current value filter
      sources: [], // 'manual', 'assignment', 'import'
      caseManagers: [],
      teachers: [],
      dataRecencyDays: null // Filter for recency (e.g., has data in last N days)
    };
    
    this.sorting = {
      field: 'student_code',
      direction: 'asc'
    };
    
    this.collapsedAreas = new Set(); // Track collapsed goal areas
    this.virtualColumns = {
      offset: 0,
      count: 15 // Initial visible columns
    };
    
    // Phase 6-8: Granularity for rollups
    this.granularity = 'daily'; // 'daily', 'weekly', 'monthly'
    
    // Phase 6-8: Saved views
    this.savedViews = [];
    this.currentViewId = null;
    this.currentViewName = null;
    
    // Phase 6-8: Visible columns (for customization)
    this.visibleColumns = {
      student: true,
      goalCode: true,
      goalDesc: true,
      class: true,
      baseline: true,
      current: true,
      delta: true,
      trend: true,
      risk: false, // Phase 6-8
      lastDataAge: false, // Phase 6-8
      deltaVsTarget: false, // Phase 6-8
      quarterAvgs: true,
      dates: true
    };
    
    // Data cache
    this.rawData = [];
    this.quarterAverages = [];
    this.processedData = null;
    
    // Phase 6-8: Query cache for performance
    this.queryCache = new Map(); // keyed by filter hash
    this.maxCacheSize = 10;
    
    // Debounce timer
    this.debounceTimer = null;
    
    // Phase 4-5: Editing state
    this.editingCell = null; // { student_code, goal_code, date }
    this.bulkModalOpen = false;
    this.pendingBulkRows = [];
    
    // Phase 5: Realtime
    this.realtimeChannel = null;
    this.realtimeActive = false;
    this.realtimeDebounceTimer = null;
    
    // Bind methods
    this.render = this.render.bind(this);
    this.refresh = this.refresh.bind(this);
    this.exportCSV = this.exportCSV.bind(this);
    this.handleCellClick = this.handleCellClick.bind(this);
    this.handleCellEdit = this.handleCellEdit.bind(this);
  }
  
  // ========================================================================
  // Quarter Logic (Academic Year: Q1=Jul-Sep, Q2=Oct-Dec, Q3=Jan-Mar, Q4=Apr-Jun)
  // ========================================================================
  
  getCurrentQuarter() {
    const now = new Date();
    const month = now.getMonth() + 1; // 1-12
    const day = now.getDate();
    
    // Q1: August 1 - October 18
    if (month === 8 || month === 9 || (month === 10 && day <= 18)) return 'Q1';
    
    // Q2: October 19 - January 18
    if ((month === 10 && day >= 19) || month === 11 || month === 12 || (month === 1 && day <= 18)) return 'Q2';
    
    // Q3: January 19 - March 18
    if ((month === 1 && day >= 19) || month === 2 || (month === 3 && day <= 18)) return 'Q3';
    
    // Q4: March 19 - May 31 (including summer)
    if ((month === 3 && day >= 19) || month === 4 || month === 5 || month === 6 || month === 7) return 'Q4';
    
    return 'Q1'; // default
  }
  
  getQuarterDateRange(quarter) {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    
    // Determine school year (August-July)
    const schoolYear = month >= 8 ? year : year - 1;
    
    const ranges = {
      'Q1': { start: `${schoolYear}-08-01`, end: `${schoolYear}-10-18` },
      'Q2': { start: `${schoolYear}-10-19`, end: `${schoolYear + 1}-01-18` },
      'Q3': { start: `${schoolYear + 1}-01-19`, end: `${schoolYear + 1}-03-18` },
      'Q4': { start: `${schoolYear + 1}-03-19`, end: `${schoolYear + 1}-05-31` }
    };
    
    return ranges[quarter] || { start: null, end: null };
  }
  
  getQuarterLabel(quarter) {
    const labels = {
      'Q1': 'Q1 (Aug 1-Oct 18)',
      'Q2': 'Q2 (Oct 19-Jan 18)',
      'Q3': 'Q3 (Jan 19-Mar 18)',
      'Q4': 'Q4 (Mar 19-May 31)'
    };
    return labels[quarter] || quarter;
  }
  
  // ========================================================================
  // Data Fetching
  // ========================================================================
  
  async fetchData() {
    console.log('[ProgressGridV2] Fetching data with filters:', this.filters);
    
    // Determine date range from quarters
    let startDate = null;
    let endDate = null;
    
    if (this.filters.quarters.length > 0) {
      // Get date ranges for all selected quarters
      const ranges = this.filters.quarters.map(q => this.getQuarterDateRange(q));
      startDate = ranges.map(r => r.start).sort()[0];
      endDate = ranges.map(r => r.end).sort().reverse()[0];
    } else {
      // Default to current quarter
      const currentQ = this.getCurrentQuarter();
      const range = this.getQuarterDateRange(currentQ);
      startDate = range.start;
      endDate = range.end;
    }
    
    // Apply custom date range if specified
    if (this.filters.dateRange.start) {
      startDate = this.filters.dateRange.start;
    }
    if (this.filters.dateRange.end) {
      endDate = this.filters.dateRange.end;
    }
    
    try {
      // Fetch progress data
      const progressParams = {
        startDate,
        endDate,
        studentCodes: this.filters.studentCodes.length > 0 ? this.filters.studentCodes : null,
        classCodes: this.filters.classCodes.length > 0 ? this.filters.classCodes : null,
        goalAreas: this.filters.goalAreas.length > 0 ? this.filters.goalAreas : null
      };
      
      this.rawData = await this.db.listGoalProgress(progressParams);
      
      // Fetch quarter averages
      this.quarterAverages = await this.db.listGoalQuarterAverages({});
      
      console.log('[ProgressGridV2] Fetched', this.rawData.length, 'progress rows and', this.quarterAverages.length, 'quarter averages');
      
      return true;
    } catch (err) {
      console.error('[ProgressGridV2] Error fetching data:', err);
      return false;
    }
  }
  
  // ========================================================================
  // Data Processing
  // ========================================================================
  
  processData() {
    console.log('[ProgressGridV2] Processing data...');
    
    let filtered = [...this.rawData];
    
    // Apply search filter
    if (this.filters.searchText) {
      const search = this.filters.searchText.toLowerCase();
      filtered = filtered.filter(row => 
        (row.student_code || '').toLowerCase().includes(search) ||
        (row.student_name || '').toLowerCase().includes(search) ||
        (row.goal_code || '').toLowerCase().includes(search) ||
        (row.goal_desc || '').toLowerCase().includes(search)
      );
    }
    
    // Group by goal area -> student + goal
    const groupedByArea = {};
    const uniqueDates = new Set();
    const goalMetricsMap = {}; // key: student_code|goal_code
    
    filtered.forEach(row => {
      const area = row.goal_area || 'Uncategorized';
      if (!groupedByArea[area]) groupedByArea[area] = {};
      
      const key = `${row.student_code}|${row.goal_code}`;
      if (!groupedByArea[area][key]) {
        groupedByArea[area][key] = {
          student_code: row.student_code,
          student_name: row.student_name,
          goal_code: row.goal_code,
          goal_desc: row.goal_desc,
          goal_area: area,
          class_code: row.class_code,
          target: row.target, // Phase 6-8: Track target for delta vs target
          measurements: {}
        };
      }
      
      groupedByArea[area][key].measurements[row.date] = parseFloat(row.value);
      uniqueDates.add(row.date);
      
      // Track for metrics calculation
      if (!goalMetricsMap[key]) {
        goalMetricsMap[key] = {
          values: [],
          dates: []
        };
      }
      goalMetricsMap[key].values.push(parseFloat(row.value));
      goalMetricsMap[key].dates.push(row.date);
    });
    
    // Calculate metrics for each goal
    Object.keys(goalMetricsMap).forEach(key => {
      const metrics = goalMetricsMap[key];
      
      // Sort by date
      const sorted = metrics.values.map((v, i) => ({
        value: v,
        date: metrics.dates[i]
      })).sort((a, b) => a.date.localeCompare(b.date));
      
      const baseline = sorted.length > 0 ? sorted[0].value : null;
      const current = sorted.length > 0 ? sorted[sorted.length - 1].value : null;
      const delta = (baseline !== null && current !== null) ? (current - baseline) : null;
      
      // Determine trend
      let trend = 'flat';
      if (delta !== null) {
        if (delta >= this.options.trendThreshold) trend = 'up';
        else if (delta <= -this.options.trendThreshold) trend = 'down';
      }
      
      goalMetricsMap[key].baseline = baseline;
      goalMetricsMap[key].current = current;
      goalMetricsMap[key].delta = delta;
      goalMetricsMap[key].trend = trend;
    });
    
    // Phase 6-8: Apply advanced filters after metrics calculation
    if (getFeatureFlag('progressAdvancedFilters')) {
      Object.keys(groupedByArea).forEach(area => {
        const items = Object.values(groupedByArea[area]);
        const filteredItems = this.applyAdvancedFiltersToItems(items, goalMetricsMap);
        
        if (filteredItems.length === 0) {
          delete groupedByArea[area];
        } else {
          groupedByArea[area] = {};
          filteredItems.forEach(item => {
            const key = `${item.student_code}|${item.goal_code}`;
            groupedByArea[area][key] = item;
          });
        }
      });
    }
    
    // Sort dates
    const sortedDates = Array.from(uniqueDates).sort();
    
    // Sort areas alphabetically
    const sortedAreas = Object.keys(groupedByArea).sort();
    
    // Apply sorting within each area
    sortedAreas.forEach(area => {
      const items = Object.values(groupedByArea[area]);
      items.sort((a, b) => {
        const keyA = `${a.student_code}|${a.goal_code}`;
        const keyB = `${b.student_code}|${b.goal_code}`;
        const metricsA = goalMetricsMap[keyA];
        const metricsB = goalMetricsMap[keyB];
        
        switch (this.sorting.field) {
          case 'student_code':
            return this.sorting.direction === 'asc' 
              ? a.student_code.localeCompare(b.student_code)
              : b.student_code.localeCompare(a.student_code);
          
          case 'current': {
            const currA = metricsA?.current || 0;
            const currB = metricsB?.current || 0;
            return this.sorting.direction === 'asc' ? currA - currB : currB - currA;
          }
          
          case 'delta': {
            const deltaA = metricsA?.delta || 0;
            const deltaB = metricsB?.delta || 0;
            return this.sorting.direction === 'asc' ? deltaA - deltaB : deltaB - deltaA;
          }
          
          case 'goal_area':
            return this.sorting.direction === 'asc'
              ? a.goal_area.localeCompare(b.goal_area)
              : b.goal_area.localeCompare(a.goal_area);
          
          default:
            return 0;
        }
      });
      
      groupedByArea[area] = items;
    });
    
    this.processedData = {
      groupedByArea,
      sortedAreas,
      sortedDates,
      goalMetricsMap
    };
    
    console.log('[ProgressGridV2] Processed', sortedAreas.length, 'goal areas with', sortedDates.length, 'unique dates');
  }

  // Phase 6-8: Helper for advanced filters
  applyAdvancedFiltersToItems(items, metricsMap) {
    let filtered = items;
    
    // Value range filter (on current value)
    if (this.filters.valueRange.min != null || this.filters.valueRange.max != null) {
      filtered = filtered.filter(item => {
        const key = `${item.student_code}|${item.goal_code}`;
        const current = metricsMap[key]?.current;
        if (current == null) return false;
        
        if (this.filters.valueRange.min != null && current < this.filters.valueRange.min) return false;
        if (this.filters.valueRange.max != null && current > this.filters.valueRange.max) return false;
        
        return true;
      });
    }
    
    // Source type filter
    if (this.filters.sources.length > 0) {
      filtered = filtered.filter(item => {
        const entries = this.rawData.filter(r => 
          r.student_code === item.student_code && r.goal_code === item.goal_code
        );
        return entries.some(e => this.filters.sources.includes(e.source));
      });
    }
    
    // Data recency filter
    if (this.filters.dataRecencyDays != null) {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - this.filters.dataRecencyDays);
      const cutoffStr = cutoffDate.toISOString().split('T')[0];
      
      filtered = filtered.filter(item => {
        const entries = this.rawData.filter(r => 
          r.student_code === item.student_code && r.goal_code === item.goal_code
        );
        return entries.some(e => e.date >= cutoffStr);
      });
    }
    
    return filtered;
  }

  
  // ========================================================================
  // Rendering
  // ========================================================================
  
  buildFilterBar() {
    const selectedQuarters = this.filters.quarters.length > 0 
      ? this.filters.quarters 
      : [this.getCurrentQuarter()];
    
    // Phase 6-8: Saved Views dropdown
    const savedViewsUI = getFeatureFlag('progressSavedViews') ? `
      <div class="filter-section">
        <label class="filter-label">Saved Views</label>
        <div style="display:flex;gap:6px;align-items:center">
          <select class="filter-select" id="savedViewSelect">
            <option value="">-- Select View --</option>
            ${this.savedViews.map(v => `
              <option value="${v.id}" ${this.currentViewId === v.id ? 'selected' : ''}>
                ${this.escapeHtml(v.name)} ${v.is_default ? '⭐' : ''}
              </option>
            `).join('')}
          </select>
          <button class="btn small" id="saveViewBtn" title="Save current view">💾</button>
          ${this.currentViewId ? '<button class="btn small" id="updateViewBtn" title="Update current view">↻</button>' : ''}
          ${this.currentViewId ? '<button class="btn small" id="deleteViewBtn" title="Delete current view">🗑️</button>' : ''}
        </div>
      </div>
    ` : '';
    
    // Phase 6-8: Advanced Filters
    const advancedFiltersUI = getFeatureFlag('progressAdvancedFilters') ? `
      <div class="filter-section">
        <label class="filter-label">Value Range (Current %)</label>
        <div style="display:flex;gap:6px;align-items:center">
          <input type="number" class="filter-number-input" id="valueRangeMin" 
                 placeholder="Min" min="0" max="100" 
                 value="${this.filters.valueRange.min || ''}" />
          <span>to</span>
          <input type="number" class="filter-number-input" id="valueRangeMax" 
                 placeholder="Max" min="0" max="100" 
                 value="${this.filters.valueRange.max || ''}" />
        </div>
      </div>
      
      <div class="filter-section">
        <label class="filter-label">Data Sources</label>
        <div class="filter-checkboxes" id="sourceCheckboxes">
          ${['manual', 'assignment', 'import'].map(src => `
            <label>
              <input type="checkbox" value="${src}" 
                     ${this.filters.sources.includes(src) ? 'checked' : ''} />
              ${src.charAt(0).toUpperCase() + src.slice(1)}
            </label>
          `).join('')}
        </div>
      </div>
      
      <div class="filter-section">
        <label class="filter-label">Data Recency</label>
        <select class="filter-select" id="dataRecencySelect">
          <option value="">All time</option>
          <option value="7" ${this.filters.dataRecencyDays === 7 ? 'selected' : ''}>Last 7 days</option>
          <option value="14" ${this.filters.dataRecencyDays === 14 ? 'selected' : ''}>Last 14 days</option>
          <option value="30" ${this.filters.dataRecencyDays === 30 ? 'selected' : ''}>Last 30 days</option>
        </select>
      </div>
    ` : '';
    
    // Phase 6-8: Rollups (granularity toggle)
    const rollupsUI = getFeatureFlag('progressRollups') ? `
      <div class="filter-section">
        <label class="filter-label">Granularity</label>
        <div class="granularity-toggles">
          ${['daily', 'weekly', 'monthly'].map(g => `
            <button 
              class="granularity-toggle ${this.granularity === g ? 'active' : ''}" 
              data-granularity="${g}"
            >
              ${g.charAt(0).toUpperCase() + g.slice(1)}
            </button>
          `).join('')}
        </div>
      </div>
    ` : '';
    
    return `
      <div class="progress-grid-v2-filters">
        ${savedViewsUI}
        
        <div class="filter-section">
          <label class="filter-label">Quarters</label>
          <div class="quarter-toggles">
            ${['Q1', 'Q2', 'Q3', 'Q4'].map(q => `
              <button 
                class="quarter-toggle ${selectedQuarters.includes(q) ? 'active' : ''}" 
                data-quarter="${q}"
              >
                ${this.getQuarterLabel(q)}
              </button>
            `).join('')}
          </div>
        </div>
        
        <div class="filter-section">
          <label class="filter-label">Search</label>
          <input 
            type="text" 
            class="filter-search" 
            placeholder="Student, goal code, or description..."
            value="${this.filters.searchText}"
          />
        </div>
        
        ${advancedFiltersUI}
        ${rollupsUI}
        
        <div class="filter-section">
          <label class="filter-label">Goal Areas</label>
          <div class="filter-checkboxes" id="goalAreaCheckboxes">
            <!-- Populated by JS -->
          </div>
        </div>
        
        <div class="filter-section">
          <label class="filter-label">Classes</label>
          <div class="filter-checkboxes" id="classCheckboxes">
            <!-- Populated by JS -->
          </div>
        </div>
        
        <div class="filter-section">
          <label class="filter-label">Students</label>
          <div class="filter-checkboxes" id="studentCheckboxes">
            <!-- Populated by JS -->
          </div>
        </div>
        
        <div class="filter-section">
          <label class="filter-label">Date Range (Optional)</label>
          <div style="display:flex;gap:6px;align-items:center">
            <input 
              type="date" 
              class="filter-date-input" 
              id="dateRangeStart"
              value="${this.filters.dateRange.start || ''}"
            />
            <span>to</span>
            <input 
              type="date" 
              class="filter-date-input" 
              id="dateRangeEnd"
              value="${this.filters.dateRange.end || ''}"
            />
          </div>
        </div>
        
        <div class="filter-actions">
          <button class="btn small" id="gridRefreshBtn">🔄 Refresh</button>
          <button class="btn small" id="gridExportBtn">📥 Export CSV</button>
          ${getFeatureFlag('progressPdfExport') ? '<button class="btn small" id="gridPdfExportBtn">📄 Export PDF</button>' : ''}
          ${getFeatureFlag('progressEditing') ? '<button class="btn small primary" id="gridBulkAddBtn">➕ Bulk Add Progress</button>' : ''}
          ${getFeatureFlag('progressAutoFromAssignments') ? '<button class="btn small" id="gridMappingBtn">⚙️ Assignment Mapping</button>' : ''}
        </div>
      </div>
    `;
  }
  
  buildGrid() {
    if (!this.processedData) {
      return '<div class="grid-empty">No data available. Please refresh.</div>';
    }
    
    const { groupedByArea, sortedAreas, sortedDates, goalMetricsMap } = this.processedData;
    
    if (sortedAreas.length === 0) {
      return '<div class="grid-empty">No progress data found for selected filters.</div>';
    }
    
    // Calculate visible date columns based on virtualization
    const visibleDates = this.getVisibleDateColumns(sortedDates);
    
    // Determine which quarter average columns to show
    const selectedQuarters = this.filters.quarters.length > 0 
      ? this.filters.quarters 
      : [this.getCurrentQuarter()];
    
    let html = '<div class="progress-grid-v2-table-wrapper">';
    html += '<table class="progress-grid-v2-table" role="grid" aria-label="IEP Progress Data">';
    
    // Phase 6-8: Count columns for colspan
    let baseColCount = 8;
    if (getFeatureFlag('progressRiskIndicators')) {
      if (this.visibleColumns.risk) baseColCount++;
      if (this.visibleColumns.lastDataAge) baseColCount++;
      if (this.visibleColumns.deltaVsTarget) baseColCount++;
    }
    
    // Header
    html += '<thead><tr role="row">';
    if (this.visibleColumns.student) html += '<th role="columnheader" class="col-student sortable" data-field="student_code" tabindex="0">Student</th>';
    if (this.visibleColumns.goalCode) html += '<th role="columnheader" class="col-goal-code">Goal</th>';
    if (this.visibleColumns.goalDesc) html += '<th role="columnheader" class="col-goal-desc">Description</th>';
    if (this.visibleColumns.class) html += '<th role="columnheader" class="col-class">Class</th>';
    if (this.visibleColumns.baseline) html += '<th role="columnheader" class="col-baseline">Baseline</th>';
    if (this.visibleColumns.current) html += '<th role="columnheader" class="col-current sortable" data-field="current" tabindex="0">Current</th>';
    if (this.visibleColumns.delta) html += '<th role="columnheader" class="col-delta sortable" data-field="delta" tabindex="0">Delta</th>';
    if (this.visibleColumns.trend) html += '<th role="columnheader" class="col-trend">Trend</th>';
    
    // Phase 6-8: Risk indicators columns
    if (getFeatureFlag('progressRiskIndicators')) {
      if (this.visibleColumns.risk) html += '<th role="columnheader" class="col-risk" title="Risk indicator based on recency, target, and trend">Risk</th>';
      if (this.visibleColumns.lastDataAge) html += '<th role="columnheader" class="col-last-data-age" title="Days since last data entry">Last Data</th>';
      if (this.visibleColumns.deltaVsTarget) html += '<th role="columnheader" class="col-delta-target" title="Current value vs target">Δ Target</th>';
    }
    
    // Quarter average columns
    if (this.visibleColumns.quarterAvgs) {
      selectedQuarters.forEach(q => {
        html += `<th role="columnheader" class="col-quarter-avg">${q} Avg</th>`;
      });
    }
    
    // Date columns (with granularity formatting)
    if (this.visibleColumns.dates) {
      visibleDates.forEach(date => {
        const header = this.formatPeriodHeader(date);
        html += `<th role="columnheader" class="col-date">${header}</th>`;
      });
    }
    
    html += '</tr></thead><tbody role="rowgroup">';
    
    // Render each area
    sortedAreas.forEach(area => {
      const items = groupedByArea[area];
      const isCollapsed = this.collapsedAreas.has(area);
      
      // Count visible columns for colspan
      let visibleColCount = 0;
      Object.values(this.visibleColumns).forEach(v => {
        if (v === true) visibleColCount++;
      });
      if (this.visibleColumns.quarterAvgs) visibleColCount += selectedQuarters.length - 1;
      if (this.visibleColumns.dates) visibleColCount += visibleDates.length - 1;
      
      // Area header
      html += `
        <tr class="area-header" data-area="${area}" role="row">
          <td colspan="${visibleColCount}" role="gridcell">
            <span class="collapse-icon" role="button" tabindex="0" aria-label="${isCollapsed ? 'Expand' : 'Collapse'} ${area}">${isCollapsed ? '▶' : '▼'}</span>
            📁 ${area} (${items.length} goals)
          </td>
        </tr>
      `;
      
      // Data rows (skip if collapsed)
      if (!isCollapsed) {
        items.forEach(item => {
          const key = `${item.student_code}|${item.goal_code}`;
          const metrics = goalMetricsMap[key];
          
          // Phase 6-8: Calculate risk indicators
          const riskData = getFeatureFlag('progressRiskIndicators') 
            ? this.calculateRiskIndicators(item)
            : null;
          
          // Get quarter averages for this goal
          const quarterAvgs = {};
          this.quarterAverages.forEach(qa => {
            if (qa.student_code === item.student_code && qa.goal_code === item.goal_code) {
              quarterAvgs[qa.quarter] = qa.avg_value;
            }
          });
          
          html += '<tr class="data-row" role="row">';
          
          // Student
          if (this.visibleColumns.student) {
            html += `<td role="gridcell" class="col-student" aria-label="Student ${item.student_code}">${item.student_name}<br><span class="student-code">${item.student_code}</span></td>`;
          }
          
          // Goal code
          if (this.visibleColumns.goalCode) {
            html += `<td role="gridcell" class="col-goal-code"><span class="badge">${item.goal_code}</span></td>`;
          }
          
          // Goal description (truncated with tooltip)
          if (this.visibleColumns.goalDesc) {
            const truncDesc = item.goal_desc.length > 120 
              ? item.goal_desc.substring(0, 120) + '...' 
              : item.goal_desc;
            html += `<td role="gridcell" class="col-goal-desc" title="${this.escapeHtml(item.goal_desc)}">${truncDesc}</td>`;
          }
          
          // Class
          if (this.visibleColumns.class) {
            html += `<td role="gridcell" class="col-class">${item.class_code || '—'}</td>`;
          }
          
          // Metrics
          if (this.visibleColumns.baseline) {
            const baselineVal = metrics?.baseline != null ? Math.round(metrics.baseline) + '%' : '—';
            html += `<td role="gridcell" class="col-baseline" aria-label="Baseline ${baselineVal}">${baselineVal}</td>`;
          }
          if (this.visibleColumns.current) {
            const currentVal = metrics?.current != null ? Math.round(metrics.current) + '%' : '—';
            html += `<td role="gridcell" class="col-current" aria-label="Current ${currentVal}">${currentVal}</td>`;
          }
          if (this.visibleColumns.delta) {
            html += `<td role="gridcell" class="col-delta ${this.getDeltaClass(metrics?.delta)}" aria-label="Delta ${this.formatDelta(metrics?.delta)}">${this.formatDelta(metrics?.delta)}</td>`;
          }
          if (this.visibleColumns.trend) {
            html += `<td role="gridcell" class="col-trend" aria-label="Trend ${metrics?.trend || 'unknown'}">${this.getTrendIcon(metrics?.trend)}</td>`;
          }
          
          // Phase 6-8: Risk indicators
          if (getFeatureFlag('progressRiskIndicators')) {
            if (this.visibleColumns.risk && riskData) {
              html += `<td role="gridcell" class="col-risk">${this.getRiskIcon(riskData.risk, riskData.reasons)}</td>`;
            }
            if (this.visibleColumns.lastDataAge && riskData) {
              const ageText = riskData.lastDataAge != null ? `${riskData.lastDataAge}d` : '—';
              html += `<td role="gridcell" class="col-last-data-age" aria-label="Last data ${ageText} ago">${ageText}</td>`;
            }
            if (this.visibleColumns.deltaVsTarget && riskData) {
              const deltaTarget = riskData.deltaVsTarget;
              const deltaTargetText = deltaTarget != null ? (deltaTarget >= 0 ? `+${Math.round(deltaTarget)}pp` : `${Math.round(deltaTarget)}pp`) : '—';
              const deltaTargetClass = deltaTarget != null ? (deltaTarget >= 0 ? 'delta-positive' : 'delta-negative') : '';
              html += `<td role="gridcell" class="col-delta-target ${deltaTargetClass}" aria-label="Delta vs target ${deltaTargetText}">${deltaTargetText}</td>`;
            }
          }
          
          // Quarter averages
          if (this.visibleColumns.quarterAvgs) {
            selectedQuarters.forEach(q => {
              const avg = quarterAvgs[q];
              const avgText = avg != null ? Math.round(avg) + '%' : '—';
              html += `<td role="gridcell" class="col-quarter-avg" aria-label="${q} average ${avgText}">${avgText}</td>`;
            });
          }
          
          // Date columns
          if (this.visibleColumns.dates) {
            visibleDates.forEach(date => {
              const value = item.measurements[date];
              const isEditable = getFeatureFlag('progressEditing');
              const cellClass = isEditable ? 'col-date editable' : 'col-date';
              const cellData = `data-student="${item.student_code}" data-goal="${item.goal_code}" data-date="${date}"`;
              
              // Check if there are multiple entries for this date (stacked indicator)
              const entries = this.rawData.filter(r => 
                r.student_code === item.student_code && 
                r.goal_code === item.goal_code && 
                r.date === date
              );
              const hasMultiple = entries.length > 1;
              const stackedIndicator = hasMultiple ? this.buildStackedIndicator(entries) : '';
              
              const valueText = value != null ? Math.round(value) + '%' : '—';
              const ariaLabel = `Student ${item.student_code}, Goal ${item.goal_code}, ${this.formatPeriodHeader(date)}, ${valueText}`;
              
              html += `<td role="gridcell" class="${cellClass}" ${cellData} tabindex="${isEditable ? '0' : '-1'}" aria-label="${ariaLabel}">
                ${valueText}
                ${stackedIndicator}
              </td>`;
            });
          }
          
          html += '</tr>';
        });
      }
    });
    
    html += '</tbody></table></div>';
    
    // Add scroll hint if there are more columns
    if (sortedDates.length > visibleDates.length) {
      html += `<div class="scroll-hint" aria-live="polite">← Scroll horizontally to see ${sortedDates.length - visibleDates.length} more date columns →</div>`;
    }
    
    return html;
  }
  
  // ========================================================================
  // Rendering Helpers
  // ========================================================================
  
  getVisibleDateColumns(allDates) {
    // For now, show all dates (virtualization can be added later for performance)
    // Limit to prevent performance issues
    const maxCols = 100;
    return allDates.slice(0, maxCols);
  }
  
  formatDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr + 'T00:00:00');
    return `${d.getMonth() + 1}/${d.getDate()}`;
  }
  
  formatDelta(delta) {
    if (delta == null) return '—';
    const sign = delta >= 0 ? '+' : '';
    return `${sign}${Math.round(delta)}pp`;
  }
  
  getDeltaClass(delta) {
    if (delta == null) return '';
    if (delta >= this.options.trendThreshold) return 'delta-positive';
    if (delta <= -this.options.trendThreshold) return 'delta-negative';
    return 'delta-neutral';
  }
  
  getTrendIcon(trend) {
    const icons = {
      'up': '🟢 ↗',
      'down': '🔴 ↘',
      'flat': '⚪ →'
    };
    return icons[trend] || '—';
  }
  
  escapeHtml(text) {
    return (text || '').replace(/[&<>"']/g, m => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[m]);
  }
  
  // ========================================================================
  // Utility Methods
  // ========================================================================
  
  
  // ========================================================================
  // CSV Export
  // ========================================================================
  
  exportCSV() {
    if (!this.processedData) {
      alert('No data to export');
      return;
    }
    
    const { groupedByArea, sortedAreas, sortedDates, goalMetricsMap } = this.processedData;
    const selectedQuarters = this.filters.quarters.length > 0 
      ? this.filters.quarters 
      : [this.getCurrentQuarter()];
    
    // Build CSV rows
    const rows = [];
    
    // Header row
    const header = [
      'Student Code',
      'Student Name',
      'Goal Code',
      'Goal Description',
      'Goal Area',
      'Class',
      'Baseline',
      'Current',
      'Delta',
      'Trend'
    ];
    
    // Phase 6-8: Add risk indicator columns if enabled
    if (getFeatureFlag('progressRiskIndicators') && this.visibleColumns.risk) {
      header.push('Risk');
    }
    if (getFeatureFlag('progressRiskIndicators') && this.visibleColumns.lastDataAge) {
      header.push('Last Data Age (days)');
    }
    if (getFeatureFlag('progressRiskIndicators') && this.visibleColumns.deltaVsTarget) {
      header.push('Delta vs Target');
    }
    
    // Add quarter average columns
    if (this.visibleColumns.quarterAvgs) {
      selectedQuarters.forEach(q => {
        header.push(`${q} Avg`);
      });
    }
    
    // Phase 6-8: Add date columns with granularity formatting
    if (this.visibleColumns.dates) {
      sortedDates.forEach(date => {
        header.push(this.formatPeriodHeader(date));
      });
    }
    
    rows.push(header);
    
    // Data rows (flattened, respecting sort order)
    sortedAreas.forEach(area => {
      const items = groupedByArea[area];
      
      items.forEach(item => {
        const key = `${item.student_code}|${item.goal_code}`;
        const metrics = goalMetricsMap[key];
        
        // Phase 6-8: Calculate risk indicators
        const riskData = getFeatureFlag('progressRiskIndicators') 
          ? this.calculateRiskIndicators(item)
          : null;
        
        // Get quarter averages
        const quarterAvgs = {};
        this.quarterAverages.forEach(qa => {
          if (qa.student_code === item.student_code && qa.goal_code === item.goal_code) {
            quarterAvgs[qa.quarter] = qa.avg_value;
          }
        });
        
        const row = [
          item.student_code,
          item.student_name,
          item.goal_code,
          item.goal_desc,
          area,
          item.class_code || '',
          metrics?.baseline != null ? Math.round(metrics.baseline) : '',
          metrics?.current != null ? Math.round(metrics.current) : '',
          metrics?.delta != null ? Math.round(metrics.delta) : '',
          metrics?.trend || ''
        ];
        
        // Phase 6-8: Add risk indicator values
        if (getFeatureFlag('progressRiskIndicators') && this.visibleColumns.risk && riskData) {
          row.push(riskData.risk);
        }
        if (getFeatureFlag('progressRiskIndicators') && this.visibleColumns.lastDataAge && riskData) {
          row.push(riskData.lastDataAge != null ? riskData.lastDataAge : '');
        }
        if (getFeatureFlag('progressRiskIndicators') && this.visibleColumns.deltaVsTarget && riskData) {
          row.push(riskData.deltaVsTarget != null ? Math.round(riskData.deltaVsTarget) : '');
        }
        
        // Add quarter averages
        if (this.visibleColumns.quarterAvgs) {
          selectedQuarters.forEach(q => {
            const avg = quarterAvgs[q];
            row.push(avg != null ? Math.round(avg) : '');
          });
        }
        
        // Add date values (respects granularity)
        if (this.visibleColumns.dates) {
          sortedDates.forEach(date => {
            const value = item.measurements[date];
            row.push(value != null ? Math.round(value) : '');
          });
        }
        
        rows.push(row);
      });
    });
    
    // Convert to CSV string
    const csvContent = rows.map(row => 
      row.map(cell => {
        // Escape cells containing commas, quotes, or newlines
        const str = String(cell);
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      }).join(',')
    ).join('\n');
    
    // Download
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const granularitySuffix = getFeatureFlag('progressRollups') && this.granularity !== 'daily' 
      ? `_${this.granularity}` 
      : '';
    const filename = `progress_export${granularitySuffix}_${timestamp}.csv`;
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    
    console.log('[ProgressGridV2] Exported', rows.length - 1, 'rows to', filename);
  }
  
  // ========================================================================
  // Event Handlers
  // ========================================================================
  
  attachEventListeners(containerEl) {
    // Phase 6-8: Saved Views
    if (getFeatureFlag('progressSavedViews')) {
      const viewSelect = containerEl.querySelector('#savedViewSelect');
      if (viewSelect) {
        viewSelect.addEventListener('change', async (e) => {
          const viewId = e.target.value;
          if (viewId) {
            await this.restoreView(viewId);
          }
        });
      }
      
      const saveViewBtn = containerEl.querySelector('#saveViewBtn');
      if (saveViewBtn) {
        saveViewBtn.addEventListener('click', async () => {
          const name = prompt('Enter a name for this view:');
          if (name) {
            try {
              await this.saveCurrentView(name, false);
              alert(`View "${name}" saved successfully!`);
              this.renderOnly(); // Update UI to show new view
            } catch (err) {
              alert('Failed to save view. ' + err.message);
            }
          }
        });
      }
      
      const updateViewBtn = containerEl.querySelector('#updateViewBtn');
      if (updateViewBtn) {
        updateViewBtn.addEventListener('click', async () => {
          if (confirm(`Update view "${this.currentViewName}"?`)) {
            try {
              await this.updateCurrentView();
              alert('View updated successfully!');
            } catch (err) {
              alert('Failed to update view. ' + err.message);
            }
          }
        });
      }
      
      const deleteViewBtn = containerEl.querySelector('#deleteViewBtn');
      if (deleteViewBtn) {
        deleteViewBtn.addEventListener('click', async () => {
          if (confirm(`Delete view "${this.currentViewName}"?`)) {
            try {
              await this.deleteView(this.currentViewId);
              alert('View deleted successfully!');
              this.renderOnly(); // Update UI
            } catch (err) {
              alert('Failed to delete view. ' + err.message);
            }
          }
        });
      }
    }
    
    // Phase 6-8: Advanced Filters
    if (getFeatureFlag('progressAdvancedFilters')) {
      const valueRangeMin = containerEl.querySelector('#valueRangeMin');
      const valueRangeMax = containerEl.querySelector('#valueRangeMax');
      
      if (valueRangeMin) {
        valueRangeMin.addEventListener('change', (e) => {
          this.filters.valueRange.min = e.target.value ? parseFloat(e.target.value) : null;
          this.debouncedRender();
        });
      }
      
      if (valueRangeMax) {
        valueRangeMax.addEventListener('change', (e) => {
          this.filters.valueRange.max = e.target.value ? parseFloat(e.target.value) : null;
          this.debouncedRender();
        });
      }
      
      const sourceCheckboxes = containerEl.querySelectorAll('#sourceCheckboxes input[type="checkbox"]');
      sourceCheckboxes.forEach(cb => {
        cb.addEventListener('change', (e) => {
          const source = e.target.value;
          if (e.target.checked) {
            if (!this.filters.sources.includes(source)) {
              this.filters.sources.push(source);
            }
          } else {
            const idx = this.filters.sources.indexOf(source);
            if (idx >= 0) {
              this.filters.sources.splice(idx, 1);
            }
          }
          this.debouncedRender();
        });
      });
      
      const dataRecencySelect = containerEl.querySelector('#dataRecencySelect');
      if (dataRecencySelect) {
        dataRecencySelect.addEventListener('change', (e) => {
          this.filters.dataRecencyDays = e.target.value ? parseInt(e.target.value) : null;
          this.debouncedRender();
        });
      }
    }
    
    // Phase 6-8: Rollups (Granularity)
    if (getFeatureFlag('progressRollups')) {
      containerEl.querySelectorAll('.granularity-toggle').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const granularity = e.target.dataset.granularity;
          this.setGranularity(granularity);
        });
      });
    }
    
    // Phase 6-8: PDF Export
    const pdfExportBtn = containerEl.querySelector('#gridPdfExportBtn');
    if (pdfExportBtn) {
      pdfExportBtn.addEventListener('click', () => this.exportToPDF());
    }
    
    // Quarter toggles
    containerEl.querySelectorAll('.quarter-toggle').forEach(btn => {
      btn.addEventListener('click', e => {
        const quarter = e.target.dataset.quarter;
        const index = this.filters.quarters.indexOf(quarter);
        
        if (index >= 0) {
          this.filters.quarters.splice(index, 1);
        } else {
          this.filters.quarters.push(quarter);
        }
        
        // If no quarters selected, reset to empty (will use current quarter)
        if (this.filters.quarters.length === 0) {
          this.filters.quarters = [];
        }
        
        this.debouncedRender();
      });
    });
    
    // Search
    const searchInput = containerEl.querySelector('.filter-search');
    if (searchInput) {
      searchInput.addEventListener('input', e => {
        this.filters.searchText = e.target.value;
        this.debouncedRender();
      });
    }
    
    // Date range
    const startInput = containerEl.querySelector('#dateRangeStart');
    const endInput = containerEl.querySelector('#dateRangeEnd');
    
    if (startInput) {
      startInput.addEventListener('change', e => {
        this.filters.dateRange.start = e.target.value || null;
        this.debouncedRender();
      });
    }
    
    if (endInput) {
      endInput.addEventListener('change', e => {
        this.filters.dateRange.end = e.target.value || null;
        this.debouncedRender();
      });
    }
    
    // Refresh button
    const refreshBtn = containerEl.querySelector('#gridRefreshBtn');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => this.refresh());
    }
    
    // Export button
    const exportBtn = containerEl.querySelector('#gridExportBtn');
    if (exportBtn) {
      exportBtn.addEventListener('click', () => this.exportCSV());
    }
    
    // Bulk add button (Phase 4)
    const bulkAddBtn = containerEl.querySelector('#gridBulkAddBtn');
    if (bulkAddBtn) {
      bulkAddBtn.addEventListener('click', () => this.openBulkAddModal());
    }
    
    // Mapping button (Phase 5)
    const mappingBtn = containerEl.querySelector('#gridMappingBtn');
    if (mappingBtn) {
      mappingBtn.addEventListener('click', () => this.openMappingModal());
    }
    
    // Cell click for inline editing (Phase 4)
    if (getFeatureFlag('progressEditing')) {
      containerEl.querySelectorAll('td.editable').forEach(cell => {
        cell.addEventListener('click', this.handleCellClick);
        cell.addEventListener('keydown', e => {
          if (e.key === 'Enter') {
            this.handleCellClick(e);
          }
        });
      });
    }
    
    // Area collapse/expand
    containerEl.querySelectorAll('.area-header').forEach(header => {
      header.addEventListener('click', e => {
        const area = e.currentTarget.dataset.area;
        
        if (this.collapsedAreas.has(area)) {
          this.collapsedAreas.delete(area);
        } else {
          this.collapsedAreas.add(area);
        }
        
        // Re-render without re-fetching
        this.renderOnly();
      });
    });
    
    // Column sorting
    containerEl.querySelectorAll('.sortable').forEach(th => {
      th.addEventListener('click', e => {
        const field = e.currentTarget.dataset.field;
        
        if (this.sorting.field === field) {
          this.sorting.direction = this.sorting.direction === 'asc' ? 'desc' : 'asc';
        } else {
          this.sorting.field = field;
          this.sorting.direction = 'desc'; // Default to descending for metrics
        }
        
        // Re-render without re-fetching
        this.processData();
        this.renderOnly();
      });
    });
    
    // Populate filter checkboxes
    this.populateFilterCheckboxes(containerEl);
  }
  
  // ========================================================================
  // Filter Checkbox Population
  // ========================================================================
  
  populateFilterCheckboxes(containerEl) {
    // Extract unique values from raw data
    const goalAreas = new Set();
    const classes = new Set();
    const students = new Map(); // code -> name
    
    this.rawData.forEach(row => {
      if (row.goal_area) goalAreas.add(row.goal_area);
      if (row.class_code) classes.add(row.class_code);
      if (row.student_code) {
        students.set(row.student_code, row.student_name || row.student_code);
      }
    });
    
    // Goal Areas
    const goalAreaContainer = containerEl.querySelector('#goalAreaCheckboxes');
    if (goalAreaContainer) {
      const sortedAreas = Array.from(goalAreas).sort();
      goalAreaContainer.innerHTML = sortedAreas.map(area => `
        <label>
          <input type="checkbox" value="${area}" class="goal-area-checkbox" />
          <span>${area}</span>
        </label>
      `).join('') || '<span style="font-size:12px;color:var(--muted)">No goal areas found</span>';
      
      // Attach listeners
      goalAreaContainer.querySelectorAll('.goal-area-checkbox').forEach(cb => {
        cb.addEventListener('change', e => {
          if (e.target.checked) {
            this.filters.goalAreas.push(e.target.value);
          } else {
            this.filters.goalAreas = this.filters.goalAreas.filter(a => a !== e.target.value);
          }
          this.debouncedRender();
        });
      });
    }
    
    // Classes
    const classContainer = containerEl.querySelector('#classCheckboxes');
    if (classContainer) {
      const sortedClasses = Array.from(classes).sort();
      classContainer.innerHTML = sortedClasses.map(cls => `
        <label>
          <input type="checkbox" value="${cls}" class="class-checkbox" />
          <span>${cls}</span>
        </label>
      `).join('') || '<span style="font-size:12px;color:var(--muted)">No classes found</span>';
      
      // Attach listeners
      classContainer.querySelectorAll('.class-checkbox').forEach(cb => {
        cb.addEventListener('change', e => {
          if (e.target.checked) {
            this.filters.classCodes.push(e.target.value);
          } else {
            this.filters.classCodes = this.filters.classCodes.filter(c => c !== e.target.value);
          }
          this.debouncedRender();
        });
      });
    }
    
    // Students
    const studentContainer = containerEl.querySelector('#studentCheckboxes');
    if (studentContainer) {
      const sortedStudents = Array.from(students.entries()).sort((a, b) => a[0].localeCompare(b[0]));
      studentContainer.innerHTML = sortedStudents.map(([code, name]) => `
        <label>
          <input type="checkbox" value="${code}" class="student-checkbox" />
          <span>${name} (${code})</span>
        </label>
      `).join('') || '<span style="font-size:12px;color:var(--muted)">No students found</span>';
      
      // Attach listeners
      studentContainer.querySelectorAll('.student-checkbox').forEach(cb => {
        cb.addEventListener('change', e => {
          if (e.target.checked) {
            this.filters.studentCodes.push(e.target.value);
          } else {
            this.filters.studentCodes = this.filters.studentCodes.filter(s => s !== e.target.value);
          }
          this.debouncedRender();
        });
      });
    }
  }
  
  // ========================================================================
  // Main Render Method
  // ========================================================================
  
  async render(containerEl) {
    this.containerEl = containerEl;
    
    // Phase 6-8: Load saved views on first render
    if (getFeatureFlag('progressSavedViews') && this.savedViews.length === 0) {
      await this.loadSavedViews();
    }
    
    // Show loading state
    containerEl.innerHTML = '<div class="grid-loading">Loading progress data...</div>';
    
    // Fetch data
    const success = await this.fetchData();
    if (!success) {
      containerEl.innerHTML = '<div class="grid-error">Error loading data. Please try again.</div>';
      return;
    }
    
    // Process data
    this.processData();
    
    // Render UI
    this.renderOnly();
    
    // Setup realtime (Phase 5)
    if (!this.realtimeChannel) {
      this.setupRealtime();
    }
  }
  
  renderOnly() {
    if (!this.containerEl) return;
    
    const html = this.buildFilterBar() + this.buildGrid();
    this.containerEl.innerHTML = html;
    
    // Attach event listeners
    this.attachEventListeners(this.containerEl);
  }
  
  debouncedRender() {
    clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(async () => {
      await this.render(this.containerEl);
    }, this.options.debounceMs);
  }
  
  async refresh() {
    if (this.containerEl) {
      await this.render(this.containerEl);
    }
  }

  // ========================================================================
  // Phase 4-5: Inline Editing
  // ========================================================================

  buildStackedIndicator(entries) {
    if (entries.length <= 1) return '';
    
    // Build mini-history HTML
    const historyItems = entries.map(e => {
      const icon = e.source === 'assignment' ? 'A' : e.source === 'manual' ? 'M' : 'I';
      const time = new Date(e.created_at).toLocaleString();
      return `<div class="history-item">
        <span class="source-icon">${icon}</span>
        <span class="value">${Math.round(e.value)}%</span>
        <span class="time">${time}</span>
      </div>`;
    }).join('');
    
    return `<span class="stacked-indicator" title="Multiple entries">
      ${entries.map(e => {
        const icon = e.source === 'assignment' ? 'A' : e.source === 'manual' ? 'M' : 'I';
        return `<span class="source-badge">${icon}</span>`;
      }).join('')}
      <div class="history-panel">${historyItems}</div>
    </span>`;
  }

  handleCellClick(e) {
    const cell = e.target.closest('td.editable');
    if (!cell || !getFeatureFlag('progressEditing')) return;
    
    const student = cell.dataset.student;
    const goal = cell.dataset.goal;
    const date = cell.dataset.date;
    
    console.log('[progress-inline-edit] Cell clicked:', { student, goal, date });
    
    // Open inline editor
    this.openInlineEditor(cell, student, goal, date);
  }

  openInlineEditor(cell, student_code, goal_code, date) {
    // Close any existing editor
    this.closeInlineEditor();
    
    // Get current value
    const currentText = cell.textContent.trim();
    const currentValue = currentText === '—' ? '' : parseInt(currentText);
    
    // Create editor
    const editor = document.createElement('div');
    editor.className = 'inline-editor';
    editor.setAttribute('role', 'group');
    editor.setAttribute('aria-label', `Edit progress for ${student_code} ${goal_code} on ${date}`);
    editor.innerHTML = `
      <input 
        type="number" 
        min="0" 
        max="100" 
        step="1" 
        value="${currentValue || ''}" 
        class="editor-input"
        aria-label="Progress value (0-100)"
        aria-describedby="editor-hint" />
      <button class="editor-save" title="Save" aria-label="Save progress value">✓</button>
      <button class="editor-cancel" title="Cancel" aria-label="Cancel editing">✗</button>
      <span id="editor-hint" class="sr-only">Use arrow keys to adjust value by 1, Shift+arrow to adjust by 5, Enter to save, Escape to cancel</span>
    `;
    
    // Replace cell content
    cell.dataset.originalContent = cell.innerHTML;
    cell.innerHTML = '';
    cell.appendChild(editor);
    cell.classList.add('editing');
    
    const input = editor.querySelector('.editor-input');
    const saveBtn = editor.querySelector('.editor-save');
    const cancelBtn = editor.querySelector('.editor-cancel');
    
    // Focus input
    input.focus();
    input.select();
    
    // Save handler
    const save = async () => {
      const value = parseInt(input.value);
      if (isNaN(value) || value < 0 || value > 100) {
        alert('Please enter a value between 0 and 100');
        input.focus();
        return;
      }
      
      console.log('[progress-inline-edit] Saving:', { student_code, goal_code, date, value });
      
      // Optimistic UI update
      cell.innerHTML = `${value}%`;
      cell.classList.remove('editing');
      
      try {
        // Save to backend
        await this.db.upsertGoalProgress({
          goal_code,
          student_code,
          date,
          value,
          source: 'manual',
          collected_by: this.options.teacherEmail
        });
        
        console.log('[progress-inline-edit] Saved successfully');
        
        // Refresh data to update metrics
        await this.refresh();
      } catch (err) {
        console.error('[progress-inline-edit] Save failed:', err);
        
        // Rollback
        cell.innerHTML = cell.dataset.originalContent;
        alert('Failed to save. Please try again.');
      }
    };
    
    // Event listeners
    saveBtn.addEventListener('click', save);
    cancelBtn.addEventListener('click', () => this.closeInlineEditor(cell));
    
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        save();
      } else if (e.key === 'Escape') {
        this.closeInlineEditor(cell);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const delta = e.shiftKey ? 5 : 1;
        input.value = Math.min(100, (parseInt(input.value) || 0) + delta);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        const delta = e.shiftKey ? 5 : 1;
        input.value = Math.max(0, (parseInt(input.value) || 0) - delta);
      }
    });
    
    // Store editing state
    this.editingCell = { cell, student_code, goal_code, date };
  }

  closeInlineEditor(cell = null) {
    const target = cell || this.editingCell?.cell;
    if (!target) return;
    
    if (target.dataset.originalContent) {
      target.innerHTML = target.dataset.originalContent;
      delete target.dataset.originalContent;
    }
    target.classList.remove('editing');
    
    this.editingCell = null;
  }

  // ========================================================================
  // Phase 4: Bulk Add Modal
  // ========================================================================

  openBulkAddModal() {
    console.log('[progress-bulk] Opening bulk add modal');
    this.bulkModalOpen = true;
    
    // Create modal
    const modal = document.createElement('div');
    modal.className = 'modal-backdrop show';
    modal.id = 'bulkAddModal';
    modal.innerHTML = `
      <div class="modal card">
        <div class="card-header">
          <h3>Bulk Add Progress</h3>
          <button class="btn small" id="closeBulkModal">✗ Close</button>
        </div>
        <div class="bulk-modal-content">
          <div class="bulk-step" id="bulkStep1">
            <h4>Step 1: Select Goals</h4>
            <div class="bulk-goal-filters">
              <input type="text" placeholder="Search goals..." class="bulk-search" />
              <select class="bulk-area-filter">
                <option value="">All Areas</option>
              </select>
              <select class="bulk-class-filter">
                <option value="">All Classes</option>
              </select>
            </div>
            <div class="bulk-goal-list" id="bulkGoalList">
              <!-- Populated by JS -->
            </div>
            <button class="btn primary" id="bulkNextStep1">Next: Select Dates →</button>
          </div>
          
          <div class="bulk-step hidden" id="bulkStep2">
            <h4>Step 2: Select Dates</h4>
            <div class="bulk-date-options">
              <label>
                <input type="radio" name="dateMode" value="single" checked />
                Single Date
              </label>
              <label>
                <input type="radio" name="dateMode" value="range" />
                Date Range
              </label>
            </div>
            <div class="bulk-date-inputs">
              <input type="date" id="bulkStartDate" />
              <span id="bulkRangeTo" class="hidden">to</span>
              <input type="date" id="bulkEndDate" class="hidden" />
              <label class="hidden" id="bulkSkipWeekendsLabel">
                <input type="checkbox" id="bulkSkipWeekends" checked />
                Skip weekends
              </label>
            </div>
            <button class="btn" id="bulkBackStep2">← Back</button>
            <button class="btn primary" id="bulkNextStep2">Next: Enter Values →</button>
          </div>
          
          <div class="bulk-step hidden" id="bulkStep3">
            <h4>Step 3: Enter Values</h4>
            <div class="bulk-value-table-wrapper">
              <table class="bulk-value-table" id="bulkValueTable">
                <!-- Populated by JS -->
              </table>
            </div>
            <div class="bulk-shortcuts">
              <button class="btn small" id="bulkFillAll">Fill All (Value: <input type="number" min="0" max="100" id="bulkFillValue" value="80" style="width:60px" />)</button>
            </div>
            <button class="btn" id="bulkBackStep3">← Back</button>
            <button class="btn primary" id="bulkNextStep3">Next: Review →</button>
          </div>
          
          <div class="bulk-step hidden" id="bulkStep4">
            <h4>Step 4: Review & Commit</h4>
            <div id="bulkReviewSummary">
              <!-- Populated by JS -->
            </div>
            <button class="btn" id="bulkBackStep4">← Back</button>
            <button class="btn primary" id="bulkCommit">✓ Save All Entries</button>
          </div>
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);
    
    // Attach event listeners
    this.attachBulkModalListeners(modal);
    
    // Populate initial data
    this.populateBulkGoals(modal);
  }

  attachBulkModalListeners(modal) {
    // Close modal
    const closeBtn = modal.querySelector('#closeBulkModal');
    closeBtn.addEventListener('click', () => this.closeBulkAddModal());
    
    // Date mode toggle
    modal.querySelectorAll('input[name="dateMode"]').forEach(radio => {
      radio.addEventListener('change', e => {
        const isRange = e.target.value === 'range';
        modal.querySelector('#bulkEndDate').classList.toggle('hidden', !isRange);
        modal.querySelector('#bulkRangeTo').classList.toggle('hidden', !isRange);
        modal.querySelector('#bulkSkipWeekendsLabel').classList.toggle('hidden', !isRange);
      });
    });
    
    // Step navigation
    modal.querySelector('#bulkNextStep1').addEventListener('click', () => {
      const selected = this.getSelectedBulkGoals(modal);
      if (selected.length === 0) {
        alert('Please select at least one goal');
        return;
      }
      this.showBulkStep(modal, 2);
    });
    
    modal.querySelector('#bulkBackStep2').addEventListener('click', () => this.showBulkStep(modal, 1));
    
    modal.querySelector('#bulkNextStep2').addEventListener('click', () => {
      const dates = this.getBulkDates(modal);
      if (dates.length === 0) {
        alert('Please select valid dates');
        return;
      }
      this.populateBulkValueTable(modal);
      this.showBulkStep(modal, 3);
    });
    
    modal.querySelector('#bulkBackStep3').addEventListener('click', () => this.showBulkStep(modal, 2));
    
    modal.querySelector('#bulkNextStep3').addEventListener('click', () => {
      this.populateBulkReview(modal);
      this.showBulkStep(modal, 4);
    });
    
    modal.querySelector('#bulkBackStep4').addEventListener('click', () => this.showBulkStep(modal, 3));
    
    modal.querySelector('#bulkCommit').addEventListener('click', () => this.commitBulkAdd(modal));
    
    // Fill all shortcut
    modal.querySelector('#bulkFillAll').addEventListener('click', () => {
      const value = modal.querySelector('#bulkFillValue').value;
      modal.querySelectorAll('.bulk-value-input').forEach(input => {
        input.value = value;
      });
    });
  }

  populateBulkGoals(modal) {
    // Get all unique goals from raw data
    const goalsMap = new Map();
    this.rawData.forEach(row => {
      const key = `${row.student_code}|${row.goal_code}`;
      if (!goalsMap.has(key)) {
        goalsMap.set(key, {
          student_code: row.student_code,
          student_name: row.student_name,
          goal_code: row.goal_code,
          goal_desc: row.goal_desc,
          goal_area: row.goal_area,
          class_code: row.class_code
        });
      }
    });
    
    const goals = Array.from(goalsMap.values());
    
    // Populate filters
    const areas = new Set(goals.map(g => g.goal_area).filter(Boolean));
    const classes = new Set(goals.map(g => g.class_code).filter(Boolean));
    
    const areaFilter = modal.querySelector('.bulk-area-filter');
    areaFilter.innerHTML = '<option value="">All Areas</option>' + 
      Array.from(areas).sort().map(a => `<option value="${this.escapeHtml(a)}">${this.escapeHtml(a)}</option>`).join('');
    
    const classFilter = modal.querySelector('.bulk-class-filter');
    classFilter.innerHTML = '<option value="">All Classes</option>' + 
      Array.from(classes).sort().map(c => `<option value="${this.escapeHtml(c)}">${this.escapeHtml(c)}</option>`).join('');
    
    // Populate goal list
    const goalList = modal.querySelector('#bulkGoalList');
    goalList.innerHTML = goals.map(g => `
      <label class="bulk-goal-item">
        <input type="checkbox" value="${this.escapeHtml(g.student_code)}|${this.escapeHtml(g.goal_code)}" />
        <div class="bulk-goal-info">
          <strong>${this.escapeHtml(g.student_name)} (${this.escapeHtml(g.student_code)})</strong> - ${this.escapeHtml(g.goal_code)}
          <div class="subtle">${this.escapeHtml(g.goal_desc.substring(0, 100))}${g.goal_desc.length > 100 ? '...' : ''}</div>
          <div class="badge">${this.escapeHtml(g.goal_area)}</div>
        </div>
      </label>
    `).join('');
    
    // Search filter
    const searchInput = modal.querySelector('.bulk-search');
    searchInput.addEventListener('input', () => this.filterBulkGoals(modal));
    
    areaFilter.addEventListener('change', () => this.filterBulkGoals(modal));
    classFilter.addEventListener('change', () => this.filterBulkGoals(modal));
  }

  filterBulkGoals(modal) {
    const search = modal.querySelector('.bulk-search').value.toLowerCase();
    const area = modal.querySelector('.bulk-area-filter').value;
    const cls = modal.querySelector('.bulk-class-filter').value;
    
    modal.querySelectorAll('.bulk-goal-item').forEach(item => {
      const text = item.textContent.toLowerCase();
      const areaMatch = !area || item.querySelector('.badge').textContent === area;
      const searchMatch = !search || text.includes(search);
      
      item.style.display = areaMatch && searchMatch ? 'flex' : 'none';
    });
  }

  getSelectedBulkGoals(modal) {
    const selected = [];
    modal.querySelectorAll('.bulk-goal-item input:checked').forEach(cb => {
      const [student_code, goal_code] = cb.value.split('|');
      const item = this.rawData.find(r => r.student_code === student_code && r.goal_code === goal_code);
      if (item) {
        selected.push({
          student_code,
          goal_code,
          student_name: item.student_name,
          goal_desc: item.goal_desc
        });
      }
    });
    return selected;
  }

  getBulkDates(modal) {
    const mode = modal.querySelector('input[name="dateMode"]:checked').value;
    const startDate = modal.querySelector('#bulkStartDate').value;
    
    if (!startDate) return [];
    
    if (mode === 'single') {
      return [startDate];
    } else {
      const endDate = modal.querySelector('#bulkEndDate').value;
      const skipWeekends = modal.querySelector('#bulkSkipWeekends').checked;
      
      if (!endDate) return [startDate];
      
      const dates = [];
      const start = new Date(startDate);
      const end = new Date(endDate);
      
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const dayOfWeek = d.getDay();
        if (skipWeekends && (dayOfWeek === 0 || dayOfWeek === 6)) {
          continue;
        }
        dates.push(d.toISOString().split('T')[0]);
      }
      
      return dates;
    }
  }

  populateBulkValueTable(modal) {
    const goals = this.getSelectedBulkGoals(modal);
    const dates = this.getBulkDates(modal);
    
    const table = modal.querySelector('#bulkValueTable');
    
    let html = '<thead><tr><th>Goal</th>';
    dates.forEach(d => {
      html += `<th>${this.escapeHtml(d)}</th>`;
    });
    html += '</tr></thead><tbody>';
    
    goals.forEach(g => {
      html += `<tr><td><strong>${this.escapeHtml(g.student_name)}</strong><br/>${this.escapeHtml(g.goal_code)}</td>`;
      dates.forEach(d => {
        html += `<td><input type="number" min="0" max="100" class="bulk-value-input" data-student="${this.escapeHtml(g.student_code)}" data-goal="${this.escapeHtml(g.goal_code)}" data-date="${this.escapeHtml(d)}" /></td>`;
      });
      html += '</tr>';
    });
    
    html += '</tbody>';
    table.innerHTML = html;
  }

  populateBulkReview(modal) {
    const inputs = modal.querySelectorAll('.bulk-value-input');
    const rows = [];
    
    inputs.forEach(input => {
      const value = parseInt(input.value);
      if (!isNaN(value) && value >= 0 && value <= 100) {
        rows.push({
          student_code: input.dataset.student,
          goal_code: input.dataset.goal,
          date: input.dataset.date,
          value
        });
      }
    });
    
    this.pendingBulkRows = rows;
    
    const summary = modal.querySelector('#bulkReviewSummary');
    summary.innerHTML = `
      <p><strong>${rows.length}</strong> entries will be created.</p>
      <div class="bulk-review-list">
        ${rows.map(r => `<div class="bulk-review-item">${this.escapeHtml(r.student_code)} - ${this.escapeHtml(r.goal_code)} - ${this.escapeHtml(r.date)}: ${Math.round(r.value)}%</div>`).slice(0, 20).join('')}
        ${rows.length > 20 ? `<div class="subtle">... and ${rows.length - 20} more</div>` : ''}
      </div>
    `;
  }

  async commitBulkAdd(modal) {
    console.log('[progress-bulk] Committing', this.pendingBulkRows.length, 'rows');
    
    const commitBtn = modal.querySelector('#bulkCommit');
    commitBtn.disabled = true;
    commitBtn.textContent = 'Saving...';
    
    try {
      const result = await this.db.bulkInsertGoalProgress(
        this.pendingBulkRows.map(r => ({
          ...r,
          source: 'manual',
          collected_by: this.options.teacherEmail
        }))
      );
      
      console.log('[progress-bulk] Committed successfully:', result);
      alert(`Successfully saved ${result.inserted} entries!`);
      
      this.closeBulkAddModal();
      await this.refresh();
    } catch (err) {
      console.error('[progress-bulk] Commit failed:', err);
      alert('Failed to save entries. Please try again.');
      commitBtn.disabled = false;
      commitBtn.textContent = '✓ Save All Entries';
    }
  }

  showBulkStep(modal, step) {
    modal.querySelectorAll('.bulk-step').forEach((s, i) => {
      s.classList.toggle('hidden', i + 1 !== step);
    });
  }

  closeBulkAddModal() {
    const modal = document.getElementById('bulkAddModal');
    if (modal) {
      modal.remove();
    }
    this.bulkModalOpen = false;
    this.pendingBulkRows = [];
  }

  // ========================================================================
  // Phase 5: Assignment Goal Mapping UI
  // ========================================================================

  async openMappingModal() {
    console.log('[progress-mapping] Opening assignment-goal mapping modal');
    
    // Fetch assignments
    const assignments = await this.db.listAssignments();
    
    // Create modal
    const modal = document.createElement('div');
    modal.className = 'modal-backdrop show';
    modal.id = 'mappingModal';
    modal.innerHTML = `
      <div class="modal card" style="max-width: 1000px;">
        <div class="card-header">
          <h3>⚙️ Assignment → Goal Mapping</h3>
          <button class="btn small" id="closeMappingModal">✗ Close</button>
        </div>
        <div class="mapping-modal-content">
          <p class="subtle">Map assignments to IEP goals for automated progress tracking when submissions are graded.</p>
          
          <div class="mapping-layout">
            <div class="mapping-assignments">
              <h4>Assignments</h4>
              <input type="text" placeholder="Search assignments..." class="mapping-search" id="assignmentSearch" />
              <div class="mapping-assignment-list" id="assignmentList">
                <!-- Populated by JS -->
              </div>
            </div>
            
            <div class="mapping-goals">
              <h4>Mapped Goals</h4>
              <div id="mappingSelectedAssignment" class="mapping-selected-info">
                Select an assignment to view/edit mappings
              </div>
              <div id="mappingGoalList" class="mapping-goal-list hidden">
                <!-- Populated by JS -->
              </div>
              <button class="btn primary hidden" id="addGoalMappingBtn">+ Add Goals</button>
            </div>
          </div>
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);
    
    // Attach event listeners
    this.attachMappingModalListeners(modal, assignments);
    
    // Populate assignments
    this.populateMappingAssignments(modal, assignments);
  }

  attachMappingModalListeners(modal, assignments) {
    // Close modal
    const closeBtn = modal.querySelector('#closeMappingModal');
    closeBtn.addEventListener('click', () => this.closeMappingModal());
    
    // Assignment search
    const searchInput = modal.querySelector('#assignmentSearch');
    searchInput.addEventListener('input', () => {
      this.filterMappingAssignments(modal, assignments);
    });
  }

  populateMappingAssignments(modal, assignments) {
    const list = modal.querySelector('#assignmentList');
    
    if (!assignments || assignments.length === 0) {
      list.innerHTML = '<div class="subtle" style="padding: 16px;">No assignments found</div>';
      return;
    }
    
    list.innerHTML = assignments.map(a => `
      <div class="mapping-assignment-item" data-assignment-id="${this.escapeHtml(String(a.id))}">
        <strong>${this.escapeHtml(a.title || 'Untitled')}</strong>
        <div class="subtle">${this.escapeHtml(a.series || '')} ${a.type ? `• ${this.escapeHtml(a.type)}` : ''}</div>
      </div>
    `).join('');
    
    // Attach click listeners
    list.querySelectorAll('.mapping-assignment-item').forEach(item => {
      item.addEventListener('click', () => {
        // Deselect others
        list.querySelectorAll('.mapping-assignment-item').forEach(i => i.classList.remove('selected'));
        item.classList.add('selected');
        
        const assignmentId = item.dataset.assignmentId;
        this.showMappingForAssignment(modal, assignmentId, assignments.find(a => a.id == assignmentId));
      });
    });
  }

  filterMappingAssignments(modal, assignments) {
    const search = modal.querySelector('#assignmentSearch').value.toLowerCase();
    modal.querySelectorAll('.mapping-assignment-item').forEach(item => {
      const text = item.textContent.toLowerCase();
      item.style.display = text.includes(search) ? 'block' : 'none';
    });
  }

  async showMappingForAssignment(modal, assignmentId, assignment) {
    console.log('[progress-mapping] Showing mappings for assignment:', assignmentId);
    
    const infoDiv = modal.querySelector('#mappingSelectedAssignment');
    const goalList = modal.querySelector('#mappingGoalList');
    const addBtn = modal.querySelector('#addGoalMappingBtn');
    
    infoDiv.innerHTML = `<strong>${this.escapeHtml(assignment.title || 'Untitled Assignment')}</strong><br/>
      <span class="subtle">${this.escapeHtml(assignment.series || '')} ${assignment.type ? `• ${this.escapeHtml(assignment.type)}` : ''}</span>`;
    
    goalList.classList.remove('hidden');
    addBtn.classList.remove('hidden');
    
    // Fetch existing mappings
    const mappings = await this.db.listAssignmentGoalMappings(assignmentId);
    console.log('[progress-mapping] Fetched mappings:', mappings);
    
    if (!mappings || mappings.length === 0) {
      goalList.innerHTML = '<div class="subtle" style="padding: 16px;">No goals mapped yet. Click "+ Add Goals" to map goals.</div>';
    } else {
      goalList.innerHTML = mappings.map(m => `
        <div class="mapping-goal-item">
          <div class="mapping-goal-info">
            <strong>${this.escapeHtml(m.goals?.code || 'Unknown')}</strong> - ${this.escapeHtml(m.goals?.desc || '')}
            <div class="subtle">${this.escapeHtml(m.goals?.goal_area || 'Uncategorized')}</div>
          </div>
          <div class="mapping-goal-actions">
            <label>
              <input type="checkbox" ${m.primary_goal ? 'checked' : ''} 
                class="mapping-primary-toggle" 
                data-mapping-id="${this.escapeHtml(String(m.id))}" 
                data-assignment-id="${this.escapeHtml(String(assignmentId))}"
                data-goal-id="${this.escapeHtml(String(m.goal_id))}" />
              Primary
            </label>
            <button class="btn small mapping-remove-btn" 
              data-assignment-id="${this.escapeHtml(String(assignmentId))}" 
              data-goal-id="${this.escapeHtml(String(m.goal_id))}">Remove</button>
          </div>
        </div>
      `).join('');
      
      // Attach listeners
      goalList.querySelectorAll('.mapping-primary-toggle').forEach(cb => {
        cb.addEventListener('change', async (e) => {
          const assignmentId = e.target.dataset.assignmentId;
          const goalId = e.target.dataset.goalId;
          const primary = e.target.checked;
          
          try {
            await this.db.upsertAssignmentGoalMapping({
              assignment_id: assignmentId,
              goal_id: goalId,
              primary_goal: primary
            });
            console.log('[progress-mapping] Updated primary flag');
          } catch (err) {
            console.error('[progress-mapping] Failed to update primary flag:', err);
            e.target.checked = !primary; // Revert
            alert('Failed to update primary goal flag');
          }
        });
      });
      
      goalList.querySelectorAll('.mapping-remove-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          const assignmentId = e.target.dataset.assignmentId;
          const goalId = e.target.dataset.goalId;
          
          if (!confirm('Remove this goal mapping?')) return;
          
          try {
            await this.db.deleteAssignmentGoalMapping({
              assignment_id: assignmentId,
              goal_id: goalId
            });
            console.log('[progress-mapping] Removed mapping');
            
            // Refresh mappings
            this.showMappingForAssignment(modal, assignmentId, assignment);
          } catch (err) {
            console.error('[progress-mapping] Failed to remove mapping:', err);
            alert('Failed to remove mapping');
          }
        });
      });
    }
    
    // Add goals button
    addBtn.onclick = () => this.openAddGoalsMappingDialog(modal, assignmentId, assignment);
  }

  async openAddGoalsMappingDialog(modal, assignmentId, assignment) {
    console.log('[progress-mapping] Opening add goals dialog');
    
    // Fetch all goals
    const allGoals = await this.db.listGoalsAll();
    const existingMappings = await this.db.listAssignmentGoalMappings(assignmentId);
    const existingGoalIds = new Set(existingMappings.map(m => m.goal_id));
    
    // Create dialog
    const dialog = document.createElement('div');
    dialog.className = 'modal-backdrop show';
    dialog.id = 'addGoalsDialog';
    dialog.innerHTML = `
      <div class="modal card" style="max-width: 600px;">
        <div class="card-header">
          <h3>Add Goals to "${this.escapeHtml(assignment.title)}"</h3>
          <button class="btn small" id="closeAddGoalsDialog">✗ Close</button>
        </div>
        <div style="padding: 16px;">
          <input type="text" placeholder="Search goals..." class="mapping-search" id="goalSearchDialog" />
          
          <div class="mapping-add-goal-list">
            ${allGoals.map(g => {
              const alreadyMapped = existingGoalIds.has(g.id);
              return `
                <label class="mapping-add-goal-item ${alreadyMapped ? 'disabled' : ''}">
                  <input type="checkbox" value="${this.escapeHtml(String(g.id))}" ${alreadyMapped ? 'disabled' : ''} 
                    data-student-code="${this.escapeHtml(g.student_code || '')}" 
                    data-goal-code="${this.escapeHtml(g.code || '')}" />
                  <div class="mapping-goal-info">
                    <strong>${this.escapeHtml(g.student_code || 'Unknown')} - ${this.escapeHtml(g.code || '')}</strong>
                    <div class="subtle">${this.escapeHtml(g.desc || '')}</div>
                    <div class="badge">${this.escapeHtml(g.goal_area || 'Uncategorized')}</div>
                  </div>
                  ${alreadyMapped ? '<span class="subtle">Already mapped</span>' : ''}
                </label>
              `;
            }).join('')}
          </div>
          
          <div style="margin-top: 16px; display: flex; gap: 8px;">
            <button class="btn" id="cancelAddGoals">Cancel</button>
            <button class="btn primary" id="confirmAddGoals">Add Selected Goals</button>
          </div>
        </div>
      </div>
    `;
    
    document.body.appendChild(dialog);
    
    // Search
    dialog.querySelector('#goalSearchDialog').addEventListener('input', (e) => {
      const search = e.target.value.toLowerCase();
      dialog.querySelectorAll('.mapping-add-goal-item').forEach(item => {
        const text = item.textContent.toLowerCase();
        item.style.display = text.includes(search) ? 'flex' : 'none';
      });
    });
    
    // Close
    const closeDialog = () => {
      dialog.remove();
    };
    
    dialog.querySelector('#closeAddGoalsDialog').addEventListener('click', closeDialog);
    dialog.querySelector('#cancelAddGoals').addEventListener('click', closeDialog);
    
    // Confirm
    dialog.querySelector('#confirmAddGoals').addEventListener('click', async () => {
      const selected = Array.from(dialog.querySelectorAll('.mapping-add-goal-item input:checked'))
        .map(cb => cb.value);
      
      if (selected.length === 0) {
        alert('Please select at least one goal');
        return;
      }
      
      console.log('[progress-mapping] Adding mappings:', selected);
      
      try {
        for (const goalId of selected) {
          await this.db.upsertAssignmentGoalMapping({
            assignment_id: assignmentId,
            goal_id: goalId,
            primary_goal: false
          });
        }
        
        console.log('[progress-mapping] Added', selected.length, 'mappings');
        closeDialog();
        
        // Refresh mappings
        this.showMappingForAssignment(modal, assignmentId, assignment);
      } catch (err) {
        console.error('[progress-mapping] Failed to add mappings:', err);
        alert('Failed to add mappings. Please try again.');
      }
    });
  }

  closeMappingModal() {
    const modal = document.getElementById('mappingModal');
    if (modal) {
      modal.remove();
    }
    
    // Also close add goals dialog if open
    const dialog = document.getElementById('addGoalsDialog');
    if (dialog) {
      dialog.remove();
    }
  }

  // ========================================================================
  // Phase 5: Realtime Refresh
  // ========================================================================

  async setupRealtime() {
    // Skip realtime setup if disabled via runtime config
    if (isRealtimeDisabled()) {
      console.info('[progress-realtime] Realtime disabled - skipping setup');
      return;
    }
    
    // Only setup if Supabase is available
    const supabase = await this.db.getSupabase?.();
    if (!supabase) {
      console.log('[progress-realtime] Supabase not available, skipping realtime setup');
      return;
    }
    
    console.log('[progress-realtime] Setting up realtime subscription');
    
    this.realtimeChannel = supabase
      .channel('goal_progress_changes')
      .on('postgres_changes', 
        { event: 'INSERT', schema: 'public', table: 'goal_progress' },
        payload => this.handleRealtimeInsert(payload)
      )
      .subscribe((status) => {
        console.log('[progress-realtime] Subscription status:', status);
        this.realtimeActive = status === 'SUBSCRIBED';
      });
  }

  handleRealtimeInsert(payload) {
    console.log('[progress-realtime] Insert detected:', payload);
    
    // Debounce refresh to avoid excessive updates
    clearTimeout(this.realtimeDebounceTimer);
    this.realtimeDebounceTimer = setTimeout(() => {
      console.log('[progress-realtime] Refreshing grid');
      this.refresh();
    }, 250);
  }

  teardownRealtime() {
    if (this.realtimeChannel) {
      console.log('[progress-realtime] Tearing down realtime subscription');
      this.realtimeChannel.unsubscribe();
      this.realtimeChannel = null;
      this.realtimeActive = false;
    }
  }

  // ========================================================================
  // Phase 4-5: Diagnostics
  // ========================================================================

  getDiagnostics() {
    return {
      editingEnabled: getFeatureFlag('progressEditing'),
      autoFromAssignmentsEnabled: getFeatureFlag('progressAutoFromAssignments'),
      savedViewsEnabled: getFeatureFlag('progressSavedViews'),
      advancedFiltersEnabled: getFeatureFlag('progressAdvancedFilters'),
      riskIndicatorsEnabled: getFeatureFlag('progressRiskIndicators'),
      rollupsEnabled: getFeatureFlag('progressRollups'),
      pdfExportEnabled: getFeatureFlag('progressPdfExport'),
      bulkModalOpen: this.bulkModalOpen,
      pendingBulkRows: this.pendingBulkRows.length,
      realtimeActive: this.realtimeActive,
      editingCell: this.editingCell ? `${this.editingCell.student_code}|${this.editingCell.goal_code}|${this.editingCell.date}` : null,
      dataRows: this.rawData.length,
      processedAreas: this.processedData?.sortedAreas?.length || 0,
      currentViewId: this.currentViewId,
      granularity: this.granularity,
      cacheSize: this.queryCache.size
    };
  }

  // ========================================================================
  // Phase 6-8: Saved Views
  // ========================================================================

  async loadSavedViews() {
    if (!getFeatureFlag('progressSavedViews')) return;
    
    try {
      this.savedViews = await this.db.listSavedViews(this.options.userId);
      console.log('[saved-views] Loaded', this.savedViews.length, 'saved views');
      
      // Auto-restore last used or default view
      const defaultView = this.savedViews.find(v => v.is_default);
      const lastUsedViewId = localStorage.getItem(`rc_progress_last_view_${this.options.userId}`);
      const viewToRestore = lastUsedViewId 
        ? this.savedViews.find(v => v.id === lastUsedViewId) || defaultView
        : defaultView;
      
      if (viewToRestore) {
        await this.restoreView(viewToRestore.id);
      }
    } catch (err) {
      console.error('[saved-views] Failed to load saved views:', err);
    }
  }

  async saveCurrentView(name, setAsDefault = false) {
    if (!getFeatureFlag('progressSavedViews')) return;
    
    const config = this.getCurrentViewConfig();
    
    try {
      const view = await this.db.createSavedView(this.options.userId, {
        name,
        config,
        is_default: setAsDefault
      });
      
      this.savedViews.push(view);
      this.currentViewId = view.id;
      this.currentViewName = view.name;
      
      console.log('[saved-views] Created view:', name);
      return view;
    } catch (err) {
      console.error('[saved-views] Failed to create view:', err);
      throw err;
    }
  }

  async updateCurrentView() {
    if (!getFeatureFlag('progressSavedViews') || !this.currentViewId) return;
    
    const config = this.getCurrentViewConfig();
    
    try {
      const view = await this.db.updateSavedView(this.options.userId, this.currentViewId, {
        config
      });
      
      // Update in local array
      const idx = this.savedViews.findIndex(v => v.id === this.currentViewId);
      if (idx >= 0) {
        this.savedViews[idx] = view;
      }
      
      console.log('[saved-views] Updated view:', this.currentViewName);
      return view;
    } catch (err) {
      console.error('[saved-views] Failed to update view:', err);
      throw err;
    }
  }

  async deleteView(viewId) {
    if (!getFeatureFlag('progressSavedViews')) return;
    
    try {
      await this.db.deleteSavedView(this.options.userId, viewId);
      
      this.savedViews = this.savedViews.filter(v => v.id !== viewId);
      
      if (this.currentViewId === viewId) {
        this.currentViewId = null;
        this.currentViewName = null;
      }
      
      console.log('[saved-views] Deleted view:', viewId);
    } catch (err) {
      console.error('[saved-views] Failed to delete view:', err);
      throw err;
    }
  }

  async restoreView(viewId) {
    if (!getFeatureFlag('progressSavedViews')) return;
    
    const view = this.savedViews.find(v => v.id === viewId);
    if (!view) {
      console.warn('[saved-views] View not found:', viewId);
      return;
    }
    
    this.applyViewConfig(view.config);
    this.currentViewId = view.id;
    this.currentViewName = view.name;
    
    // Remember last used view
    localStorage.setItem(`rc_progress_last_view_${this.options.userId}`, viewId);
    
    console.log('[saved-views] Restored view:', view.name);
    await this.refresh();
  }

  getCurrentViewConfig() {
    return {
      filters: { ...this.filters },
      sorting: { ...this.sorting },
      collapsedAreas: Array.from(this.collapsedAreas),
      visibleColumns: { ...this.visibleColumns },
      granularity: this.granularity
    };
  }

  applyViewConfig(config) {
    if (config.filters) {
      this.filters = { ...this.filters, ...config.filters };
    }
    if (config.sorting) {
      this.sorting = { ...config.sorting };
    }
    if (config.collapsedAreas) {
      this.collapsedAreas = new Set(config.collapsedAreas);
    }
    if (config.visibleColumns) {
      this.visibleColumns = { ...this.visibleColumns, ...config.visibleColumns };
    }
    if (config.granularity) {
      this.granularity = config.granularity;
    }
  }

  // ========================================================================
  // Phase 6-8: Advanced Filters
  // ========================================================================

  applyAdvancedFilters(data) {
    if (!getFeatureFlag('progressAdvancedFilters')) return data;
    
    let filtered = data;
    
    // Value range filter (on current value)
    if (this.filters.valueRange.min != null || this.filters.valueRange.max != null) {
      filtered = filtered.filter(row => {
        const current = row.current;
        if (current == null) return false;
        
        if (this.filters.valueRange.min != null && current < this.filters.valueRange.min) return false;
        if (this.filters.valueRange.max != null && current > this.filters.valueRange.max) return false;
        
        return true;
      });
    }
    
    // Source type filter
    if (this.filters.sources.length > 0) {
      filtered = filtered.filter(row => {
        // Check if any entry for this goal matches the source types
        const entries = this.rawData.filter(r => 
          r.student_code === row.student_code && r.goal_code === row.goal_code
        );
        return entries.some(e => this.filters.sources.includes(e.source));
      });
    }
    
    // Data recency filter
    if (this.filters.dataRecencyDays != null) {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - this.filters.dataRecencyDays);
      const cutoffStr = cutoffDate.toISOString().split('T')[0];
      
      filtered = filtered.filter(row => {
        const entries = this.rawData.filter(r => 
          r.student_code === row.student_code && r.goal_code === row.goal_code
        );
        return entries.some(e => e.date >= cutoffStr);
      });
    }
    
    return filtered;
  }

  // ========================================================================
  // Phase 6-8: Risk Indicators
  // ========================================================================

  calculateRiskIndicators(item) {
    if (!getFeatureFlag('progressRiskIndicators')) {
      return { risk: 'none', reasons: [], lastDataAge: null, deltaVsTarget: null };
    }
    
    const risks = [];
    let riskLevel = 'green'; // green, amber, red
    
    // Find all entries for this goal
    const entries = this.rawData.filter(r => 
      r.student_code === item.student_code && r.goal_code === item.goal_code
    );
    
    if (entries.length === 0) {
      return { risk: 'none', reasons: ['No data'], lastDataAge: null, deltaVsTarget: null };
    }
    
    // Calculate last data age
    const sortedDates = entries.map(e => e.date).sort();
    const lastDate = sortedDates[sortedDates.length - 1];
    const today = new Date().toISOString().split('T')[0];
    const lastDataAge = this.daysBetween(lastDate, today);
    
    // Check missing data recency
    const thresholds = this.options.riskThresholds;
    if (lastDataAge >= thresholds.missingDataDaysRed) {
      riskLevel = 'red';
      risks.push(`No data in ${lastDataAge} days`);
    } else if (lastDataAge >= thresholds.missingDataDaysAmber) {
      if (riskLevel === 'green') riskLevel = 'amber';
      risks.push(`No data in ${lastDataAge} days`);
    }
    
    // Calculate delta vs target (if target exists)
    let deltaVsTarget = null;
    if (item.target != null && item.current != null) {
      deltaVsTarget = item.current - item.target;
      
      if (deltaVsTarget < -thresholds.belowTargetRed) {
        riskLevel = 'red';
        risks.push(`${Math.abs(Math.round(deltaVsTarget))}pp below target`);
      } else if (deltaVsTarget < 0 && Math.abs(deltaVsTarget) <= thresholds.belowTargetAmber) {
        if (riskLevel !== 'red') riskLevel = 'amber';
        risks.push(`${Math.abs(Math.round(deltaVsTarget))}pp below target`);
      }
    }
    
    // Check for negative trend
    const recentValues = sortedDates.slice(-thresholds.negativeTrendPoints).map(date => {
      const entry = entries.find(e => e.date === date);
      return entry ? entry.value : null;
    }).filter(v => v != null);
    
    if (recentValues.length >= 2) {
      const isNegativeTrend = recentValues.every((val, idx) => {
        if (idx === 0) return true;
        return val < recentValues[idx - 1];
      });
      
      if (isNegativeTrend) {
        if (riskLevel === 'green') riskLevel = 'amber';
        risks.push(`Declining trend over ${recentValues.length} points`);
      }
    }
    
    return {
      risk: riskLevel,
      reasons: risks,
      lastDataAge,
      deltaVsTarget
    };
  }

  daysBetween(date1Str, date2Str) {
    const d1 = new Date(date1Str + 'T00:00:00');
    const d2 = new Date(date2Str + 'T00:00:00');
    const diffTime = Math.abs(d2 - d1);
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  getRiskIcon(risk, reasons) {
    const icons = {
      red: '🔴',
      amber: '🟡',
      green: '🟢',
      none: '⚪'
    };
    const icon = icons[risk] || '⚪';
    const tooltip = reasons.length > 0 ? reasons.join('; ') : 'No issues';
    return `<span class="risk-indicator risk-${risk}" title="${this.escapeHtml(tooltip)}">${icon}</span>`;
  }

  // ========================================================================
  // Phase 6-8: Rollups (Weekly/Monthly Aggregation)
  // ========================================================================

  setGranularity(granularity) {
    if (!getFeatureFlag('progressRollups')) return;
    
    if (!['daily', 'weekly', 'monthly'].includes(granularity)) {
      console.warn('[rollups] Invalid granularity:', granularity);
      return;
    }
    
    this.granularity = granularity;
    console.log('[rollups] Granularity set to:', granularity);
    this.refresh();
  }

  aggregateByGranularity(data) {
    if (this.granularity === 'daily' || !getFeatureFlag('progressRollups')) {
      return data; // No aggregation needed
    }
    
    // Group by student/goal and aggregate by time period
    const aggregated = [];
    const grouped = {};
    
    data.forEach(row => {
      const key = `${row.student_code}|${row.goal_code}`;
      if (!grouped[key]) {
        grouped[key] = {
          ...row,
          measurements: {}
        };
      }
      
      // Aggregate measurements by period
      Object.entries(row.measurements).forEach(([date, value]) => {
        const period = this.granularity === 'weekly' 
          ? this.getWeekKey(date)
          : this.getMonthKey(date);
        
        if (!grouped[key].measurements[period]) {
          grouped[key].measurements[period] = [];
        }
        grouped[key].measurements[period].push(value);
      });
    });
    
    // Calculate averages for each period
    Object.values(grouped).forEach(row => {
      const avgMeasurements = {};
      Object.entries(row.measurements).forEach(([period, values]) => {
        avgMeasurements[period] = values.reduce((sum, v) => sum + v, 0) / values.length;
      });
      row.measurements = avgMeasurements;
      aggregated.push(row);
    });
    
    return aggregated;
  }

  getWeekKey(dateStr) {
    // ISO week: YYYY-Www (e.g., 2025-W42)
    const date = new Date(dateStr + 'T00:00:00');
    const year = date.getFullYear();
    const week = this.getISOWeek(date);
    return `${year}-W${String(week).padStart(2, '0')}`;
  }

  getISOWeek(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + 4 - (d.getDay() || 7));
    const yearStart = new Date(d.getFullYear(), 0, 1);
    return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  }

  getMonthKey(dateStr) {
    // Format: YYYY-MM
    const date = new Date(dateStr + 'T00:00:00');
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
  }

  formatPeriodHeader(periodKey) {
    if (this.granularity === 'weekly') {
      // Format: W42 (Oct 15)
      const [year, week] = periodKey.split('-W');
      const weekEndDate = this.getWeekEndDate(parseInt(year), parseInt(week));
      return `W${week} (${this.formatDate(weekEndDate)})`;
    } else if (this.granularity === 'monthly') {
      // Format: Oct 2025
      const [year, month] = periodKey.split('-');
      const date = new Date(year, parseInt(month) - 1, 1);
      return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    } else {
      return this.formatDate(periodKey);
    }
  }

  getWeekEndDate(year, week) {
    const jan4 = new Date(year, 0, 4);
    const daysToAdd = (week - 1) * 7 + (7 - jan4.getDay());
    const weekEnd = new Date(year, 0, 4 + daysToAdd);
    return weekEnd.toISOString().split('T')[0];
  }

  // ========================================================================
  // Phase 6-8: PDF Export
  // ========================================================================

  async exportToPDF() {
    if (!getFeatureFlag('progressPdfExport')) {
      alert('PDF export is not enabled. Please enable it in settings.');
      return;
    }
    
    // Use jsPDF library (needs to be loaded separately)
    if (typeof window.jspdf === 'undefined') {
      console.error('[pdf-export] jsPDF library not loaded');
      alert('PDF export library not loaded. Please include jsPDF in your page.');
      return;
    }
    
    try {
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a4'
      });
      
      // Header
      doc.setFontSize(16);
      doc.text('IEP Progress Report', 14, 15);
      
      doc.setFontSize(10);
      doc.text(`Date: ${new Date().toLocaleDateString()}`, 14, 22);
      doc.text(`Teacher: ${this.options.teacherEmail}`, 14, 27);
      
      if (this.currentViewName) {
        doc.text(`View: ${this.currentViewName}`, 14, 32);
      }
      
      if (this.filters.dateRange.start || this.filters.dateRange.end) {
        const range = `${this.filters.dateRange.start || 'start'} to ${this.filters.dateRange.end || 'today'}`;
        doc.text(`Date Range: ${range}`, 14, 37);
      }
      
      // Export grid data
      let yPos = 45;
      const { groupedByArea, sortedAreas } = this.processedData;
      
      doc.setFontSize(8);
      
      for (const area of sortedAreas) {
        const items = groupedByArea[area];
        
        // Check if we need a new page
        if (yPos > 180) {
          doc.addPage();
          yPos = 15;
        }
        
        // Goal Area Header
        doc.setFontSize(12);
        doc.setFont(undefined, 'bold');
        doc.text(`📁 ${area}`, 14, yPos);
        yPos += 7;
        
        doc.setFontSize(8);
        doc.setFont(undefined, 'normal');
        
        // Render simplified table for each item
        items.forEach(item => {
          if (yPos > 185) {
            doc.addPage();
            yPos = 15;
          }
          
          const text = `${item.student_code} - ${item.goal_code}: Current ${item.current != null ? Math.round(item.current) + '%' : '—'}, Baseline ${item.baseline != null ? Math.round(item.baseline) + '%' : '—'}`;
          doc.text(text, 14, yPos);
          yPos += 5;
        });
        
        yPos += 3;
      }
      
      // Save PDF
      const filename = `IEP_Progress_${new Date().toISOString().split('T')[0]}.pdf`;
      doc.save(filename);
      
      console.log('[pdf-export] PDF exported:', filename);
    } catch (err) {
      console.error('[pdf-export] Failed to export PDF:', err);
      alert('Failed to export PDF. See console for details.');
    }
  }

  // ========================================================================
  // Phase 6-8: Performance - Query Caching
  // ========================================================================

  getFilterHash() {
    // Create a hash of current filters for caching
    return JSON.stringify({
      filters: this.filters,
      sorting: this.sorting,
      granularity: this.granularity
    });
  }

  getCachedQuery(hash) {
    return this.queryCache.get(hash);
  }

  setCachedQuery(hash, data) {
    // Implement LRU cache
    if (this.queryCache.size >= this.maxCacheSize) {
      const firstKey = this.queryCache.keys().next().value;
      this.queryCache.delete(firstKey);
    }
    this.queryCache.set(hash, data);
  }

  clearQueryCache() {
    this.queryCache.clear();
    console.log('[cache] Query cache cleared');
  }
}
