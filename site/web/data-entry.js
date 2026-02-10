/**
 * Data Entry Module (Standalone)
 * External IEP goal progress data entry for other teachers
 * Token-based access, no authentication required
 */

(async () => {
  "use strict";

  console.log('[data-entry] Initializing external data entry module');

  // Import Supabase client (vendored library)
  const { getSupabase } = await import('/web/supabase-client.js');

  // Quarter date ranges (school year calendar)
  const QUARTERS = {
    Q1: { start: '08-16', end: '10-17' },
    Q2: { start: '10-18', end: '12-19' },
    Q3: { start: '12-20', end: '03-06' },
    Q4: { start: '03-07', end: '05-20' }
  };

  // State
  let tokenData = null;
  let goalData = null;
  let studentData = null;
  let progressEntries = [];
  let currentQuarter = null;

  // DOM elements
  const $ = (id) => document.getElementById(id);
  const deLoading = $('deLoading');
  const deContent = $('deContent');
  const deAlert = $('deAlert');
  const deForm = $('deForm');
  const deStudentCode = $('deStudentCode');
  const deGoalCode = $('deGoalCode');
  const deGoalArea = $('deGoalArea');
  const deMeasurementType = $('deMeasurementType');
  const deGoalDesc = $('deGoalDesc');
  const deDataCollector = $('deDataCollector');
  const deDate = $('deDate');
  const dePercent = $('dePercent');
  const dePercentGroup = $('dePercentGroup');
  const deXofYGroup = $('deXofYGroup');
  const deXofYNum = $('deXofYNum');
  const deXofYDenom = $('deXofYDenom');
  const deNotes = $('deNotes');
  const deSubmitBtn = $('deSubmitBtn');
  const deProgressList = $('deProgressList');
  const deProgressSummary = $('deProgressSummary');
  const deAvgValue = $('deAvgValue');
  const deTrend = $('deTrend');

  /**
   * Show alert message
   */
  function showAlert(message, type = 'info') {
    deAlert.textContent = message;
    deAlert.className = `de-alert ${type}`;
    deAlert.style.display = 'block';

    // Auto-hide success messages after 5 seconds
    if (type === 'success') {
      setTimeout(() => {
        deAlert.style.display = 'none';
      }, 5000);
    }
  }

  /**
   * Hide alert
   */
  function hideAlert() {
    deAlert.style.display = 'none';
  }

  /**
   * Get current quarter based on today's date
   */
  function getCurrentQuarter() {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1; // 1-12
    const day = now.getDate();
    
    // Determine school year (starts Aug 16)
    let schoolYear = year;
    if (month < 8 || (month === 8 && day < 16)) {
      schoolYear = year - 1;
    }

    // Check each quarter
    for (const [quarter, range] of Object.entries(QUARTERS)) {
      const [startMonth, startDay] = range.start.split('-').map(Number);
      const [endMonth, endDay] = range.end.split('-').map(Number);

      let startYear = schoolYear;
      let endYear = schoolYear;

      // Handle year boundary (Q3 and Q4 span into next year)
      if (startMonth >= 8) {
        startYear = schoolYear;
        endYear = schoolYear + 1;
      } else {
        startYear = schoolYear + 1;
        endYear = schoolYear + 1;
      }

      const startDate = new Date(startYear, startMonth - 1, startDay);
      const endDate = new Date(endYear, endMonth - 1, endDay, 23, 59, 59);

      if (now >= startDate && now <= endDate) {
        return { quarter, schoolYear, startDate, endDate };
      }
    }

    // Default to Q1 if outside all quarters
    return { quarter: 'Q1', schoolYear, startDate: null, endDate: null };
  }

  /**
   * Format date as MM/DD/YYYY
   */
  function formatDate(dateStr) {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' });
  }

  /**
   * Format date as YYYY-MM-DD in local timezone
   */
  function formatDateYYYYMMDD(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /**
   * Get token from URL query parameter
   */
  function getTokenFromURL() {
    const params = new URLSearchParams(window.location.search);
    return params.get('token');
  }

  /**
   * Initialize and validate token
   */
  async function initToken() {
    const token = getTokenFromURL();
    
    if (!token) {
      showAlert('No token provided. Please use the link sent to you by Dan Reinisch.', 'error');
      return false;
    }

    const supabase = await getSupabase();
    if (!supabase) {
      showAlert('Unable to connect to database. Please check your internet connection.', 'error');
      return false;
    }

    try {
      // Query token (using anon access - RLS policy allows reading valid tokens)
      const { data, error } = await supabase
        .from('data_entry_tokens')
        .select('*')
        .eq('token', token)
        .eq('revoked', false)
        .maybeSingle();

      if (error) throw error;

      if (!data) {
        showAlert('This link is no longer valid. Please contact Dan Reinisch for a new link.', 'error');
        return false;
      }

      // Check expiration
      if (data.expires_at && new Date(data.expires_at) < new Date()) {
        showAlert('This link has expired. Please contact Dan Reinisch for a new link.', 'error');
        return false;
      }

      tokenData = data;
      console.log('[data-entry] Token validated:', tokenData);
      return true;

    } catch (err) {
      console.error('[data-entry] Error validating token:', err);
      showAlert('Error validating link. Please try again or contact Dan Reinisch.', 'error');
      return false;
    }
  }

  /**
   * Load goal and student data
   */
  async function loadGoalData() {
    const supabase = await getSupabase();
    if (!supabase || !tokenData) return false;

    try {
      // Get student by code
      const { data: student, error: studentError } = await supabase
        .from('students')
        .select('id, code, name')
        .eq('code', tokenData.student_code)
        .single();

      if (studentError) throw studentError;
      studentData = student;

      // Get goal by code
      const { data: goal, error: goalError } = await supabase
        .from('goals')
        .select('*')
        .eq('code', tokenData.goal_code)
        .eq('student_id', student.id)
        .single();

      if (goalError) throw goalError;
      goalData = goal;

      console.log('[data-entry] Goal data loaded:', goalData);
      return true;

    } catch (err) {
      console.error('[data-entry] Error loading goal data:', err);
      showAlert('Error loading goal information. Please try again.', 'error');
      return false;
    }
  }

  /**
   * Load progress entries for current quarter
   */
  async function loadProgressEntries() {
    const supabase = await getSupabase();
    if (!supabase || !goalData || !studentData) return;

    currentQuarter = getCurrentQuarter();

    try {
      // Get progress entries for this goal in current quarter
      const { data, error } = await supabase
        .from('goal_progress')
        .select('*')
        .eq('goal_id', goalData.id)
        .eq('student_id', studentData.id)
        .gte('date', currentQuarter.startDate.toISOString().split('T')[0])
        .lte('date', currentQuarter.endDate.toISOString().split('T')[0])
        .order('date', { ascending: false });

      if (error) throw error;

      progressEntries = data || [];
      console.log('[data-entry] Progress entries loaded:', progressEntries.length);

    } catch (err) {
      console.error('[data-entry] Error loading progress entries:', err);
      // Non-fatal error - just show empty list
      progressEntries = [];
    }
  }

  /**
   * Render the UI
   */
  function render() {
    // Populate student and goal info
    deStudentCode.textContent = tokenData.student_code;
    deGoalCode.textContent = tokenData.goal_code;
    deGoalArea.textContent = goalData.goal_area || 'Uncategorized';
    deMeasurementType.textContent = goalData.measurement_type === 'x_of_y' ? 'X out of Y' : 'Percent';
    deGoalDesc.textContent = goalData.desc || 'No description available';
    deDataCollector.textContent = tokenData.data_collector || 'Unknown';

    // Show appropriate input fields based on measurement type
    if (goalData.measurement_type === 'x_of_y') {
      dePercentGroup.style.display = 'none';
      deXofYGroup.style.display = 'block';
      dePercent.removeAttribute('required');
      deXofYNum.setAttribute('required', 'required');
      deXofYDenom.setAttribute('required', 'required');
    } else {
      dePercentGroup.style.display = 'block';
      deXofYGroup.style.display = 'none';
      dePercent.setAttribute('required', 'required');
      deXofYNum.removeAttribute('required');
      deXofYDenom.removeAttribute('required');
    }

    // Set default date to today (local timezone)
    deDate.value = formatDateYYYYMMDD();

    // Render progress entries
    renderProgressEntries();
  }

  /**
   * Render progress entries list
   */
  function renderProgressEntries() {
    if (progressEntries.length === 0) {
      deProgressList.innerHTML = '<li class="de-empty">No entries yet this quarter.</li>';
      deProgressSummary.style.display = 'none';
      return;
    }

    // Build list HTML
    const html = progressEntries.map(entry => {
      const date = formatDate(entry.date);
      const value = parseFloat(entry.value).toFixed(0);
      const collectedBy = entry.collected_by || tokenData.data_collector || 'Unknown';
      
      return `
        <li class="de-progress-item">
          <span class="de-progress-date">${date}:</span>
          <span>
            <span class="de-progress-value">${value}%</span>
            <span class="de-progress-by">(by ${collectedBy})</span>
          </span>
        </li>
      `;
    }).join('');

    deProgressList.innerHTML = html;

    // Calculate and display rolling average
    const sum = progressEntries.reduce((acc, e) => acc + parseFloat(e.value), 0);
    const avg = (sum / progressEntries.length).toFixed(0);
    deAvgValue.textContent = avg;

    // Calculate trend
    let trend = '→';
    if (progressEntries.length >= 2) {
      const sorted = [...progressEntries].sort((a, b) => new Date(a.date) - new Date(b.date));
      const firstHalf = sorted.slice(0, Math.floor(sorted.length / 2));
      const secondHalf = sorted.slice(Math.floor(sorted.length / 2));
      const firstAvg = firstHalf.reduce((acc, e) => acc + parseFloat(e.value), 0) / firstHalf.length;
      const secondAvg = secondHalf.reduce((acc, e) => acc + parseFloat(e.value), 0) / secondHalf.length;
      
      if (secondAvg > firstAvg + 5) trend = '↗';
      else if (secondAvg < firstAvg - 5) trend = '↘';
    }
    deTrend.textContent = trend;

    deProgressSummary.style.display = 'flex';
  }

  /**
   * Handle form submission
   */
  async function handleSubmit(e) {
    e.preventDefault();
    hideAlert();

    const supabase = await getSupabase();
    if (!supabase) {
      showAlert('Unable to connect to database. Please check your internet connection.', 'error');
      return;
    }

    // Get form values
    const date = deDate.value;
    let value;

    if (goalData.measurement_type === 'x_of_y') {
      const num = parseFloat(deXofYNum.value);
      const denom = parseFloat(deXofYDenom.value);
      
      if (!num || !denom || denom === 0) {
        showAlert('Please enter valid numbers for score.', 'error');
        return;
      }
      
      // Convert to percentage
      value = (num / denom) * 100;
    } else {
      value = parseFloat(dePercent.value);
      
      if (isNaN(value) || value < 0 || value > 100) {
        showAlert('Please enter a valid percentage between 0 and 100.', 'error');
        return;
      }
    }

    const notes = deNotes.value.trim();
    const collectedBy = tokenData.data_collector || 'External';

    // Disable submit button
    deSubmitBtn.disabled = true;
    deSubmitBtn.textContent = 'Saving...';

    try {
      // Insert progress entry
      const { error } = await supabase
        .from('goal_progress')
        .insert({
          goal_id: goalData.id,
          student_id: studentData.id,
          date,
          value: value.toFixed(2),
          source: 'external',
          collected_by: collectedBy,
          notes
        });

      if (error) throw error;

      console.log('[data-entry] Progress entry saved successfully');
      
      // Show success message
      showAlert('✅ Success! Data point saved.', 'success');

      // Reset form
      deForm.reset();
      deDate.value = formatDateYYYYMMDD();

      // Reload progress entries
      await loadProgressEntries();
      renderProgressEntries();

    } catch (err) {
      console.error('[data-entry] Error saving progress entry:', err);
      showAlert('Could not save. Please check your connection and try again.', 'error');
    } finally {
      // Re-enable submit button
      deSubmitBtn.disabled = false;
      deSubmitBtn.textContent = '✅ Submit Data Point';
    }
  }

  /**
   * Initialize the data entry page
   */
  async function init() {
    console.log('[data-entry] Starting initialization');

    // Validate token
    const tokenValid = await initToken();
    if (!tokenValid) {
      deLoading.style.display = 'none';
      return;
    }

    // Load goal data
    const goalLoaded = await loadGoalData();
    if (!goalLoaded) {
      deLoading.style.display = 'none';
      return;
    }

    // Load progress entries
    await loadProgressEntries();

    // Hide loading, show content
    deLoading.style.display = 'none';
    deContent.style.display = 'block';

    // Render UI
    render();

    // Setup form handler
    deForm.addEventListener('submit', handleSubmit);

    console.log('[data-entry] Initialization complete');
  }

  // Start initialization
  init();
})();
