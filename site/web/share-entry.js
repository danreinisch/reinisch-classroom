(async () => {
  "use strict";

  // Storage keys
  const SHARE_TOKENS_KEY = 'rc_share_tokens';
  const PROGRESS_KEY = 'rc_goal_progress';
  const MAX_ENTRIES_PER_TOKEN = 50;

  // Helper to escape HTML
  function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // Get token from URL
  function getTokenFromUrl() {
    const params = new URLSearchParams(window.location.search);
    return params.get('token');
  }

  // Load share tokens from localStorage
  function loadShareTokens() {
    try {
      const data = localStorage.getItem(SHARE_TOKENS_KEY);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      console.error('Error loading share tokens:', e);
      return [];
    }
  }

  // Save share tokens to localStorage
  function saveShareTokens(tokens) {
    try {
      localStorage.setItem(SHARE_TOKENS_KEY, JSON.stringify(tokens));
    } catch (e) {
      console.error('Error saving share tokens:', e);
    }
  }

  // Load progress data from localStorage
  function loadProgressData() {
    try {
      const data = localStorage.getItem(PROGRESS_KEY);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      console.error('Error loading progress data:', e);
      return [];
    }
  }

  // Save progress data to localStorage
  function saveProgressData(progress) {
    try {
      localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
    } catch (e) {
      console.error('Error saving progress data:', e);
    }
  }

  // Validate token
  function validateToken(token) {
    const tokens = loadShareTokens();
    const shareToken = tokens.find(t => t.token === token);
    
    if (!shareToken) {
      return { valid: false, reason: 'Token not found' };
    }
    
    if (shareToken.revoked) {
      return { valid: false, reason: 'Token has been revoked' };
    }
    
    if (shareToken.expires_at) {
      const expiresDate = new Date(shareToken.expires_at);
      if (expiresDate < new Date()) {
        return { valid: false, reason: 'Token has expired' };
      }
    }
    
    if (shareToken.entries.length >= MAX_ENTRIES_PER_TOKEN) {
      return { valid: false, reason: 'Maximum entries reached for this link' };
    }
    
    return { valid: true, token: shareToken };
  }

  // Initialize page
  async function init() {
    const tokenString = getTokenFromUrl();
    
    if (!tokenString) {
      showError();
      return;
    }
    
    const validation = validateToken(tokenString);
    
    if (!validation.valid) {
      console.log('Token validation failed:', validation.reason);
      showError();
      return;
    }
    
    const shareToken = validation.token;
    
    // Hide loading, show form
    document.getElementById('loadingMessage').style.display = 'none';
    document.getElementById('entryForm').style.display = 'block';
    
    // Populate student name (first name only for privacy)
    const firstName = shareToken.student_name.split(' ')[0];
    document.getElementById('studentName').textContent = firstName;
    
    // Set today's date as default
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('entryDate').value = today;
    
    // Try to load goal details from db
    let goalDetails = [];
    try {
      const { db } = await import('/web/data-adapter.js');
      goalDetails = await db.listGoalsByStudentCode(shareToken.student_code);
    } catch (e) {
      console.error('Could not load goal details:', e);
    }
    
    // Populate goals
    const goalsContainer = document.getElementById('goalsContainer');
    goalsContainer.innerHTML = '';
    
    shareToken.goal_codes.forEach(goalCode => {
      const goalDetail = goalDetails.find(g => g.code === goalCode);
      const goalDiv = document.createElement('div');
      goalDiv.className = 'goal-entry';
      goalDiv.innerHTML = `
        <div class="goal-header">
          <span class="goal-code">${escapeHtml(goalCode)}</span>
          ${goalDetail && goalDetail.area ? `<span style="color: rgba(240,255,250,.7); font-size: 13px;">${escapeHtml(goalDetail.area)}</span>` : ''}
        </div>
        ${goalDetail && goalDetail.description ? `
          <div class="goal-description">${escapeHtml(goalDetail.description)}</div>
        ` : ''}
        <div class="form-group">
          <label for="percent_${escapeHtml(goalCode)}">Progress (%)</label>
          <input 
            type="number" 
            id="percent_${escapeHtml(goalCode)}" 
            name="percent_${escapeHtml(goalCode)}"
            class="form-input" 
            min="0" 
            max="100" 
            step="1"
            placeholder="0-100"
            required
          >
        </div>
        <div class="form-group">
          <label for="notes_${escapeHtml(goalCode)}">Notes (optional)</label>
          <textarea 
            id="notes_${escapeHtml(goalCode)}" 
            name="notes_${escapeHtml(goalCode)}"
            class="form-textarea" 
            placeholder="Additional observations or notes..."
          ></textarea>
        </div>
      `;
      goalsContainer.appendChild(goalDiv);
    });
    
    // Handle form submission
    document.getElementById('dataEntryForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const submitBtn = document.getElementById('submitBtn');
      submitBtn.disabled = true;
      submitBtn.textContent = 'Submitting...';
      
      try {
        const entryDate = document.getElementById('entryDate').value;
        const enteredBy = document.getElementById('enteredBy').value.trim();
        
        if (!enteredBy) {
          alert('Please enter your name');
          submitBtn.disabled = false;
          submitBtn.textContent = 'Submit Progress Data';
          return;
        }
        
        const timestamp = new Date().toISOString();
        
        // Collect entries for each goal
        const entries = [];
        const progressEntries = [];
        
        shareToken.goal_codes.forEach(goalCode => {
          const percentInput = document.getElementById(`percent_${goalCode}`);
          const notesInput = document.getElementById(`notes_${goalCode}`);
          
          if (!percentInput) return;
          
          const percent = parseInt(percentInput.value);
          const notes = notesInput ? notesInput.value.trim() : '';
          
          if (isNaN(percent) || percent < 0 || percent > 100) {
            throw new Error(`Invalid percent value for goal ${goalCode}`);
          }
          
          // Add to share token entries (audit trail)
          entries.push({
            goal_code: goalCode,
            percent: percent,
            notes: notes,
            date: entryDate,
            entered_by: enteredBy,
            timestamp: timestamp
          });
          
          // Add to main progress data
          progressEntries.push({
            student_code: shareToken.student_code,
            goal_code: goalCode,
            date: entryDate,
            percent: percent,
            notes: notes,
            entered_by: enteredBy,
            source: 'share_link',
            timestamp: timestamp
          });
        });
        
        // Update share token with entries
        const tokens = loadShareTokens();
        const tokenIndex = tokens.findIndex(t => t.token === tokenString);
        if (tokenIndex >= 0) {
          tokens[tokenIndex].entries.push(...entries);
          saveShareTokens(tokens);
        }
        
        // Update main progress data
        const progressData = loadProgressData();
        progressData.push(...progressEntries);
        saveProgressData(progressData);
        
        // Try to sync to Supabase if available
        try {
          const { db } = await import('/web/data-adapter.js');
          for (const entry of progressEntries) {
            // Try to add each entry
            await db.addGoalProgress(entry);
          }
        } catch (e) {
          console.log('Could not sync to Supabase, data saved locally:', e);
        }
        
        // Show success message
        document.getElementById('entryForm').style.display = 'none';
        document.getElementById('successMessage').style.display = 'block';
        
        // Allow entering more data after 3 seconds
        setTimeout(() => {
          document.getElementById('successMessage').style.display = 'none';
          document.getElementById('entryForm').style.display = 'block';
          e.target.reset();
          document.getElementById('entryDate').value = today;
          submitBtn.disabled = false;
          submitBtn.textContent = 'Submit Progress Data';
        }, 3000);
        
      } catch (err) {
        console.error('Error submitting data:', err);
        alert('Error submitting data: ' + err.message);
        submitBtn.disabled = false;
        submitBtn.textContent = 'Submit Progress Data';
      }
    });
  }

  // Show error message
  function showError() {
    document.getElementById('loadingMessage').style.display = 'none';
    document.getElementById('errorMessage').style.display = 'block';
  }

  // Initialize
  init();
})();
