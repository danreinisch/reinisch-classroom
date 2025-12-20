// Student API client for calling Netlify Functions
// All student portal data access goes through these functions (no direct Supabase calls)

/**
 * Base fetch wrapper with error handling and auth redirect
 * @param {string} url - Full URL to fetch
 * @param {Object} options - Fetch options
 * @returns {Promise<Object>} Response data
 */
async function apiFetch(url, options = {}) {
  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    // Handle auth errors - clear auth and redirect to hub
    if (response.status === 401 || response.status === 403) {
      console.warn('[student-api] Authentication error, clearing auth and redirecting');
      localStorage.removeItem('rc_auth');
      localStorage.removeItem('rc_auth_expires');
      window.location.href = '/hub/';
      throw new Error('Authentication required');
    }

    // Parse response
    let data;
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      data = await response.json();
    } else {
      data = { error: await response.text() };
    }

    // Check for error response
    if (!response.ok) {
      const errorMsg = data.error || `HTTP ${response.status}`;
      console.error('[student-api] API error:', errorMsg);
      throw new Error(errorMsg);
    }

    return data;
  } catch (err) {
    // Network errors or other exceptions
    console.error('[student-api] Request failed:', err);
    throw err;
  }
}

/**
 * Get student profile
 * @param {string} code - Student code
 * @returns {Promise<Object>} Student profile data
 */
export async function getStudentProfile(code) {
  const url = `/.netlify/functions/student-profile?code=${encodeURIComponent(code)}`;
  const response = await apiFetch(url);
  
  if (!response.ok || !response.profile) {
    throw new Error(response.error || 'Failed to fetch student profile');
  }
  
  return response.profile;
}

/**
 * Get student IEP goals
 * @param {string} code - Student code
 * @returns {Promise<Array>} Array of goals
 */
export async function getStudentGoals(code) {
  const url = `/.netlify/functions/student-goals?code=${encodeURIComponent(code)}`;
  const response = await apiFetch(url);
  
  if (!response.ok) {
    throw new Error(response.error || 'Failed to fetch student goals');
  }
  
  return response.goals || [];
}

/**
 * Get student assignment instances
 * @param {string} code - Student code
 * @returns {Promise<Array>} Array of assignment instances
 */
export async function getStudentAssignments(code) {
  const url = `/.netlify/functions/student-assignments?code=${encodeURIComponent(code)}`;
  const response = await apiFetch(url);
  
  if (!response.ok) {
    throw new Error(response.error || 'Failed to fetch student assignments');
  }
  
  return response.instances || [];
}

/**
 * Get student submissions
 * @param {string} code - Student code
 * @returns {Promise<Array>} Array of submissions
 */
export async function getStudentSubmissions(code) {
  const url = `/.netlify/functions/student-submissions?code=${encodeURIComponent(code)}`;
  const response = await apiFetch(url);
  
  if (!response.ok) {
    throw new Error(response.error || 'Failed to fetch student submissions');
  }
  
  return response.submissions || [];
}

/**
 * Get student goal progress
 * @param {string} code - Student code
 * @returns {Promise<Array>} Array of goal progress entries
 */
export async function getStudentGoalProgress(code) {
  const url = `/.netlify/functions/student-goal-progress?code=${encodeURIComponent(code)}`;
  const response = await apiFetch(url);
  
  if (!response.ok) {
    throw new Error(response.error || 'Failed to fetch goal progress');
  }
  
  return response.progress || [];
}

/**
 * Build a facade db object that uses the student API
 * This allows minimal changes to existing student portal code
 * @param {string} studentCode - Student code for all queries
 * @returns {Object} DB-like object with methods
 */
export function createStudentApiAdapter(studentCode) {
  return {
    // Students (not needed for student portal, but kept for compatibility)
    async listStudents() {
      // Student portal shouldn't list all students
      return [];
    },
    
    // Goals
    async listGoalsByStudentCode(code) {
      return await getStudentGoals(code || studentCode);
    },
    
    // Goal progress
    async listGoalProgress({ studentCodes } = {}) {
      // Only fetch for the current student
      if (studentCodes && studentCodes.length > 0 && studentCodes[0] !== studentCode) {
        return [];
      }
      return await getStudentGoalProgress(studentCode);
    },
    
    // Assignments
    async listAssignments() {
      // For student portal, we get assignments via instances
      const instances = await getStudentAssignments(studentCode);
      // Extract unique assignments from instances
      const assignmentMap = new Map();
      instances.forEach(inst => {
        if (inst.assignment && !assignmentMap.has(inst.assignment.id)) {
          assignmentMap.set(inst.assignment.id, inst.assignment);
        }
      });
      return Array.from(assignmentMap.values());
    },
    
    async listAssignmentInstances() {
      return await getStudentAssignments(studentCode);
    },
    
    // Submissions
    async listSubmissions(filters = {}) {
      // Ignore filters, always return for current student
      return await getStudentSubmissions(studentCode);
    },
    
    async getLatestSubmission(instance_id) {
      const submissions = await getStudentSubmissions(studentCode);
      const instanceSubmissions = submissions
        .filter(s => s.instance_id === instance_id)
        .sort((a, b) => new Date(b.submitted_at) - new Date(a.submitted_at));
      
      return instanceSubmissions[0] || null;
    },
    
    // Placeholder methods that student portal shouldn't use
    async upsertStudent() {
      throw new Error('Operation not permitted from student portal');
    },
    async setStudentPassword() {
      throw new Error('Operation not permitted from student portal');
    },
    async verifyStudentPassword() {
      throw new Error('Operation not permitted from student portal');
    },
  };
}
