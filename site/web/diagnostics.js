// diagnostics.js
// Self-test utility for authentication debugging

/**
 * Diagnose current authentication state
 * @returns {Object} Diagnostic information
 */
window.__diagnoseAuth = function() {
  const result = {
    timestamp: new Date().toISOString(),
    flags: {},
    localStorage: {},
    sessionStorage: {},
    urlParams: {},
    status: 'ok',
    warnings: [],
    errors: []
  };
  
  try {
    // Check global flags
    result.flags.__autoLoginOk = window.__autoLoginOk || false;
    result.flags.__authModalExtendBound = window.__authModalExtendBound || false;
    result.flags.__sbClient = !!window.__sbClient;
    
    // Check localStorage
    try {
      const rcAuth = localStorage.getItem('rc_auth');
      if (rcAuth) {
        try {
          const auth = JSON.parse(rcAuth);
          result.localStorage.rc_auth = {
            role: auth.role,
            code: auth.code,
            name: auth.name,
            issuedAt: auth.issuedAt ? new Date(auth.issuedAt).toISOString() : null,
            expiresAt: auth.expiresAt ? new Date(auth.expiresAt).toISOString() : null,
            isExpired: auth.expiresAt ? Date.now() > auth.expiresAt : null,
            timeRemaining: auth.expiresAt ? Math.max(0, auth.expiresAt - Date.now()) : null
          };
          
          // Validate structure
          if (!auth.role) result.warnings.push('rc_auth missing role field');
          if (!auth.code) result.warnings.push('rc_auth missing code field');
          if (!auth.expiresAt) result.warnings.push('rc_auth missing expiresAt field');
          
          // Check expiry
          if (auth.expiresAt && Date.now() > auth.expiresAt) {
            result.warnings.push('rc_auth has expired');
            result.status = 'warning';
          }
        } catch (parseErr) {
          result.errors.push('rc_auth is not valid JSON');
          result.localStorage.rc_auth = 'INVALID_JSON';
          result.status = 'error';
        }
      } else {
        result.localStorage.rc_auth = null;
      }
      
      // Check other rc_ keys
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key.startsWith('rc_') && key !== 'rc_auth') {
          const val = localStorage.getItem(key);
          // Truncate long values
          result.localStorage[key] = val && val.length > 100 ? val.substring(0, 100) + '...' : val;
        }
      }
    } catch (lsErr) {
      result.errors.push('localStorage access failed: ' + lsErr.message);
      result.status = 'error';
    }
    
    // Check sessionStorage
    try {
      result.sessionStorage.rc_user_code = sessionStorage.getItem('rc_user_code');
      result.sessionStorage.rc_user_role = sessionStorage.getItem('rc_user_role');
      
      // Check for inconsistency
      if (result.localStorage.rc_auth && result.localStorage.rc_auth !== 'INVALID_JSON') {
        const authCode = result.localStorage.rc_auth.code;
        const authRole = result.localStorage.rc_auth.role;
        const sessionCode = result.sessionStorage.rc_user_code;
        const sessionRole = result.sessionStorage.rc_user_role;
        
        if (authCode && sessionCode && authCode !== sessionCode) {
          result.warnings.push(`Code mismatch: localStorage(${authCode}) vs sessionStorage(${sessionCode})`);
          result.status = result.status === 'error' ? 'error' : 'warning';
        }
        
        if (authRole && sessionRole && authRole !== sessionRole) {
          result.warnings.push(`Role mismatch: localStorage(${authRole}) vs sessionStorage(${sessionRole})`);
          result.status = result.status === 'error' ? 'error' : 'warning';
        }
      }
    } catch (ssErr) {
      result.errors.push('sessionStorage access failed: ' + ssErr.message);
      result.status = 'error';
    }
    
    // Check URL parameters
    try {
      const urlParams = new URLSearchParams(window.location.search);
      result.urlParams.auto = urlParams.get('auto');
      result.urlParams.code = urlParams.get('code');
      
      // Check for parameter mismatch
      if (result.urlParams.auto === '1' && result.urlParams.code) {
        if (result.localStorage.rc_auth && result.localStorage.rc_auth !== 'INVALID_JSON') {
          const authCode = result.localStorage.rc_auth.code;
          if (authCode && authCode !== result.urlParams.code) {
            result.warnings.push(`Code mismatch: URL(${result.urlParams.code}) vs localStorage(${authCode})`);
            result.status = result.status === 'error' ? 'error' : 'warning';
          }
        }
      }
    } catch (urlErr) {
      result.errors.push('URL parameters access failed: ' + urlErr.message);
      result.status = 'error';
    }
    
    // Summary message
    if (result.status === 'ok') {
      result.summary = 'Authentication state looks healthy';
    } else if (result.status === 'warning') {
      result.summary = `${result.warnings.length} warning(s) detected - see warnings array`;
    } else {
      result.summary = `${result.errors.length} error(s) detected - see errors array`;
    }
    
  } catch (err) {
    result.errors.push('Diagnostic failed: ' + err.message);
    result.status = 'error';
    result.summary = 'Diagnostic utility encountered an error';
  }
  
  return result;
};

/**
 * Print diagnostic information to console in a formatted way
 */
window.__printDiagnostics = function() {
  const diag = window.__diagnoseAuth();
  
  console.log('%c=== AUTH DIAGNOSTICS ===', 'font-weight:bold;font-size:16px;color:#22c55e');
  console.log('%cTimestamp:', 'font-weight:bold', diag.timestamp);
  console.log('%cStatus:', 'font-weight:bold', diag.status.toUpperCase());
  console.log('%cSummary:', 'font-weight:bold', diag.summary);
  
  console.log('\n%cFlags:', 'font-weight:bold;color:#06b6d4');
  console.table(diag.flags);
  
  console.log('\n%clocalStorage:', 'font-weight:bold;color:#06b6d4');
  console.table(diag.localStorage);
  
  console.log('\n%csessionStorage:', 'font-weight:bold;color:#06b6d4');
  console.table(diag.sessionStorage);
  
  console.log('\n%cURL Parameters:', 'font-weight:bold;color:#06b6d4');
  console.table(diag.urlParams);
  
  if (diag.warnings.length > 0) {
    console.log('\n%c⚠️ Warnings:', 'font-weight:bold;color:#f59e0b');
    diag.warnings.forEach((w, i) => console.log(`  ${i + 1}. ${w}`));
  }
  
  if (diag.errors.length > 0) {
    console.log('\n%c❌ Errors:', 'font-weight:bold;color:#ef4444');
    diag.errors.forEach((e, i) => console.log(`  ${i + 1}. ${e}`));
  }
  
  console.log('\n%cFull diagnostic object:', 'font-weight:bold;color:#8b5cf6');
  console.log(diag);
  
  return diag;
};

console.log('[diagnostics] Auth diagnostics loaded. Use window.__diagnoseAuth() or window.__printDiagnostics()');
