/**
 * @fileoverview Student Portal Goal Progress Error Handling Test
 * 
 * PR D: Ensures that the student portal handles goal progress failures gracefully:
 * 1. Dashboard remains visible when goal progress API fails
 * 2. Retries are capped (no infinite loop)
 * 3. Goals render without progress data when unavailable
 * 4. No console spam after max retries
 */

import { test, expect } from '@playwright/test';

/**
 * Track console errors and retries
 */
function setupConsoleTracking(page) {
  const consoleMessages = [];
  
  page.on('console', (msg) => {
    const text = msg.text();
    const type = msg.type();
    
    // Track error and retry messages
    if (type === 'error' || text.includes('Retrying goals') || text.includes('Failed to load goals')) {
      consoleMessages.push({
        type,
        text,
        timestamp: Date.now()
      });
    }
  });
  
  return consoleMessages;
}

test.describe('Student Portal Goal Progress Error Handling', () => {
  test('should render dashboard when goal progress returns unavailable', async ({ page }) => {
    const consoleMessages = setupConsoleTracking(page);
    
    // Mock student-roster to provide a test student
    await page.route('**/.netlify/functions/student-roster', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          students: [
            { code: 'TEST001', name: 'Test Student', class_id: 1 }
          ]
        })
      });
    });
    
    // Mock student-login to succeed
    await page.route('**/.netlify/functions/student-login', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true })
      });
    });
    
    // Mock student-goals to return goals
    await page.route('**/.netlify/functions/student-goals', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          goals: [
            { code: 'G001', desc: 'Test Goal 1', status: 'Open' },
            { code: 'G002', desc: 'Test Goal 2', status: 'Met' }
          ]
        })
      });
    });
    
    // Mock student-goal-progress to return unavailable (new behavior)
    await page.route('**/.netlify/functions/student-goal-progress**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          progress: [],
          unavailable: true,
          reason: 'supabase_not_configured'
        })
      });
    });
    
    // Mock auth-health to indicate Supabase not configured
    await page.route('**/.netlify/functions/auth-health', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: false,
          status: {
            supabase_configured: false
          }
        })
      });
    });
    
    // Mock other required endpoints
    await page.route('**/.netlify/functions/student-assignments', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, instances: [] })
      });
    });
    
    await page.route('**/.netlify/functions/student-submissions', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, submissions: [] })
      });
    });
    
    // Navigate to student portal
    await page.goto('/student/');
    
    // Login
    await page.fill('#loginCode', 'TEST001');
    await page.fill('#loginPassword', 'testpass');
    await page.click('#btnStudentLogin');
    
    // Wait for dashboard to be visible
    await page.waitForSelector('#studentDashboardView:not(.hidden)', { timeout: 5000 });
    
    // Verify dashboard is visible
    const dashboardVisible = await page.locator('#studentDashboardView').isVisible();
    expect(dashboardVisible).toBeTruthy();
    
    // Verify login view is hidden
    const loginHidden = await page.locator('#loginView').evaluate(el => el.classList.contains('hidden'));
    expect(loginHidden).toBeTruthy();
    
    // Verify goals card shows goals without progress
    const goalsContent = await page.locator('#goalsContent').textContent();
    expect(goalsContent).toContain('Test Goal 1');
    expect(goalsContent).toContain('Avg: —'); // Progress unavailable indicator
    
    // Verify banner is displayed
    await page.waitForSelector('#portalBanner:not(.hidden)', { timeout: 2000 });
    const bannerVisible = await page.locator('#portalBanner').isVisible();
    expect(bannerVisible).toBeTruthy();
    
    // Verify banner shows appropriate message
    const bannerMessage = await page.locator('#portalBannerMessage').textContent();
    expect(bannerMessage).toContain('Progress');
    expect(bannerMessage.toLowerCase()).toContain('unavailable');
  });

  test('should cap retries at 3 attempts when goal progress fails', async ({ page }) => {
    const consoleMessages = setupConsoleTracking(page);
    let goalProgressCallCount = 0;
    
    // Mock student-roster
    await page.route('**/.netlify/functions/student-roster', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          students: [{ code: 'TEST001', name: 'Test Student', class_id: 1 }]
        })
      });
    });
    
    // Mock student-login
    await page.route('**/.netlify/functions/student-login', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true })
      });
    });
    
    // Mock student-goals to fail initially
    let goalsCallCount = 0;
    await page.route('**/.netlify/functions/student-goals', async (route) => {
      goalsCallCount++;
      if (goalsCallCount <= 3) {
        // Fail for first 3 attempts
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ ok: false, error: 'Internal server error' })
        });
      } else {
        // Succeed after 3 retries (should not happen if capped properly)
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            ok: true,
            goals: []
          })
        });
      }
    });
    
    // Mock student-goal-progress
    await page.route('**/.netlify/functions/student-goal-progress**', async (route) => {
      goalProgressCallCount++;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, progress: [] })
      });
    });
    
    // Mock other endpoints
    await page.route('**/.netlify/functions/student-assignments', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, instances: [] })
      });
    });
    
    await page.route('**/.netlify/functions/student-submissions', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, submissions: [] })
      });
    });
    
    // Navigate and login
    await page.goto('/student/');
    await page.fill('#loginCode', 'TEST001');
    await page.fill('#loginPassword', 'testpass');
    await page.click('#btnStudentLogin');
    
    // Wait for dashboard
    await page.waitForSelector('#studentDashboardView:not(.hidden)', { timeout: 5000 });
    
    // Wait for retries to complete (2s + 5s + 10s = 17s total, add buffer)
    await page.waitForTimeout(20000);
    
    // Verify max 4 calls (1 initial + 3 retries)
    expect(goalsCallCount).toBeLessThanOrEqual(4);
    
    // Verify final error message shows
    const goalsContent = await page.locator('#goalsContent').textContent();
    expect(goalsContent).toContain('currently unavailable');
    
    // Count retry messages in console
    const retryMessages = consoleMessages.filter(msg => 
      msg.text.includes('Retrying goals load')
    );
    
    // Should have at most 3 retry messages
    expect(retryMessages.length).toBeLessThanOrEqual(3);
  });

  test('should handle 500 error from goal progress gracefully', async ({ page }) => {
    // Mock student-roster
    await page.route('**/.netlify/functions/student-roster', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          students: [{ code: 'TEST001', name: 'Test Student', class_id: 1 }]
        })
      });
    });
    
    // Mock student-login
    await page.route('**/.netlify/functions/student-login', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true })
      });
    });
    
    // Mock student-goals
    await page.route('**/.netlify/functions/student-goals', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          goals: [{ code: 'G001', desc: 'Test Goal', status: 'Open' }]
        })
      });
    });
    
    // Mock student-goal-progress to return 500 (old behavior)
    // Note: With server-side fix, this should now return 200 with unavailable flag
    // But testing old behavior for backwards compatibility
    await page.route('**/.netlify/functions/student-goal-progress**', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ ok: false, error: 'Internal server error' })
      });
    });
    
    // Mock other endpoints
    await page.route('**/.netlify/functions/student-assignments', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, instances: [] })
      });
    });
    
    await page.route('**/.netlify/functions/student-submissions', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, submissions: [] })
      });
    });
    
    // Navigate and login
    await page.goto('/student/');
    await page.fill('#loginCode', 'TEST001');
    await page.fill('#loginPassword', 'testpass');
    await page.click('#btnStudentLogin');
    
    // Wait for dashboard
    await page.waitForSelector('#studentDashboardView:not(.hidden)', { timeout: 5000 });
    
    // Verify dashboard is still visible despite error
    const dashboardVisible = await page.locator('#studentDashboardView').isVisible();
    expect(dashboardVisible).toBeTruthy();
    
    // Verify goals are shown (even without progress)
    const goalsContent = await page.locator('#goalsContent').textContent();
    expect(goalsContent).toContain('Test Goal');
  });

  test('should render goals without progress bars when progress unavailable', async ({ page }) => {
    // Mock student-roster
    await page.route('**/.netlify/functions/student-roster', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          students: [{ code: 'TEST001', name: 'Test Student', class_id: 1 }]
        })
      });
    });
    
    // Mock student-login
    await page.route('**/.netlify/functions/student-login', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true })
      });
    });
    
    // Mock student-goals
    await page.route('**/.netlify/functions/student-goals', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          goals: [
            { code: 'G001', desc: 'Reading Comprehension', status: 'Open' },
            { code: 'G002', desc: 'Math Skills', status: 'Met' }
          ]
        })
      });
    });
    
    // Mock student-goal-progress to return unavailable
    await page.route('**/.netlify/functions/student-goal-progress**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          progress: [],
          unavailable: true
        })
      });
    });
    
    // Mock auth-health
    await page.route('**/.netlify/functions/auth-health', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          status: {
            supabase_configured: true
          }
        })
      });
    });
    
    // Mock other endpoints
    await page.route('**/.netlify/functions/student-assignments', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, instances: [] })
      });
    });
    
    await page.route('**/.netlify/functions/student-submissions', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, submissions: [] })
      });
    });
    
    // Navigate and login
    await page.goto('/student/');
    await page.fill('#loginCode', 'TEST001');
    await page.fill('#loginPassword', 'testpass');
    await page.click('#btnStudentLogin');
    
    // Wait for dashboard
    await page.waitForSelector('#studentDashboardView:not(.hidden)', { timeout: 5000 });
    
    // Check goals content
    const goalsContent = await page.locator('#goalsContent').innerHTML();
    
    // Should show goals
    expect(goalsContent).toContain('Reading Comprehension');
    expect(goalsContent).toContain('Math Skills');
    
    // Should show "—" for unavailable progress
    expect(goalsContent).toContain('Avg: —');
    
    // Should show "Progress data unavailable" instead of progress bars
    expect(goalsContent).toContain('Progress data unavailable');
    
    // Should NOT contain progress-bar-container when unavailable
    const hasProgressBar = goalsContent.includes('progress-bar-container');
    expect(hasProgressBar).toBeFalsy();
  });

  test('should show diagnostic message in debug mode when Supabase not configured', async ({ page }) => {
    // Mock student-roster
    await page.route('**/.netlify/functions/student-roster', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          students: [{ code: 'TEST001', name: 'Test Student', class_id: 1 }]
        })
      });
    });
    
    // Mock student-login
    await page.route('**/.netlify/functions/student-login', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true })
      });
    });
    
    // Mock student-goals
    await page.route('**/.netlify/functions/student-goals', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          goals: [{ code: 'G001', desc: 'Test Goal', status: 'Open' }]
        })
      });
    });
    
    // Mock student-goal-progress to return unavailable with supabase_not_configured reason
    await page.route('**/.netlify/functions/student-goal-progress**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          progress: [],
          unavailable: true,
          reason: 'supabase_not_configured'
        })
      });
    });
    
    // Mock auth-health to indicate Supabase not configured
    await page.route('**/.netlify/functions/auth-health', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: false,
          status: {
            supabase_configured: false
          }
        })
      });
    });
    
    // Mock other endpoints
    await page.route('**/.netlify/functions/student-assignments', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, instances: [] })
      });
    });
    
    await page.route('**/.netlify/functions/student-submissions', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, submissions: [] })
      });
    });
    
    // Navigate with debug mode enabled
    await page.goto('/student/?debug=1');
    await page.fill('#loginCode', 'TEST001');
    await page.fill('#loginPassword', 'testpass');
    await page.click('#btnStudentLogin');
    
    // Wait for dashboard
    await page.waitForSelector('#studentDashboardView:not(.hidden)', { timeout: 5000 });
    
    // Wait for banner to appear
    await page.waitForSelector('#portalBanner:not(.hidden)', { timeout: 3000 });
    
    // Verify banner shows diagnostic message
    const bannerMessage = await page.locator('#portalBannerMessage').textContent();
    expect(bannerMessage).toContain('Supabase');
    expect(bannerMessage).toContain('environment variables');
    expect(bannerMessage).toContain('auth-health');
  });

  test('should handle backwards compatibility with 503 response', async ({ page }) => {
    // Mock student-roster
    await page.route('**/.netlify/functions/student-roster', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          students: [{ code: 'TEST001', name: 'Test Student', class_id: 1 }]
        })
      });
    });
    
    // Mock student-login
    await page.route('**/.netlify/functions/student-login', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true })
      });
    });
    
    // Mock student-goals
    await page.route('**/.netlify/functions/student-goals', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          goals: [{ code: 'G001', desc: 'Test Goal', status: 'Open' }]
        })
      });
    });
    
    // Mock student-goal-progress to return 503 (old behavior)
    await page.route('**/.netlify/functions/student-goal-progress**', async (route) => {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: false,
          error: 'Service unavailable'
        })
      });
    });
    
    // Mock auth-health
    await page.route('**/.netlify/functions/auth-health', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          status: {
            supabase_configured: true
          }
        })
      });
    });
    
    // Mock other endpoints
    await page.route('**/.netlify/functions/student-assignments', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, instances: [] })
      });
    });
    
    await page.route('**/.netlify/functions/student-submissions', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, submissions: [] })
      });
    });
    
    // Navigate and login
    await page.goto('/student/');
    await page.fill('#loginCode', 'TEST001');
    await page.fill('#loginPassword', 'testpass');
    await page.click('#btnStudentLogin');
    
    // Wait for dashboard
    await page.waitForSelector('#studentDashboardView:not(.hidden)', { timeout: 5000 });
    
    // Verify dashboard is still visible despite 503 error
    const dashboardVisible = await page.locator('#studentDashboardView').isVisible();
    expect(dashboardVisible).toBeTruthy();
    
    // Verify goals are shown (even without progress)
    const goalsContent = await page.locator('#goalsContent').textContent();
    expect(goalsContent).toContain('Test Goal');
    expect(goalsContent).toContain('Avg: —');
    
    // Verify banner is displayed
    await page.waitForSelector('#portalBanner:not(.hidden)', { timeout: 2000 });
    const bannerVisible = await page.locator('#portalBanner').isVisible();
    expect(bannerVisible).toBeTruthy();
  });
});
