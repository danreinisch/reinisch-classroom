/**
 * Student Manager UI
 * 
 * Provides basic Student Manager UI components:
 * - Metrics (total, active, goals)
 * - Filter (Active/Inactive/All) and search
 * - Student list with counts and placeholder actions
 * - Loading states and error handling
 */

console.log('[student-manager-ui] Module loading started');

import { studentRpc } from './student-manager-rpc.js';

console.log('[student-manager-ui] student-manager-rpc.js imported successfully');

/**
 * StudentManagerUI class
 * Manages the Student Manager panel rendering and interactions
 */
export class StudentManagerUI {
  constructor(containerSelector) {
    this.containerSelector = containerSelector;
    this.container = null;
    this.students = [];
    this.filteredStudents = [];
    this.currentFilter = 'all';
    this.searchTerm = '';
    this.loading = false;
    this.error = null;
  }
  
  /**
   * Initialize the UI
   */
  async init() {
    console.log('[student-manager-ui] Initializing...');
    this.container = document.querySelector(this.containerSelector);
    
    if (!this.container) {
      console.error('[student-manager-ui] Container not found:', this.containerSelector);
      return;
    }
    
    // Show loading state
    this.showLoading();
    
    try {
      // Run environment diagnostics
      const envChecks = await studentRpc.checkEnvironment();
      this.renderDiagnostics(envChecks);
      
      // Load students
      await this.loadStudents();
      
      // Render UI
      this.render();
      
      // Attach event listeners
      this.attachEventListeners();
    } catch (err) {
      console.error('[student-manager-ui] Initialization failed:', err);
      this.error = err.message;
      this.renderError();
    }
  }
  
  /**
   * Show loading state
   */
  showLoading() {
    if (!this.container) return;
    
    const loadingHTML = `
      <div style="padding:40px;text-align:center">
        <div style="font-size:32px;margin-bottom:12px">⏳</div>
        <div style="font-weight:800;margin-bottom:8px">Loading Student Manager...</div>
        <div class="subtle">Running diagnostics and loading data...</div>
      </div>
    `;
    
    // Find or create loading container
    let loadingContainer = this.container.querySelector('#smLoadingContainer');
    if (!loadingContainer) {
      loadingContainer = document.createElement('div');
      loadingContainer.id = 'smLoadingContainer';
      this.container.appendChild(loadingContainer);
    }
    loadingContainer.innerHTML = loadingHTML;
  }
  
  /**
   * Render environment diagnostics
   */
  renderDiagnostics(checks) {
    console.log('[student-manager-ui] Rendering diagnostics:', checks);
    
    try {
      const diagnosticsEl = this.container?.querySelector('#smDiagnostics');
      if (!diagnosticsEl) {
        // Create diagnostics section if it doesn't exist
        const section = document.createElement('div');
        section.id = 'smDiagnostics';
        section.className = 'card';
        section.style.marginBottom = '16px';
        
        // Insert after metrics or at the beginning
        const metricsSection = this.container?.querySelector('#smMetrics');
        if (metricsSection && metricsSection.nextSibling) {
          this.container.insertBefore(section, metricsSection.nextSibling);
        } else if (this.container) {
          this.container.insertBefore(section, this.container.firstChild);
        }
      }
      
      const diagnosticsContainer = this.container?.querySelector('#smDiagnostics');
      if (!diagnosticsContainer) return;
      
      const statusIcon = (status) => {
        if (status === 'ok') return '✅';
        if (status === 'fail') return '❌';
        if (status === 'warn') return '⚠️';
        if (status === 'n/a') return '➖';
        return '⏳';
      };
      
      const statusColor = (status) => {
        if (status === 'ok') return 'rgba(34,197,94,.8)';
        if (status === 'fail') return 'rgba(239,68,68,.8)';
        if (status === 'warn') return 'rgba(251,191,36,.8)';
        return 'rgba(148,163,184,.8)';
      };
      
      // Check if any failures exist
      const hasFailures = checks && (
        checks.studentsTable?.status === 'fail' ||
        checks.goalsTable?.status === 'fail' ||
        checks.enrollmentsTable?.status === 'fail' ||
        checks.rpcAvailable?.status === 'fail'
      );
      
      diagnosticsContainer.innerHTML = `
        <div class="card-header">
          <div>🔍 Environment Diagnostics</div>
          <span class="badge" style="background:${statusColor(checks?.mode === 'remote' ? 'ok' : 'warn')}">${checks?.mode === 'remote' ? 'Remote Mode' : 'Local Mode'}</span>
        </div>
        
        ${hasFailures ? `
          <div style="padding:10px;margin-top:12px;background:rgba(251,191,36,.1);border:1px solid rgba(251,191,36,.5);border-radius:8px">
            <div style="font-weight:700;margin-bottom:4px;color:rgba(251,191,36,.9)">⚠️ Partial Metrics</div>
            <div class="subtle" style="font-size:12px">One or more data sources failed to load. Metrics marked with * indicate partial or unavailable data.</div>
          </div>
        ` : ''}
        
        <div style="display:grid;gap:8px;margin-top:12px">
          <div style="display:flex;align-items:center;gap:10px;padding:8px;border-radius:8px;background:rgba(255,255,255,.04)">
            <span style="font-size:20px">${statusIcon(checks?.studentsTable?.status)}</span>
            <div style="flex:1">
              <div style="font-weight:700">Students Table</div>
              <div class="subtle" style="font-size:12px">${checks?.studentsTable?.message || 'Checking...'}</div>
            </div>
          </div>
          
          <div style="display:flex;align-items:center;gap:10px;padding:8px;border-radius:8px;background:rgba(255,255,255,.04)">
            <span style="font-size:20px">${statusIcon(checks?.goalsTable?.status)}</span>
            <div style="flex:1">
              <div style="font-weight:700">Goals Table</div>
              <div class="subtle" style="font-size:12px">${checks?.goalsTable?.message || 'Checking...'}</div>
            </div>
          </div>
          
          <div style="display:flex;align-items:center;gap:10px;padding:8px;border-radius:8px;background:rgba(255,255,255,.04)">
            <span style="font-size:20px">${statusIcon(checks?.enrollmentsTable?.status)}</span>
            <div style="flex:1">
              <div style="font-weight:700">Enrollments Table</div>
              <div class="subtle" style="font-size:12px">${checks?.enrollmentsTable?.message || 'Checking...'}</div>
            </div>
          </div>
          
          <div style="display:flex;align-items:center;gap:10px;padding:8px;border-radius:8px;background:rgba(255,255,255,.04)">
            <span style="font-size:20px">${statusIcon(checks?.rpcAvailable?.status)}</span>
            <div style="flex:1">
              <div style="font-weight:700">RPC Availability</div>
              <div class="subtle" style="font-size:12px">${checks?.rpcAvailable?.message || 'Checking...'}</div>
            </div>
          </div>
        </div>
      `;
      
      // Update metrics with defensive guards
      if (checks?.counts) {
        this.updateMetrics(checks.counts);
      }
    } catch (err) {
      console.error('[student-manager-ui] Failed to render diagnostics:', err);
    }
  }
  
  /**
   * Update metrics displays with defensive guards
   */
  updateMetrics(counts) {
    try {
      const totalEl = document.querySelector('#smTotalStudents');
      const activeEl = document.querySelector('#smActiveStudents');
      const goalsEl = document.querySelector('#smTotalGoals');
      
      if (totalEl && counts && typeof counts.students !== 'undefined') {
        totalEl.textContent = counts.students || 0;
      }
      if (goalsEl && counts && typeof counts.goals !== 'undefined') {
        goalsEl.textContent = counts.goals || 0;
      }
      
      // Active count will be updated after loading students
      if (activeEl && this.students && this.students.length > 0) {
        const activeCount = this.students.filter(s => s.active).length;
        activeEl.textContent = activeCount;
      }
    } catch (err) {
      console.error('[student-manager-ui] Failed to update metrics:', err);
    }
  }
  
  /**
   * Load students data with retry logic
   */
  async loadStudents() {
    console.log('[student-manager-ui] Loading students...');
    this.loading = true;
    this.error = null;
    
    let attempt = 0;
    const maxAttempts = 2;
    
    while (attempt < maxAttempts) {
      try {
        attempt++;
        this.students = await studentRpc.listStudents('all');
        this.filteredStudents = this.students;
        this.applyFilters();
        
        // Update metrics after loading students with defensive guards
        const totalEl = document.querySelector('#smTotalStudents');
        const activeEl = document.querySelector('#smActiveStudents');
        
        if (totalEl) totalEl.textContent = this.students.length;
        
        const activeCount = this.students.filter(s => s.active).length;
        if (activeEl) activeEl.textContent = activeCount;
        
        console.log('[student-manager-ui] Loaded', this.students.length, 'students');
        return; // Success, exit retry loop
      } catch (err) {
        console.error(`[student-manager-ui] Load attempt ${attempt}/${maxAttempts} failed:`, err);
        
        if (attempt < maxAttempts) {
          // Wait ~2s before retry
          console.log('[student-manager-ui] Retrying in 2 seconds...');
          await new Promise(resolve => setTimeout(resolve, 2000));
        } else {
          // Final failure - set partial metrics
          console.error('[student-manager-ui] All retry attempts exhausted');
          this.error = err.message;
          
          // Set "0*" partial metrics with defensive guards
          const totalEl = document.querySelector('#smTotalStudents');
          const activeEl = document.querySelector('#smActiveStudents');
          const goalsEl = document.querySelector('#smTotalGoals');
          
          if (totalEl) totalEl.textContent = '0*';
          if (activeEl) activeEl.textContent = '0*';
          if (goalsEl) goalsEl.textContent = '0*';
          
          // Emit metrics event with partial flag
          try {
            window.dispatchEvent(new CustomEvent('student-manager:metrics', {
              detail: { 
                partial: true, 
                error: err.message,
                values: { total: '0*', active: '0*', goals: '0*' }
              }
            }));
          } catch (eventErr) {
            console.warn('[student-manager-ui] Failed to dispatch metrics event:', eventErr);
          }
          
          throw err;
        }
      } finally {
        this.loading = false;
      }
    }
  }
  
  /**
   * Apply filters and search
   */
  applyFilters() {
    let filtered = this.students;
    
    // Apply status filter
    if (this.currentFilter === 'active') {
      filtered = filtered.filter(s => s.active);
    } else if (this.currentFilter === 'inactive') {
      filtered = filtered.filter(s => !s.active);
    }
    
    // Apply search
    if (this.searchTerm) {
      const term = this.searchTerm.toLowerCase();
      filtered = filtered.filter(s => 
        s.code.toLowerCase().includes(term)
      );
    }
    
    this.filteredStudents = filtered;
  }
  
  /**
   * Render main UI
   */
  render() {
    console.log('[student-manager-ui] Rendering UI with', this.filteredStudents.length, 'students');
    
    // Clear loading container if exists
    const loadingContainer = this.container.querySelector('#smLoadingContainer');
    if (loadingContainer) {
      loadingContainer.remove();
    }
    
    // Find or create student list container
    let listContainer = this.container.querySelector('#smStudentList');
    if (!listContainer) {
      listContainer = document.createElement('div');
      listContainer.id = 'smStudentList';
      listContainer.className = 'card';
      listContainer.style.marginTop = '16px';
      this.container.appendChild(listContainer);
    }
    
    listContainer.innerHTML = `
      <div class="card-header">
        <div>📋 Students (${this.filteredStudents.length})</div>
        <div style="display:flex;gap:8px">
          <select id="smFilterSelect" class="btn small" style="width:auto">
            <option value="all" ${this.currentFilter === 'all' ? 'selected' : ''}>All Students</option>
            <option value="active" ${this.currentFilter === 'active' ? 'selected' : ''}>Active Only</option>
            <option value="inactive" ${this.currentFilter === 'inactive' ? 'selected' : ''}>Inactive Only</option>
          </select>
          <input id="smSearchInput" class="btn small" style="width:200px;padding:6px 10px" placeholder="Search by code..." value="${this.escapeHtml(this.searchTerm)}" />
        </div>
      </div>
      
      ${this.filteredStudents.length === 0 ? `
        <div style="padding:40px;text-align:center">
          <div style="font-size:32px;margin-bottom:12px">📭</div>
          <div class="subtle">No students found matching your filters.</div>
        </div>
      ` : `
        <div class="table-wrap" style="max-height:500px;overflow:auto;margin-top:12px">
          <table class="table">
            <thead>
              <tr>
                <th>Student Code</th>
                <th>Status</th>
                <th>Goals</th>
                <th>Enrollments</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              ${this.filteredStudents.map(student => `
                <tr>
                  <td>
                    <div style="font-weight:700">${this.escapeHtml(student.code)}</div>
                  </td>
                  <td>
                    <span class="badge" style="background:${student.active ? 'rgba(34,197,94,.8)' : 'rgba(148,163,184,.6)'}">
                      ${student.active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td>
                    <span class="badge">${student.goal_count || 0}</span>
                  </td>
                  <td>
                    <span class="badge">${student.enrollment_count || 0}</span>
                  </td>
                  <td>
                    <div style="display:flex;gap:6px">
                      <button class="btn small" disabled title="View (Coming in Phase 2)">👁️ View</button>
                      <button class="btn small" disabled title="Edit (Coming in Phase 2)">✏️ Edit</button>
                      <button class="btn small" disabled title="Goals (Coming in Phase 2)">🎯 Goals</button>
                    </div>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `}
    `;
  }
  
  /**
   * Render error state
   */
  renderError() {
    if (!this.container) return;
    
    const errorHTML = `
      <div class="card" style="padding:20px;text-align:center;background:rgba(239,68,68,.1);border-color:rgba(239,68,68,.5)">
        <div style="font-size:32px;margin-bottom:12px">⚠️</div>
        <div style="font-weight:800;margin-bottom:8px;color:#fecaca">Error Loading Student Manager</div>
        <div class="subtle">${this.escapeHtml(this.error || 'Unknown error occurred')}</div>
      </div>
    `;
    
    const errorContainer = document.createElement('div');
    errorContainer.innerHTML = errorHTML;
    this.container.appendChild(errorContainer);
  }
  
  /**
   * Attach event listeners with defensive guards
   */
  attachEventListeners() {
    try {
      // Filter select
      const filterSelect = document.querySelector('#smFilterSelect');
      if (filterSelect) {
        filterSelect.addEventListener('change', (e) => {
          this.currentFilter = e.target.value;
          this.applyFilters();
          this.render();
          this.attachEventListeners(); // Re-attach after re-render
        });
      }
      
      // Search input
      const searchInput = document.querySelector('#smSearchInput');
      if (searchInput) {
        searchInput.addEventListener('input', (e) => {
          this.searchTerm = e.target.value;
          this.applyFilters();
          this.render();
          this.attachEventListeners(); // Re-attach after re-render
        });
      }
    } catch (err) {
      console.error('[student-manager-ui] Failed to attach event listeners:', err);
    }
  }
  
  /**
   * Escape HTML to prevent XSS
   */
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

// Export for use in hub
export default StudentManagerUI;

// Attach to window for legacy fallback
if (typeof window !== 'undefined') {
  window.StudentManagerUI = StudentManagerUI;
}
