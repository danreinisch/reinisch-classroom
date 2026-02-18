(async () => {
  "use strict";

  // Only run on share page
  if (!location.pathname.startsWith("/teacher/share")) return;

  // Import data adapter
  const { db, isRemote } = await import('/web/data-adapter.js');

  // Storage key for share tokens
  const SHARE_TOKENS_KEY = 'rc_share_tokens';

  // Helper to escape HTML
  function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // Helper to generate secure random token
  function generateToken() {
    const arr = new Uint8Array(24);
    crypto.getRandomValues(arr);
    return btoa(String.fromCharCode(...arr))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '')
      .slice(0, 32);
  }

  // Helper to format date
  function formatDate(dateStr) {
    if (!dateStr) return 'Never';
    const date = new Date(dateStr);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
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

  // Show toast notification
  function showToast(message) {
    const toast = document.getElementById('shareToast');
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => {
      toast.classList.remove('show');
    }, 3000);
  }

  // Initialize page
  async function init() {
    const students = await db.listStudents();
    
    // Populate student dropdown
    const studentSelect = document.getElementById('shareStudent');
    students.forEach(student => {
      const option = document.createElement('option');
      option.value = student.code;
      option.textContent = `${student.name} (${student.code})`;
      studentSelect.appendChild(option);
    });

    // Listen for student selection
    studentSelect.addEventListener('change', async (e) => {
      const studentCode = e.target.value;
      if (!studentCode) {
        document.getElementById('shareGoalsList').innerHTML = `
          <p style="text-align: center; color: rgba(240,255,250,.6); margin: 0;">
            Select a student first
          </p>
        `;
        return;
      }

      // Load goals for selected student
      const goals = await db.listGoalsByStudentCode(studentCode);
      const goalsList = document.getElementById('shareGoalsList');
      
      if (goals.length === 0) {
        goalsList.innerHTML = `
          <p style="text-align: center; color: rgba(240,255,250,.6); margin: 0;">
            No goals found for this student
          </p>
        `;
        return;
      }

      goalsList.innerHTML = '';
      goals.forEach(goal => {
        const item = document.createElement('div');
        item.className = 'share-checkbox-item';
        item.innerHTML = `
          <input type="checkbox" id="goal_${escapeHtml(goal.code)}" name="share_goals" value="${escapeHtml(goal.code)}">
          <label for="goal_${escapeHtml(goal.code)}">
            <strong>${escapeHtml(goal.code)}</strong> - ${escapeHtml(goal.area || 'No area')} - ${escapeHtml(goal.description || 'No description')}
          </label>
        `;
        goalsList.appendChild(item);
      });
    });

    // Handle form submission
    document.getElementById('shareGenerateForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const studentCode = document.getElementById('shareStudent').value;
      if (!studentCode) {
        alert('Please select a student');
        return;
      }

      // Get selected goals
      const checkedBoxes = document.querySelectorAll('input[name="share_goals"]:checked');
      if (checkedBoxes.length === 0) {
        alert('Please select at least one goal to share');
        return;
      }

      const goalCodes = Array.from(checkedBoxes).map(cb => cb.value);
      const expirationHours = parseInt(document.getElementById('shareExpiration').value);
      
      // Find student name
      const student = students.find(s => s.code === studentCode);
      if (!student) {
        alert('Student not found');
        return;
      }

      // Generate token
      const token = generateToken();
      const now = new Date().toISOString();
      const expiresAt = expirationHours > 0 
        ? new Date(Date.now() + expirationHours * 60 * 60 * 1000).toISOString()
        : null;

      // Create share token object
      const shareToken = {
        id: `share_${Date.now()}`,
        token: token,
        student_code: studentCode,
        student_name: student.name,
        goal_codes: goalCodes,
        created_at: now,
        expires_at: expiresAt,
        created_by: 'Teacher',
        entries: [],
        revoked: false
      };

      // Save to localStorage
      const tokens = loadShareTokens();
      tokens.push(shareToken);
      saveShareTokens(tokens);

      // Generate URL
      const shareUrl = `${window.location.origin}/share/?token=${token}`;
      
      // Display the link
      document.getElementById('shareLinkUrl').textContent = shareUrl;
      document.getElementById('shareLinkDisplay').style.display = 'block';
      
      // Refresh the table
      renderShareLinksTable();
      
      showToast('✅ Share link generated successfully!');
      
      // Reset form
      e.target.reset();
      document.getElementById('shareGoalsList').innerHTML = `
        <p style="text-align: center; color: rgba(240,255,250,.6); margin: 0;">
          Select a student first
        </p>
      `;
    });

    // Handle copy link button
    document.getElementById('shareCopyBtn').addEventListener('click', () => {
      const linkUrl = document.getElementById('shareLinkUrl').textContent;
      navigator.clipboard.writeText(linkUrl).then(() => {
        showToast('📋 Link copied to clipboard!');
      }).catch(err => {
        console.error('Failed to copy:', err);
        alert('Failed to copy link to clipboard');
      });
    });

    // Render initial table
    renderShareLinksTable();
  }

  // Render share links table
  function renderShareLinksTable() {
    const tokens = loadShareTokens();
    const tbody = document.getElementById('shareLinksBody');
    const emptyEl = document.getElementById('shareLinksEmpty');
    const tableEl = document.getElementById('shareLinksTable');

    if (tokens.length === 0) {
      emptyEl.style.display = 'block';
      tableEl.style.display = 'none';
      return;
    }

    emptyEl.style.display = 'none';
    tableEl.style.display = 'block';

    // Sort by created date (newest first)
    tokens.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    tbody.innerHTML = '';
    
    tokens.forEach((token, index) => {
      const now = new Date();
      const expiresDate = token.expires_at ? new Date(token.expires_at) : null;
      const isExpired = expiresDate && expiresDate < now;
      const isRevoked = token.revoked;
      
      let status, statusClass;
      if (isRevoked) {
        status = 'Revoked';
        statusClass = 'revoked';
      } else if (isExpired) {
        status = 'Expired';
        statusClass = 'expired';
      } else {
        status = 'Active';
        statusClass = 'active';
      }

      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${escapeHtml(token.student_name)}<br><small style="opacity: 0.7;">${escapeHtml(token.student_code)}</small></td>
        <td>${escapeHtml(token.goal_codes.join(', '))}</td>
        <td><small>${formatDate(token.created_at)}</small></td>
        <td><small>${token.expires_at ? formatDate(token.expires_at) : 'Never'}</small></td>
        <td><span class="share-status ${statusClass}">${status}</span></td>
        <td style="text-align: center;">${token.entries.length}</td>
        <td>
          <button class="share-btn" data-token="${escapeHtml(token.token)}" ${isRevoked ? 'disabled' : ''}>
            📋 Copy
          </button>
          ${!isRevoked && !isExpired ? `
            <button class="share-btn" data-token-id="${escapeHtml(token.id)}" style="margin-left: 4px;">
              🚫 Revoke
            </button>
          ` : ''}
        </td>
      `;
      
      tbody.appendChild(row);

      // Add audit trail if there are entries
      if (token.entries.length > 0) {
        const auditRow = document.createElement('tr');
        auditRow.innerHTML = `
          <td colspan="7">
            <div class="share-audit-trail">
              <div class="share-expandable" onclick="window.tcShare.toggleAudit(this)">
                <strong>▶ View ${token.entries.length} Entry Log(s)</strong>
              </div>
              <div class="share-expanded-content">
                ${token.entries.map(entry => `
                  <div class="share-audit-entry">
                    <div><strong>${escapeHtml(entry.entered_by || 'Unknown')}</strong> - ${formatDate(entry.timestamp)}</div>
                    <div style="margin-top: 4px;">
                      Goal ${escapeHtml(entry.goal_code)}: <strong>${entry.percent}%</strong>
                      ${entry.notes ? `<br><em>${escapeHtml(entry.notes)}</em>` : ''}
                    </div>
                  </div>
                `).join('')}
              </div>
            </div>
          </td>
        `;
        tbody.appendChild(auditRow);
      }
    });
    
    // Add event listeners to buttons
    tbody.querySelectorAll('button[data-token]').forEach(btn => {
      btn.addEventListener('click', () => {
        const token = btn.dataset.token;
        const shareUrl = `${window.location.origin}/share/?token=${token}`;
        navigator.clipboard.writeText(shareUrl).then(() => {
          showToast('📋 Link copied to clipboard!');
        }).catch(err => {
          console.error('Failed to copy:', err);
          alert('Failed to copy link to clipboard');
        });
      });
    });
    
    tbody.querySelectorAll('button[data-token-id]').forEach(btn => {
      btn.addEventListener('click', () => {
        const tokenId = btn.dataset.tokenId;
        if (!confirm('Are you sure you want to revoke this share link? It will no longer accept data entries.')) {
          return;
        }
        
        const tokens = loadShareTokens();
        const tokenIndex = tokens.findIndex(t => t.id === tokenId);
        if (tokenIndex >= 0) {
          tokens[tokenIndex].revoked = true;
          saveShareTokens(tokens);
          renderShareLinksTable();
          showToast('🚫 Share link revoked');
        }
      });
    });
  }

  // Global functions for onclick handlers (kept for audit trail toggle)
  window.tcShare = {
    toggleAudit: (el) => {
      const content = el.nextElementSibling;
      content.classList.toggle('show');
      el.innerHTML = content.classList.contains('show') 
        ? el.innerHTML.replace('▶', '▼')
        : el.innerHTML.replace('▼', '▶');
    }
  };

  // Initialize
  init();
})();
