// Teacher Center Assignment Issuing - Server-backed Tests (TC-2)
// Validates server-backed assignment listing and issuing functionality

import { test, expect } from '@playwright/test';

test.describe('Teacher Center Assignment Issuing - Server Functions', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to hub
    await page.goto('/hub/');
    
    // Enable feature flag
    await page.evaluate(() => {
      localStorage.setItem('rc_feature_teacher_center_assignments', 'true');
    });
    
    // Reload to apply feature flag
    await page.reload();
    
    // Mock teacher authentication to access Teacher Center
    await page.evaluate(() => {
      sessionStorage.setItem('teacher_unlocked', 'true');
      sessionStorage.setItem('teacher_user', JSON.stringify({ role: 'teacher' }));
    });
    
    // Show teacher view
    await page.evaluate(() => {
      const view = document.querySelector('#view-teacher');
      if (view) view.style.display = 'grid';
    });
  });

  test('Assignment dropdown calls server function to load assignments', async ({ page, context }) => {
    // Mock the teacher cookie for auth
    await context.addCookies([{
      name: 'tc',
      value: 'mock-teacher-token',
      domain: 'localhost',
      path: '/',
      httpOnly: true,
      sameSite: 'Lax'
    }]);

    // Set up response interceptor to verify the call
    let serverFunctionCalled = false;
    await page.route('**/.netlify/functions/teacher-assignments-list', (route) => {
      serverFunctionCalled = true;
      // Return mock assignments
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          assignments: [
            { id: 1, title: 'Test Assignment 1', type: 'html', series: 'series-1', page: 'index.html', created_at: '2024-01-01T00:00:00Z' },
            { id: 2, title: 'Test Assignment 2', type: 'txt_quiz', series: 'series-2', page: 'quiz.html', created_at: '2024-01-02T00:00:00Z' }
          ]
        })
      });
    });

    // Navigate to work area -> assignments tab
    await page.click('[data-area="work"]');
    await page.waitForTimeout(100);
    await page.click('[data-tab="assignments"]');
    await page.waitForTimeout(500); // Give time for async load

    // Verify server function was called
    expect(serverFunctionCalled).toBeTruthy();

    // Verify dropdown is populated with mock assignments
    const assignmentSelect = page.locator('#issueAssignmentSelect');
    await expect(assignmentSelect).toBeVisible();
    
    const options = await assignmentSelect.locator('option').allTextContents();
    expect(options).toContain('Test Assignment 1 (html)');
    expect(options).toContain('Test Assignment 2 (txt_quiz)');
  });

  test('Assignment dropdown shows error message when server returns 401', async ({ page }) => {
    // Set up response to return 401 Unauthorized
    await page.route('**/.netlify/functions/teacher-assignments-list', (route) => {
      route.fulfill({
        status: 401,
        contentType: 'application/json',
        headers: {
          'X-Request-Id': 'test-request-123'
        },
        body: JSON.stringify({
          ok: false,
          error: 'Unauthorized'
        })
      });
    });

    // Navigate to assignments tab
    await page.click('[data-area="work"]');
    await page.waitForTimeout(100);
    await page.click('[data-tab="assignments"]');
    await page.waitForTimeout(500);

    // Verify dropdown shows error state
    const assignmentSelect = page.locator('#issueAssignmentSelect');
    const options = await assignmentSelect.locator('option').allTextContents();
    expect(options.join('')).toContain('Error loading assignments');
  });

  test('Assignment issuing calls server function with correct parameters', async ({ page, context }) => {
    // Mock the teacher cookie
    await context.addCookies([{
      name: 'tc',
      value: 'mock-teacher-token',
      domain: 'localhost',
      path: '/',
      httpOnly: true,
      sameSite: 'Lax'
    }]);

    // Mock assignments list endpoint
    await page.route('**/.netlify/functions/teacher-assignments-list', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          assignments: [
            { id: 1, title: 'Test Assignment', type: 'html', series: 'test', page: 'index.html', created_at: '2024-01-01T00:00:00Z' }
          ]
        })
      });
    });

    // Track the issue request
    let issueRequestBody = null;
    await page.route('**/.netlify/functions/teacher-issue-assignment', (route) => {
      const request = route.request();
      issueRequestBody = request.postDataJSON();
      
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: {
          'X-Request-Id': 'test-issue-request-456'
        },
        body: JSON.stringify({
          ok: true,
          inserted_count: 2,
          skipped_count: 0,
          instances: [
            { id: 'inst-1', assignment_id: 1, student_id: 'student-uuid-1' },
            { id: 'inst-2', assignment_id: 1, student_id: 'student-uuid-2' }
          ]
        })
      });
    });

    // Navigate to assignments tab
    await page.click('[data-area="work"]');
    await page.waitForTimeout(100);
    await page.click('[data-tab="assignments"]');
    await page.waitForTimeout(500);

    // Mock STUDENTS array with IDs
    await page.evaluate(() => {
      window.STUDENTS = [
        { id: 'student-uuid-1', code: 'STU001', name: 'Student 1' },
        { id: 'student-uuid-2', code: 'STU002', name: 'Student 2' }
      ];
      
      // Populate student select
      const select = document.querySelector('#issueStudentsSelect');
      if (select) {
        select.innerHTML = window.STUDENTS.map(s => 
          `<option value="${s.code}">${s.code}</option>`
        ).join('');
      }
    });

    // Select assignment
    await page.selectOption('#issueAssignmentSelect', '1');

    // Select students
    await page.locator('#issueStudentsSelect option[value="STU001"]').click({ modifiers: ['Control'] });
    await page.locator('#issueStudentsSelect option[value="STU002"]').click({ modifiers: ['Control'] });

    // Set due date
    await page.fill('#issueDueDate', '2024-12-31');

    // Click issue button
    await page.click('#btnIssueAssignment');
    await page.waitForTimeout(500);

    // Verify request was made with correct parameters
    expect(issueRequestBody).toBeTruthy();
    expect(issueRequestBody.assignment_id).toBe(1);
    expect(issueRequestBody.student_ids).toEqual(['student-uuid-1', 'student-uuid-2']);
    expect(issueRequestBody.due_at).toContain('2024-12-31');
    expect(issueRequestBody.settings).toEqual({});
  });

  test('Assignment issuing shows success message with counts', async ({ page, context }) => {
    // Mock the teacher cookie
    await context.addCookies([{
      name: 'tc',
      value: 'mock-teacher-token',
      domain: 'localhost',
      path: '/',
      httpOnly: true,
      sameSite: 'Lax'
    }]);

    // Mock endpoints
    await page.route('**/.netlify/functions/teacher-assignments-list', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          assignments: [
            { id: 1, title: 'Math Quiz', type: 'html', series: 'test', page: 'index.html', created_at: '2024-01-01T00:00:00Z' }
          ]
        })
      });
    });

    await page.route('**/.netlify/functions/teacher-issue-assignment', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          inserted_count: 2,
          skipped_count: 1,
          instances: []
        })
      });
    });

    // Navigate to assignments tab
    await page.click('[data-area="work"]');
    await page.waitForTimeout(100);
    await page.click('[data-tab="assignments"]');
    await page.waitForTimeout(500);

    // Set up UI
    await page.evaluate(() => {
      window.STUDENTS = [
        { id: 'student-uuid-1', code: 'STU001', name: 'Student 1' },
        { id: 'student-uuid-2', code: 'STU002', name: 'Student 2' },
        { id: 'student-uuid-3', code: 'STU003', name: 'Student 3' }
      ];
      
      const select = document.querySelector('#issueStudentsSelect');
      if (select) {
        select.innerHTML = window.STUDENTS.map(s => 
          `<option value="${s.code}">${s.code}</option>`
        ).join('');
      }
    });

    // Select assignment and students
    await page.selectOption('#issueAssignmentSelect', '1');
    await page.selectOption('#issueStudentsSelect', ['STU001', 'STU002', 'STU003']);

    // Issue assignment
    await page.click('#btnIssueAssignment');
    await page.waitForTimeout(500);

    // Verify progress message shows counts
    const progressText = page.locator('#issueProgressText');
    const text = await progressText.textContent();
    expect(text).toContain('2');
    expect(text).toContain('1');
  });

  test('Assignment issuing handles server errors gracefully', async ({ page, context }) => {
    // Mock the teacher cookie
    await context.addCookies([{
      name: 'tc',
      value: 'mock-teacher-token',
      domain: 'localhost',
      path: '/',
      httpOnly: true,
      sameSite: 'Lax'
    }]);

    // Mock endpoints
    await page.route('**/.netlify/functions/teacher-assignments-list', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          assignments: [
            { id: 1, title: 'Test Assignment', type: 'html', series: 'test', page: 'index.html', created_at: '2024-01-01T00:00:00Z' }
          ]
        })
      });
    });

    await page.route('**/.netlify/functions/teacher-issue-assignment', (route) => {
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        headers: {
          'X-Request-Id': 'error-request-789'
        },
        body: JSON.stringify({
          ok: false,
          error: 'Database connection failed'
        })
      });
    });

    // Navigate and set up
    await page.click('[data-area="work"]');
    await page.waitForTimeout(100);
    await page.click('[data-tab="assignments"]');
    await page.waitForTimeout(500);

    await page.evaluate(() => {
      window.STUDENTS = [
        { id: 'student-uuid-1', code: 'STU001', name: 'Student 1' }
      ];
      
      const select = document.querySelector('#issueStudentsSelect');
      if (select) {
        select.innerHTML = '<option value="STU001">STU001</option>';
      }
    });

    // Select and issue
    await page.selectOption('#issueAssignmentSelect', '1');
    await page.selectOption('#issueStudentsSelect', 'STU001');
    await page.click('#btnIssueAssignment');
    await page.waitForTimeout(500);

    // Verify error is shown with request ID
    const progressText = page.locator('#issueProgressText');
    const text = await progressText.textContent();
    expect(text).toContain('Error');
    expect(text).toContain('error-request-789');
  });
});

test.describe('Teacher Center Assignment Issuing - Idempotency', () => {
  test.beforeEach(async ({ page, context }) => {
    await page.goto('/hub/');
    
    await page.evaluate(() => {
      localStorage.setItem('rc_feature_teacher_center_assignments', 'true');
    });
    
    await page.reload();
    
    await page.evaluate(() => {
      sessionStorage.setItem('teacher_unlocked', 'true');
      sessionStorage.setItem('teacher_user', JSON.stringify({ role: 'teacher' }));
    });
    
    await page.evaluate(() => {
      const view = document.querySelector('#view-teacher');
      if (view) view.style.display = 'grid';
    });

    await context.addCookies([{
      name: 'tc',
      value: 'mock-teacher-token',
      domain: 'localhost',
      path: '/',
      httpOnly: true,
      sameSite: 'Lax'
    }]);
  });

  test('Issuing same assignment twice shows skipped count', async ({ page }) => {
    // Mock endpoints
    await page.route('**/.netlify/functions/teacher-assignments-list', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          assignments: [
            { id: 1, title: 'Quiz 1', type: 'html', series: 'test', page: 'index.html', created_at: '2024-01-01T00:00:00Z' }
          ]
        })
      });
    });

    let callCount = 0;
    await page.route('**/.netlify/functions/teacher-issue-assignment', (route) => {
      callCount++;
      
      // First call: all new
      if (callCount === 1) {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            ok: true,
            inserted_count: 3,
            skipped_count: 0,
            instances: []
          })
        });
      } else {
        // Second call: all skipped (already assigned)
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            ok: true,
            inserted_count: 0,
            skipped_count: 3,
            instances: []
          })
        });
      }
    });

    // Navigate and set up
    await page.click('[data-area="work"]');
    await page.waitForTimeout(100);
    await page.click('[data-tab="assignments"]');
    await page.waitForTimeout(500);

    await page.evaluate(() => {
      window.STUDENTS = [
        { id: 'student-uuid-1', code: 'STU001', name: 'Student 1' },
        { id: 'student-uuid-2', code: 'STU002', name: 'Student 2' },
        { id: 'student-uuid-3', code: 'STU003', name: 'Student 3' }
      ];
      
      const select = document.querySelector('#issueStudentsSelect');
      if (select) {
        select.innerHTML = window.STUDENTS.map(s => 
          `<option value="${s.code}">${s.code}</option>`
        ).join('');
      }
    });

    // First issue
    await page.selectOption('#issueAssignmentSelect', '1');
    await page.selectOption('#issueStudentsSelect', ['STU001', 'STU002', 'STU003']);
    await page.click('#btnIssueAssignment');
    await page.waitForTimeout(500);

    let progressText = await page.locator('#issueProgressText').textContent();
    expect(progressText).toContain('3 issued');

    // Wait for progress to hide
    await page.waitForTimeout(3500);

    // Second issue (duplicate)
    await page.click('#btnIssueAssignment');
    await page.waitForTimeout(500);

    progressText = await page.locator('#issueProgressText').textContent();
    expect(progressText).toContain('0 issued');
    expect(progressText).toContain('3');
  });
});
