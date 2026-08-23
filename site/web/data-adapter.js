// Adapter selection: use Supabase if available, else localStorage.
import { getSupabase } from './supabase-client.js';
import { withRetry } from './supabase-util.js';

// Maximum number of rows to fetch in a single query.
// Supabase PostgREST imposes a default row limit (often 1000) that can silently
// drop rows; using an explicit high limit ensures all school-year data is
// retrieved for the gradebook and review page.
const MAX_ASSIGNMENTS_QUERY_LIMIT = 5000;

const NS = 'rc_unified_';
const store = {
  get: (k, def) => { try { return JSON.parse(localStorage.getItem(NS + k)) ?? def; } catch { return def; } },
  set: (k, v) => localStorage.setItem(NS + k, JSON.stringify(v)),
};

// TC-3.1: Helper to detect local dev environment
// Only allows fallback in true dev environments (localhost, 127.0.0.1)
// Netlify preview deployments are excluded to maintain security
const isLocalDev = () => {
  return window.location.hostname === 'localhost' || 
         window.location.hostname === '127.0.0.1';
};

/**
 * Robust detection for schema-related errors from Supabase/PostgREST
 * Checks for various error conditions that indicate missing columns or tables
 * @param {Error} error - The error object to check
 * @returns {boolean} True if error is schema-related
 */
function isSchemaError(error) {
  if (!error) return false;
  const msg = (error.message || '').toLowerCase();
  const code = error.code || '';
  return (
    msg.includes('column') ||
    msg.includes('relation') ||
    msg.includes('does not exist') ||
    msg.includes('undefined column') ||
    code === '42703' ||    // undefined_column
    code === '42P01' ||    // undefined_table
    code === 'PGRST204' || // PostgREST column not found
    code === 'PGRST200'    // PostgREST relation not found
  );
}

/**
 * Returns the starting calendar year of the current school year.
 * Aug–Dec → current year; Jan–Jul → current year - 1.
 * @returns {number}
 */
function getCurrentSchoolYear() {
  const now = new Date();
  const month = now.getMonth() + 1; // 1-12
  return month >= 8 ? now.getFullYear() : now.getFullYear() - 1;
}

/**
 * Mapping from DB class codes to UI canonical class names
 * Some classes have multiple sections (SC/S1) which are represented as separate UI tabs
 */
const CLASS_CODE_TO_CANONICAL_NAMES = {
  'LA1': ['Language Arts 1 SC'],
  'LA2': ['Language Arts 2 SC'],
  'LA3': ['Language Arts 3 SC'],
  'LA4': ['Language Arts 4 SC'],
  'LS-LA': ['Life Skills Language Arts SC'],
  'LS': ['Transitional Skills'],
  'CM': ['Consumer Math'],
  'GEO-SC': ['Geometry SC'],
  'SL': ['Speech/Language'],
  'WA': ['Warrior Academy']
};

/**
 * Maps a DB class code/name to UI canonical names
 * @param {string} code - DB class code (e.g., "LA3")
 * @param {string} name - DB class name (e.g., "Language Arts 3")
 * @returns {string[]} Array of canonical UI names
 */
function mapToCanonicalNames(code, name) {
  // Return mapped names if code exists in mapping
  if (code && CLASS_CODE_TO_CANONICAL_NAMES[code]) {
    return CLASS_CODE_TO_CANONICAL_NAMES[code];
  }
  // Preserve compatibility while production code LS transitions from
  // the legacy display name to Transitional Skills.
  if (name === 'Life Skills' || name === 'Transitional Skills') {
    return ['Transitional Skills'];
  }
  // Fall back to name if available, then code, then Unknown
  if (name) return [name];
  if (code) return [code];
  return ['Unknown'];
}

/**
 * Deduplicate submissions per instance_id: keep only the most recent submission
 * with non-empty answers for each instance_id. This prevents stale/empty
 * resubmission shells (e.g. from "Return for Revision") from appearing in results.
 * @param {Array} submissions
 * @returns {Array}
 */
function deduplicateSubmissions(submissions) {
  const byInstance = new Map();
  for (const sub of submissions) {
    const iid = sub.instance_id;
    if (!iid) continue;
    const hasAnswers = sub.answers && typeof sub.answers === 'object' && Object.keys(sub.answers).length > 0;
    const existing = byInstance.get(iid);
    if (!existing) {
      byInstance.set(iid, sub);
    } else {
      const existingHasAnswers = existing.answers && typeof existing.answers === 'object' && Object.keys(existing.answers).length > 0;
      const subTime = new Date(sub.submitted_at || 0).getTime();
      const existingTime = new Date(existing.submitted_at || 0).getTime();
      if (hasAnswers && !existingHasAnswers) {
        byInstance.set(iid, sub);
      } else if (!hasAnswers && existingHasAnswers) {
        // keep existing
      } else if (subTime > existingTime) {
        byInstance.set(iid, sub);
      }
    }
  }
  return Array.from(byInstance.values());
}

function dedupeAssignmentGoalDataPoints(rows) {
  const safeRows =
    Array.isArray(rows)
      ? rows
      : [];

  const output = [];
  const assignmentRows =
    new Map();

  safeRows.forEach((row, index) => {
    if (
      !row ||
      !row.assignment_instance_id ||
      row.item_id === null ||
      row.item_id === undefined ||
      !row.goal_id
    ) {
      output.push({
        index,
        row,
      });

      return;
    }

    const key = [
      row.assignment_instance_id,
      row.item_id,
      row.goal_id,
    ].join('|');

    const stamp =
      String(row.created_at || '');

    const id =
      String(row.id || '');

    const existing =
      assignmentRows.get(key);

    if (
      !existing ||
      stamp > existing.stamp ||
      (
        stamp === existing.stamp &&
        id > existing.id
      )
    ) {
      assignmentRows.set(
        key,
        {
          index,
          row,
          stamp,
          id,
        },
      );
    }
  });

  output.push(
    ...assignmentRows.values(),
  );

  output.sort(
    (a, b) =>
      a.index - b.index,
  );

  return output.map(
    entry => entry.row,
  );
}

async function filterInstructionalEvidenceRows(rows) {
  const safeRows = Array.isArray(rows) ? rows : [];
  const instanceIds = [
    ...new Set(
      safeRows
        .map(row => row?.assignment_instance_id)
        .filter(Boolean)
    )
  ];

  if (instanceIds.length === 0) return safeRows;

  const response = await fetch(
    '/.netlify/functions/teacher-assignment-instance-markers',
    {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        instance_ids: instanceIds
      })
    }
  );

  if (!response.ok) {
    throw new Error(
      `Assignment-instance marker lookup failed: ${response.status}`
    );
  }

  const result = await response.json();
  const markers = Array.isArray(result?.markers)
    ? result.markers
    : [];

  const markerById = new Map(
    markers
      .filter(marker => marker && marker.id)
      .map(marker => [marker.id, marker])
  );

  if (
    markerById.size !== instanceIds.length ||
    instanceIds.some(id => !markerById.has(id))
  ) {
    throw new Error(
      'Assignment-instance marker lookup returned an incomplete result'
    );
  }

  const nonInstructionalIds = new Set(
    markers
      .filter(marker => marker.non_instructional === true)
      .map(marker => marker.id)
  );

  return safeRows.filter(
    row =>
      !row.assignment_instance_id ||
      !nonInstructionalIds.has(row.assignment_instance_id)
  );
}

const local = {
  // Students
  async listStudents() { return store.get('students', []); },
  async upsertStudent(s) {
    const arr = store.get('students', []);
    const i = arr.findIndex(x => x.code === s.code);
    if (i >= 0) arr[i] = { ...arr[i], ...s };
    else arr.push({ ...s });
    store.set('students', arr);
    return s;
  },
  // TC-3: Batch upsert for efficient bulk operations
  async batchUpsertStudents(students) {
    const arr = store.get('students', []);
    const result = [];
    for (const s of students) {
      const i = arr.findIndex(x => x.code === s.code);
      const student = { code: s.code, name: s.name || s.code, class_id: s.class_id || null };
      if (i >= 0) {
        arr[i] = { ...arr[i], ...student };
        result.push(arr[i]);
      } else {
        arr.push(student);
        result.push(student);
      }
    }
    store.set('students', arr);
    return result;
  },

  // Goals
  async listGoalsByStudentCode(code) {
    const map = store.get('iepGoals', {});
    return map[code] || [];
  },
  async upsertGoal({ student_code, code, goal_text, desc, target = null, status = 'Open', 
                     measurement_type = 'percent', data_collector = null, 
                     data_collector_email = null, class_context = null, 
                     goal_area = null, baseline = null, mastery = null, case_manager = null, version = 1,
                     observation_config = null, notes = null,
                     criterion_conflict = undefined }) {
    const map = store.get('iepGoals', {});
    const goals = map[student_code] || [];
    const idx = goals.findIndex(g => g.code === code);
    // Map goal_text to desc for consistency with database schema
    const description = goal_text || desc;
    const goal = { 
      code, desc: description, target, status, measurement_type, data_collector, 
      data_collector_email, class_context, goal_area, baseline, mastery, case_manager, version,
      observation_config, notes
    };

    if (typeof criterion_conflict === 'boolean') {
      goal.criterion_conflict = criterion_conflict;
    }

    if (idx >= 0) {
      goals[idx] = { ...goals[idx], ...goal };
    } else {
      goals.push(goal);
    }
    map[student_code] = goals;
    store.set('iepGoals', map);
    return { student_code, ...goal };
  },
  async listGoalsAll() {
    const map = store.get('iepGoals', {});
    const result = [];
    for (const [student_code, goals] of Object.entries(map)) {
      for (const goal of goals) {
        result.push({ student_code, ...goal });
      }
    }
    return result;
  },

  // Progress
  async addProgress(p) {
    const arr = store.get('progressEntries', []);
    arr.push({ ...p, created_at: new Date().toISOString() });
    store.set('progressEntries', arr);
    return true;
  },

  // Events
  async addEvent(e) {
    const arr = store.get('events', []);
    arr.push({ id: Date.now() + Math.random().toString(36).slice(2), ...e });
    store.set('events', arr);
    return true;
  },
  async listEvents() { return store.get('events', []); },

  // Passwords (plaintext, for local dev)
  async setStudentPassword(code, plain) {
    const arr = store.get('students', []);
    const i = arr.findIndex(x => x.code === code);
    if (i >= 0) arr[i].password = plain;
    store.set('students', arr);
    return true;
  },
  async verifyStudentPassword(code, plain) {
    const s = (store.get('students', []) || []).find(x => x.code === code);
    const expected = s?.password || (code + '!');
    return expected === plain;
  },
  async getStudentPasswordStatuses() {
    const arr = store.get('students', []);
    return arr.map(s => ({
      student_code: s.code,
      // If no password stored, treat as default ({code}!); otherwise compare
      is_default_password: s.password == null || s.password === (s.code + '!'),
    }));
  },

  // Assignments / Instances (local placeholders)
  async createAssignment(a) {
    const id = 'A' + Math.random().toString(36).slice(2, 9).toUpperCase();
    const arr = store.get('assignments', []);
    const entry = { id, ...a, school_year: a.school_year ?? getCurrentSchoolYear(), created_at: new Date().toISOString() };
    arr.push(entry);
    store.set('assignments', arr);
    return entry;
  },

  async updateAssignment(id, updates) {
    const arr = store.get('assignments', []);
    const idx = arr.findIndex(a => a.id === id);
    if (idx === -1) throw new Error('Assignment not found');
    const originalMeta = arr[idx].meta;
    arr[idx] = { ...arr[idx], ...updates };
    // For meta, merge rather than replace
    if (updates.meta) {
      arr[idx].meta = { ...(originalMeta || {}), ...updates.meta };
    }
    store.set('assignments', arr);
    return arr[idx];
  },

  // Upload paper file — not available in local mode
  // eslint-disable-next-line no-unused-vars
  async uploadPaperFile(_file, _storagePath) {
    console.warn('[data-adapter] uploadPaperFile: file storage not available in local mode');
    return null;
  },

  // Delete a paper file — no-op in local mode
  // eslint-disable-next-line no-unused-vars
  async deletePaperFile(_storagePath) {
    return null;
  },

  // Create a submission archive record — stored in localStorage in local mode
  async createSubmissionArchive(record) {
    const archives = store.get('submissionArchives', []);
    const entry = {
      id: 'SA' + Math.random().toString(36).slice(2, 9).toUpperCase(),
      ...record,
      archived_at: record.archived_at || new Date().toISOString(),
    };
    archives.push(entry);
    store.set('submissionArchives', archives);
    return entry;
  },
  async listAssignments() {
    const currentYear = getCurrentSchoolYear();
    return store.get('assignments', []).filter(i => !i.school_year || i.school_year === currentYear);
  },
  async listAssignmentInstances() {
    const arr = store.get('assignmentInstances', []);
    const currentYear = getCurrentSchoolYear();
    // Return with snake_case field names to match remote
    return arr
      .filter(inst => !inst.school_year || inst.school_year === currentYear)
      .map(inst => ({
      id: inst.id || (inst.assignment_id + '-' + inst.student_code),
      assignment_id: inst.assignment_id,
      student_code: inst.student_code,
      student_name: inst.student_name,
      assigned_at: inst.assigned_at,
      due_at: inst.due_at,
      status: inst.status,
      settings: inst.settings,
      school_year: inst.school_year
    }));
  },
  async upsertAssignmentInstance(x) {
    const arr = store.get('assignmentInstances', []);
    const i = arr.findIndex(ai => ai.assignment_id === x.assignment_id && ai.student_code === x.student_code);
    const instance = {
      id: x.id || (x.assignment_id + '-' + x.student_code),
      assignment_id: x.assignment_id,
      student_code: x.student_code,
      student_name: x.student_name,
      assigned_at: x.assigned_at || new Date().toISOString().split('T')[0],
      due_at: x.due_at,
      status: x.status || 'Assigned',
      settings: x.settings || {},
      school_year: x.school_year ?? getCurrentSchoolYear()
    };
    if (i >= 0) arr[i] = instance;
    else arr.push(instance);
    store.set('assignmentInstances', arr);
    return instance;
  },
  async addSubmission(payload) {
    const submissions = store.get('submissions', []);
    const id = 'SUB' + Math.random().toString(36).slice(2, 9).toUpperCase();
    submissions.push({ id, ...payload, submitted_at: new Date().toISOString(), school_year: getCurrentSchoolYear() });
    store.set('submissions', submissions);
    
    // Update instance status to 'Submitted'
    const arr = store.get('assignmentInstances', []);
    const inst = arr.find(ai => ai.id === payload.instance_id);
    if (inst) inst.status = 'Submitted';
    store.set('assignmentInstances', arr);
    
    return { submission_id: id };
  },

  // Portal B: List submissions (filtered by student if provided)
  async listSubmissions(filters = {}) {
    const submissions = store.get('submissions', []);
    const currentYear = getCurrentSchoolYear();
    let result = submissions.filter(s => !s.school_year || s.school_year === currentYear);
    
    if (filters.student_code) {
      const instances = store.get('assignmentInstances', []);
      const studentInstanceIds = new Set(
        instances.filter(i => i.student_code === filters.student_code).map(i => i.id)
      );
      result = result.filter(s => studentInstanceIds.has(s.instance_id));
    }
    
    if (filters.instance_id) {
      result = result.filter(s => s.instance_id === filters.instance_id);
    }
    
    if (filters.excludeFinalized) {
      result = result.filter(s => s.review_status !== 'finalized');
    }
    
    return deduplicateSubmissions(result);
  },
  
  // Portal B: Get latest submission for an instance
  async getLatestSubmission(instance_id) {
    const submissions = store.get('submissions', []);
    const instanceSubmissions = submissions
      .filter(s => s.instance_id === instance_id)
      .sort((a, b) => new Date(b.submitted_at) - new Date(a.submitted_at));
    
    return instanceSubmissions[0] || null;
  },
  
  // Portal B: Create resubmission
  async createResubmission({ instance_id, original_submission_id, answers = {} }) {
    const instances = store.get('assignmentInstances', []);
    const instance = instances.find(i => i.id === instance_id);
    
    if (!instance) {
      throw new Error(`Assignment instance ${instance_id} not found`);
    }
    
    // Check resubmission limit
    const resubmissionCount = instance.resubmission_count || 0;
    if (resubmissionCount >= 1) {
      throw new Error('Resubmission limit reached for this assignment');
    }
    
    // Create new submission
    const submissions = store.get('submissions', []);
    const id = 'SUB' + Math.random().toString(36).slice(2, 9).toUpperCase();
    const newSubmission = {
      id,
      instance_id,
      submission_type: 'resubmission',
      original_submission_id,
      answers,
      submitted_at: new Date().toISOString()
    };
    
    submissions.push(newSubmission);
    store.set('submissions', submissions);
    
    // Increment resubmission count and update status
    instance.resubmission_count = resubmissionCount + 1;
    instance.status = 'Submitted';
    store.set('assignmentInstances', instances);
    
    return { submission_id: id };
  },
  
  // Phase B: Classes and Enrollments (local stub)
  async listClasses() {
    // Prefer stored classes; otherwise derive unique set from students[].class_id
    const storedClasses = store.get('classes', []);
    if (storedClasses.length > 0) {
      return storedClasses;
    }
    
    // Derive from students with class_id
    const students = store.get('students', []);
    const uniqueClassIds = [...new Set(students.map(s => s.class_id).filter(Boolean))];
    
    // Return each class_id as {id, code, name} all set to the class_id value
    return uniqueClassIds.map(classId => ({
      id: classId,
      code: classId,
      name: classId
    }));
  },
  
  async listClassEnrollments() {
    // Prefer stored enrollments; otherwise derive from students having class_id
    const storedEnrollments = store.get('classEnrollments', []);
    if (storedEnrollments.length > 0) {
      // Add class_name if not present
      const results = [];
      for (const e of storedEnrollments) {
        if (e.active === false) continue;

        const classCode = e.class_code || e.class_id || '';
        const className = e.class_name || classCode || '';
        const canonicalNames = mapToCanonicalNames(classCode, className);
        
        for (const canonName of canonicalNames) {
          results.push({
            ...e,
            class_name: canonName
          });
        }
      }
      return results;
    }
    
    // Derive from students with class_id
    const students = store.get('students', []);
    const classes = store.get('classes', []);
    const classMap = new Map(classes.map(c => [c.id, c]));
    
    const results = [];
    for (const s of students) {
      if (!s.class_id) continue;
      
      const classInfo = classMap.get(s.class_id) || { code: s.class_id, name: s.class_id };
      const canonicalNames = mapToCanonicalNames(classInfo.code, classInfo.name);
      
      for (const canonName of canonicalNames) {
        results.push({
          class_id: s.class_id,
          class_code: classInfo.code,
          class_name: canonName,
          student_code: s.code,
          student_name: s.name || s.code
        });
      }
    }
    
    return results;
  },
  
  async upsertClass(classData) {
    const classes = store.get('classes', []);
    const existing = classes.find(c => c.id === classData.id || c.name === classData.name);
    if (existing) {
      Object.assign(existing, classData);
    } else {
      classes.push({ id: classData.id || 'CLS' + Date.now(), ...classData });
    }
    store.set('classes', classes);
    return classData;
  },
  
  async upsertClassEnrollment(enrollment) {
    const enrollments = store.get('classEnrollments', []);
    const normalized = {
      ...enrollment,
      active: true
    };
    const existing = enrollments.find(e =>
      e.class_id === normalized.class_id &&
      e.student_code === normalized.student_code
    );

    if (existing) {
      Object.assign(existing, normalized);
    } else {
      enrollments.push(normalized);
    }

    store.set('classEnrollments', enrollments);
    return normalized;
  },
  
  // Phase B: HTML Package Upload (local stub - stores manifest but not actual files)
  async uploadAssignmentZip(file, manifest, createdBy = null) {
    // In local mode, we can't actually store files, so just create assignment with manifest data
    const id = 'A' + Math.random().toString(36).slice(2, 9).toUpperCase();
    const arr = store.get('assignments', []);
    const assignment = {
      id,
      title: manifest.title,
      type: 'html',
      series: null,
      page: manifest.page || null,
      hero: null,
      meta: {
        version: manifest.version,
        questions: manifest.questions || []
      },
      created_by: createdBy,
      created_at: new Date().toISOString()
    };
    arr.push(assignment);
    store.set('assignments', arr);
    return assignment;
  },
  
  // Phase B: Google Forms metadata
  async saveFormMeta(assignmentId, meta) {
    const arr = store.get('assignments', []);
    const assignment = arr.find(a => a.id === assignmentId);
    if (!assignment) throw new Error('Assignment not found');
    
    // Merge metadata
    assignment.meta = { ...assignment.meta, ...meta };
    
    // If page is provided, update it at top level
    if (meta.page) {
      assignment.page = meta.page;
    }
    
    store.set('assignments', arr);
    return true;
  },
  
  // Phase B: Import responses from CSV (local stub)

  // ============================================================================
  // Phase 1: Goal Progress (Local fallback)
  // ============================================================================
  async listGoalProgress({ studentCodes, goalCodes, classCodes, startDate, endDate, goalAreas, limit, includeAllYears = false } = {}) {
    console.log('[goal-progress] listGoalProgress (local mode)', { studentCodes, goalCodes, classCodes, startDate, endDate, goalAreas, limit });
    const currentYear = getCurrentSchoolYear();
    const progressArr = store.get('goalProgress', []).filter(p => includeAllYears || !p.school_year || p.school_year === currentYear);
    const students = store.get('students', []);
    const goalsMap = store.get('iepGoals', {});
    
    // Build a flat list of goals with metadata
    const allGoals = [];
    for (const [student_code, goals] of Object.entries(goalsMap)) {
      for (const goal of goals) {
        allGoals.push({
          ...goal,
          student_code,
          goal_code: goal.code,
          goal_area: goal.goal_area || 'Uncategorized'
        });
      }
    }
    
    // Filter progress entries
    let filtered = progressArr.filter(p => {
      // Filter by student codes
      if (studentCodes && studentCodes.length > 0 && !studentCodes.includes(p.student_code)) return false;
      
      // Filter by goal codes
      if (goalCodes && goalCodes.length > 0 && !goalCodes.includes(p.goal_code)) return false;
      
      // Filter by class codes
      if (classCodes && classCodes.length > 0 && !classCodes.includes(p.class_code)) return false;
      
      // Filter by date range
      if (startDate && p.date < startDate) return false;
      if (endDate && p.date > endDate) return false;
      
      // Filter by goal areas (join with goals to get goal_area)
      if (goalAreas && goalAreas.length > 0) {
        const goal = allGoals.find(g => g.goal_code === p.goal_code && g.student_code === p.student_code);
        if (!goal || !goalAreas.includes(goal.goal_area)) return false;
      }
      
      return true;
    });
    
    // Enrich with metadata
    filtered = filtered.map(p => {
      const student = students.find(s => s.code === p.student_code);
      const goal = allGoals.find(g => g.goal_code === p.goal_code && g.student_code === p.student_code);
      return {
        ...p,
        student_name: student?.name || p.student_code,
        goal_desc: goal?.desc || '',
        goal_area: goal?.goal_area || 'Uncategorized',
        class_code: p.class_code || null
      };
    });
    
    // Apply limit
    if (limit) {
      filtered = filtered.slice(0, limit);
    }
    
    return filtered;
  },

  // ============================================================================
  // Goal Data Points (Local fallback — returns empty; data captured server-side)
  // ============================================================================
  async listGoalDataPoints({ studentId, goalId } = {}) {
    console.log('[goal-data-points] listGoalDataPoints (local mode)', { studentId, goalId });
    // Per-question data points are only captured via the Netlify function against
    // the remote database. Return empty array in local (demo) mode.
    return [];
  },

  async listGoalQuarterAverages({ goalIds, studentIds, year } = {}) {
    console.log('[goal-progress] listGoalQuarterAverages (local mode)', { goalIds, studentIds, year });
    const progressArr = store.get('goalProgress', []);
    
    // Group by goal_code, student_code, quarter
    const groups = {};
    
    progressArr.forEach(p => {
      if (!p.date || p.value == null) return;
      
      const date = new Date(p.date);
      const month = date.getMonth() + 1; // 1-12
      const day = date.getDate();
      const pYear = date.getFullYear();
      
      // TODO: Make quarter dates configurable from /teacher/overview/ settings
      // Determine school year and quarter based on actual school calendar
      // School year starts Aug 16, so Aug 16-Dec 31 use current year, Jan 1-Aug 15 use previous year
      const schoolYear = (month > 8 || (month === 8 && day >= 16)) ? pYear : pYear - 1;
      
      // Q1: Aug 16-Oct 17, Q2: Oct 18-Dec 19, Q3: Dec 20-Mar 6, Q4: Mar 7-May 20
      let quarter = 'Unknown';
      if ((month === 8 && day >= 16) || month === 9 || (month === 10 && day <= 17)) {
        quarter = 'Q1';
      } else if ((month === 10 && day >= 18) || month === 11 || (month === 12 && day <= 19)) {
        quarter = 'Q2';
      } else if ((month === 12 && day >= 20) || month === 1 || month === 2 || (month === 3 && day <= 6)) {
        quarter = 'Q3';
      } else if ((month === 3 && day >= 7) || month === 4 || (month === 5 && day <= 20)) {
        quarter = 'Q4';
      } else {
        // Summer (May 21-Aug 15) - treat as Q4
        quarter = 'Q4';
      }
      
      // Filter by year if specified
      if (year && schoolYear !== year) return;
      
      const key = `${p.student_code}|${p.goal_code}|${quarter}|${schoolYear}`;
      if (!groups[key]) {
        groups[key] = {
          student_code: p.student_code,
          goal_code: p.goal_code,
          quarter,
          school_year: schoolYear,
          sum: 0,
          count: 0
        };
      }
      
      groups[key].sum += parseFloat(p.value);
      groups[key].count += 1;
    });
    
    // Convert to array with averages
    const result = Object.values(groups).map(g => ({
      student_code: g.student_code,
      goal_code: g.goal_code,
      quarter: g.quarter,
      school_year: g.school_year,
      avg_value: Math.round(g.sum / g.count * 10) / 10,
      measurement_count: g.count
    }));
    
    return result;
  },

  async upsertGoalProgress({ goal_code, student_code, date, value, source = 'manual', class_code = null, collected_by = null, assignment_instance_id = null, notes = null }) {
    console.log('[goal-progress] upsertGoalProgress (local mode)', { goal_code, student_code, date, value, source });
    const arr = store.get('goalProgress', []);
    
    // Create new entry (local mode doesn't update, just appends)
    const entry = {
      id: 'gp_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9),
      goal_code,
      student_code,
      class_code,
      date,
      value: parseFloat(value),
      source,
      collected_by,
      assignment_instance_id,
      notes,
      school_year: getCurrentSchoolYear(),
      created_at: new Date().toISOString()
    };
    
    arr.push(entry);
    store.set('goalProgress', arr);
    
    return entry;
  },

  // ============================================================================
  // Review Tab: Submission Answers
  // ============================================================================
  
  /**
   * List all submission answers for a given submission with enriched data
   * @param {string} submissionId - Submission ID
   * @returns {Array} Submission answers with item details and mappings
   */
  async listSubmissionAnswers(submissionId) {
    const answers = store.get('submissionAnswers', []);
    const items = store.get('assignmentItems', []);
    const mappings = store.get('assignmentItemMappings', []);
    
    // Filter answers for this submission
    const submissionAnswers = answers.filter(a => a.submission_id === submissionId);
    
    // Enrich with item and mapping data
    return submissionAnswers.map(answer => {
      const itemId = answer.assignment_item_id ?? answer.item_id;
      const item = items.find(i => i.id === itemId) || {};
      const mapping = mappings.find(m => m.item_id === itemId) || {};
      
      return {
        ...answer,
        item_ref: item.item_ref,
        answer_type: item.answer_type,
        points: item.points,
        meta: item.meta,
        dese_codes: mapping.dese_codes || [],
        goal_codes: mapping.goal_codes || [],
        weight: mapping.weight || 1.0
      };
    });
  },

  /**
   * Update or create a submission answer with teacher scoring
   * @param {Object} params - { submissionId, itemId, earnedPoints, teacherNote }
   * @returns {Object} Updated submission answer
   */
  async updateSubmissionAnswer({ submissionId, itemId, earnedPoints, teacherNote }) {
    const answers = store.get('submissionAnswers', []);
    const existingIndex = answers.findIndex(
      a => a.submission_id === submissionId && (a.assignment_item_id === itemId || a.item_id === itemId)
    );
    
    const updatedAnswer = {
      submission_id: submissionId,
      assignment_item_id: itemId,
      earned_points: earnedPoints,
      // Note: is_correct is not set for manual grading as it's ambiguous (partial credit, 0-point items, etc.)
      teacher_note: teacherNote || '',
      created_at: new Date().toISOString()
    };
    
    if (existingIndex >= 0) {
      // Update existing
      answers[existingIndex] = { ...answers[existingIndex], ...updatedAnswer };
    } else {
      // Create new
      updatedAnswer.id = 'SA' + Date.now() + '_' + Math.random().toString(36).slice(2, 9);
      answers.push(updatedAnswer);
    }
    
    store.set('submissionAnswers', answers);
    return updatedAnswer;
  },

  /**
   * Finalize a submission with scores and set review status to 'finalized'
   * @param {string} submissionId - Submission ID
   * @param {Object} params - { scoreAuto, scoreManual, scoreTotal }
   * @returns {boolean} Success
   */
  async finalizeSubmission(submissionId, { scoreAuto, scoreManual, scoreTotal }) {
    const submissions = store.get('submissions', []);
    const submission = submissions.find(s => s.id === submissionId);
    
    if (!submission) {
      throw new Error('Submission not found');
    }
    
    if (scoreAuto !== undefined) submission.score_auto = scoreAuto;
    submission.score_manual = scoreManual;
    submission.score_total = scoreTotal;
    submission.review_status = 'finalized';
    
    store.set('submissions', submissions);
    
    // Update instance status to 'Reviewed'
    const instances = store.get('assignmentInstances', []);
    const instance = instances.find(i => i.id === submission.instance_id);
    if (instance) {
      instance.status = 'Reviewed';
      store.set('assignmentInstances', instances);
    }
    
    return true;
  },

  /**
   * Update a submission with grading fields (score_auto, score_manual, score_total, status, graded_at, graded_by, feedback)
   * @param {Object} params - { id, score_auto, score_manual, score_total, status, graded_at, graded_by, feedback }
   * @returns {boolean} Success
   */
  async upsertSubmission({ id, score_auto, score_manual, score_total, status, graded_at, graded_by, feedback }) {
    const submissions = store.get('submissions', []);
    const submission = submissions.find(s => s.id === id);
    if (!submission) throw new Error('Submission not found');
    if (score_auto !== undefined) submission.score_auto = score_auto;
    if (score_manual !== undefined) submission.score_manual = score_manual;
    if (score_total !== undefined) submission.score_total = score_total;
    if (status !== undefined) submission.review_status = status === 'Graded' ? 'reviewed' : status.toLowerCase();
    if (graded_at !== undefined) submission.graded_at = graded_at;
    if (graded_by !== undefined) submission.graded_by = graded_by;
    if (feedback !== undefined) submission.feedback = feedback;
    store.set('submissions', submissions);
    return true;
  },

  async setSubmissionInProgress(submissionId) {
    const submissions = store.get('submissions', []);
    const submission = submissions.find(s => s.id === submissionId);
    if (submission) {
      submission.review_status = 'in_progress';
      store.set('submissions', submissions);
    }
    return true;
  },

  async reopenSubmission(submissionId) {
    const submissions = store.get('submissions', []);
    const submission = submissions.find(s => s.id === submissionId);
    if (!submission) throw new Error('Submission not found');

    submission.review_status = 'pending';
    store.set('submissions', submissions);

    const instances = store.get('assignmentInstances', []);
    const instance = instances.find(i => i.id === submission.instance_id);
    if (instance) {
      instance.status = 'In Progress';
      store.set('assignmentInstances', instances);
    }

    return true;
  },

  // ============================================================================
  // Archive Tab: Student Archive Management
  // ============================================================================

  /**
   * Get all archived students
   * @returns {Array} Students where active = false
   */
  async getArchivedStudents() {
    const students = store.get('students', []);
    return students.filter(s => s.active === false);
  },

  /**
   * Get comprehensive archive data for a student
   * @param {string} studentCode - Student code
   * @returns {Object} {student, goals, submissions, progress, gradebookScores}
   */
  async getStudentArchiveData(studentCode) {
    const students = store.get('students', []);
    const student = students.find(s => s.code === studentCode);
    if (!student) return null;

    // Get all goals for this student (including archived versions)
    const iepGoals = store.get('iepGoals', {});
    const goals = iepGoals[studentCode] || [];

    // Get all submissions
    const allSubmissions = store.get('submissions', []);
    const submissions = allSubmissions.filter(s => s.student_code === studentCode);

    // Get all progress entries
    const allProgress = store.get('goalProgress', []);
    const progress = allProgress.filter(p => p.student_code === studentCode);

    // Get gradebook scores (if available)
    const allScores = store.get('gradebookScores', []);
    const gradebookScores = allScores.filter(s => s.student_code === studentCode);

    return {
      student,
      goals,
      submissions,
      progress,
      gradebookScores
    };
  },

  /**
   * Reactivate an archived student
   * @param {string} studentCode - Student code
   * @returns {Object} Updated student
   */
  async reactivateStudent(studentCode) {
    const students = store.get('students', []);
    const student = students.find(s => s.code === studentCode);
    if (!student) throw new Error('Student not found');

    student.active = true;
    student.archived_at = null;
    store.set('students', students);

    return student;
  },

  // ============================================================================
  // Data Entry Tokens: Token Management (Local Mode)
  // ============================================================================

  /**
   * Create a data entry token
   * @param {Object} params - {studentCode, goalCode, dataCollector, dataCollectorEmail}
   * @returns {Object} Token object with token string
   */
  async createDataEntryToken({ studentCode, goalCode, dataCollector, dataCollectorEmail }) {
    const tokens = store.get('dataEntryTokens', []);
    
    // Check if token already exists for this student+goal combo
    const existing = tokens.find(t => 
      t.student_code === studentCode && 
      t.goal_code === goalCode && 
      !t.revoked
    );
    
    if (existing) return existing;

    // Generate random 32-char hex token
    const tokenArray = new Uint8Array(16);
    crypto.getRandomValues(tokenArray);
    const token = Array.from(tokenArray, byte => byte.toString(16).padStart(2, '0')).join('');

    const tokenObj = {
      id: 'tok_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9),
      token,
      student_code: studentCode,
      goal_code: goalCode,
      data_collector: dataCollector,
      data_collector_email: dataCollectorEmail,
      created_by: 'teacher',
      created_at: new Date().toISOString(),
      expires_at: null,
      revoked: false
    };

    tokens.push(tokenObj);
    store.set('dataEntryTokens', tokens);

    return tokenObj;
  },

  /**
   * Get token details by token string
   * @param {string} token - Token string
   * @returns {Object|null} Token object or null if invalid/revoked/expired
   */
  async getDataEntryToken(token) {
    const tokens = store.get('dataEntryTokens', []);
    const tokenObj = tokens.find(t => t.token === token);
    
    if (!tokenObj || tokenObj.revoked) return null;
    
    // Check expiration
    if (tokenObj.expires_at) {
      const expiresAt = new Date(tokenObj.expires_at);
      if (expiresAt < new Date()) return null;
    }

    return tokenObj;
  },

  /**
   * List all active tokens for a student
   * @param {string} studentCode - Student code
   * @returns {Array} Active tokens
   */
  async listDataEntryTokens(studentCode) {
    const tokens = store.get('dataEntryTokens', []);
    return tokens.filter(t => 
      t.student_code === studentCode && 
      !t.revoked &&
      (!t.expires_at || new Date(t.expires_at) > new Date())
    );
  },

  /**
   * Revoke a data entry token
   * @param {string} tokenId - Token ID
   * @returns {boolean} Success
   */
  async revokeDataEntryToken(tokenId) {
    const tokens = store.get('dataEntryTokens', []);
    const token = tokens.find(t => t.id === tokenId);
    if (!token) return false;

    token.revoked = true;
    store.set('dataEntryTokens', tokens);

    return true;
  },

  // App config (key-value store for cross-device settings like home config)
  async getAppConfig(key) {
    try {
      return JSON.parse(localStorage.getItem('rc_app_config_' + key)) ?? null;
    } catch { return null; }
  },
  async setAppConfig(key, value) {
    localStorage.setItem('rc_app_config_' + key, JSON.stringify(value));
    return value;
  },

  // AI Builder Outputs (local stubs)
  async listAiBuilderOutputs(filters = {}) {
    const outputs = store.get('aiBuilderOutputs', []);
    return outputs.filter(o => {
      if (filters.status && o.status !== filters.status) return false;
      if (filters.week && o.week !== filters.week) return false;
      if (filters.subject && o.subject !== filters.subject) return false;
      return true;
    }).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  },

  async saveAiBuilderOutput(output) {
    const outputs = store.get('aiBuilderOutputs', []);
    const entry = {
      id: 'aio_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9),
      ...output,
      created_at: new Date().toISOString(),
      status: 'active',
    };
    outputs.push(entry);
    store.set('aiBuilderOutputs', outputs);
    return entry;
  },

  async updateAiBuilderOutput(id, updates) {
    const outputs = store.get('aiBuilderOutputs', []);
    const idx = outputs.findIndex(o => o.id === id);
    if (idx === -1) throw new Error('Output not found');
    outputs[idx] = { ...outputs[idx], ...updates };
    store.set('aiBuilderOutputs', outputs);
    return outputs[idx];
  },

  // ============================================================================
  // Attendance Log
  // ============================================================================

  async upsertAttendance({ student_code, date, status = 'present', source = 'manual', notes = null }) {
    const arr = store.get('attendanceLog', []);
    const idx = arr.findIndex(e => e.student_code === student_code && e.date === date);
    const entry = {
      id: idx >= 0 ? arr[idx].id : ('att_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9)),
      student_code,
      date,
      status,
      source,
      notes,
      created_at: idx >= 0 ? arr[idx].created_at : new Date().toISOString(),
    };
    if (idx >= 0) {
      arr[idx] = entry;
    } else {
      arr.push(entry);
    }
    store.set('attendanceLog', arr);
    return entry;
  },

  async listAttendance(student_code, startDate, endDate) {
    const arr = store.get('attendanceLog', []);
    return arr.filter(e =>
      e.student_code === student_code &&
      (!startDate || e.date >= startDate) &&
      (!endDate || e.date <= endDate)
    );
  },

  async listAttendanceAll(startDate, endDate) {
    const arr = store.get('attendanceLog', []);
    return arr.filter(e =>
      (!startDate || e.date >= startDate) &&
      (!endDate || e.date <= endDate)
    );
  },
};


async function callTeacherGoalProgress(action, payload = {}) {
  const response = await fetch(
    '/.netlify/functions/teacher-goal-progress',
    {
      method: 'POST',
      credentials: 'include',
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        action,
        ...payload,
      }),
    }
  );

  const result = await response
    .json()
    .catch(() => ({
      ok: false,
      error: `HTTP ${response.status}`,
    }));

  if (!response.ok || result.ok !== true) {
    const error = new Error(
      result.error ||
      'Teacher goal-progress request failed'
    );

    error.status = response.status;
    throw error;
  }

  return result;
}

async function callTeacherDataEntryTokens(action, payload = {}) {
  const response = await fetch(
    '/.netlify/functions/teacher-data-entry-tokens',
    {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        action,
        ...payload,
      }),
    }
  );

  const result = await response
    .json()
    .catch(() => ({
      ok: false,
      error: `HTTP ${response.status}`,
    }));

  if (!response.ok || !result.ok) {
    const error = new Error(
      result.error ||
      'Data-entry token request failed'
    );

    error.status = response.status;
    throw error;
  }

  return result;
}

async function callPublicDataEntryAccess(token) {
  const response = await fetch(
    '/.netlify/functions/data-entry-access' +
    `?token=${encodeURIComponent(token)}`,
    {
      method: 'GET',
      credentials: 'same-origin',
      headers: {
        'Accept': 'application/json',
      },
    }
  );

  const result = await response
    .json()
    .catch(() => ({
      ok: false,
      error: `HTTP ${response.status}`,
    }));

  if (!response.ok || !result.ok) {
    const error = new Error(
      result.error ||
      'Data-entry link validation failed'
    );

    error.status = response.status;
    throw error;
  }

  return result;
}


let teacherRosterContextRequest = null;

async function fetchTeacherRosterContext() {
  if (!teacherRosterContextRequest) {
    teacherRosterContextRequest = (async () => {
      const response = await fetch(
        '/.netlify/functions/teacher-roster-context',
        {
          method: 'GET',
          credentials: 'include',
          cache: 'no-store',
          headers: {
            Accept: 'application/json'
          }
        }
      );

      const result = await response
        .json()
        .catch(() => ({
          ok: false,
          error: `HTTP ${response.status}`
        }));

      if (!response.ok || !result.ok) {
        const requestId =
          response.headers.get('X-Request-Id') ||
          'unknown';

        const error = new Error(
          `${result.error || 'Failed to load Teacher roster context'} ` +
          `(Request ID: ${requestId})`
        );

        error.status = response.status;
        throw error;
      }

      return result;
    })().finally(() => {
      teacherRosterContextRequest = null;
    });
  }

  return teacherRosterContextRequest;
}

const remote = {
  async listStudents() {
    const context =
      await fetchTeacherRosterContext();

    return Array.isArray(context.students)
      ? context.students
      : [];
  },
  async upsertStudent(studentData) {
    const supabase = await getSupabase();
    if (!supabase) throw new Error('supabase-not-configured');
    
    const { code, name, class_id = null, iep_due, eval_due, primary_case_manager, archived_at, active } = studentData;
    
    // TC-3.1: Use server-backed function to avoid RLS errors
    // Call teacher-students-upsert function with batch of 1 student
    try {
      const response = await fetch('/.netlify/functions/teacher-students-upsert', {
        method: 'POST',
        credentials: 'include', // Include teacher session cookie
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          students: [{ 
            code, 
            name: name || code, 
            class_id,
            iep_due,
            eval_due,
            primary_case_manager,
            archived_at,
            active
          }]
        })
      });
      
      // TC-3.1: Get request ID from response headers for error tracking
      const requestId = response.headers.get('X-Request-Id') || 'unknown';
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        
        // TC-3.1: Only allow fallback to direct Supabase in local dev environments
        if (isLocalDev() && (response.status === 401 || response.status === 503)) {
          console.log('[data-adapter] Local dev: Teacher function unavailable, falling back to direct Supabase');
          const payload = { code, name, class_id, iep_due, eval_due, primary_case_manager, archived_at, active };
          const { data, error } = await supabase.from('students').upsert(payload, { onConflict: 'code' }).select().single();
          if (error) throw error;
          return data;
        }
        
        // TC-3.1: In production, throw clear error with request ID (no fallback)
        const errorMsg = errorData.error || `Server error: ${response.status}`;
        throw new Error(`${errorMsg} (Request ID: ${requestId})`);
      }
      
      const result = await response.json();
      if (!result.ok || !result.students || result.students.length === 0) {
        throw new Error(`Failed to upsert student: Empty result (Request ID: ${requestId})`);
      }
      
      return result.students[0];
    } catch (err) {
      // TC-3.1: Only allow fallback in local dev (no production fallback to avoid RLS violations)
      if (isLocalDev() && err.message !== 'supabase-not-configured') {
        console.warn('[data-adapter] Local dev: Server upsert failed, attempting direct Supabase:', err.message);
        const payload = { code, name, class_id, iep_due, eval_due, primary_case_manager, archived_at, active };
        const { data, error } = await supabase.from('students').upsert(payload, { onConflict: 'code' }).select().single();
        if (error) throw error;
        return data;
      }
      
      // In production or if Supabase not configured, throw the original error
      throw err;
    }
  },
  // TC-3: Batch upsert for efficient bulk operations
  async batchUpsertStudents(students) {
    if (!Array.isArray(students) || students.length === 0) {
      return [];
    }
    
    const supabase = await getSupabase();
    if (!supabase) throw new Error('supabase-not-configured');
    
    // Use server-backed function for batch operations
    try {
      const response = await fetch('/.netlify/functions/teacher-students-upsert', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ students })
      });
      
      // TC-3.1: Get request ID from response headers for error tracking
      const requestId = response.headers.get('X-Request-Id') || 'unknown';
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        
        // TC-3.1: Only allow fallback to direct Supabase in local dev environments
        if (isLocalDev() && (response.status === 401 || response.status === 503)) {
          console.log('[data-adapter] Local dev: Teacher function unavailable for batch, falling back to direct Supabase');
          const studentsToUpsert = students.map(s => ({
            code: s.code,
            name: s.name || s.code,
            class_id: s.class_id || null
          }));
          const { data, error } = await supabase.from('students').upsert(studentsToUpsert, { onConflict: 'code' }).select();
          if (error) throw error;
          return data;
        }
        
        // TC-3.1: In production, throw clear error with request ID (no fallback)
        const errorMsg = errorData.error || `Server error: ${response.status}`;
        throw new Error(`${errorMsg} (Request ID: ${requestId})`);
      }
      
      const result = await response.json();
      if (!result.ok || !result.students) {
        throw new Error(`Failed to batch upsert students (Request ID: ${requestId})`);
      }
      
      return result.students;
    } catch (err) {
      // TC-3.1: Only allow fallback in local dev (no production fallback to avoid RLS violations)
      if (isLocalDev() && err.message !== 'supabase-not-configured') {
        console.warn('[data-adapter] Local dev: Server batch upsert failed, attempting direct Supabase:', err.message);
        const studentsToUpsert = students.map(s => ({
          code: s.code,
          name: s.name || s.code,
          class_id: s.class_id || null
        }));
        const { data, error } = await supabase.from('students').upsert(studentsToUpsert, { onConflict: 'code' }).select();
        if (error) throw error;
        return data;
      }
      
      // In production or if Supabase not configured, throw the original error
      throw err;
    }
  },
  async listGoalsByStudentCode(code) {
    const supabase = await getSupabase();
    if (!supabase) throw new Error('supabase-not-configured');
    const { data: stu, error: e1 } = await supabase.from('students').select('id').eq('code', code).single();
    if (e1) throw e1;
    const { data, error } = await supabase.from('goals')
      .select('id, code, desc, target, status, measurement_type, data_collector, data_collector_email, class_context, goal_area, baseline, mastery, case_manager, version, observation_config, notes, criterion_conflict, addressed_in_class, individual_delivery')
      .eq('student_id', stu.id)
      .eq('active', true)
      .or('status.is.null,status.not.in.(closed,archived,Closed,Archived)')
      .order('code');
    if (error) throw error; return data;
  },
  async upsertGoal({ student_code, code, goal_text, desc, target = null, status = 'Open',
                     measurement_type = 'percent', data_collector = null,
                     data_collector_email = null, class_context = null,
                     goal_area = null, baseline = null, mastery = null, case_manager = null, version = 1,
                     observation_config = null, notes = null,
                     criterion_conflict = undefined,
                     addressed_in_class = true, individual_delivery = false }) {
    const supabase = await getSupabase();
    if (!supabase) throw new Error('supabase-not-configured');
    // Lookup student by code
    const { data: stu, error: e1 } = await supabase.from('students').select('id').eq('code', student_code).single();
    if (e1) throw e1;
    // Map goal_text to desc for consistency with database schema
    const description = goal_text || desc;
    
    // Try with new columns first
    const fullPayload = { 
      student_id: stu.id, code, desc: description, target, status,
      measurement_type, data_collector, data_collector_email, class_context,
      goal_area, baseline, mastery, case_manager, version,
      observation_config, notes, addressed_in_class, individual_delivery
    };

    if (typeof criterion_conflict === 'boolean') {
      fullPayload.criterion_conflict = criterion_conflict;
    }

    let { data, error } = await supabase.from('goals')
      .upsert(fullPayload, { onConflict: 'student_id,code' })
      .select()
      .single();
    
    // Graceful fallback: if schema error, retry with basic columns only
    if (isSchemaError(error)) {
      if (criterion_conflict === true) {
        throw new Error(
          'criterion-conflict-schema-unavailable'
        );
      }

      console.error('[data-adapter] ⚠ Schema fallback in upsertGoal() — enriched fields (baseline, mastery, class_context, addressed_in_class, individual_delivery, etc.) were NOT saved. Apply the 20260405_goal_delivery_fields migration.', { code: error.code, message: error.message });
      const basicPayload = { student_id: stu.id, code, desc: description, target, status };
      const fallback = await supabase.from('goals')
        .upsert(basicPayload, { onConflict: 'student_id,code' })
        .select()
        .single();
      if (fallback.error) throw fallback.error;
      return { student_code, ...fallback.data, _fallback: true };
    }
    
    if (error) throw error;
    return { student_code, ...data };
  },
  async listGoalsAll() {
    const context =
      await fetchTeacherRosterContext();

    return Array.isArray(context.goals)
      ? context.goals
      : [];
  },
  async addProgress({ student_code, goal_id, date, percent = null, method = '', by_name = 'Teacher', via = 'manual', notes = '' }) {
    const supabase = await getSupabase();
    if (!supabase) throw new Error('supabase-not-configured');
    const { data: stu, error: e1 } = await supabase.from('students').select('id').eq('code', student_code).single();
    if (e1) throw e1;
    const { error } = await supabase.from('progress_entries').insert({ student_id: stu.id, goal_id, date, percent, method, by_name, via, notes });
    if (error) throw error; return true;
  },
  async addEvent({ type, student_code, date, due, notes }) {
    const supabase = await getSupabase();
    if (!supabase) throw new Error('supabase-not-configured');
    const { data: stu, error: e1 } = await supabase.from('students').select('id').eq('code', student_code).single();
    if (e1) throw e1;
    const { error } = await supabase.from('events').insert({ type, student_id: stu.id, date, due, notes });
    if (error) throw error; return true;
  },
  async listEvents() {
    const supabase = await getSupabase();
    if (!supabase) throw new Error('supabase-not-configured');
    const { data, error } = await supabase.from('events').select('id, type, student_id, date, due, notes, created_at').order('date', { ascending: true });
    if (error) throw error; return data;
  },
  async setStudentPassword(code, plain) {
    const supabase = await getSupabase();
    if (!supabase) throw new Error('supabase-not-configured');
    const { error } = await supabase.rpc('set_student_password', { p_code: code, p_password: plain });
    if (error) throw error;
    return true;
  },
  async verifyStudentPassword(code, plain) {
    const supabase = await getSupabase();
    if (!supabase) throw new Error('supabase-not-configured');
    const { data, error } = await supabase.rpc('verify_student_password', { p_code: code, p_password: plain });
    if (error) throw error; return !!data;
  },
  async getStudentPasswordStatuses() {
    const supabase = await getSupabase();
    if (!supabase) throw new Error('supabase-not-configured');
    const { data, error } = await supabase.rpc('list_student_password_statuses');
    if (error) throw error;
    return data || [];
  },
  
  // Assignments
  async createAssignment(a) {
    const supabase = await getSupabase();
    if (!supabase) throw new Error('supabase-not-configured');
    const payload = {
      title: a.title,
      type: a.type || 'html',
      series: a.series || null,
      page: a.page || null,
      hero: a.hero || null,
      meta: a.meta || {},
      created_by: a.created_by || null,
      unit_id: a.unit_id || null,
      section_id: a.section_id || null,
      tags: a.tags || []
    };
    const { data, error } = await supabase.from('assignments').insert(payload).select().single();
    if (error) throw error;
    return data;
  },

  async updateAssignment(id, updates) {
    const supabase = await getSupabase();
    if (!supabase) throw new Error('supabase-not-configured');
    return await withRetry(async () => {
      const { data, error } = await supabase
        .from('assignments')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    });
  },

  // Create a paper assignment through the signed Teacher Center boundary.
  async createPaperAssignment({ title, class_name, page, meta }) {
    const response = await fetch('/.netlify/functions/teacher-paper-assignment-create', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        title,
        className: class_name,
        page,
        meta
      })
    });

    const result = await response
      .json()
      .catch(() => ({
        ok: false,
        error: 'Invalid server response'
      }));

    if (!response.ok || !result.ok || !result.assignment) {
      throw new Error(
        result.error ||
        `Paper assignment create failed: ${response.status}`
      );
    }

    return result.assignment;
  },

  // Upload a paper assignment file to Supabase Storage (bucket: assignments)
  // Returns the public URL on success, throws on failure
  async uploadPaperFile(file, storagePath) {
    const supabase = await getSupabase();
    if (!supabase) throw new Error('supabase-not-configured');
    const { error } = await supabase.storage
      .from('assignments')
      .upload(storagePath, file, { upsert: true, contentType: file.type || 'application/octet-stream' });
    if (error) throw error;
    const { data: urlData } = supabase.storage.from('assignments').getPublicUrl(storagePath);
    return urlData.publicUrl;
  },

  // Delete a paper file from Supabase Storage — used for cleanup on partial failure
  async deletePaperFile(storagePath) {
    const supabase = await getSupabase();
    if (!supabase) return null;
    const { error } = await supabase.storage.from('assignments').remove([storagePath]);
    if (error) console.warn('[data-adapter] deletePaperFile failed (non-critical):', error.message);
    return null;
  },

  async listAssignments() {
    const supabase = await getSupabase();
    if (!supabase) throw new Error('supabase-not-configured');
    const schoolYear = getCurrentSchoolYear();
    const { data, error } = await supabase
      .from('assignments')
      .select('id, title, type, series, active, page, hero, meta, created_at, school_year, unit_id, section_id, tags')
      .or(`school_year.eq.${schoolYear},school_year.is.null`)
      .limit(MAX_ASSIGNMENTS_QUERY_LIMIT)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  },
  
  async listAssignmentInstances() {
    const response = await fetch(
      '/.netlify/functions/teacher-assignment-instances-list',
      {
        method: 'GET',
        credentials: 'include',
        cache: 'no-store',
        headers: {
          Accept: 'application/json'
        }
      }
    );

    let result = {};

    try {
      result = await response.json();
    } catch {
      result = {};
    }

    if (!response.ok || result.ok !== true) {
      throw new Error(
        result.error ||
        `teacher-assignment-instances-list-${response.status}`
      );
    }

    const instances =
      Array.isArray(result.instances)
        ? result.instances
        : [];

    // Preserve the existing shared-reader student-code ordering contract.
    instances.sort(
      (a, b) =>
        (a.student_code || '')
          .localeCompare(
            b.student_code || ''
          )
    );

    return instances;
  },
  
  async saveGradebookScore({ assignment_id, student_code, score, score_earned }) {
    const response = await fetch('/.netlify/functions/teacher-gradebook-save-score', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        assignmentId: assignment_id,
        studentCode: student_code,
        score,
        scoreEarned: score_earned
      })
    });

    const result = await response
      .json()
      .catch(() => ({
        ok: false,
        error: 'Invalid server response'
      }));

    if (!response.ok || !result.ok) {
      throw new Error(
        result.error ||
        `Gradebook score save failed: ${response.status}`
      );
    }

    return result;
  },


  async saveManualGrade({
    title,
    class_name,
    student_codes,
    total_possible,
    score_earned,
    date,
    category,
    notes
  }) {
    const response = await fetch('/.netlify/functions/teacher-manual-grade-save', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        title,
        className: class_name,
        studentCodes: student_codes,
        totalPossible: total_possible,
        scoreEarned: score_earned,
        date,
        category,
        notes
      })
    });

    const data = await response.json().catch(() => ({
      ok: false,
      error: `Manual grade save failed: ${response.status}`
    }));

    if (!response.ok || !data.ok) {
      throw new Error(
        data.error || `Manual grade save failed: ${response.status}`
      );
    }

    return data;
  },

  async savePaperResult({ assignment_id, student_code }) {
    const response = await fetch(
      '/.netlify/functions/teacher-paper-result-save',
      {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          assignmentId: assignment_id,
          studentCode: student_code
        })
      }
    );

    const result = await response
      .json()
      .catch(() => ({
        ok: false,
        error: 'Invalid server response'
      }));

    if (!response.ok || !result.ok) {
      throw new Error(
        result.error ||
        `Paper result save failed: ${response.status}`
      );
    }

    return result;
  },

  async upsertAssignmentInstance(x) {
    const supabase = await getSupabase();
    if (!supabase) throw new Error('supabase-not-configured');
    // Lookup student by code to get student_id
    const { data: stu, error: e1 } = await supabase
      .from('students')
      .select('id')
      .eq('code', x.student_code)
      .single();
    if (e1) throw e1;
    
    const payload = {
      assignment_id: x.assignment_id,
      student_id: stu.id,
      due_at: x.due_at || null,
      status: x.status || 'Assigned',
      settings: x.settings || {},
      school_year: x.school_year ?? getCurrentSchoolYear()
    };
    
    // Upsert on unique (assignment_id, student_id) and return the row id
    const { data: instanceRow, error } = await supabase
      .from('assignment_instances')
      .upsert(payload, { onConflict: 'assignment_id,student_id' })
      .select('id')
      .single();
    if (error) throw error;
    return instanceRow;
  },
  
  async addSubmission(payload) {
    const supabase = await getSupabase();
    if (!supabase) throw new Error('supabase-not-configured');
    // Insert submission
    const { data: submission, error: e1 } = await supabase
      .from('submissions')
      .insert({
        instance_id: payload.instance_id,
        answers: payload.answers || {},
        score_auto: payload.score_auto || null,
        score_manual: payload.score_manual || null,
        score_total: payload.score_total || null,
        detail: payload.detail || {},
        notes: payload.notes || null,
        school_year: getCurrentSchoolYear()
      })
      .select('id')
      .single();
    if (e1) throw e1;
    
    // Call process_submission RPC
    const { error: e2 } = await supabase.rpc('process_submission', { 
      submission_id: submission.id 
    });
    if (e2) throw e2;
    
    // Update assignment_instances status to 'Submitted'
    const { error: e3 } = await supabase
      .from('assignment_instances')
      .update({ status: 'Submitted' })
      .eq('id', payload.instance_id);
    if (e3) throw e3;
    
    return { submission_id: submission.id };
  },

  // Teacher Center: list submissions through the signed server boundary.
  async listSubmissions(filters = {}) {
    const params = new URLSearchParams();

    if (filters.excludeFinalized) {
      params.set('exclude_finalized', 'true');
    }

    const studentCode =
      filters.student_code || filters.studentCode;

    if (studentCode) {
      params.set('student_code', studentCode);
    }

    if (filters.instance_id) {
      params.set('instance_id', filters.instance_id);
    }

    const queryString = params.toString();
    const endpoint =
      '/.netlify/functions/teacher-submissions' +
      (queryString ? `?${queryString}` : '');

    const response = await fetch(endpoint, {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
      headers: {
        Accept: 'application/json'
      }
    });

    let result = {};

    try {
      result = await response.json();
    } catch {
      result = {};
    }

    if (!response.ok || result.ok !== true) {
      throw new Error(
        result.error ||
        `teacher-submissions-${response.status}`
      );
    }

    const submissions =
      Array.isArray(result.submissions)
        ? result.submissions
        : [];

    return deduplicateSubmissions(submissions);
  },
  
  // Portal B: Get latest submission for an instance
  async getLatestSubmission(instance_id) {
    const supabase = await getSupabase();
    if (!supabase) throw new Error('supabase-not-configured');
    
    const { data, error } = await supabase
      .rpc('get_latest_submission', { p_instance_id: instance_id });
    
    if (error) throw error;
    
    return data && data.length > 0 ? data[0] : null;
  },
  
  // Portal B: Create resubmission
  async createResubmission({ instance_id, original_submission_id, answers = {} }) {
    const response = await fetch(
      '/.netlify/functions/student-create-resubmission',
      {
        method: 'POST',
        credentials: 'include',
        cache: 'no-store',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          instance_id,
          original_submission_id,
          answers
        })
      }
    );

    let result = {};
    try {
      result = await response.json();
    } catch {
      result = {};
    }

    if (!response.ok) {
      throw new Error(
        result.error ||
        'Failed to create resubmission'
      );
    }

    return {
      submission_id: result.submission_id
    };
  },
  
  // Phase B: Classes and Enrollments
  async listClasses() {
    const supabase = await getSupabase();
    if (!supabase) throw new Error('supabase-not-configured');
    const { data, error } = await supabase
      .from('classes')
      .select('id, code, name')
      .order('code');
    if (error) throw error;
    return data || [];
  },
  
  async listClassEnrollments() {
    const context =
      await fetchTeacherRosterContext();

    const enrollments =
      Array.isArray(context.class_enrollments)
        ? context.class_enrollments
        : [];

    const results = [];

    for (const enrollment of enrollments) {
      if (
        enrollment == null ||
        enrollment.students == null ||
        enrollment.classes == null
      ) {
        continue;
      }

      const student =
        Array.isArray(enrollment.students)
          ? enrollment.students[0]
          : enrollment.students;

      const classRow =
        Array.isArray(enrollment.classes)
          ? enrollment.classes[0]
          : enrollment.classes;

      if (
        student == null ||
        classRow == null
      ) {
        continue;
      }

      const classCode =
        classRow.code || '';

      const className =
        classRow.name || '';

      const canonicalNames =
        mapToCanonicalNames(
          classCode,
          className
        );

      for (
        const canonicalName
        of canonicalNames
      ) {
        results.push({
          class_id:
            enrollment.class_id,
          class_code:
            classCode,
          class_name:
            canonicalName,
          student_code:
            student.code || '',
          student_name:
            student.name ||
            student.code ||
            ''
        });
      }
    }

    return results;
  },

  async upsertClass(classData) {
    const supabase = await getSupabase();
    if (!supabase) throw new Error('supabase-not-configured');
    const { data, error } = await supabase
      .from('classes')
      .upsert({ name: classData.name, code: classData.code }, { onConflict: 'name' })
      .select()
      .single();
    if (error) throw error;
    return data;
  },
  
  async upsertClassEnrollment(enrollment) {
    const supabase = await getSupabase();
    if (!supabase) throw new Error('supabase-not-configured');
    // Resolve student_id from student_code if needed
    let studentId = enrollment.student_id;
    if (!studentId && enrollment.student_code) {
      const { data: student, error: studentError } = await supabase
        .from('students')
        .select('id')
        .eq('code', enrollment.student_code)
        .single();
      if (studentError) throw studentError;
      studentId = student.id;
    }
    
    const { error } = await supabase
      .from('class_enrollments')
      .upsert(
        { class_id: enrollment.class_id, student_id: studentId, active: true },
        { onConflict: 'class_id,student_id' }
      );
    if (error) throw error;
    return enrollment;
  },
  
  // Phase B: HTML Package Upload with Supabase Storage
  async uploadAssignmentZip(file, manifest, createdBy = null) {
    const supabase = await getSupabase();
    if (!supabase) throw new Error('supabase-not-configured');
    // 1. Create assignment row first
    const payload = {
      title: manifest.title,
      type: 'html',
      series: manifest.series || null,
      page: null, // Will be set after upload
      hero: null,
      meta: {
        version: manifest.version,
        questions: manifest.questions || []
      },
      created_by: createdBy
    };
    
    const { data: assignment, error: createErr } = await supabase
      .from('assignments')
      .insert(payload)
      .select()
      .single();
    
    if (createErr) throw createErr;
    
    // 2. Upload all files from the zip to storage
    // Files should be uploaded to: assignments/{assignmentId}/{filename}
    const basePath = `assignments/${assignment.id}`;
    
    try {
      // NOTE: In a full implementation, this function should:
      // 1. Extract all files from the ZIP (already done by caller with JSZip)
      // 2. Iterate through each file and upload to Supabase Storage
      // 3. For example:
      //    for (const [path, file] of Object.entries(zipFiles)) {
      //      const content = await file.async('blob');
      //      await supabase.storage.from('assignments').upload(`${basePath}/${path}`, content);
      //    }
      // 
      // For now, we construct the expected public URL without actual upload.
      // The caller must handle file uploads separately if using Supabase Storage.
      
      const indexUrl = `${supabase.storage.from('assignments').getPublicUrl(`${basePath}/index.html`).data.publicUrl}`;
      
      // 3. Update assignment.page with the public URL
      const { error: updateErr } = await supabase
        .from('assignments')
        .update({ page: indexUrl })
        .eq('id', assignment.id);
      
      if (updateErr) throw updateErr;
      
      // Return the updated assignment
      return { ...assignment, page: indexUrl };
    } catch (uploadErr) {
      // If upload fails, delete the assignment to maintain consistency
      await supabase.from('assignments').delete().eq('id', assignment.id);
      throw uploadErr;
    }
  },
  
  // Phase B: Google Forms metadata
  async saveFormMeta(assignmentId, meta) {
    const supabase = await getSupabase();
    if (!supabase) throw new Error('supabase-not-configured');
    // Fetch current meta and merge with new meta
    const { data: current, error: fetchErr } = await supabase
      .from('assignments')
      .select('meta')
      .eq('id', assignmentId)
      .single();
    
    if (fetchErr) throw fetchErr;
    
    // Merge metadata
    const merged = { ...(current?.meta || {}), ...meta };
    
    // Prepare update object
    const updateData = { meta: merged };
    
    // If page is provided, update it at top level
    if (meta.page) {
      updateData.page = meta.page;
    }
    
    // Update with properly parameterized query
    const { error } = await supabase
      .from('assignments')
      .update(updateData)
      .eq('id', assignmentId);
    
    if (error) throw error;
    return true;
  },
  
  // Phase B: Import Google Form responses from CSV

  // ============================================================================
  // Phase 1: Goal Progress (Remote via Supabase)
  // ============================================================================
  async listGoalProgress({
    studentCodes,
    goalCodes,
    classCodes,
    startDate,
    endDate,
    goalAreas,
    limit,
    includeAllYears = false,
    sortDesc = false
  } = {}) {
    console.log(
      '[goal-progress] listGoalProgress (signed server boundary)',
      {
        studentCodes,
        goalCodes,
        classCodes,
        startDate,
        endDate,
        goalAreas,
        limit,
        includeAllYears,
        sortDesc
      }
    );

    const result = await callTeacherGoalProgress(
      'list',
      {
        student_codes: studentCodes,
        goal_codes: goalCodes,
        class_codes: classCodes,
        start_date: startDate,
        end_date: endDate,
        goal_areas: goalAreas,
        limit,
        include_all_years: includeAllYears,
        sort_desc: sortDesc,
        school_year: getCurrentSchoolYear()
      }
    );

    return await filterInstructionalEvidenceRows(
      Array.isArray(result.progress)
        ? result.progress
        : []
    );
  },

  async listGoalQuarterAverages({
    goalIds,
    studentIds,
    year
  } = {}) {
    console.log(
      '[goal-progress] listGoalQuarterAverages (signed server boundary)',
      {
        goalIds,
        studentIds,
        year
      }
    );

    const result = await callTeacherGoalProgress(
      'quarter_averages',
      {
        goal_ids: goalIds,
        student_ids: studentIds,
        year
      }
    );

    return Array.isArray(result.averages)
      ? result.averages
      : [];
  },

  async upsertGoalProgress({
    goal_code,
    student_code,
    date,
    value,
    source = 'manual',
    class_code = null,
    collected_by = null,
    assignment_instance_id = null,
    notes = null
  }) {
    console.log(
      '[goal-progress] upsertGoalProgress (signed server boundary)',
      {
        goal_code,
        student_code,
        date,
        value,
        source
      }
    );

    const result = await callTeacherGoalProgress(
      'insert',
      {
        goal_code,
        student_code,
        date,
        value,
        source,
        class_code,
        collected_by,
        assignment_instance_id,
        notes
      }
    );

    return result.progress || null;
  },

  // ============================================================================
  // Goal Data Points (Remote)
  // ============================================================================

  /**
   * List per-question goal data points for a student (and optionally a specific goal).
   * @param {Object} opts
   * @param {string} opts.studentId - UUID of the student
   * @param {string} [opts.goalId]  - UUID of the goal (optional filter)
   * @returns {Array} data point rows
   */
  async listGoalDataPoints({ studentId, goalId } = {}) {
    const supabase = await getSupabase();
    if (!supabase) throw new Error('supabase-not-configured');

    console.log('[goal-data-points] listGoalDataPoints (remote)', { studentId, goalId });


    let query = supabase
      .from('goal_data_points')
      .select('*')
      .eq('student_id', studentId)
      .order('date', { ascending: true })
      .order('created_at', { ascending: true });

    if (goalId) {
      query = query.eq('goal_id', goalId);
    }

    const { data, error } = await query;
    if (error) {
      // Gracefully handle the case where the goal_data_points table doesn't
      // exist yet (PostgREST returns PGRST204 or a "Could not find the table"
      // message). Return an empty array so callers don't crash.
      if (
        error.code === 'PGRST204' ||
        (error.message && error.message.includes('Could not find the table'))
      ) {
        console.warn('[goal-data-points] goal_data_points table not found — returning empty array. Run the migration to create it.');
        return [];
      }
      throw error;
    }

    const instructionalRows =
      await filterInstructionalEvidenceRows(
        data || []
      );

    return dedupeAssignmentGoalDataPoints(
      instructionalRows
    );
  },

  // ============================================================================
  // Review Tab: Submission Answers
  // ============================================================================
  
  /**
   * List all submission answers for a given submission with enriched data
   * @param {string} submissionId - Submission ID
   * @returns {Array} Submission answers with item details and mappings
   */
  async listSubmissionAnswers(submissionId) {
    const response = await fetch(
      '/.netlify/functions/teacher-review-submission-answers' +
      `?submission_id=${encodeURIComponent(submissionId)}`,
      {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Accept': 'application/json'
        }
      }
    );

    if (!response.ok) {
      const err = await response
        .json()
        .catch(() => ({
          error: 'Unknown error'
        }));

      throw new Error(
        err.error ||
        `Load submission answers failed: ${response.status}`
      );
    }

    const result = await response.json();

    return Array.isArray(result.answers)
      ? result.answers
      : [];
  },


  /**
   * Update or create a submission answer with teacher scoring
   * @param {Object} params - { submissionId, itemId, earnedPoints, teacherNote, rationale?, aiSuggestedScore? }
   * @returns {Object} Updated submission answer
   */
  async updateSubmissionAnswer({ submissionId, itemId, earnedPoints, teacherNote, rationale, aiSuggestedScore }) {
    const response = await fetch('/.netlify/functions/teacher-review-save', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'save_score',
        submissionId, itemId, earnedPoints, teacherNote, rationale,
        aiSuggestedScore: aiSuggestedScore != null ? aiSuggestedScore : null,
      })
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(err.error || `Save score failed: ${response.status}`);
    }
    const result = await response.json();
    return result.data;
  },

  /**
   * Finalize a submission with scores and set review status to 'reviewed'
   * @param {string} submissionId - Submission ID
   * @param {Object} params - { scoreAuto, scoreManual, scoreTotal, instanceId? }
   * @returns {boolean} Success
   */
  async finalizeSubmission(submissionId, { scoreAuto, scoreManual, scoreTotal, instanceId: callerInstanceId }) {
    // All live Teacher Review callers provide instanceId.
    // The signed teacher-review-save boundary independently authorizes
    // submission -> assignment instance -> assignment -> owned class.
    const instanceId = callerInstanceId || null;

    const response = await fetch('/.netlify/functions/teacher-review-save', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'finalize',
        submissionId,
        scoreAuto, scoreManual, scoreTotal,
        instanceId
      })
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(err.error || `Finalize failed: ${response.status}`);
    }
    return true;
  },

  /**
   * Update a submission with grading fields (score_auto, score_manual, score_total, status, graded_at, graded_by, feedback)
   * @param {Object} params - { id, score_auto, score_manual, score_total, status, graded_at, graded_by, feedback, instance_id }
   * @returns {boolean} Success
   */
  async upsertSubmission({ id, score_auto, score_manual, score_total, status, graded_at, graded_by, feedback, instance_id }) {
    const response = await fetch('/.netlify/functions/teacher-review-save', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'save_grade',
        submissionId: id,
        scoreAuto: score_auto,
        scoreManual: score_manual,
        scoreTotal: score_total,
        status,
        gradedAt: graded_at,
        gradedBy: graded_by,
        feedback,
        instanceId: instance_id
      })
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(err.error || `Grade save failed: ${response.status}`);
    }
    return true;
  },

  /**
   * Set submission review_status to 'in_progress' using service role key
   * @param {string} submissionId - Submission ID
   * @returns {boolean} Success
   */
  async setSubmissionInProgress(submissionId) {
    const response = await fetch('/.netlify/functions/teacher-review-save', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'set_in_progress',
        submissionId
      })
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(err.error || `Set in_progress failed: ${response.status}`);
    }
    return true;
  },

  /**
   * Reopen a finalized submission — sets review_status back to 'pending' and instance to 'In Progress'
   * @param {string} submissionId - Submission ID
   * @returns {boolean} Success
   */
  async reopenSubmission(submissionId) {
    const response = await fetch('/.netlify/functions/teacher-review-save', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'reopen',
        submissionId
      })
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(err.error || `Reopen failed: ${response.status}`);
    }
    const data = await response.json().catch(() => ({}));
    if (!data.ok) throw new Error(data.error || 'Failed to reopen submission');
    return true;
  },

  // ============================================================================
  // Archive Tab: Student Archive Management (Remote)
  // ============================================================================

  /**
   * Get all archived students
   * @returns {Array} Students where active = false
   */
  async getArchivedStudents() {
    const supabase = await getSupabase();
    if (!supabase) throw new Error('supabase-not-configured');

    // Try with new columns first
    let { data, error } = await supabase
      .from('students')
      .select('id, code, name, class_id, iep_due, eval_due, primary_case_manager, archived_at, active')
      .eq('active', false)
      .order('archived_at', { ascending: false });

    // Graceful fallback: if schema error, retry with basic columns only
    // When columns don't exist, return empty array since we can't filter by active
    if (isSchemaError(error)) {
      console.warn('[data-adapter] Supabase schema outdated — archived students feature requires "active" column. Apply migration 20260210_students_tab_schema.sql. Returning empty array.');
      return [];
    }

    if (error) throw error;
    return data || [];
  },

  /**
   * Get comprehensive archive data for a student
   * @param {string} studentCode - Student code
   * @returns {Object} {student, goals, submissions, progress, gradebookScores}
   */
  async getStudentArchiveData(studentCode) {
    const supabase = await getSupabase();
    if (!supabase) throw new Error('supabase-not-configured');

    // Get student
    const { data: student, error: studentError } = await supabase
      .from('students')
      .select('*')
      .eq('code', studentCode)
      .single();

    if (studentError) throw studentError;

    // Get all goals (including all versions)
    const { data: goals, error: goalsError } = await supabase
      .from('goals')
      .select('*')
      .eq('student_id', student.id)
      .order('version', { ascending: false });

    if (goalsError) throw goalsError;

    // Get all submissions with assignment details
    const { data: submissions, error: submissionsError } = await supabase
      .from('submissions')
      .select(`
        *,
        assignment_instances!inner(
          assignment_id,
          assignments(id, title)
        )
      `)
      .eq('student_id', student.id)
      .order('submitted_at', { ascending: false });

    if (submissionsError) throw submissionsError;

    // Get all progress entries through the signed Teacher Center boundary.
    const progressResult = await callTeacherGoalProgress(
      'list',
      {
        student_codes: [studentCode],
        include_all_years: true,
        sort_desc: true,
        limit: 10000
      }
    );

    const progress = Array.isArray(progressResult.progress)
      ? progressResult.progress
      : [];

    // Note: Gradebook scores would need a separate query if stored in a scores table
    // For now, we'll return empty array
    const gradebookScores = [];

    return {
      student,
      goals: goals || [],
      submissions: submissions || [],
      progress: progress || [],
      gradebookScores
    };
  },

  /**
   * Reactivate an archived student
   * @param {string} studentCode - Student code
   * @returns {Object} Updated student
   */
  async reactivateStudent(studentCode) {
    const supabase = await getSupabase();
    if (!supabase) throw new Error('supabase-not-configured');

    const { data, error } = await supabase
      .from('students')
      .update({ active: true, archived_at: null })
      .eq('code', studentCode)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  // ============================================================================
  // Data Entry Tokens: Server-backed token management
  // ============================================================================

  async createDataEntryToken({
    studentCode,
    goalCode,
    dataCollector,
    dataCollectorEmail
  }) {
    const result = await callTeacherDataEntryTokens(
      'create',
      {
        student_code: studentCode,
        goal_code: goalCode,
        data_collector: dataCollector,
        data_collector_email: dataCollectorEmail,
      }
    );

    return result.token;
  },

  async getDataEntryToken(token) {
    try {
      const result =
        await callPublicDataEntryAccess(token);

      return result.token || null;
    } catch (error) {
      if (error.status === 404) {
        return null;
      }

      throw error;
    }
  },

  async listDataEntryTokens(studentCode) {
    const result = await callTeacherDataEntryTokens(
      'list',
      {
        student_code: studentCode,
      }
    );

    return result.tokens || [];
  },

  async revokeDataEntryToken(tokenId) {
    const result = await callTeacherDataEntryTokens(
      'revoke',
      {
        token_id: tokenId,
      }
    );

    return result.revoked === true;
  },

  // App config (key-value store for cross-device settings like home config)
  async getAppConfig(key) {
    const supabase = await getSupabase();
    if (!supabase) throw new Error('supabase-not-configured');

    const { data, error } = await supabase
      .from('app_config')
      .select('value')
      .eq('key', key)
      .maybeSingle();

    if (error) throw error;
    return data ? data.value : null;
  },
  async setAppConfig(key, value) {
    const supabase = await getSupabase();
    if (!supabase) throw new Error('supabase-not-configured');

    const { error } = await supabase
      .from('app_config')
      .upsert({ key, value }, { onConflict: 'key' });

    if (error) throw error;
    return value;
  },

  // ============================================================================
  // Attendance Log
  // ============================================================================

  async upsertAttendance({ student_code, date, status = 'present', source = 'manual', notes = null }) {
    const supabase = await getSupabase();
    if (!supabase) throw new Error('supabase-not-configured');

    const { data, error } = await supabase
      .from('attendance_log')
      .upsert({ student_code, date, status, source, notes }, { onConflict: 'student_code,date' })
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async listAttendance(student_code, startDate, endDate) {
    const supabase = await getSupabase();
    if (!supabase) throw new Error('supabase-not-configured');

    let query = supabase
      .from('attendance_log')
      .select('*')
      .eq('student_code', student_code)
      .order('date', { ascending: false });

    if (startDate) query = query.gte('date', startDate);
    if (endDate) query = query.lte('date', endDate);

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  },

  async listAttendanceAll(startDate, endDate) {
    const supabase = await getSupabase();
    if (!supabase) throw new Error('supabase-not-configured');

    let query = supabase
      .from('attendance_log')
      .select('*')
      .order('date', { ascending: false });

    if (startDate) query = query.gte('date', startDate);
    if (endDate) query = query.lte('date', endDate);

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  },
};

// Dynamic adapter: tries remote first, falls back to local if not configured
const db = {};

// Wrap each method to try remote first, fall back to local
// Note: We wrap all local methods for consistency, even if remote doesn't implement them.
// The check `if (supabase && remote[method])` handles methods that only exist in local.
for (const method of Object.keys(local)) {
  db[method] = async function(...args) {
    const supabase = await getSupabase();
    if (supabase && remote[method]) {
      try {
        return await remote[method](...args);
      } catch (err) {
        // If error is supabase-not-configured, fall back to local
        if (err.message === 'supabase-not-configured') {
          return await local[method](...args);
        }
        throw err;
      }
    }
    // No supabase, use local
    return await local[method](...args);
  };
}

export { db };

// For backward compatibility, provide async function to check remote status
// Note: Consumers should await this function
export async function isRemote() {
  return !!(await getSupabase());
}

export const localStore = store; // exposed for CSV import/export bootstrap
