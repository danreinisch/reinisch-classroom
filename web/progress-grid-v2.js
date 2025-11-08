// ============================================================================
// IEP Progress Grid V2 (Phases 2-3)
// ============================================================================
// Spreadsheet-like grid with:
// - Multi-quarter selection
// - Column virtualization for horizontal scrolling
// - Collapsible goal-area grouping
// - Enhanced filtering and search
// - Baseline, Current, Delta, Trend metrics
// - CSV export
// ============================================================================

export class ProgressGridV2 {
  constructor(dataAdapter, options = {}) {
    this.db = dataAdapter;
    this.options = {
      trendThreshold: options.trendThreshold || 5, // percentage points
      columnBufferSize: options.columnBufferSize || 5, // extra columns to render
      debounceMs: options.debounceMs || 300,
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
    
    // Bind methods
    this.render = this.render.bind(this);
    this.refresh = this.refresh.bind(this);
    this.exportCSV = this.exportCSV.bind(this);
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
            html += `<td class="col-date">${value != null ? Math.round(value) + '%' : '—'}</td>`;
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
}
