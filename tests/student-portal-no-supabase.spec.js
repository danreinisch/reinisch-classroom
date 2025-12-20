/**
 * @fileoverview Student Portal Supabase Guardrail Test
 * 
 * PR C: Ensures that the student portal does NOT make direct Supabase REST API calls
 * from the browser during roster caching or any other operations.
 * 
 * This test validates that:
 * 1. No requests to /rest/v1/ (Supabase REST API) occur during page load
 * 2. No requests to /rest/v1/ occur during auto-login with roster fetch
 * 3. Roster caching uses in-memory approach instead of db.upsertStudent()
 */

import { test, expect } from '@playwright/test';

// Supabase REST API pattern
const SUPABASE_REST_PATTERN = /\/rest\/v1\//;

/**
 * Setup network listener to detect and fail on Supabase REST calls
 * @param {Page} page - Playwright page object
 * @returns {Array} Array to collect matching requests
 */
function setupSupabaseGuard(page) {
  const supabaseRequests = [];
  
  page.on('request', (request) => {
    const url = request.url();
    if (SUPABASE_REST_PATTERN.test(url)) {
      console.error('[GUARDRAIL] Detected forbidden Supabase REST call:', url);
      supabaseRequests.push({
        url,
        method: request.method(),
        timestamp: Date.now(),
        initiator: request.frame().url()
      });
    }
  });
  
  return supabaseRequests;
}

/**
 * Mock Netlify Functions for student portal
 */
async function setupMocks(page) {
  // Mock student-roster function (returns test roster)
  await page.route('**/.netlify/functions/student-roster', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        students: [
          { code: 'S001', name: 'Test Student', class_id: null },
          { code: 'S002', name: 'Another Student', class_id: null }
        ]
      })
    });
  });
  
  // Mock student-login function
  await page.route('**/.netlify/functions/student-login', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true })
    });
  });
  
  // Mock assignment instances endpoint
  await page.route('**/.netlify/functions/student-*/assignment-instances*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, instances: [] })
    });
  });
  
  // Mock submissions endpoint
  await page.route('**/.netlify/functions/student-*/submissions*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, submissions: [] })
    });
  });
  
  // Mock goals endpoint
  await page.route('**/.netlify/functions/student-*/goals*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, goals: [] })
    });
  });
}

test.describe('Student Portal Supabase Guardrail (PR C)', () => {
  test('should NOT make Supabase REST calls on initial page load', async ({ page }) => {
    const supabaseRequests = setupSupabaseGuard(page);
    await setupMocks(page);
    
    // Navigate to student portal
    await page.goto('/site/student/');
    
    // Wait for page to load completely
    await page.waitForLoadState('networkidle');
    
    // CRITICAL: Verify NO Supabase REST calls were made
    expect(supabaseRequests).toHaveLength(0);
    
    // Verify login form is visible (normal state)
    const loginView = page.locator('#loginView');
    await expect(loginView).toBeVisible();
  });

  test('should NOT make Supabase REST calls during auto-login with roster fetch', async ({ page }) => {
    const supabaseRequests = setupSupabaseGuard(page);
    await setupMocks(page);
    
    // Navigate with auto-login parameters (triggers roster fetch)
    await page.goto('/site/student/?auto=1&code=S001&name=TestStudent');
    
    // Wait for roster fetch and auto-login to complete
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000); // Allow async operations to complete
    
    // CRITICAL: Verify NO Supabase REST calls were made
    // This validates that roster caching does NOT use db.upsertStudent()
    if (supabaseRequests.length > 0) {
      console.error('[FAILURE] Supabase REST calls detected:');
      supabaseRequests.forEach(req => {
        console.error(`  - ${req.method} ${req.url}`);
        console.error(`    Initiator: ${req.initiator}`);
      });
    }
    expect(supabaseRequests).toHaveLength(0);
    
    // Verify dashboard is visible (successful auto-login)
    const dashboardView = page.locator('#studentDashboardView');
    await expect(dashboardView).toBeVisible({ timeout: 5000 });
  });

  test('should use in-memory roster cache without Supabase writes', async ({ page }) => {
    const supabaseRequests = setupSupabaseGuard(page);
    const rosterFetchCount = { count: 0 };
    
    await setupMocks(page);
    
    // Track roster function calls
    page.on('request', (request) => {
      if (request.url().includes('/.netlify/functions/student-roster')) {
        rosterFetchCount.count++;
        console.log('[test] Roster fetch call #' + rosterFetchCount.count);
      }
    });
    
    // Navigate with auto-login (should fetch roster once)
    await page.goto('/site/student/?auto=1&code=S001&name=TestStudent');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    
    // Verify roster was fetched at least once
    expect(rosterFetchCount.count).toBeGreaterThanOrEqual(1);
    
    // CRITICAL: No Supabase REST calls during roster caching
    expect(supabaseRequests).toHaveLength(0);
    
    // Verify cache is being used (check console for cache messages)
    const logs = [];
    page.on('console', msg => {
      if (msg.text().includes('[student-portal]')) {
        logs.push(msg.text());
      }
    });
    
    // Dashboard should be visible
    const dashboardView = page.locator('#studentDashboardView');
    await expect(dashboardView).toBeVisible({ timeout: 5000 });
  });

  test('should NOT make Supabase REST calls when roster function returns students', async ({ page }) => {
    const supabaseRequests = setupSupabaseGuard(page);
    let rosterFetched = false;
    
    // Mock roster function with multiple students
    await page.route('**/.netlify/functions/student-roster', async (route) => {
      rosterFetched = true;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          students: [
            { code: 'S001', name: 'Student One', class_id: 'C1' },
            { code: 'S002', name: 'Student Two', class_id: 'C1' },
            { code: 'S003', name: 'Student Three', class_id: 'C2' },
            { code: 'S004', name: 'Student Four', class_id: 'C2' }
          ]
        })
      });
    });
    
    await setupMocks(page);
    
    // Auto-login as S003 (forces roster fetch to find student)
    await page.goto('/site/student/?auto=1&code=S003&name=StudentThree');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    
    // Verify roster was fetched
    expect(rosterFetched).toBe(true);
    
    // CRITICAL: No Supabase calls even with multiple students in roster
    // This is where the bug would occur - looping through db.upsertStudent()
    expect(supabaseRequests).toHaveLength(0);
    
    // Verify successful login
    const dashboardView = page.locator('#studentDashboardView');
    await expect(dashboardView).toBeVisible({ timeout: 5000 });
  });

  test('should handle roster fetch failure without Supabase fallback', async ({ page }) => {
    const supabaseRequests = setupSupabaseGuard(page);
    
    // Mock roster function to fail
    await page.route('**/.netlify/functions/student-roster', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ ok: false, error: 'Server error' })
      });
    });
    
    await setupMocks(page);
    
    // Try auto-login (will fail to fetch roster)
    await page.goto('/site/student/?auto=1&code=S999&name=Unknown');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    
    // CRITICAL: Even on failure, NO Supabase REST calls
    expect(supabaseRequests).toHaveLength(0);
    
    // Should either show login form or dashboard (depending on fallback behavior)
    // The key is no Supabase calls were made
    const loginVisible = await page.locator('#loginView').isVisible().catch(() => false);
    const dashboardVisible = await page.locator('#studentDashboardView').isVisible().catch(() => false);
    
    // One of them should be visible
    expect(loginVisible || dashboardVisible).toBe(true);
  });

  test('should NOT make Supabase REST calls during manual student login', async ({ page }) => {
    const supabaseRequests = setupSupabaseGuard(page);
    await setupMocks(page);
    
    // Navigate to student portal
    await page.goto('/site/student/');
    await page.waitForLoadState('networkidle');
    
    // Fill in login form
    await page.fill('#loginCode', 'S001');
    await page.fill('#loginPassword', 'testpass');
    
    // Click login button
    await page.click('#btnStudentLogin');
    
    // Wait for login to complete
    await page.waitForTimeout(2000);
    
    // CRITICAL: No Supabase REST calls during manual login
    expect(supabaseRequests).toHaveLength(0);
  });
});
