(async () => {
  "use strict";

  // Only run on share page
  if (!location.pathname.startsWith("/teacher/share")) return;

  // Import data adapter
  const { db, isRemote } = await import('/web/data-adapter.js');

  // Storage key for share tokens
  const SHARE_TOKENS_KEY = 'rc_share_tokens';

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

  // Validate a share token object has the expected shape
  function isValidToken(t) {
    return typeof t === 'object' && t !== null && !Array.isArray(t) &&
      typeof t.id === 'string' && typeof t.token === 'string';
  }

  // Load share tokens from localStorage, filtering out malformed entries
  function loadShareTokens() {
    try {
      const data = localStorage.getItem(SHARE_TOKENS_KEY);
      const parsed = data ? JSON.parse(data) : [];
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(isValidToken);
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
        _renderGoalsPlaceholder(document.getElementById('shareGoalsList'), 'Select a student first');
        return;
      }

      // Load goals for selected student
      const goals = await db.listGoalsByStudentCode(studentCode);
      const goalsList = document.getElementById('shareGoalsList');
      
      if (goals.length === 0) {
        _renderGoalsPlaceholder(goalsList, 'No goals found for this student');
        return;
      }

      goalsList.innerHTML = ''; // SAFETY: clearing container before safe DOM rebuild
      goals.forEach(goal => {
        const item = document.createElement('div');
        item.className = 'share-checkbox-item';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = 'goal_' + (goal.code || '');
        checkbox.name = 'share_goals';
        checkbox.value = goal.code || '';

        const label = document.createElement('label');
        label.htmlFor = 'goal_' + (goal.code || '');
        const strong = document.createElement('strong');
        strong.textContent = goal.code || '';
        label.appendChild(strong);
        label.appendChild(document.createTextNode(
          ' - ' + (goal.area || 'No area') + ' - ' + (goal.description || 'No description')
        ));

        item.appendChild(checkbox);
        item.appendChild(label);
        goalsList.appendChild(item);
      });
    });

    // Handle form submission
    document.getElementById('shareGenerateForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const studentCode = document.getElementById('shareStudent').value;
      if (!studentCode) {
        await rcAlert('Validation Error', 'Please select a student');
        return;
      }

      // Get selected goals
      const checkedBoxes = document.querySelectorAll('input[name="share_goals"]:checked');
      if (checkedBoxes.length === 0) {
        await rcAlert('Validation Error', 'Please select at least one goal to share');
        return;
      }

      const goalCodes = Array.from(checkedBoxes).map(cb => cb.value);
      const expirationHours = parseInt(document.getElementById('shareExpiration').value);
      
      // Find student name
      const student = students.find(s => s.code === studentCode);
      if (!student) {
        await rcAlert('Error', 'Student not found');
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
      _renderGoalsPlaceholder(document.getElementById('shareGoalsList'), 'Select a student first');
    });

    // Handle copy link button
    document.getElementById('shareCopyBtn').addEventListener('click', async () => {
      const linkUrl = document.getElementById('shareLinkUrl').textContent;
      navigator.clipboard.writeText(linkUrl).then(() => {
        showToast('📋 Link copied to clipboard!');
      }).catch(async err => {
        console.error('Failed to copy:', err);
        await rcAlert('Error', 'Failed to copy link to clipboard');
      });
    });

    // Render initial table
    renderShareLinksTable();
  }

  // Helper: render "no selection" / empty-state paragraph in goal list
  function _renderGoalsPlaceholder(container, message) {
    container.innerHTML = ''; // SAFETY: clearing container
    const p = document.createElement('p');
    p.style.cssText = 'text-align: center; color: rgba(240,255,250,.6); margin: 0;';
    p.textContent = message;
    container.appendChild(p);
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

    tbody.innerHTML = ''; // SAFETY: clearing container before safe DOM rebuild

    tokens.forEach((token, _index) => {
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

      // Student cell
      const tdStudent = document.createElement('td');
      tdStudent.textContent = token.student_name || '';
      tdStudent.appendChild(document.createElement('br'));
      const smallCode = document.createElement('small');
      smallCode.style.opacity = '0.7';
      smallCode.textContent = token.student_code || '';
      tdStudent.appendChild(smallCode);
      row.appendChild(tdStudent);

      // Goals cell
      const tdGoals = document.createElement('td');
      tdGoals.textContent = Array.isArray(token.goal_codes) ? token.goal_codes.join(', ') : '';
      row.appendChild(tdGoals);

      // Created cell
      const tdCreated = document.createElement('td');
      const smallCreated = document.createElement('small');
      smallCreated.textContent = formatDate(token.created_at);
      tdCreated.appendChild(smallCreated);
      row.appendChild(tdCreated);

      // Expires cell
      const tdExpires = document.createElement('td');
      const smallExpires = document.createElement('small');
      smallExpires.textContent = token.expires_at ? formatDate(token.expires_at) : 'Never';
      tdExpires.appendChild(smallExpires);
      row.appendChild(tdExpires);

      // Status cell
      const tdStatus = document.createElement('td');
      const statusSpan = document.createElement('span');
      statusSpan.className = 'share-status ' + statusClass;
      statusSpan.textContent = status;
      tdStatus.appendChild(statusSpan);
      row.appendChild(tdStatus);

      // Entries count cell
      const tdEntries = document.createElement('td');
      tdEntries.style.textAlign = 'center';
      const entryCount = Array.isArray(token.entries) ? token.entries.length : 0;
      tdEntries.textContent = String(entryCount);
      row.appendChild(tdEntries);

      // Actions cell
      const tdActions = document.createElement('td');
      const copyBtn = document.createElement('button');
      copyBtn.className = 'share-btn';
      copyBtn.dataset.token = token.token;
      copyBtn.textContent = '📋 Copy';
      if (isRevoked) copyBtn.disabled = true;
      tdActions.appendChild(copyBtn);

      if (!isRevoked && !isExpired) {
        const revokeBtn = document.createElement('button');
        revokeBtn.className = 'share-btn';
        revokeBtn.dataset.tokenId = token.id;
        revokeBtn.style.marginLeft = '4px';
        revokeBtn.textContent = '🚫 Revoke';
        tdActions.appendChild(revokeBtn);
      }

      row.appendChild(tdActions);
      tbody.appendChild(row);

      // Add audit trail row if there are entries
      const entries = Array.isArray(token.entries) ? token.entries : [];
      if (entries.length > 0) {
        const auditRow = document.createElement('tr');
        const auditTd = document.createElement('td');
        auditTd.colSpan = 7;

        const auditTrail = document.createElement('div');
        auditTrail.className = 'share-audit-trail';

        const expandable = document.createElement('div');
        expandable.className = 'share-expandable';
        expandable.dataset.toggleAudit = 'true';
        const expandStrong = document.createElement('strong');
        expandStrong.textContent = '▶ View ' + entries.length + ' Entry Log(s)';
        expandable.appendChild(expandStrong);

        const expandedContent = document.createElement('div');
        expandedContent.className = 'share-expanded-content';

        entries.forEach(entry => {
          const entryDiv = document.createElement('div');
          entryDiv.className = 'share-audit-entry';

          const headerDiv = document.createElement('div');
          const entryStrong = document.createElement('strong');
          entryStrong.textContent = entry.entered_by || 'Unknown';
          headerDiv.appendChild(entryStrong);
          headerDiv.appendChild(document.createTextNode(' - ' + formatDate(entry.timestamp)));
          entryDiv.appendChild(headerDiv);

          const detailDiv = document.createElement('div');
          detailDiv.style.marginTop = '4px';
          detailDiv.appendChild(document.createTextNode(
            'Goal ' + (entry.goal_code || '') + ': '
          ));
          const percentStrong = document.createElement('strong');
          percentStrong.textContent = (entry.percent != null ? entry.percent : '') + '%';
          detailDiv.appendChild(percentStrong);
          if (entry.notes) {
            detailDiv.appendChild(document.createElement('br'));
            const em = document.createElement('em');
            em.textContent = entry.notes;
            detailDiv.appendChild(em);
          }
          entryDiv.appendChild(detailDiv);
          expandedContent.appendChild(entryDiv);
        });

        auditTrail.appendChild(expandable);
        auditTrail.appendChild(expandedContent);
        auditTd.appendChild(auditTrail);
        auditRow.appendChild(auditTd);
        tbody.appendChild(auditRow);
      }
    });

    // Add event listeners to buttons
    tbody.querySelectorAll('button[data-token]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const token = btn.dataset.token;
        const shareUrl = `${window.location.origin}/share/?token=${token}`;
        navigator.clipboard.writeText(shareUrl).then(() => {
          showToast('📋 Link copied to clipboard!');
        }).catch(async err => {
          console.error('Failed to copy:', err);
          await rcAlert('Error', 'Failed to copy link to clipboard');
        });
      });
    });

    tbody.querySelectorAll('button[data-token-id]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const tokenId = btn.dataset.tokenId;
        if (!await rcConfirm('Revoke Share Link', 'Are you sure you want to revoke this share link? It will no longer accept data entries.', 'Revoke', { danger: true })) {
          return;
        }

        const allTokens = loadShareTokens();
        const tokenIndex = allTokens.findIndex(t => t.id === tokenId);
        if (tokenIndex >= 0) {
          allTokens[tokenIndex].revoked = true;
          saveShareTokens(allTokens);
          renderShareLinksTable();
          showToast('🚫 Share link revoked');
        }
      });
    });

    // Add audit trail toggle listeners
    tbody.querySelectorAll('[data-toggle-audit]').forEach(el => {
      el.addEventListener('click', () => {
        const content = el.nextElementSibling;
        content.classList.toggle('show');
        const strong = el.querySelector('strong');
        if (strong) {
          const isExpanded = content.classList.contains('show');
          if (isExpanded) {
            strong.textContent = strong.textContent.replace('▶', '▼');
          } else {
            strong.textContent = strong.textContent.replace('▼', '▶');
          }
        }
      });
    });
  }

  // Initialize
  init();
})();
