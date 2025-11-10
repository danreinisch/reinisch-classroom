/**
 * Student Manager RPC Layer
 * 
 * Provides minimal RPC wrappers for Student Manager operations:
 * - checkEnvironment() — environment diagnostics
 * - listStudents() — returns {code, active, goal_count, enrollment_count}
 * - createStudent(payload) — scaffold for Phase 2
 */

console.log('[student-manager-rpc] Module loading started');

// Import data adapter for db access
import { db, isRemote as detectRemoteMode } from './data-adapter.js';

console.log('[student-manager-rpc] data-adapter.js imported successfully');

/**
 * Check environment readiness for Student Manager
 * Returns layered diagnostics with OK/fail status per check
 */
export async function checkEnvironment() {
  console.log('[student-manager-rpc] Running environment diagnostics...');
  
  const checks = {
    mode: null,
    studentsTable: { status: 'pending', message: '' },
    goalsTable: { status: 'pending', message: '' },
    enrollmentsTable: { status: 'pending', message: '' },
    rpcAvailable: { status: 'pending', message: '' },
    counts: { students: 0, goals: 0, enrollments: 0 }
  };
  
  try {
    // Determine mode
    const remote = await detectRemoteMode();
    checks.mode = remote ? 'remote' : 'local';
    
    if (!remote) {
      // Local mode - check localStorage
      checks.studentsTable = { status: 'ok', message: 'Local storage accessible' };
      checks.goalsTable = { status: 'ok', message: 'Local storage accessible' };
      checks.enrollmentsTable = { status: 'ok', message: 'Local storage accessible' };
      checks.rpcAvailable = { status: 'n/a', message: 'Local mode - RPC not required' };
      
      // Get counts
      const students = await db.listStudents();
      const goals = await db.listGoalsAll();
      checks.counts.students = students?.length || 0;
      checks.counts.goals = goals?.length || 0;
      checks.counts.enrollments = 0; // Local mode doesn't track enrollments separately
      
      return checks;
    }
    
    // Remote mode - check Supabase tables and RPC
    try {
      const students = await db.listStudents();
      checks.studentsTable = { 
        status: 'ok', 
        message: `Found ${students?.length || 0} students` 
      };
      checks.counts.students = students?.length || 0;
    } catch (err) {
      checks.studentsTable = { 
        status: 'fail', 
        message: `Error: ${err.message}` 
      };
    }
    
    try {
      const goals = await db.listGoalsAll();
      checks.goalsTable = { 
        status: 'ok', 
        message: `Found ${goals?.length || 0} goals` 
      };
      checks.counts.goals = goals?.length || 0;
    } catch (err) {
      checks.goalsTable = { 
        status: 'fail', 
        message: `Error: ${err.message}` 
      };
    }
    
    try {
      const enrollments = await db.listClassEnrollments?.() || [];
      checks.enrollmentsTable = { 
        status: 'ok', 
        message: `Found ${enrollments?.length || 0} enrollments` 
      };
      checks.counts.enrollments = enrollments?.length || 0;
    } catch (err) {
      checks.enrollmentsTable = { 
        status: 'fail', 
        message: `Error: ${err.message}` 
      };
    }
    
    // Check for Student Manager RPC functions
    try {
      // Try to call listStudentsWithCounts if available
      if (typeof db.listStudentsWithCounts === 'function') {
        await db.listStudentsWithCounts('all');
        checks.rpcAvailable = { 
          status: 'ok', 
          message: 'Student Manager RPC functions available' 
        };
      } else {
        checks.rpcAvailable = { 
          status: 'warn', 
          message: 'RPC functions not available - using fallback' 
        };
      }
    } catch (err) {
      if (err.message && (err.message.includes('function') || err.message.includes('does not exist'))) {
        checks.rpcAvailable = { 
          status: 'fail', 
          message: 'RPC migration not applied - please run migration' 
        };
      } else {
        checks.rpcAvailable = { 
          status: 'warn', 
          message: `RPC check failed: ${err.message}` 
        };
      }
    }
    
    return checks;
  } catch (err) {
    console.error('[student-manager-rpc] Environment check failed:', err);
    checks.studentsTable = { status: 'fail', message: err.message };
    return checks;
  }
}

/**
 * List students with counts
 * Returns array of {code, active, goal_count, enrollment_count}
 */
export async function listStudents(filter = 'all') {
  console.log('[student-manager-rpc] listStudents with filter:', filter);
  
  try {
    const remote = await detectRemoteMode();
    
    if (!remote) {
      // Local mode - use local storage
      const students = await db.listStudents();
      const goals = await db.listGoalsAll();
      
      // Group goals by student
      const goalsByStudent = {};
      goals.forEach(g => {
        if (!goalsByStudent[g.student_code]) {
          goalsByStudent[g.student_code] = [];
        }
        goalsByStudent[g.student_code].push(g);
      });
      
      // Map students to desired format
      let result = students.map(s => ({
        code: s.code,
        active: s.active !== false,
        goal_count: (goalsByStudent[s.code] || []).length,
        enrollment_count: 0 // Local mode doesn't track enrollments
      }));
      
      // Apply filter
      if (filter === 'active') {
        result = result.filter(s => s.active);
      } else if (filter === 'inactive') {
        result = result.filter(s => !s.active);
      }
      
      return result;
    }
    
    // Remote mode - try RPC function if available
    if (typeof db.listStudentsWithCounts === 'function') {
      return await db.listStudentsWithCounts(filter);
    }
    
    // Fallback: manually aggregate
    const students = await db.listStudents();
    const goals = await db.listGoalsAll();
    const enrollments = await db.listClassEnrollments?.() || [];
    
    // Group goals by student
    const goalsByStudent = {};
    goals.forEach(g => {
      if (!goalsByStudent[g.student_code]) {
        goalsByStudent[g.student_code] = [];
      }
      goalsByStudent[g.student_code].push(g);
    });
    
    // Count enrollments by student
    const enrollmentsByStudent = {};
    enrollments.forEach(e => {
      if (!enrollmentsByStudent[e.student_code]) {
        enrollmentsByStudent[e.student_code] = 0;
      }
      enrollmentsByStudent[e.student_code]++;
    });
    
    // Map students to desired format
    let result = students.map(s => ({
      code: s.code,
      active: s.active !== false,
      goal_count: (goalsByStudent[s.code] || []).length,
      enrollment_count: enrollmentsByStudent[s.code] || 0
    }));
    
    // Apply filter
    if (filter === 'active') {
      result = result.filter(s => s.active);
    } else if (filter === 'inactive') {
      result = result.filter(s => !s.active);
    }
    
    return result;
  } catch (err) {
    console.error('[student-manager-rpc] listStudents failed:', err);
    throw err;
  }
}

/**
 * Create student with enrollments and goals
 * Scaffold only - full implementation in Phase 2
 */
export async function createStudent(payload) {
  console.log('[student-manager-rpc] createStudent (scaffold):', payload);
  
  try {
    const remote = await detectRemoteMode();
    
    if (!remote) {
      // Local mode
      if (typeof db.createStudentWithEnrollmentsAndGoals === 'function') {
        return await db.createStudentWithEnrollmentsAndGoals(payload);
      }
      throw new Error('createStudentWithEnrollmentsAndGoals not available in local mode');
    }
    
    // Remote mode
    if (typeof db.createStudentWithEnrollmentsAndGoals === 'function') {
      return await db.createStudentWithEnrollmentsAndGoals(payload);
    }
    
    throw new Error('createStudentWithEnrollmentsAndGoals RPC not available - migration required');
  } catch (err) {
    console.error('[student-manager-rpc] createStudent failed:', err);
    throw err;
  }
}

// Export as named module
export const studentRpc = {
  checkEnvironment,
  listStudents,
  createStudent
};
