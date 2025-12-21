// Teacher Students Upsert - Server-backed Tests (TC-3)
// Validates server-backed student upsert functionality and RLS protection

import { test, expect } from '@playwright/test';

test.describe('Teacher Students Upsert - Server Functions (TC-3)', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to hub
    await page.goto('/hub/');
    
    // Mock teacher authentication
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

  test('Single student upsert calls server function with teacher auth', async ({ page, context }) => {
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
    let requestBody = null;
    
    await page.route('**/.netlify/functions/teacher-students-upsert', (route) => {
      serverFunctionCalled = true;
      const request = route.request();
      requestBody = JSON.parse(request.postData());
      
      // Verify request structure
      expect(requestBody).toHaveProperty('students');
      expect(Array.isArray(requestBody.students)).toBeTruthy();
      
      // Return mock response
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: {
          'X-Request-Id': 'test-request-upsert-123'
        },
        body: JSON.stringify({
          ok: true,
          upserted_count: requestBody.students.length,
          students: requestBody.students.map((s, i) => ({
            id: `uuid-${i}`,
            code: s.code,
            name: s.name || s.code,
            class_id: s.class_id || null
          }))
        })
      });
    });

    // Call upsertStudent via data adapter
    await page.evaluate(async () => {
      // Import data adapter
      const { db } = await import('/web/data-adapter.js');
      
      // Upsert a single student
      const result = await db.upsertStudent({
        code: 'S001',
        name: 'Test Student',
        class_id: null
      });
      
      // Store result for verification
      window.testResult = result;
    });

    // Verify server function was called
    expect(serverFunctionCalled).toBeTruthy();
    
    // Verify request had single student in batch
    expect(requestBody.students).toHaveLength(1);
    expect(requestBody.students[0]).toMatchObject({
      code: 'S001',
      name: 'Test Student',
      class_id: null
    });
    
    // Verify result
    const result = await page.evaluate(() => window.testResult);
    expect(result).toHaveProperty('code', 'S001');
  });

  test('Batch student upsert sends multiple students to server', async ({ page, context }) => {
    // Mock the teacher cookie for auth
    await context.addCookies([{
      name: 'tc',
      value: 'mock-teacher-token',
      domain: 'localhost',
      path: '/',
      httpOnly: true,
      sameSite: 'Lax'
    }]);

    let serverFunctionCalled = false;
    let requestBody = null;
    
    await page.route('**/.netlify/functions/teacher-students-upsert', (route) => {
      serverFunctionCalled = true;
      const request = route.request();
      requestBody = JSON.parse(request.postData());
      
      // Return mock response
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: {
          'X-Request-Id': 'test-request-batch-123'
        },
        body: JSON.stringify({
          ok: true,
          upserted_count: requestBody.students.length,
          students: requestBody.students.map((s, i) => ({
            id: `uuid-${i}`,
            code: s.code,
            name: s.name || s.code,
            class_id: s.class_id || null
          }))
        })
      });
    });

    // Call batchUpsertStudents via data adapter
    await page.evaluate(async () => {
      const { db } = await import('/web/data-adapter.js');
      
      // Batch upsert multiple students
      const students = [
        { code: 'S001', name: 'Student One', class_id: null },
        { code: 'S002', name: 'Student Two', class_id: 'CLS1' },
        { code: 'S003', name: 'Student Three', class_id: null }
      ];
      
      const result = await db.batchUpsertStudents(students);
      window.testResult = result;
    });

    // Verify server function was called
    expect(serverFunctionCalled).toBeTruthy();
    
    // Verify request had all students
    expect(requestBody.students).toHaveLength(3);
    expect(requestBody.students[0]).toMatchObject({ code: 'S001' });
    expect(requestBody.students[1]).toMatchObject({ code: 'S002' });
    expect(requestBody.students[2]).toMatchObject({ code: 'S003' });
    
    // Verify result
    const result = await page.evaluate(() => window.testResult);
    expect(result).toHaveLength(3);
  });

  test('Student upsert falls back to direct Supabase on 401', async ({ page }) => {
    // No teacher cookie - should get 401 and fall back
    
    let serverFunctionCalled = false;
    let supabaseCalled = false;
    
    await page.route('**/.netlify/functions/teacher-students-upsert', (route) => {
      serverFunctionCalled = true;
      
      // Return 401 Unauthorized
      route.fulfill({
        status: 401,
        contentType: 'application/json',
        headers: {
          'X-Request-Id': 'test-request-unauth-123'
        },
        body: JSON.stringify({
          ok: false,
          error: 'Unauthorized'
        })
      });
    });
    
    // Mock Supabase client for fallback
    await page.evaluate(() => {
      // Mock getSupabase to return a mock client
      window.mockSupabaseCalled = false;
      const originalGetSupabase = window.getSupabase;
      
      window.getSupabase = async () => {
        return {
          from: (table) => ({
            upsert: (data, options) => {
              window.mockSupabaseCalled = true;
              return {
                select: () => ({
                  single: () => Promise.resolve({
                    data: { id: 'uuid-fallback', ...data },
                    error: null
                  })
                })
              };
            }
          })
        };
      };
    });

    // Try to upsert without auth
    await page.evaluate(async () => {
      const { db } = await import('/web/data-adapter.js');
      
      try {
        const result = await db.upsertStudent({
          code: 'S001',
          name: 'Test Student',
          class_id: null
        });
        window.testResult = result;
      } catch (err) {
        window.testError = err.message;
      }
    });

    // Verify server function was called
    expect(serverFunctionCalled).toBeTruthy();
    
    // Verify fallback to Supabase was attempted
    const supabaseFallback = await page.evaluate(() => window.mockSupabaseCalled);
    expect(supabaseFallback).toBeTruthy();
  });

  test('Server function rejects oversized batch (>500 students)', async ({ page, context }) => {
    // Mock the teacher cookie for auth
    await context.addCookies([{
      name: 'tc',
      value: 'mock-teacher-token',
      domain: 'localhost',
      path: '/',
      httpOnly: true,
      sameSite: 'Lax'
    }]);

    await page.route('**/.netlify/functions/teacher-students-upsert', (route) => {
      const request = route.request();
      const body = JSON.parse(request.postData());
      
      // Simulate server rejection of oversized batch
      if (body.students.length > 500) {
        route.fulfill({
          status: 400,
          contentType: 'application/json',
          headers: {
            'X-Request-Id': 'test-request-oversized-123'
          },
          body: JSON.stringify({
            ok: false,
            error: 'Batch size exceeds maximum of 500 students'
          })
        });
      } else {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            ok: true,
            upserted_count: body.students.length,
            students: []
          })
        });
      }
    });

    // Try to batch upsert 501 students
    const error = await page.evaluate(async () => {
      const { db } = await import('/web/data-adapter.js');
      
      // Create 501 students
      const students = Array.from({ length: 501 }, (_, i) => ({
        code: `S${String(i + 1).padStart(3, '0')}`,
        name: `Student ${i + 1}`,
        class_id: null
      }));
      
      try {
        await db.batchUpsertStudents(students);
        return null;
      } catch (err) {
        return err.message;
      }
    });

    expect(error).toContain('Batch size exceeds maximum');
  });
});
