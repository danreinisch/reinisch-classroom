/**
 * @fileoverview Student Portal Network Verification Test
 * Ensures that the student portal does NOT make direct Supabase REST API calls
 * from the browser. All data access should go through Netlify Functions.
 */

import { test, expect } from '@playwright/test';

// Track network requests to Supabase REST endpoints
const SUPABASE_REST_PATTERN = /\/rest\/v1\//;

/**
 * Setup network listener to detect Supabase REST calls
 * @param {Page} page - Playwright page object
 * @returns {Array} Array to collect matching requests
 */
function setupNetworkListener(page) {
  const supabaseRequests = [];
  
  page.on('request', (request) => {
    const url = request.url();
    if (SUPABASE_REST_PATTERN.test(url)) {
      console.log('[network] Detected Supabase REST call:', url);
      supabaseRequests.push({
        url,
        method: request.method(),
        timestamp: Date.now()
      });
    }
  });
  
  return supabaseRequests;
}

test.describe('Student Portal Network Verification', () => {
  test('should not make direct Supabase REST calls on load', async ({ page }) => {
    const supabaseRequests = setupNetworkListener(page);
    
    // Navigate to student portal
    await page.goto('/student/');
    
    // Wait for page to load
    await page.waitForLoadState('networkidle');
    
    // Verify no Supabase REST calls were made
    expect(supabaseRequests).toHaveLength(0);
    
    // Verify login form is visible (not making auth calls)
    const loginView = page.locator('#loginView');
    await expect(loginView).toBeVisible();
  });

  test('should not make direct Supabase REST calls during student login', async ({ page }) => {
    const supabaseRequests = setupNetworkListener(page);
    
    // Navigate to student portal
    await page.goto('/student/');
    await page.waitForLoadState('networkidle');
    
    // Fill in student credentials
    // Note: Using test credentials - adjust based on your test environment
    await page.fill('#loginCode', 'TEST001');
    await page.fill('#loginPassword', 'testpass');
    
    // Click login button
    await page.click('#btnStudentLogin');
    
    // Wait for navigation or error
    await page.waitForTimeout(2000);
    
    // Check for either dashboard or error message
    const isDashboardVisible = await page.locator('#studentDashboardView').isVisible().catch(() => false);
    const isErrorVisible = await page.locator('#loginError').isVisible().catch(() => false);
    
    // Should either show dashboard or error, but no Supabase REST calls
    expect(isDashboardVisible || isErrorVisible).toBeTruthy();
    
    // Verify no Supabase REST calls were made (all should go through Netlify functions)
    expect(supabaseRequests).toHaveLength(0);
  });

  test('should use Netlify Functions for student data', async ({ page }) => {
    const supabaseRequests = setupNetworkListener(page);
    const netlifyFunctionCalls = [];
    
    // Track Netlify Function calls
    page.on('request', (request) => {
      const url = request.url();
      if (url.includes('/.netlify/functions/')) {
        const functionName = url.split('/.netlify/functions/')[1].split('?')[0];
        console.log('[network] Netlify Function call:', functionName);
        netlifyFunctionCalls.push({
          functionName,
          url,
          method: request.method()
        });
      }
    });
    
    // Navigate to student portal with auto-login (if supported)
    await page.goto('/student/?auto=1&code=TEST001');
    
    // Wait for any network activity
    await page.waitForTimeout(3000);
    
    // Verify no Supabase REST calls
    expect(supabaseRequests).toHaveLength(0);
    
    // If dashboard is visible, verify Netlify Functions were used
    const isDashboardVisible = await page.locator('#studentDashboardView').isVisible().catch(() => false);
    
    if (isDashboardVisible) {
      // Should have called some student-* functions
      const studentFunctions = netlifyFunctionCalls.filter(call => 
        call.functionName.startsWith('student-')
      );
      
      console.log('[test] Student functions called:', studentFunctions.map(f => f.functionName));
      
      // At minimum should call student-login or student-profile
      const hasStudentFunctionCalls = studentFunctions.length > 0;
      expect(hasStudentFunctionCalls).toBeTruthy();
    }
  });

  test('should not make Supabase REST calls on re-login', async ({ page }) => {
    const supabaseRequests = setupNetworkListener(page);
    
    // First login
    await page.goto('/student/');
    await page.waitForLoadState('networkidle');
    
    await page.fill('#loginCode', 'TEST001');
    await page.fill('#loginPassword', 'testpass');
    await page.click('#btnStudentLogin');
    
    await page.waitForTimeout(2000);
    
    // Check if we got to dashboard
    const isDashboardVisible = await page.locator('#studentDashboardView').isVisible().catch(() => false);
    
    if (isDashboardVisible) {
      // Logout
      const logoutBtn = page.locator('#portalLogoutBtn');
      if (await logoutBtn.isVisible()) {
        await logoutBtn.click();
        await page.waitForTimeout(1000);
      }
      
      // Re-login
      await page.fill('#loginCode', 'TEST001');
      await page.fill('#loginPassword', 'testpass');
      await page.click('#btnStudentLogin');
      
      await page.waitForTimeout(2000);
      
      // Verify still no Supabase REST calls after re-login
      expect(supabaseRequests).toHaveLength(0);
    } else {
      // Login failed (expected in test environment without real credentials)
      console.log('[test] Login failed (expected in test environment)');
      
      // Still verify no Supabase REST calls
      expect(supabaseRequests).toHaveLength(0);
    }
  });
});
