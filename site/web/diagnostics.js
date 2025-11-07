// diagnostics.js
// Diagnostic utilities for debugging authentication and session state

/**
 * Diagnose current authentication state
 * @returns {Object} Diagnostic information
 */
export function diagnoseAuth() {
  const result = {
    timestamp: new Date().toISOString(),
    autoLoginOk: window.__autoLoginOk || false,
    sessionRole: sessionStorage.getItem('rc_user_role'),
    sessionCode: sessionStorage.getItem('rc_user_code'),
    rc_auth: null,
    rc_auth_parsed: null,
    rc_auth_valid: false,
    rc_auth_expired: false,
    errors: []
  };

  // Try to read rc_auth from localStorage
  try {
    const authStr = localStorage.getItem('rc_auth');
    result.rc_auth = authStr;

    if (authStr) {
      try {
        const auth = JSON.parse(authStr);
        result.rc_auth_parsed = auth;

        // Validate structure
        if (!auth.role || !auth.code || !auth.issuedAt || !auth.expiresAt) {
          result.errors.push('rc_auth missing required fields');
        } else {
          result.rc_auth_valid = true;

          // Check expiry
          const now = Date.now();
          if (now > auth.expiresAt) {
            result.rc_auth_expired = true;
            result.errors.push(`rc_auth expired ${Math.round((now - auth.expiresAt) / 1000 / 60)} minutes ago`);
          }
        }
      } catch (parseErr) {
        result.errors.push('rc_auth JSON parse error: ' + parseErr.message);
      }
    }
  } catch (err) {
    result.errors.push('localStorage read error: ' + err.message);
  }

  return result;
}

/**
 * Format diagnostic result as readable text
 * @param {Object} result - Result from diagnoseAuth()
 * @returns {string} Formatted text
 */
export function formatDiagnostics(result) {
  const lines = [
    `=== Auth Diagnostics (${result.timestamp}) ===`,
    '',
    `Auto-Login Flag: ${result.autoLoginOk ? '✅ true' : '❌ false'}`,
    `Session Role: ${result.sessionRole || 'none'}`,
    `Session Code: ${result.sessionCode || 'none'}`,
    '',
    `rc_auth exists: ${result.rc_auth ? '✅ yes' : '❌ no'}`,
    `rc_auth valid: ${result.rc_auth_valid ? '✅ yes' : '❌ no'}`,
    `rc_auth expired: ${result.rc_auth_expired ? '⚠️ yes' : '✅ no'}`,
    ''
  ];

  if (result.rc_auth_parsed) {
    lines.push('rc_auth details:');
    lines.push(`  Role: ${result.rc_auth_parsed.role}`);
    lines.push(`  Code: ${result.rc_auth_parsed.code}`);
    lines.push(`  Name: ${result.rc_auth_parsed.name || 'none'}`);
    lines.push(`  Issued: ${new Date(result.rc_auth_parsed.issuedAt).toLocaleString()}`);
    lines.push(`  Expires: ${new Date(result.rc_auth_parsed.expiresAt).toLocaleString()}`);

    const now = Date.now();
    const remaining = Math.max(0, result.rc_auth_parsed.expiresAt - now);
    const hoursRemaining = Math.floor(remaining / 1000 / 60 / 60);
    const minutesRemaining = Math.floor((remaining % (1000 * 60 * 60)) / 1000 / 60);
    lines.push(`  Time remaining: ${hoursRemaining}h ${minutesRemaining}m`);
    lines.push('');
  }

  if (result.errors.length > 0) {
    lines.push('Errors:');
    result.errors.forEach(err => {
      lines.push(`  ⚠️ ${err}`);
    });
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Global diagnostic function exposed on window
 * Usage: window.__diagnoseAuth() in browser console
 */
if (typeof window !== 'undefined') {
  window.__diagnoseAuth = function() {
    const result = diagnoseAuth();
    console.log(formatDiagnostics(result));
    return result;
  };
  
  console.log('[diagnostics] window.__diagnoseAuth() ready');
}

export default {
  diagnoseAuth,
  formatDiagnostics
};
