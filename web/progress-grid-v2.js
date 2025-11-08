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

export class ProgressGridV2 {
  constructor(dataAdapter, options = {}) {
    this.db = dataAdapter;
    this.options = {
      trendThreshold: options.trendThreshold || 5, // percentage points
      columnBufferSize: options.columnBufferSize || 5, // extra columns to render
      debounceMs: options.debounceMs || 300,
      teacherEmail: options.teacherEmail || 'teacher@example.com', // For collected_by
      ...options
    };
    
    // State
    this.filters = {
      studentCodes: [],
      classCodes: [],
      goalAreas: [],
      quarters: [], // Empty means current quarter
      dateRange: { start: null, end: null },
      searchText: ''
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
    
    // Data cache
    this.rawData = [];
    this.quarterAverages = [];
    this.processedData = null;
    
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
    
    if ([7, 8, 9].includes(month)) return 'Q1';
    if ([10, 11, 12].includes(month)) return 'Q2';
    if ([1, 2, 3].includes(month)) return 'Q3';
    if ([4, 5, 6].includes(month)) return 'Q4';
    return 'Q1';
  }
  
  getQuarterDateRange(quarter) {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    
    // Determine school year
    const schoolYear = month >= 7 ? year : year - 1;
    
    const ranges = {
      'Q1': { start: `${schoolYear}-07-01`, end: `${schoolYear}-09-30` },
      'Q2': { start: `${schoolYear}-10-01`, end: `${schoolYear}-12-31` },
      'Q3': { start: `${schoolYear + 1}-01-01`, end: `${schoolYear + 1}-03-31` },
      'Q4': { start: `${schoolYear + 1}-04-01`, end: `${schoolYear + 1}-06-30` }
    };
    
    return ranges[quarter] || { start: null, end: null };
  }
  
  getQuarterLabel(quarter) {
    const labels = {
      'Q1': 'Q1 (Jul-Sep)',
      'Q2': 'Q2 (Oct-Dec)',
      'Q3': 'Q3 (Jan-Mar)',
      'Q4': 'Q4 (Apr-Jun)'
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
          
          case 'current':
            const currA = metricsA?.current || 0;
            const currB = metricsB?.current || 0;
            return this.sorting.direction === 'asc' ? currA - currB : currB - currA;
          
          case 'delta':
            const deltaA = metricsA?.delta || 0;
            const deltaB = metricsB?.delta || 0;
            return this.sorting.direction === 'asc' ? deltaA - deltaB : deltaB - deltaA;
          
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
  
  // ========================================================================
  // Rendering
  // ========================================================================
  
  buildFilterBar() {
    const selectedQuarters = this.filters.quarters.length > 0 
      ? this.filters.quarters 
      : [this.getCurrentQuarter()];
    
    return `
      <div class="progress-grid-v2-filters">
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
          ${getFeatureFlag('progressEditing') ? '<button class="btn small primary" id="gridBulkAddBtn">➕ Bulk Add Progress</button>' : ''}
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
    html += '<table class="progress-grid-v2-table">';
    
    // Header
    html += '<thead><tr>';
    html += '<th class="col-student sortable" data-field="student_code">Student</th>';
    html += '<th class="col-goal-code">Goal</th>';
    html += '<th class="col-goal-desc">Description</th>';
    html += '<th class="col-class">Class</th>';
    html += '<th class="col-baseline">Baseline</th>';
    html += '<th class="col-current sortable" data-field="current">Current</th>';
    html += '<th class="col-delta sortable" data-field="delta">Delta</th>';
    html += '<th class="col-trend">Trend</th>';
    
    // Quarter average columns
    selectedQuarters.forEach(q => {
      html += `<th class="col-quarter-avg">${q} Avg</th>`;
    });
    
    // Date columns
    visibleDates.forEach(date => {
      html += `<th class="col-date">${this.formatDate(date)}</th>`;
    });
    
    html += '</tr></thead><tbody>';
    
    // Render each area
    sortedAreas.forEach(area => {
      const items = groupedByArea[area];
      const isCollapsed = this.collapsedAreas.has(area);
      
      // Area header
      html += `
        <tr class="area-header" data-area="${area}">
          <td colspan="${8 + selectedQuarters.length + visibleDates.length}">
            <span class="collapse-icon">${isCollapsed ? '▶' : '▼'}</span>
            📁 ${area} (${items.length} goals)
          </td>
        </tr>
      `;
      
      // Data rows (skip if collapsed)
      if (!isCollapsed) {
        items.forEach(item => {
          const key = `${item.student_code}|${item.goal_code}`;
          const metrics = goalMetricsMap[key];
          
          // Get quarter averages for this goal
          const quarterAvgs = {};
          this.quarterAverages.forEach(qa => {
            if (qa.student_code === item.student_code && qa.goal_code === item.goal_code) {
              quarterAvgs[qa.quarter] = qa.avg_value;
            }
          });
          
          html += '<tr class="data-row">';
          
          // Student
          html += `<td class="col-student">${item.student_name}<br><span class="student-code">${item.student_code}</span></td>`;
          
          // Goal code
          html += `<td class="col-goal-code"><span class="badge">${item.goal_code}</span></td>`;
          
          // Goal description (truncated with tooltip)
          const truncDesc = item.goal_desc.length > 120 
            ? item.goal_desc.substring(0, 120) + '...' 
            : item.goal_desc;
          html += `<td class="col-goal-desc" title="${this.escapeHtml(item.goal_desc)}">${truncDesc}</td>`;
          
          // Class
          html += `<td class="col-class">${item.class_code || '—'}</td>`;
          
          // Metrics
          html += `<td class="col-baseline">${metrics?.baseline != null ? Math.round(metrics.baseline) + '%' : '—'}</td>`;
          html += `<td class="col-current">${metrics?.current != null ? Math.round(metrics.current) + '%' : '—'}</td>`;
          html += `<td class="col-delta ${this.getDeltaClass(metrics?.delta)}">${this.formatDelta(metrics?.delta)}</td>`;
          html += `<td class="col-trend">${this.getTrendIcon(metrics?.trend)}</td>`;
          
          // Quarter averages
          selectedQuarters.forEach(q => {
            const avg = quarterAvgs[q];
            html += `<td class="col-quarter-avg">${avg != null ? Math.round(avg) + '%' : '—'}</td>`;
          });
          
          // Date columns
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
            
            html += `<td class="${cellClass}" ${cellData} tabindex="${isEditable ? '0' : '-1'}">
              ${value != null ? Math.round(value) + '%' : '—'}
              ${stackedIndicator}
            </td>`;
          });
          
          html += '</tr>';
        });
      }
    });
    
    html += '</tbody></table></div>';
    
    // Add scroll hint if there are more columns
    if (sortedDates.length > visibleDates.length) {
      html += `<div class="scroll-hint">← Scroll horizontally to see ${sortedDates.length - visibleDates.length} more date columns →</div>`;
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
    
    // Add quarter average columns
    selectedQuarters.forEach(q => {
      header.push(`${q} Avg`);
    });
    
    // Add date columns
    sortedDates.forEach(date => {
      header.push(date);
    });
    
    rows.push(header);
    
    // Data rows (flattened, respecting sort order)
    sortedAreas.forEach(area => {
      const items = groupedByArea[area];
      
      items.forEach(item => {
        const key = `${item.student_code}|${item.goal_code}`;
        const metrics = goalMetricsMap[key];
        
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
        
        // Add quarter averages
        selectedQuarters.forEach(q => {
          const avg = quarterAvgs[q];
          row.push(avg != null ? Math.round(avg) : '');
        });
        
        // Add date values
        sortedDates.forEach(date => {
          const value = item.measurements[date];
          row.push(value != null ? Math.round(value) : '');
        });
        
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
    const filename = `progress_export_${timestamp}.csv`;
    
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
    editor.innerHTML = `
      <input type="number" min="0" max="100" step="1" value="${currentValue || ''}" class="editor-input" />
      <button class="editor-save" title="Save">✓</button>
      <button class="editor-cancel" title="Cancel">✗</button>
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
      Array.from(areas).sort().map(a => `<option value="${a}">${a}</option>`).join('');
    
    const classFilter = modal.querySelector('.bulk-class-filter');
    classFilter.innerHTML = '<option value="">All Classes</option>' + 
      Array.from(classes).sort().map(c => `<option value="${c}">${c}</option>`).join('');
    
    // Populate goal list
    const goalList = modal.querySelector('#bulkGoalList');
    goalList.innerHTML = goals.map(g => `
      <label class="bulk-goal-item">
        <input type="checkbox" value="${g.student_code}|${g.goal_code}" />
        <div class="bulk-goal-info">
          <strong>${g.student_name} (${g.student_code})</strong> - ${g.goal_code}
          <div class="subtle">${g.goal_desc.substring(0, 100)}${g.goal_desc.length > 100 ? '...' : ''}</div>
          <div class="badge">${g.goal_area}</div>
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
      html += `<th>${d}</th>`;
    });
    html += '</tr></thead><tbody>';
    
    goals.forEach(g => {
      html += `<tr><td><strong>${g.student_name}</strong><br/>${g.goal_code}</td>`;
      dates.forEach(d => {
        html += `<td><input type="number" min="0" max="100" class="bulk-value-input" data-student="${g.student_code}" data-goal="${g.goal_code}" data-date="${d}" /></td>`;
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
        ${rows.map(r => `<div class="bulk-review-item">${r.student_code} - ${r.goal_code} - ${r.date}: ${r.value}%</div>`).slice(0, 20).join('')}
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
  // Phase 5: Realtime Refresh
  // ========================================================================

  async setupRealtime() {
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
      bulkModalOpen: this.bulkModalOpen,
      pendingBulkRows: this.pendingBulkRows.length,
      realtimeActive: this.realtimeActive,
      editingCell: this.editingCell ? `${this.editingCell.student_code}|${this.editingCell.goal_code}|${this.editingCell.date}` : null,
      dataRows: this.rawData.length,
      processedAreas: this.processedData?.sortedAreas?.length || 0
    };
  }
}
