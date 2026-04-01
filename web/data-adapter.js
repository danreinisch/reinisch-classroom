// Adapter selection: use Supabase if available, else localStorage.
console.log('[data-adapter] Module loading started');
import { getSupabase } from './supabase-client.js';
console.log('[data-adapter] supabase-client.js imported');
import { withRetry } from '/site/web/supabase-util.js';
console.log('[data-adapter] supabase-util.js imported');

const NS = 'rc_unified_';
const store = {
  get: (k, def) => { try { return JSON.parse(localStorage.getItem(NS + k)) ?? def; } catch { return def; } },
  set: (k, v) => localStorage.setItem(NS + k, JSON.stringify(v)),
};

// Debug flag for data adapter logging
const DATA_ADAPTER_DEBUG = localStorage.getItem('rc_debug_data_adapter') === 'true';

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

  // Goals
  async listGoalsByStudentCode(code) {
    const map = store.get('iepGoals', {});
    return map[code] || [];
  },
  async upsertGoal({ student_code, code, desc, target = null, status = 'Open', baseline = null, mastery = null }) {
    const map = store.get('iepGoals', {});
    const goals = map[student_code] || [];
    const idx = goals.findIndex(g => g.code === code);
    const goal = { code, desc, target, status, baseline, mastery };
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

  // Student Manager methods
  async createStudentWithEnrollmentsAndGoals(payload) {
    console.log('[student-manager] createStudentWithEnrollmentsAndGoals (local)', payload);
    const { student, enrollments = [], goals = [] } = payload;
    
    // Validate student code uniqueness
    const students = store.get('students', []);
    if (students.find(s => s.code === student.code)) {
      throw new Error(`Student code ${student.code} already exists`);
    }
    
    // Enforce code-only identity: only accept code and password_hash
    // Ignore any PII fields even if present in payload
    const newStudent = {
      code: student.code,
      name: student.code, // Use code as name for backward compatibility
      password: student.password_hash, // In local mode, store plaintext (hashed in remote)
      created_at: new Date().toISOString()
    };
    students.push(newStudent);
    store.set('students', students);
    
    // Create enrollments
    if (enrollments.length > 0) {
      const storedEnrollments = store.get('classEnrollments', []);
      for (const enrollment of enrollments) {
        storedEnrollments.push({
          class_id: enrollment.class_id,
          student_code: student.code,
          student_name: newStudent.name,
          start_date: enrollment.start_date || new Date().toISOString().split('T')[0],
          active: true
        });
      }
      store.set('classEnrollments', storedEnrollments);
    }
    
    // Create goals
    if (goals.length > 0) {
      const goalsMap = store.get('iepGoals', {});
      const studentGoals = goalsMap[student.code] || [];
      for (const goal of goals) {
        studentGoals.push({
          code: goal.goal_code,
          desc: goal.goal_text,
          goal_area: goal.goal_area,
          baseline: goal.baseline,
          target: goal.target,
          case_manager: goal.case_manager,
          active: goal.active !== false,
          status: 'Open'
        });
      }
      goalsMap[student.code] = studentGoals;
      store.set('iepGoals', goalsMap);
    }
    
    return {
      student: newStudent,
      enrollments_count: enrollments.length,
      goals_count: goals.length
    };
  },

  async listStudentsWithCounts(filter = {}) {
    console.log('[student-manager] listStudentsWithCounts (local)', filter);
    const students = store.get('students', []);
    const goalsMap = store.get('iepGoals', {});
    const enrollments = store.get('classEnrollments', []);
    
    let filtered = students;
    
    // Apply filters
    if (filter.student_code) {
      filtered = filtered.filter(s => 
        s.code.toLowerCase().includes(filter.student_code.toLowerCase())
      );
    }
    if (filter.last_name) {
      filtered = filtered.filter(s => 
        (s.last_name || '').toLowerCase().includes(filter.last_name.toLowerCase())
      );
    }
    if (filter.class_code) {
      const classEnrolledStudents = enrollments
        .filter(e => e.class_id === filter.class_code && e.active)
        .map(e => e.student_code);
      filtered = filtered.filter(s => classEnrolledStudents.includes(s.code));
    }
    
    // Add counts
    return filtered.map(s => {
      const goals = goalsMap[s.code] || [];
      const studentEnrollments = enrollments.filter(e => 
        e.student_code === s.code && e.active
      );
      return {
        ...s,
        goals_count: goals.length,
        classes_count: studentEnrollments.length,
        enrollments: studentEnrollments
      };
    });
  },

  async addStudentGoals(student_code, goals) {
    console.log('[student-manager] addStudentGoals (local)', { student_code, goals });
    const goalsMap = store.get('iepGoals', {});
    const studentGoals = goalsMap[student_code] || [];
    
    for (const goal of goals) {
      // Check if goal code already exists
      if (studentGoals.find(g => g.code === goal.goal_code)) {
        throw new Error(`Goal code ${goal.goal_code} already exists for student ${student_code}`);
      }
      studentGoals.push({
        code: goal.goal_code,
        desc: goal.goal_text,
        goal_area: goal.goal_area,
        baseline: goal.baseline,
        target: goal.target,
        case_manager: goal.case_manager,
        active: goal.active !== false,
        status: 'Open'
      });
    }
    
    goalsMap[student_code] = studentGoals;
    store.set('iepGoals', goalsMap);
    return true;
  },

  async listStudentGoals(student_code) {
    const goalsMap = store.get('iepGoals', {});
    return goalsMap[student_code] || [];
  },
  
  async getDistinctGoalAreas(student_code = null) {
    const goalsMap = store.get('iepGoals', {});
    const areas = new Set();
    
    if (student_code) {
      // Get areas for specific student
      const studentGoals = goalsMap[student_code] || [];
      studentGoals.forEach(g => {
        if (g.goal_area) areas.add(g.goal_area);
      });
    } else {
      // Get all distinct areas across all students
      Object.values(goalsMap).forEach(goals => {
        goals.forEach(g => {
          if (g.goal_area) areas.add(g.goal_area);
        });
      });
    }
    
    return Array.from(areas).sort();
  },

  // Student Manager: Operation Chooser & Versioning (local placeholders)
  async updateStudentEnrollments({ code, add = [], remove = [] }) {
    console.log('[student-manager] updateStudentEnrollments (local) - not fully implemented', { code, add, remove });
    // Local implementation would update enrollments in localStorage
    return { student_code: code, added: add.length, removed: remove.length };
  },

  async replaceGoalVersion({ old_goal_id, new_goal }) {
    console.log('[student-manager] replaceGoalVersion (local) - not fully implemented', { old_goal_id, new_goal });
    // Local implementation would update goals in localStorage with versioning
    return { old_goal_id, new_goal_id: 'local-' + Date.now(), version: 2 };
  },

  async archiveGoal({ goal_id }) {
    console.log('[student-manager] archiveGoal (local) - not fully implemented', { goal_id });
    // Local implementation would mark goal as archived
    return { goal_id, archived: true };
  },

  async setStudentActive({ code, active }) {
    console.log('[student-manager] setStudentActive (local) - not fully implemented', { code, active });
    const students = store.get('students', []);
    const student = students.find(s => s.code === code);
    if (student) {
      student.active = active;
      store.set('students', students);
    }
    return { student_code: code, active };
  },

  async getStudentEnrollments(student_code) {
    console.log('[student-manager] getStudentEnrollments (local) - not fully implemented', student_code);
    // Local implementation would return enrollments from localStorage
    return [];
  },

  // Assignments / Instances (local placeholders)
  async createAssignment(a) {
    const id = 'A' + Math.random().toString(36).slice(2, 9).toUpperCase();
    const created_at = new Date().toISOString();
    const arr = store.get('assignments', []);
    arr.push({ id, ...a, created_at });
    store.set('assignments', arr);
    return { id, ...a, created_at };
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
      settings: inst.settings
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
      settings: x.settings || {}
    };
    if (i >= 0) arr[i] = instance;
    else arr.push(instance);
    store.set('assignmentInstances', arr);
    return instance;
  },
  async addSubmission(payload) {
    const submissions = store.get('submissions', []);
    const id = 'SUB' + Math.random().toString(36).slice(2, 9).toUpperCase();
    submissions.push({ id, ...payload, submitted_at: new Date().toISOString() });
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

  // Teacher Review: List submission answers with item details
  async listSubmissionAnswers(submissionId) {
    const answers = store.get('submissionAnswers', []);
    const items = store.get('assignmentItems', []);
    const mappings = store.get('assignmentItemMappings', []);
    const submissionAnswers = answers.filter(a => a.submission_id === submissionId);
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

  // Teacher Review: Update or create a submission answer with teacher scoring
  async updateSubmissionAnswer({ submissionId, itemId, earnedPoints, teacherNote }) {
    const answers = store.get('submissionAnswers', []);
    const existingIndex = answers.findIndex(
      a => a.submission_id === submissionId && (a.assignment_item_id === itemId || a.item_id === itemId)
    );
    const updatedAnswer = {
      submission_id: submissionId,
      assignment_item_id: itemId,
      earned_points: earnedPoints,
      teacher_note: teacherNote || '',
      scored_at: new Date().toISOString(),
      created_at: new Date().toISOString()
    };
    if (existingIndex >= 0) {
      answers[existingIndex] = { ...answers[existingIndex], ...updatedAnswer };
    } else {
      updatedAnswer.id = 'SA' + Date.now() + '_' + Math.random().toString(36).slice(2, 9);
      answers.push(updatedAnswer);
    }
    store.set('submissionAnswers', answers);
    return updatedAnswer;
  },

  // Teacher Review: Update submission with grading fields
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

  // Teacher Review: Set submission review_status to 'in_progress'
  async setSubmissionInProgress(submissionId) {
    const submissions = store.get('submissions', []);
    const submission = submissions.find(s => s.id === submissionId);
    if (submission) {
      submission.review_status = 'in_progress';
      store.set('submissions', submissions);
    }
    return true;
  },

  // Teacher Review: Finalize submission with scores
  async finalizeSubmission(submissionId, { scoreAuto, scoreManual, scoreTotal }) {
    const submissions = store.get('submissions', []);
    const submission = submissions.find(s => s.id === submissionId);
    if (!submission) throw new Error('Submission not found');
    if (scoreAuto !== undefined) submission.score_auto = scoreAuto;
    submission.score_manual = scoreManual;
    submission.score_total = scoreTotal;
    submission.review_status = 'finalized';
    store.set('submissions', submissions);
    const instances = store.get('assignmentInstances', []);
    const instance = instances.find(i => i.id === submission.instance_id);
    if (instance) {
      instance.status = 'Reviewed';
      store.set('assignmentInstances', instances);
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
      // Return all enrollments (including inactive for history)
      return storedEnrollments.map(e => ({
        ...e,
        active: e.active !== false // Default to true if not set
      }));
    }
    
    // Derive from students with class_id
    const students = store.get('students', []);
    return students
      .filter(s => s.class_id)
      .map(s => ({
        class_id: s.class_id,
        student_code: s.code,
        student_name: s.name || s.code,
        active: true
      }));
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
    const existing = enrollments.find(e => 
      e.class_id === enrollment.class_id && e.student_code === enrollment.student_code
    );
    if (!existing) {
      enrollments.push({ ...enrollment, active: enrollment.active !== false });
      store.set('classEnrollments', enrollments);
    } else {
      // Update active status if provided
      if (enrollment.active !== undefined) {
        existing.active = enrollment.active;
        store.set('classEnrollments', enrollments);
      }
    }
    return enrollment;
  },
  
  async removeClassEnrollment({ class_id, student_id, student_code }) {
    const enrollments = store.get('classEnrollments', []);
    const idx = enrollments.findIndex(e => 
      e.class_id === class_id && 
      (student_id ? e.student_id === student_id : e.student_code === student_code)
    );
    if (idx >= 0) {
      // Mark as inactive instead of deleting (preserve history)
      enrollments[idx].active = false;
      store.set('classEnrollments', enrollments);
    }
    return true;
  },
  
  async bulkUpdateClassEnrollments(class_id, { addCodes = [], removeCodes = [] }, opts = {}) {
    const students = store.get('students', []);
    const enrollments = store.get('classEnrollments', []);
    
    // Add new enrollments
    for (const code of addCodes) {
      const student = students.find(s => s.code === code);
      if (student) {
        const existing = enrollments.find(e => 
          e.class_id === class_id && e.student_code === code
        );
        if (existing) {
          // Reactivate if previously inactive
          existing.active = true;
        } else {
          enrollments.push({
            class_id,
            student_code: code,
            student_name: student.name || code,
            active: true
          });
        }
        
        // Set as primary class if requested
        if (opts.setPrimary) {
          student.class_id = class_id;
        }
      }
    }
    
    // Mark removed enrollments as inactive
    for (const code of removeCodes) {
      const idx = enrollments.findIndex(e => 
        e.class_id === class_id && e.student_code === code
      );
      if (idx >= 0) {
        enrollments[idx].active = false;
      }
      
      // Clear primary class if requested and currently this class
      if (opts.setPrimary) {
        const student = students.find(s => s.code === code);
        if (student && student.class_id === class_id) {
          student.class_id = null;
        }
      }
    }
    
    store.set('classEnrollments', enrollments);
    store.set('students', students);
    return true;
  },
  
  async ensureAssignmentInstancesForClass(class_id, studentCodes = []) {
    const assignments = store.get('assignments', []);
    const instances = store.get('assignmentInstances', []);
    const students = store.get('students', []);
    
    // Find assignments linked to this class (stored in meta.class_id)
    const classAssignments = assignments.filter(a => 
      a.meta?.class_id === class_id || a.class_id === class_id
    );
    
    // For each student, ensure they have instances for all class assignments
    for (const code of studentCodes) {
      const student = students.find(s => s.code === code);
      if (!student) continue;
      
      for (const assignment of classAssignments) {
        const existing = instances.find(i => 
          i.assignment_id === assignment.id && i.student_code === code
        );
        if (!existing) {
          instances.push({
            id: assignment.id + '-' + code,
            assignment_id: assignment.id,
            student_code: code,
            student_name: student.name || code,
            assigned_at: new Date().toISOString().split('T')[0],
            status: 'Assigned',
            settings: {}
          });
        }
      }
    }
    
    store.set('assignmentInstances', instances);
    return true;
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
  async importResponsesFromCSV(assignmentId, file, mapping) {
    // Local mode doesn't support full CSV import, return stub
    throw new Error('CSV import not supported in local mode. Please enable Supabase.');
  },

  // ============================================================================
  // Phase 1: Goal Progress (Local fallback)
  // ============================================================================
  async listGoalProgress({ studentCodes, goalCodes, classCodes, startDate, endDate, goalAreas, limit } = {}) {
    console.log('[goal-progress] listGoalProgress (local mode)', { studentCodes, goalCodes, classCodes, startDate, endDate, goalAreas, limit });
    const currentYear = getCurrentSchoolYear();
    const progressArr = store.get('goalProgress', []).filter(p => !p.school_year || p.school_year === currentYear);
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

  async upsertGoalProgress({ goal_code, student_code, date, value, source = 'manual', class_code = null, collected_by = null }) {
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
      school_year: getCurrentSchoolYear(),
      created_at: new Date().toISOString()
    };
    
    arr.push(entry);
    store.set('goalProgress', arr);
    
    return entry;
  },

  // Phases 4-5: Bulk insert goal progress
  async bulkInsertGoalProgress(rows = []) {
    console.log('[progress-bulk] bulkInsertGoalProgress (local mode)', rows.length, 'rows');
    const arr = store.get('goalProgress', []);
    const inserted = [];
    
    for (const row of rows) {
      const entry = {
        id: 'gp_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9),
        goal_code: row.goal_code,
        student_code: row.student_code,
        class_code: row.class_code || null,
        date: row.date,
        value: parseFloat(row.value),
        source: row.source || 'manual',
        collected_by: row.collected_by || null,
        created_at: new Date().toISOString()
      };
      arr.push(entry);
      inserted.push(entry);
    }
    
    store.set('goalProgress', arr);
    return { inserted: inserted.length, data: inserted };
  },

  // Phases 4-5: List assignment-goal mappings
  async listAssignmentGoalMappings(assignment_id = null) {
    console.log('[progress-mapping] listAssignmentGoalMappings (local mode)', { assignment_id });
    const arr = store.get('assignmentGoalMappings', []);
    if (assignment_id) {
      return arr.filter(m => m.assignment_id === assignment_id);
    }
    return arr;
  },

  // Phases 4-5: Upsert assignment-goal mapping
  async upsertAssignmentGoalMapping({ assignment_id, goal_code, student_code, primary_goal = false }) {
    console.log('[progress-mapping] upsertAssignmentGoalMapping (local mode)', { assignment_id, goal_code, student_code, primary_goal });
    const arr = store.get('assignmentGoalMappings', []);
    
    // Find existing mapping
    const existing = arr.find(m => 
      m.assignment_id === assignment_id && 
      m.goal_code === goal_code &&
      m.student_code === student_code
    );
    
    if (existing) {
      existing.primary_goal = primary_goal;
    } else {
      arr.push({
        id: 'agm_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9),
        assignment_id,
        goal_code,
        student_code,
        primary_goal,
        created_at: new Date().toISOString()
      });
    }
    
    store.set('assignmentGoalMappings', arr);
    return true;
  },

  // Phases 4-5: Delete assignment-goal mapping
  async deleteAssignmentGoalMapping({ assignment_id, goal_code, student_code }) {
    console.log('[progress-mapping] deleteAssignmentGoalMapping (local mode)', { assignment_id, goal_code, student_code });
    const arr = store.get('assignmentGoalMappings', []);
    const filtered = arr.filter(m => 
      !(m.assignment_id === assignment_id && m.goal_code === goal_code && m.student_code === student_code)
    );
    store.set('assignmentGoalMappings', filtered);
    return true;
  },

  // Phases 4-5: Record progress from submission (local stub)
  async recordProgressForSubmission(instance_id) {
    console.log('[progress-assignment] recordProgressForSubmission (local mode)', { instance_id });
    // In local mode, this is a stub since we don't have RPC
    // Real implementation happens in remote adapter
    return { success: true, inserted_count: 0, note: 'Local mode stub - use remote for automation' };
  },

  // ============================================================================
  // Phases 6-8: Saved Views (Local fallback using localStorage)
  // ============================================================================
  async listSavedViews(userId) {
    const key = `savedViews_${userId}`;
    return store.get(key, []);
  },

  async getSavedView(userId, viewId) {
    const views = store.get(`savedViews_${userId}`, []);
    return views.find(v => v.id === viewId) || null;
  },

  async createSavedView(userId, { name, config, is_default = false }) {
    const key = `savedViews_${userId}`;
    const views = store.get(key, []);
    
    // If setting as default, unset other defaults
    if (is_default) {
      views.forEach(v => v.is_default = false);
    }
    
    const newView = {
      id: 'view_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9),
      user_id: userId,
      name,
      config,
      is_default,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    
    views.push(newView);
    store.set(key, views);
    return newView;
  },

  async updateSavedView(userId, viewId, { name, config, is_default }) {
    const key = `savedViews_${userId}`;
    const views = store.get(key, []);
    const view = views.find(v => v.id === viewId);
    
    if (!view) {
      throw new Error('View not found');
    }
    
    // If setting as default, unset other defaults
    if (is_default) {
      views.forEach(v => v.is_default = false);
    }
    
    if (name !== undefined) view.name = name;
    if (config !== undefined) view.config = config;
    if (is_default !== undefined) view.is_default = is_default;
    view.updated_at = new Date().toISOString();
    
    store.set(key, views);
    return view;
  },

  async deleteSavedView(userId, viewId) {
    const key = `savedViews_${userId}`;
    const views = store.get(key, []);
    const filtered = views.filter(v => v.id !== viewId);
    store.set(key, filtered);
    return true;
  },
  
  // Portal C: Saved Views for Student Portal
  async listPortalSavedViews(userCode, viewType = 'assignments') {
    const key = `portalSavedViews_${userCode}_${viewType}`;
    return store.get(key, []);
  },

  async getPortalSavedView(userCode, viewId) {
    const allViews = [];
    // Gather all views for this user across view types
    ['assignments'].forEach(viewType => {
      const views = store.get(`portalSavedViews_${userCode}_${viewType}`, []);
      allViews.push(...views);
    });
    return allViews.find(v => v.id === viewId) || null;
  },

  async createPortalSavedView(userCode, { name, view_type = 'assignments', config }) {
    const key = `portalSavedViews_${userCode}_${view_type}`;
    const views = store.get(key, []);
    
    const newView = {
      id: 'pview_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9),
      user_code: userCode,
      name,
      view_type,
      config,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    
    views.push(newView);
    store.set(key, views);
    return newView;
  },

  async updatePortalSavedView(userCode, viewId, { name, config }) {
    // Find view across all view types
    let foundView = null;
    let foundKey = null;
    
    ['assignments'].forEach(viewType => {
      const key = `portalSavedViews_${userCode}_${viewType}`;
      const views = store.get(key, []);
      const view = views.find(v => v.id === viewId);
      if (view) {
        foundView = view;
        foundKey = key;
      }
    });
    
    if (!foundView) {
      throw new Error('View not found');
    }
    
    const views = store.get(foundKey, []);
    const view = views.find(v => v.id === viewId);
    
    if (name !== undefined) view.name = name;
    if (config !== undefined) view.config = config;
    view.updated_at = new Date().toISOString();
    
    store.set(foundKey, views);
    return view;
  },

  async deletePortalSavedView(userCode, viewId) {
    // Delete from all view types
    let deleted = false;
    
    ['assignments'].forEach(viewType => {
      const key = `portalSavedViews_${userCode}_${viewType}`;
      const views = store.get(key, []);
      const filtered = views.filter(v => v.id !== viewId);
      if (filtered.length < views.length) {
        store.set(key, filtered);
        deleted = true;
      }
    });
    
    return deleted;
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
};

const remote = {
  async listStudents() {
    const supabase = await getSupabase();
    if (!supabase) throw new Error('supabase-not-configured');
    return await withRetry(async () => {
      // Try with new columns first  
      let { data, error } = await supabase.from('students').select('id, code, name, class_id, iep_due, eval_due, primary_case_manager, archived_at, active').order('code');
      
      // Graceful fallback: if schema error, retry with basic columns only
      if (isSchemaError(error)) {
        console.warn('[data-adapter] Supabase schema may be outdated — some columns not available. Please apply pending migrations.');
        if (DATA_ADAPTER_DEBUG) {
          console.log('[data-adapter:debug] listStudents fallback triggered', { 
            strategy: 'basic-columns', 
            errorCode: error?.code, 
            errorMessage: error?.message 
          });
        }
        const fallback = await supabase.from('students').select('id, code, name, class_id').order('code');
        if (fallback.error) throw fallback.error;
        return fallback.data;
      }
      
      if (error) throw error;
      return data;
    });
  },
  async upsertStudent(studentData) {
    const supabase = await getSupabase();
    if (!supabase) throw new Error('supabase-not-configured');
    return await withRetry(async () => {
      const { code, name, class_id = null, iep_due, eval_due, primary_case_manager, archived_at, active } = studentData;
      
      // Try with new columns first
      const fullPayload = { code, name, class_id };
      // Include new fields only if provided
      if (iep_due !== undefined) fullPayload.iep_due = iep_due;
      if (eval_due !== undefined) fullPayload.eval_due = eval_due;
      if (primary_case_manager !== undefined) fullPayload.primary_case_manager = primary_case_manager;
      if (archived_at !== undefined) fullPayload.archived_at = archived_at;
      if (active !== undefined) fullPayload.active = active;
      
      let { data, error } = await supabase.from('students').upsert(fullPayload, { onConflict: 'code' }).select().single();
      
      // Graceful fallback: if schema error, retry with basic columns only
      if (isSchemaError(error)) {
        console.warn('[data-adapter] Supabase schema may be outdated — some columns not available. Please apply pending migrations.');
        const basicPayload = { code, name, class_id };
        const fallback = await supabase.from('students').upsert(basicPayload, { onConflict: 'code' }).select().single();
        if (fallback.error) throw fallback.error;
        return fallback.data;
      }
      
      if (error) throw error;
      return data;
    });
  },
  async listGoalsByStudentCode(code) {
    const supabase = await getSupabase();
    if (!supabase) throw new Error('supabase-not-configured');
    return await withRetry(async () => {
      const { data: stu, error: e1 } = await supabase.from('students').select('id').eq('code', code).single();
      if (e1) throw e1;
      const { data, error } = await supabase.from('goals').select('id, code, desc, target, status').eq('student_id', stu.id).order('code');
      if (error) throw error;
      return data;
    });
  },
  async upsertGoal({ student_code, code, desc, target = null, status = 'Open', 
                     measurement_type = 'percent', data_collector = null,
                     data_collector_email = null, class_context = null,
                     goal_area = null, baseline = null, mastery = null, case_manager = null, version = 1 }) {
    const supabase = await getSupabase();
    if (!supabase) throw new Error('supabase-not-configured');
    return await withRetry(async () => {
      // Lookup student by code
      const { data: stu, error: e1 } = await supabase.from('students').select('id').eq('code', student_code).single();
      if (e1) throw e1;
      
      // Try with new columns first
      const fullPayload = { 
        student_id: stu.id, code, desc, target, status,
        measurement_type, data_collector, data_collector_email, class_context,
        goal_area, baseline, mastery, case_manager, version
      };
      let { data, error } = await supabase.from('goals')
        .upsert(fullPayload, { onConflict: 'student_id,code' })
        .select()
        .single();
      
      // Graceful fallback: if schema error, retry with basic columns only
      if (isSchemaError(error)) {
        console.warn('[data-adapter] Schema fallback triggered in upsertGoal()', { code: error.code, message: error.message });
        const basicPayload = { student_id: stu.id, code, desc, target, status };
        const fallback = await supabase.from('goals')
          .upsert(basicPayload, { onConflict: 'student_id,code' })
          .select()
          .single();
        if (fallback.error) throw fallback.error;
        return { student_code, ...fallback.data };
      }
      
      if (error) throw error;
      return { student_code, ...data };
    });
  },
  async listGoalsAll() {
    const supabase = await getSupabase();
    if (!supabase) throw new Error('supabase-not-configured');
    return await withRetry(async () => {
      // Try with new columns first — filter to active, non-closed/archived goals only
      let { data, error } = await supabase
        .from('goals')
        .select(`id, code, desc, target, status, student_id,
                measurement_type, data_collector, data_collector_email, class_context,
                goal_area, baseline, mastery, case_manager, version,
                students!inner(code)`)
        .eq('active', true)
        .or('status.is.null,status.not.in.(closed,archived,Closed,Archived)')
        .order('code', { foreignTable: 'students', ascending: true });
      
      // Graceful fallback: if schema error, retry with basic columns only
      if (isSchemaError(error)) {
        console.warn('[data-adapter] Schema fallback triggered in listGoalsAll()', { code: error.code, message: error.message });
        const fallback = await supabase
          .from('goals')
          .select('id, code, desc, target, status, student_id, students!inner(code)')
          .eq('active', true)
          .or('status.is.null,status.not.in.(closed,archived,Closed,Archived)')
          .order('code', { foreignTable: 'students', ascending: true });
        if (fallback.error) throw fallback.error;
        return (fallback.data || []).map(g => ({
          id: g.id,
          student_code: g.students.code,
          code: g.code,
          desc: g.desc,
          target: g.target,
          status: g.status
        }));
      }
      
      if (error) throw error;
      // Flatten to include student_code at top level
      return (data || []).map(g => ({
        id: g.id,
        student_code: g.students.code,
        code: g.code,
        desc: g.desc,
        target: g.target,
        status: g.status,
        measurement_type: g.measurement_type,
        data_collector: g.data_collector,
        data_collector_email: g.data_collector_email,
        class_context: g.class_context,
        goal_area: g.goal_area,
        baseline: g.baseline,
        mastery: g.mastery,
        case_manager: g.case_manager,
        version: g.version
      }));
    });
  },
  async addProgress({ student_code, goal_id, date, points = '', percent = null, method = '', by_name = 'Teacher', via = 'manual', notes = '' }) {
    const supabase = await getSupabase();
    if (!supabase) throw new Error('supabase-not-configured');
    return await withRetry(async () => {
      const { data: stu, error: e1 } = await supabase.from('students').select('id').eq('code', student_code).single();
      if (e1) throw e1;
      const { error } = await supabase.from('progress_entries').insert({ student_id: stu.id, goal_id, date, points, percent, method, by_name, via, notes });
      if (error) throw error;
      return true;
    });
  },
  async addEvent({ type, student_code, date, due, notes }) {
    const supabase = await getSupabase();
    if (!supabase) throw new Error('supabase-not-configured');
    return await withRetry(async () => {
      const { data: stu, error: e1 } = await supabase.from('students').select('id').eq('code', student_code).single();
      if (e1) throw e1;
      const { error } = await supabase.from('events').insert({ type, student_id: stu.id, date, due, notes });
      if (error) throw error;
      return true;
    });
  },
  async listEvents() {
    const supabase = await getSupabase();
    if (!supabase) throw new Error('supabase-not-configured');
    return await withRetry(async () => {
      const { data, error } = await supabase.from('events').select('id, type, student_id, date, due, notes, created_at').order('date', { ascending: true });
      if (error) throw error;
      return data;
    });
  },
  async setStudentPassword(code, plain) {
    const supabase = await getSupabase();
    if (!supabase) throw new Error('supabase-not-configured');
    return await withRetry(async () => {
      const { error } = await supabase.rpc('set_student_password', { p_code: code, p_password: plain });
      if (error) throw error;
      return true;
    });
  },
  async verifyStudentPassword(code, plain) {
    const supabase = await getSupabase();
    if (!supabase) throw new Error('supabase-not-configured');
    return await withRetry(async () => {
      const { data, error } = await supabase.rpc('verify_student_password', { p_code: code, p_password: plain });
      if (error) throw error;
      return !!data;
    });
  },
  
  // Student Manager methods
  async createStudentWithEnrollmentsAndGoals(payload) {
    const supabase = await getSupabase();
    if (!supabase) throw new Error('supabase-not-configured');
    return await withRetry(async () => {
      console.log('[student-manager] createStudentWithEnrollmentsAndGoals (remote)', payload);
      const { data, error } = await supabase.rpc('create_student_with_enrollments_and_goals', { payload });
      if (error) throw error;
      return data;
    });
  },

  async listStudentsWithCounts(filter = {}) {
    const supabase = await getSupabase();
    if (!supabase) throw new Error('supabase-not-configured');
    return await withRetry(async () => {
      console.log('[student-manager] listStudentsWithCounts (remote)', filter);
      
      try {
        // Build query - select only code and name (no PII fields), include active status
        let query = supabase
          .from('students')
          .select(`
            id, 
            code, 
            name,
            active,
            created_at,
            class_enrollments!inner(class_id, active),
            goals(id, active)
          `)
          .order('code');
        
        // Apply filters
        if (filter.student_code) {
          query = query.ilike('code', `%${filter.student_code}%`);
        }
        
        // Filter by active status (default: active only)
        if (filter.status === 'active') {
          query = query.eq('active', true);
        } else if (filter.status === 'inactive') {
          query = query.eq('active', false);
        }
        // if filter.status === 'all', don't filter
        
        const { data, error } = await query;
        if (error) throw error;
        
        // Transform data to include counts (PII fields stripped)
        return (data || []).map(s => ({
          id: s.id,
          code: s.code,
          name: s.name,
          active: s.active !== false, // default to true for backward compat
          created_at: s.created_at,
          goals_count: s.goals?.length || 0,
          goals_active_count: s.goals?.filter(g => g.active !== false).length || 0,
          classes_count: s.class_enrollments?.filter(e => e.active).length || 0,
          enrollments: s.class_enrollments || []
        }));
      } catch (error) {
        // Graceful fallback: if schema error, retry with simpler query
        if (isSchemaError(error)) {
          console.warn('[data-adapter] Schema fallback triggered in listStudentsWithCounts()', { code: error.code, message: error.message });
          
          // Retry with basic columns only, no joins
          let fallbackQuery = supabase
            .from('students')
            .select('id, code, name, created_at')
            .order('code');
          
          // Apply filters
          if (filter.student_code) {
            fallbackQuery = fallbackQuery.ilike('code', `%${filter.student_code}%`);
          }
          
          // Filter by active status (default: active only)
          // Note: if 'active' column missing, we'll just return all students
          if (filter.status === 'active') {
            fallbackQuery = fallbackQuery.eq('active', true);
          } else if (filter.status === 'inactive') {
            fallbackQuery = fallbackQuery.eq('active', false);
          }
          
          const { data: fallbackData, error: fallbackError } = await fallbackQuery;
          if (fallbackError) throw fallbackError;
          
          // Map to include default counts
          return (fallbackData || []).map(s => ({
            id: s.id,
            code: s.code,
            name: s.name,
            active: true, // default assumption
            created_at: s.created_at,
            goals_count: 0,
            goals_active_count: 0,
            classes_count: 0,
            enrollments: []
          }));
        }
        
        // Re-throw non-schema errors
        throw error;
      }
    });
  },

  async addStudentGoals(student_code, goals) {
    const supabase = await getSupabase();
    if (!supabase) throw new Error('supabase-not-configured');
    return await withRetry(async () => {
      console.log('[student-manager] addStudentGoals (remote)', { student_code, goals });
      
      // Call the RPC function which handles errors per-goal
      const { data, error } = await supabase.rpc('add_student_goals', { 
        p_student_code: student_code, 
        p_goals: goals 
      });
      
      if (error) throw error;
      return data;
    });
  },

  async listStudentGoals(student_code) {
    const supabase = await getSupabase();
    if (!supabase) throw new Error('supabase-not-configured');
    return await withRetry(async () => {
      // Get student ID
      const { data: student, error: studentError } = await supabase
        .from('students')
        .select('id')
        .eq('code', student_code)
        .single();
      
      if (studentError) throw studentError;
      
      const { data, error } = await supabase
        .from('goals')
        .select('*')
        .eq('student_id', student.id)
        .eq('active', true)
        .or('status.is.null,status.not.in.(closed,archived,Closed,Archived)')
        .order('code');
      
      if (error) throw error;
      return data || [];
    });
  },
  
  async getDistinctGoalAreas(student_code = null) {
    const supabase = await getSupabase();
    if (!supabase) throw new Error('supabase-not-configured');
    return await withRetry(async () => {
      let query = supabase
        .from('goals')
        .select('goal_area');
      
      if (student_code) {
        // Get areas for specific student
        const { data: student, error: studentError } = await supabase
          .from('students')
          .select('id')
          .eq('code', student_code)
          .single();
        
        if (studentError) throw studentError;
        query = query.eq('student_id', student.id);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      
      // Extract distinct goal areas
      const areas = new Set();
      (data || []).forEach(row => {
        if (row.goal_area) areas.add(row.goal_area);
      });
      
      return Array.from(areas).sort();
    });
  },
  
  // Student Manager: Operation Chooser & Versioning
  async updateStudentEnrollments({ code, add = [], remove = [] }) {
    const supabase = await getSupabase();
    if (!supabase) throw new Error('supabase-not-configured');
    return await withRetry(async () => {
      console.log('[student-manager] updateStudentEnrollments (remote)', { code, add, remove });
      
      const { data, error } = await supabase.rpc('update_student_enrollments', { 
        p_code: code,
        p_add: add,
        p_remove: remove
      });
      if (error) throw error;
      
      return data;
    });
  },

  async getStudentEnrollments(student_code) {
    const supabase = await getSupabase();
    if (!supabase) throw new Error('supabase-not-configured');
    return await withRetry(async () => {
      console.log('[student-manager] getStudentEnrollments (remote)', student_code);
      
      // Get student ID
      const { data: student, error: studentError } = await supabase
        .from('students')
        .select('id')
        .eq('code', student_code)
        .single();
      
      if (studentError) throw studentError;
      
      const { data, error } = await supabase
        .from('class_enrollments')
        .select('*')
        .eq('student_id', student.id)
        .order('created_at');
      
      if (error) throw error;
      return data || [];
    });
  },

  async replaceGoalVersion({ old_goal_id, new_goal }) {
    const supabase = await getSupabase();
    if (!supabase) throw new Error('supabase-not-configured');
    return await withRetry(async () => {
      console.log('[student-manager] replaceGoalVersion (remote)', { old_goal_id, new_goal });
      
      const { data, error } = await supabase.rpc('replace_goal_version', { 
        old_goal_id: old_goal_id,
        new_goal: new_goal
      });
      if (error) throw error;
      
      return data;
    });
  },

  async archiveGoal({ goal_id }) {
    const supabase = await getSupabase();
    if (!supabase) throw new Error('supabase-not-configured');
    return await withRetry(async () => {
      console.log('[student-manager] archiveGoal (remote)', { goal_id });
      
      const { data, error } = await supabase.rpc('archive_goal', { 
        goal_id: goal_id
      });
      if (error) throw error;
      
      return data;
    });
  },

  async setStudentActive({ code, active }) {
    const supabase = await getSupabase();
    if (!supabase) throw new Error('supabase-not-configured');
    return await withRetry(async () => {
      console.log('[student-manager] setStudentActive (remote)', { code, active });
      
      const { data, error } = await supabase.rpc('set_student_active', { 
        p_code: code,
        p_active: active
      });
      if (error) throw error;
      
      return data;
    });
  },
  
  // Assignments
  async createAssignment(a) {
    const supabase = await getSupabase();
    if (!supabase) throw new Error('supabase-not-configured');
    return await withRetry(async () => {
      const payload = {
        title: a.title,
        type: a.type || 'html',
        series: a.series || null,
        page: a.page || null,
        hero: a.hero || null,
        meta: a.meta || {},
        created_by: a.created_by || null
      };
      const { data, error } = await supabase.from('assignments').insert(payload).select().single();
      if (error) throw error;
      return data;
    });
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
  
  async listAssignments() {
    const supabase = await getSupabase();
    if (!supabase) throw new Error('supabase-not-configured');
    return await withRetry(async () => {
      const schoolYear = getCurrentSchoolYear();
      const { data, error } = await supabase
        .from('assignments')
        .select('id, title, type, series, page, hero, meta, created_at, active')
        .or(`school_year.eq.${schoolYear},school_year.is.null`)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    });
  },
  
  async listAssignmentInstances() {
    const supabase = await getSupabase();
    if (!supabase) throw new Error('supabase-not-configured');
    return await withRetry(async () => {
      const schoolYear = getCurrentSchoolYear();
      // Join assignment_instances with students to get student code/name
      const { data, error } = await supabase
        .from('assignment_instances')
        .select(`
          id,
          assignment_id,
          student_id,
          assigned_at,
          due_at,
          status,
          settings,
          students!inner(code, name)
        `)
        .or(`school_year.eq.${schoolYear},school_year.is.null`);
      if (error) throw error;
      
      // Flatten to include student_code and student_name at top level
      // Client-side sort by student code since we can't order on joined columns
      const flattened = (data || []).map(inst => ({
        id: inst.id,
        assignment_id: inst.assignment_id,
        student_id: inst.student_id,
        student_code: inst.students.code,
        student_name: inst.students.name,
        assigned_at: inst.assigned_at,
        due_at: inst.due_at,
        status: inst.status,
        settings: inst.settings
      }));
      
      // Sort by student code
      flattened.sort((a, b) => (a.student_code || '').localeCompare(b.student_code || ''));
      return flattened;
    });
  },
  
  async upsertAssignmentInstance(x) {
    const supabase = await getSupabase();
    if (!supabase) throw new Error('supabase-not-configured');
    return await withRetry(async () => {
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
        settings: x.settings || {}
      };
      
      // Upsert on unique (assignment_id, student_id) and return the row id
      const { data: instanceRow, error } = await supabase
        .from('assignment_instances')
        .upsert(payload, { onConflict: 'assignment_id,student_id' })
        .select('id')
        .single();
      if (error) throw error;
      return instanceRow;
    });
  },
  
  async addSubmission(payload) {
    const supabase = await getSupabase();
    if (!supabase) throw new Error('supabase-not-configured');
    return await withRetry(async () => {
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
          notes: payload.notes || null
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
    });
  },
  
  // Portal B: List submissions (filtered by student if provided)
  async listSubmissions(filters = {}) {
    const supabase = await getSupabase();
    if (!supabase) throw new Error('supabase-not-configured');
    return await withRetry(async () => {
      const schoolYear = getCurrentSchoolYear();
      let query = supabase
        .from('submissions')
        .select('*, assignment_instances!inner(id, assignment_id, student_id, students!inner(code))')
        .or(`school_year.eq.${schoolYear},school_year.is.null`)
        .neq('review_status', 'finalized')
        .order('submitted_at', { ascending: false });
      
      if (filters.student_code) {
        query = query.eq('assignment_instances.students.code', filters.student_code);
      }
      
      if (filters.instance_id) {
        query = query.eq('instance_id', filters.instance_id);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      
      return deduplicateSubmissions(data || []);
    });
  },
  
  // Portal B: Get latest submission for an instance
  async getLatestSubmission(instance_id) {
    const supabase = await getSupabase();
    if (!supabase) throw new Error('supabase-not-configured');
    return await withRetry(async () => {
      const { data, error } = await supabase
        .rpc('get_latest_submission', { p_instance_id: instance_id });
      
      if (error) throw error;
      
      return data && data.length > 0 ? data[0] : null;
    });
  },
  
  // Portal B: Create resubmission
  async createResubmission({ instance_id, original_submission_id, answers = {} }) {
    const supabase = await getSupabase();
    if (!supabase) throw new Error('supabase-not-configured');
    return await withRetry(async () => {
      const { data, error } = await supabase
        .rpc('create_resubmission', {
          p_instance_id: instance_id,
          p_original_submission_id: original_submission_id,
          p_answers: answers
        });
      
      if (error) throw error;
      
      return { submission_id: data };
    });
  },

  // Teacher Review: List submission answers with item details
  async listSubmissionAnswers(submissionId) {
    const supabase = await getSupabase();
    if (!supabase) throw new Error('supabase-not-configured');
    const { data, error } = await supabase
      .from('submission_answers')
      .select(`
        *,
        assignment_items!assignment_item_id(
          id,
          item_ref,
          answer_type,
          points,
          meta
        )
      `)
      .eq('submission_id', submissionId);
    if (error) throw error;
    const itemIds = (data || []).map(a => a.assignment_item_id).filter(Boolean);
    let mappingsByItemId = {};
    if (itemIds.length > 0) {
      const { data: mappings } = await supabase
        .from('assignment_item_mappings')
        .select('*')
        .in('item_id', itemIds);
      (mappings || []).forEach(m => { mappingsByItemId[m.item_id] = m; });
    }
    return (data || []).map(answer => {
      const item = answer.assignment_items || {};
      const mapping = mappingsByItemId[answer.assignment_item_id] || {};
      return {
        id: answer.id,
        submission_id: answer.submission_id,
        item_id: answer.assignment_item_id,
        raw_answer: answer.raw_answer,
        is_correct: answer.is_correct,
        earned_points: answer.earned_points,
        max_points: answer.max_points,
        teacher_note: answer.teacher_note,
        scored_at: answer.scored_at,
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

  // Teacher Review: Update or create a submission answer with teacher scoring
  async updateSubmissionAnswer({ submissionId, itemId, earnedPoints, teacherNote }) {
    const response = await fetch('/.netlify/functions/teacher-review-save', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'save_score',
        submissionId, itemId, earnedPoints, teacherNote
      })
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(err.error || `Save score failed: ${response.status}`);
    }
    const result = await response.json();
    return result.data;
  },

  // Teacher Review: Update submission with grading fields
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

  // Teacher Review: Set submission review_status to 'in_progress' using service role key
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

  // Teacher Review: Finalize submission with scores and update instance status
  async finalizeSubmission(submissionId, { scoreAuto, scoreManual, scoreTotal, instanceId: callerInstanceId }) {
    // Use caller-provided instanceId when available to avoid a redundant anon SELECT
    // (which may fail due to RLS). Fall back to a Supabase SELECT only when needed.
    let instanceId = callerInstanceId || null;
    if (!instanceId) {
      const supabase = await getSupabase();
      if (supabase) {
        const { data } = await supabase
          .from('submissions')
          .select('instance_id')
          .eq('id', submissionId)
          .maybeSingle();
        instanceId = data?.instance_id;
      }
    }

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

  // Phase B: Classes and Enrollments
  async listClasses() {
    const supabase = await getSupabase();
    if (!supabase) throw new Error('supabase-not-configured');
    return await withRetry(async () => {
      const { data, error } = await supabase
        .from('classes')
        .select('id, name, code')
        .order('name');
      if (error) throw error;
      return data || [];
    });
  },
  
  async listClassEnrollments() {
    const supabase = await getSupabase();
    if (!supabase) throw new Error('supabase-not-configured');
    return await withRetry(async () => {
      // Primary: try class_enrollments table with joins
      const { data: enrollments, error: enrollError } = await supabase
        .from('class_enrollments')
        .select('class_id, student_id, active, students!inner(code, name), classes!inner(id)');
      
      if (enrollError) {
        console.warn('class_enrollments query failed, falling back to students.class_id:', enrollError);
      }
      
      // If we got data from class_enrollments, return it
      if (enrollments && enrollments.length > 0) {
        return enrollments.map(e => ({
          class_id: e.class_id,
          student_id: e.student_id,
          student_code: e.students.code,
          student_name: e.students.name,
          active: e.active !== false // Default to true
        }));
      }
      
      // Fallback: derive from students.class_id
      const { data: students, error: studentsError } = await supabase
        .from('students')
        .select('id, code, name, class_id')
        .not('class_id', 'is', null);
      
      if (studentsError) throw studentsError;
      
      // Return array of { class_id, student_id, student_code, student_name, active }
      return (students || []).map(s => ({
        class_id: s.class_id,
        student_id: s.id,
        student_code: s.code,
        student_name: s.name,
        active: true // Fallback always shows as active
      }));
    });
  },
  
  async upsertClass(classData) {
    const supabase = await getSupabase();
    if (!supabase) throw new Error('supabase-not-configured');
    return await withRetry(async () => {
      const { data, error } = await supabase
        .from('classes')
        .upsert({ name: classData.name, code: classData.code }, { onConflict: 'name' })
        .select()
        .single();
      if (error) throw error;
      return data;
    });
  },
  
  async upsertClassEnrollment(enrollment) {
    const supabase = await getSupabase();
    if (!supabase) throw new Error('supabase-not-configured');
    return await withRetry(async () => {
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
      
      const payload = {
        class_id: enrollment.class_id,
        student_id: studentId,
        active: enrollment.active !== false // Default to true
      };
      
      const { error } = await supabase
        .from('class_enrollments')
        .upsert(payload, { onConflict: 'class_id,student_id' });
      if (error) throw error;
      return enrollment;
    });
  },
  
  async removeClassEnrollment({ class_id, student_id, student_code }) {
    const supabase = await getSupabase();
    if (!supabase) throw new Error('supabase-not-configured');
    return await withRetry(async () => {
      // Resolve student_id from student_code if needed
      let resolvedStudentId = student_id;
      if (!resolvedStudentId && student_code) {
        const { data: student, error: studentError } = await supabase
          .from('students')
          .select('id')
          .eq('code', student_code)
          .single();
        if (studentError) throw studentError;
        resolvedStudentId = student.id;
      }
      
      // Mark as inactive instead of deleting (preserve history)
      const { error } = await supabase
        .from('class_enrollments')
        .update({ active: false })
        .eq('class_id', class_id)
        .eq('student_id', resolvedStudentId);
      
      if (error) throw error;
      return true;
    });
  },
  
  async bulkUpdateClassEnrollments(class_id, { addCodes = [], removeCodes = [] }, opts = {}) {
    const supabase = await getSupabase();
    if (!supabase) throw new Error('supabase-not-configured');
    return await withRetry(async () => {
      // Resolve student codes to IDs
      const allCodes = [...addCodes, ...removeCodes];
      const { data: students, error: studentsError } = await supabase
        .from('students')
        .select('id, code, class_id')
        .in('code', allCodes);
      
      if (studentsError) throw studentsError;
      
      const studentMap = new Map(students.map(s => [s.code, s]));
      
      // Add new enrollments
      for (const code of addCodes) {
        const student = studentMap.get(code);
        if (!student) continue;
        
        // Upsert enrollment (reactivate if exists)
        const { error: enrollError } = await supabase
          .from('class_enrollments')
          .upsert({
            class_id,
            student_id: student.id,
            active: true
          }, { onConflict: 'class_id,student_id' });
        
        if (enrollError) throw enrollError;
        
        // Set as primary class if requested
        if (opts.setPrimary) {
          const { error: studentError } = await supabase
            .from('students')
            .update({ class_id })
            .eq('id', student.id);
          
          if (studentError) throw studentError;
        }
      }
      
      // Mark removed enrollments as inactive
      for (const code of removeCodes) {
        const student = studentMap.get(code);
        if (!student) continue;
        
        const { error: enrollError } = await supabase
          .from('class_enrollments')
          .update({ active: false })
          .eq('class_id', class_id)
          .eq('student_id', student.id);
        
        if (enrollError) throw enrollError;
        
        // Clear primary class if requested and currently this class
        if (opts.setPrimary && student.class_id === class_id) {
          const { error: studentError } = await supabase
            .from('students')
            .update({ class_id: null })
            .eq('id', student.id);
          
          if (studentError) throw studentError;
        }
      }
      
      return true;
    });
  },
  
  async ensureAssignmentInstancesForClass(class_id, studentCodes = []) {
    const supabase = await getSupabase();
    if (!supabase) throw new Error('supabase-not-configured');
    return await withRetry(async () => {
      // Find assignments linked to this class (stored in meta.class_id)
      const { data: assignments, error: assignmentsError } = await supabase
        .from('assignments')
        .select('id, meta')
        .or(`meta->>class_id.eq.${class_id}`);
      
      if (assignmentsError) throw assignmentsError;
      
      // Resolve student codes to IDs
      const { data: students, error: studentsError } = await supabase
        .from('students')
        .select('id, code')
        .in('code', studentCodes);
      
      if (studentsError) throw studentsError;
      
      // For each student, ensure they have instances for all class assignments
      for (const student of students) {
        for (const assignment of assignments) {
          // Upsert instance (idempotent)
          const { error: instanceError } = await supabase
            .from('assignment_instances')
            .upsert({
              assignment_id: assignment.id,
              student_id: student.id,
              status: 'Assigned'
            }, { onConflict: 'assignment_id,student_id' });
          
          if (instanceError && !instanceError.message.includes('duplicate')) {
            console.error('Failed to create instance for', student.code, assignment.id, instanceError);
          }
        }
      }
      
      return true;
    });
  },
  
  // Phase B: HTML Package Upload with Supabase Storage
  async uploadAssignmentZip(file, manifest, createdBy = null) {
    const supabase = await getSupabase();
    if (!supabase) throw new Error('supabase-not-configured');
    return await withRetry(async () => {
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
    });
  },
  
  // Phase B: Google Forms metadata
  async saveFormMeta(assignmentId, meta) {
    const supabase = await getSupabase();
    if (!supabase) throw new Error('supabase-not-configured');
    return await withRetry(async () => {
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
    });
  },
  
  // Phase B: Import Google Form responses from CSV
  async importResponsesFromCSV(assignmentId, csvData, answerKey) {
    const supabase = await getSupabase();
    if (!supabase) throw new Error('supabase-not-configured');
    
    // This is a bulk import operation that processes multiple rows
    // We don't wrap the entire loop in withRetry because:
    // 1. It's not idempotent (could create duplicates on retry)
    // 2. We track success/failure per row
    // 3. Partial success is acceptable
    // Individual row failures are caught and reported in results.errors
    
    const results = {
      processed: 0,
      failed: 0,
      errors: []
    };
    
    for (const row of csvData) {
      try {
        const studentCode = row.student_code || row['Student Code'];
        if (!studentCode) {
          results.errors.push('Missing student code in row');
          results.failed++;
          continue;
        }
        
        // Get student
        const { data: students, error: studentErr } = await supabase
          .from('students')
          .select('id')
          .eq('code', studentCode)
          .single();
        
        if (studentErr || !students) {
          results.errors.push(`Student ${studentCode} not found`);
          results.failed++;
          continue;
        }
        
        // Get or create instance
        const { data: instances, error: instErr } = await supabase
          .from('assignment_instances')
          .select('id')
          .eq('assignment_id', assignmentId)
          .eq('student_id', students.id)
          .maybeSingle();
        
        let instanceId = instances?.id;
        
        if (!instanceId) {
          // Create instance
          const { data: newInst, error: newInstErr } = await supabase
            .from('assignment_instances')
            .insert({
              assignment_id: assignmentId,
              student_id: students.id,
              status: 'Assigned'
            })
            .select('id')
            .single();
          
          if (newInstErr) throw newInstErr;
          instanceId = newInst.id;
        }
        
        // Build submission (simplified - caller should provide formatted data)
        const { data: submission, error: subErr } = await supabase
          .from('submissions')
          .insert({
            instance_id: instanceId,
            answers: row.answers || {},
            score_auto: row.score_auto || null,
            score_total: row.score_total || null,
            detail: row.detail || {}
          })
          .select('id')
          .single();
        
        if (subErr) throw subErr;
        
        // Call process_submission
        const { error: processErr } = await supabase.rpc('process_submission', {
          submission_id: submission.id
        });
        
        if (processErr) throw processErr;
        
        // Update instance status
        await supabase
          .from('assignment_instances')
          .update({ status: 'Submitted' })
          .eq('id', instanceId);
        
        results.processed++;
      } catch (err) {
        results.failed++;
        results.errors.push(err.message);
      }
    }
    
    return results;
  },

  // ============================================================================
  // Phase 1: Goal Progress (Remote via Supabase)
  // ============================================================================
  async listGoalProgress({ studentCodes, goalCodes, classCodes, startDate, endDate, goalAreas, limit } = {}) {
    const supabase = await getSupabase();
    if (!supabase) throw new Error('supabase-not-configured');
    
    return await withRetry(async () => {
      console.log('[goal-progress] listGoalProgress (remote)', { studentCodes, goalCodes, classCodes, startDate, endDate, goalAreas, limit });
      const schoolYear = getCurrentSchoolYear();
      
      let query = supabase
        .from('goal_progress')
        .select(`
          id,
          date,
          value,
          source,
          collected_by,
          created_at,
          goal_id,
          student_id,
          class_id,
          goals!inner(id, code, desc, goal_area, student_id),
          students!inner(id, code, name),
          classes(id, name)
        `)
        .or(`school_year.eq.${schoolYear},school_year.is.null`)
        .order('date', { ascending: true });
      
      // Apply filters
      if (studentCodes && studentCodes.length > 0) {
        query = query.in('students.code', studentCodes);
      }
      
      if (goalCodes && goalCodes.length > 0) {
        query = query.in('goals.code', goalCodes);
      }
      
      if (classCodes && classCodes.length > 0) {
        query = query.in('classes.name', classCodes);
      }
      
      if (startDate) {
        query = query.gte('date', startDate);
      }
      
      if (endDate) {
        query = query.lte('date', endDate);
      }
      
      if (goalAreas && goalAreas.length > 0) {
        query = query.in('goals.goal_area', goalAreas);
      }
      
      if (limit) {
        query = query.limit(limit);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      
      // Transform to flattened structure with defensive null checks
      return (data || []).map(row => ({
        id: row.id,
        date: row.date,
        value: row.value,
        source: row.source,
        collected_by: row.collected_by,
        created_at: row.created_at,
        goal_id: row.goal_id,
        goal_code: row.goals?.code || '',
        goal_desc: row.goals?.desc || '',
        goal_area: row.goals?.goal_area || 'Uncategorized',
        student_id: row.student_id,
        student_code: row.students?.code || '',
        student_name: row.students?.name || row.students?.code || '',
        class_id: row.class_id,
        class_code: row.classes?.name || null
      }));
    });
  },

  async listGoalQuarterAverages({ goalIds, studentIds, year } = {}) {
    const supabase = await getSupabase();
    if (!supabase) throw new Error('supabase-not-configured');
    
    return await withRetry(async () => {
      console.log('[goal-progress] listGoalQuarterAverages (remote)', { goalIds, studentIds, year });
      
      let query = supabase
        .from('goal_progress_quarter_avg')
        .select('*');
      
      if (goalIds && goalIds.length > 0) {
        query = query.in('goal_id', goalIds);
      }
      
      if (studentIds && studentIds.length > 0) {
        query = query.in('student_id', studentIds);
      }
      
      if (year) {
        query = query.eq('school_year', year);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      
      return data || [];
    });
  },

  async upsertGoalProgress({ goal_code, student_code, date, value, source = 'manual', class_code = null, collected_by = null }) {
    const supabase = await getSupabase();
    if (!supabase) throw new Error('supabase-not-configured');
    
    return await withRetry(async () => {
      console.log('[goal-progress] upsertGoalProgress (remote)', { goal_code, student_code, date, value, source });
      
      // Look up student first so we can scope the goal lookup to this student
      const { data: studentData, error: studentError } = await supabase
        .from('students')
        .select('id, class_id')
        .eq('code', student_code)
        .limit(1)
        .single();
      
      if (studentError) throw new Error(`Student not found with code: ${student_code}`);
      
      // Look up goal_id filtered by both code AND student_id to avoid picking
      // a goal belonging to a different student when codes are not globally unique
      const { data: goalData, error: goalError } = await supabase
        .from('goals')
        .select('id, student_id')
        .eq('code', goal_code)
        .eq('student_id', studentData.id)
        .limit(1)
        .single();
      
      if (goalError) {
        // A goal_code on an assignment item may not correspond to an active IEP goal for
        // this student (e.g. goal was removed or never existed). Log a warning and skip
        // rather than throwing so other goals in the same submission still get recorded.
        console.warn(`[goal-progress] Goal with code "${goal_code}" not found for student "${student_code}" — skipping progress entry`);
        return null;
      }
      
      // Look up class_id if class_code provided
      let resolvedClassId = studentData.class_id; // default to student's primary class
      if (class_code) {
        const { data: classData } = await supabase
          .from('classes')
          .select('id')
          .eq('name', class_code)
          .limit(1)
          .single();
        
        if (classData) {
          resolvedClassId = classData.id;
        }
      }
      
      // Insert progress entry
      const safeValue = (value === null || value === undefined || isNaN(Number(value))) ? 0 : parseFloat(value);
      const { data, error } = await supabase
        .from('goal_progress')
        .insert({
          goal_id: goalData.id,
          student_id: studentData.id,
          class_id: resolvedClassId,
          date,
          value: safeValue,
          source,
          collected_by,
          school_year: getCurrentSchoolYear()
        })
        .select()
        .single();
      
      if (error) throw error;
      
      return data;
    });
  },

  // Phases 4-5: Bulk insert goal progress
  async bulkInsertGoalProgress(rows = []) {
    const supabase = await getSupabase();
    if (!supabase) throw new Error('supabase-not-configured');
    
    return await withRetry(async () => {
      console.log('[progress-bulk] bulkInsertGoalProgress (remote)', rows.length, 'rows');
      
      // Batch insert all rows
      const insertRows = [];
      
      for (const row of rows) {
        // Look up goal_id and student_id from codes
        const { data: goalData, error: goalError } = await supabase
          .from('goals')
          .select('id, student_id')
          .eq('code', row.goal_code)
          .limit(1)
          .single();
        
        if (goalError) {
          console.warn('[progress-bulk] Goal not found:', row.goal_code);
          continue;
        }
        
        const { data: studentData, error: studentError } = await supabase
          .from('students')
          .select('id, class_id')
          .eq('code', row.student_code)
          .limit(1)
          .single();
        
        if (studentError) {
          console.warn('[progress-bulk] Student not found:', row.student_code);
          continue;
        }
        
        insertRows.push({
          goal_id: goalData.id,
          student_id: studentData.id,
          class_id: row.class_id || studentData.class_id,
          date: row.date,
          value: parseFloat(row.value),
          source: row.source || 'manual',
          collected_by: row.collected_by || null
        });
      }
      
      if (insertRows.length === 0) {
        return { inserted: 0, data: [] };
      }
      
      // Insert all rows
      const { data, error } = await supabase
        .from('goal_progress')
        .insert(insertRows)
        .select();
      
      if (error) throw error;
      
      return { inserted: data.length, data };
    });
  },

  // Phases 4-5: List assignment-goal mappings
  async listAssignmentGoalMappings(assignment_id = null) {
    const supabase = await getSupabase();
    if (!supabase) throw new Error('supabase-not-configured');
    
    return await withRetry(async () => {
      console.log('[progress-mapping] listAssignmentGoalMappings (remote)', { assignment_id });
      
      let query = supabase
        .from('assignment_goal_map')
        .select('*, goals(code, desc, student_id, goal_area), assignments(id, title)');
      
      if (assignment_id) {
        query = query.eq('assignment_id', assignment_id);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      
      return data || [];
    });
  },

  // Phases 4-5: Upsert assignment-goal mapping
  async upsertAssignmentGoalMapping({ assignment_id, goal_id, primary_goal = false }) {
    const supabase = await getSupabase();
    if (!supabase) throw new Error('supabase-not-configured');
    
    return await withRetry(async () => {
      console.log('[progress-mapping] upsertAssignmentGoalMapping (remote)', { assignment_id, goal_id, primary_goal });
      
      const { data, error } = await supabase
        .from('assignment_goal_map')
        .upsert({
          assignment_id,
          goal_id,
          primary_goal
        }, { onConflict: 'assignment_id,goal_id' })
        .select()
        .single();
      
      if (error) throw error;
      
      return data;
    });
  },

  // Phases 4-5: Delete assignment-goal mapping
  async deleteAssignmentGoalMapping({ assignment_id, goal_id }) {
    const supabase = await getSupabase();
    if (!supabase) throw new Error('supabase-not-configured');
    
    return await withRetry(async () => {
      console.log('[progress-mapping] deleteAssignmentGoalMapping (remote)', { assignment_id, goal_id });
      
      const { error } = await supabase
        .from('assignment_goal_map')
        .delete()
        .eq('assignment_id', assignment_id)
        .eq('goal_id', goal_id);
      
      if (error) throw error;
      
      return true;
    });
  },

  // Phases 4-5: Record progress from submission (call RPC)
  async recordProgressForSubmission(instance_id) {
    const supabase = await getSupabase();
    if (!supabase) throw new Error('supabase-not-configured');
    
    return await withRetry(async () => {
      console.log('[progress-assignment] recordProgressForSubmission (remote)', { instance_id });
      
      const { data, error } = await supabase
        .rpc('record_progress_for_submission', { p_instance_id: instance_id });
      
      if (error) throw error;
      
      return data;
    });
  },

  // ============================================================================
  // Phases 6-8: Saved Views (Remote using Supabase)
  // ============================================================================
  async listSavedViews(userId) {
    const supabase = await getSupabase();
    if (!supabase) throw new Error('supabase-not-configured');
    
    return await withRetry(async () => {
      console.log('[saved-views] listSavedViews (remote)', { userId });
      
      const { data, error } = await supabase
        .from('progress_saved_views')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      
      return data || [];
    });
  },

  async getSavedView(userId, viewId) {
    const supabase = await getSupabase();
    if (!supabase) throw new Error('supabase-not-configured');
    
    return await withRetry(async () => {
      console.log('[saved-views] getSavedView (remote)', { userId, viewId });
      
      const { data, error } = await supabase
        .from('progress_saved_views')
        .select('*')
        .eq('user_id', userId)
        .eq('id', viewId)
        .single();
      
      if (error) {
        if (error.code === 'PGRST116') return null; // Not found
        throw error;
      }
      
      return data;
    });
  },

  async createSavedView(userId, { name, config, is_default = false }) {
    const supabase = await getSupabase();
    if (!supabase) throw new Error('supabase-not-configured');
    
    return await withRetry(async () => {
      console.log('[saved-views] createSavedView (remote)', { userId, name, is_default });
      
      // If setting as default, unset other defaults first
      if (is_default) {
        await supabase
          .from('progress_saved_views')
          .update({ is_default: false })
          .eq('user_id', userId)
          .eq('is_default', true);
      }
      
      const { data, error } = await supabase
        .from('progress_saved_views')
        .insert({
          user_id: userId,
          name,
          config,
          is_default
        })
        .select()
        .single();
      
      if (error) throw error;
      
      return data;
    });
  },

  async updateSavedView(userId, viewId, { name, config, is_default }) {
    const supabase = await getSupabase();
    if (!supabase) throw new Error('supabase-not-configured');
    
    return await withRetry(async () => {
      console.log('[saved-views] updateSavedView (remote)', { userId, viewId });
      
      // If setting as default, unset other defaults first
      if (is_default) {
        await supabase
          .from('progress_saved_views')
          .update({ is_default: false })
          .eq('user_id', userId)
          .eq('is_default', true)
          .neq('id', viewId);
      }
      
      const updates = {};
      if (name !== undefined) updates.name = name;
      if (config !== undefined) updates.config = config;
      if (is_default !== undefined) updates.is_default = is_default;
      
      const { data, error } = await supabase
        .from('progress_saved_views')
        .update(updates)
        .eq('user_id', userId)
        .eq('id', viewId)
        .select()
        .single();
      
      if (error) throw error;
      
      return data;
    });
  },

  async deleteSavedView(userId, viewId) {
    const supabase = await getSupabase();
    if (!supabase) throw new Error('supabase-not-configured');
    
    return await withRetry(async () => {
      console.log('[saved-views] deleteSavedView (remote)', { userId, viewId });
      
      const { error } = await supabase
        .from('progress_saved_views')
        .delete()
        .eq('user_id', userId)
        .eq('id', viewId);
      
      if (error) throw error;
      
      return true;
    });
  },
  
  // Portal C: Saved Views for Student Portal
  async listPortalSavedViews(userCode, viewType = 'assignments') {
    const supabase = await getSupabase();
    if (!supabase) throw new Error('supabase-not-configured');
    
    return await withRetry(async () => {
      console.log('[portal-saved-views] listPortalSavedViews (remote)', { userCode, viewType });
      
      const { data, error } = await supabase
        .from('portal_saved_views')
        .select('*')
        .eq('user_code', userCode)
        .eq('view_type', viewType)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      
      return data || [];
    });
  },

  async getPortalSavedView(userCode, viewId) {
    const supabase = await getSupabase();
    if (!supabase) throw new Error('supabase-not-configured');
    
    return await withRetry(async () => {
      console.log('[portal-saved-views] getPortalSavedView (remote)', { userCode, viewId });
      
      const { data, error } = await supabase
        .from('portal_saved_views')
        .select('*')
        .eq('user_code', userCode)
        .eq('id', viewId)
        .single();
      
      if (error) {
        if (error.code === 'PGRST116') return null; // Not found
        throw error;
      }
      
      return data;
    });
  },

  async createPortalSavedView(userCode, { name, view_type = 'assignments', config }) {
    const supabase = await getSupabase();
    if (!supabase) throw new Error('supabase-not-configured');
    
    return await withRetry(async () => {
      console.log('[portal-saved-views] createPortalSavedView (remote)', { userCode, name, view_type });
      
      const { data, error } = await supabase
        .from('portal_saved_views')
        .insert({
          user_code: userCode,
          name,
          view_type,
          config
        })
        .select()
        .single();
      
      if (error) throw error;
      
      return data;
    });
  },

  async updatePortalSavedView(userCode, viewId, { name, config }) {
    const supabase = await getSupabase();
    if (!supabase) throw new Error('supabase-not-configured');
    
    return await withRetry(async () => {
      console.log('[portal-saved-views] updatePortalSavedView (remote)', { userCode, viewId });
      
      const updates = {};
      if (name !== undefined) updates.name = name;
      if (config !== undefined) updates.config = config;
      
      const { data, error } = await supabase
        .from('portal_saved_views')
        .update(updates)
        .eq('user_code', userCode)
        .eq('id', viewId)
        .select()
        .single();
      
      if (error) throw error;
      
      return data;
    });
  },

  async deletePortalSavedView(userCode, viewId) {
    const supabase = await getSupabase();
    if (!supabase) throw new Error('supabase-not-configured');
    
    return await withRetry(async () => {
      console.log('[portal-saved-views] deletePortalSavedView (remote)', { userCode, viewId });
      
      const { error } = await supabase
        .from('portal_saved_views')
        .delete()
        .eq('user_code', userCode)
        .eq('id', viewId);
      
      if (error) throw error;
      
      return true;
    });
  }
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
