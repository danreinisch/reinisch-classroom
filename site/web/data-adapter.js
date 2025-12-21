// Adapter selection: use Supabase if available, else localStorage.
import { getSupabase } from './supabase-client.js';

const NS = 'rc_unified_';
const store = {
  get: (k, def) => { try { return JSON.parse(localStorage.getItem(NS + k)) ?? def; } catch { return def; } },
  set: (k, v) => localStorage.setItem(NS + k, JSON.stringify(v)),
};

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
  async upsertGoal({ student_code, code, desc, target = null, status = 'Open' }) {
    const map = store.get('iepGoals', {});
    const goals = map[student_code] || [];
    const idx = goals.findIndex(g => g.code === code);
    const goal = { code, desc, target, status };
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

  // Assignments / Instances (local placeholders)
  async createAssignment(a) {
    const id = 'A' + Math.random().toString(36).slice(2, 9).toUpperCase();
    const arr = store.get('assignments', []);
    arr.push({ id, ...a });
    store.set('assignments', arr);
    return { id, ...a };
  },
  async listAssignments() { return store.get('assignments', []); },
  async listAssignmentInstances() {
    const arr = store.get('assignmentInstances', []);
    // Return with snake_case field names to match remote
    return arr.map(inst => ({
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
    return true;
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
    let result = [...submissions];
    
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
    
    return result;
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
      return storedEnrollments;
    }
    
    // Derive from students with class_id
    const students = store.get('students', []);
    return students
      .filter(s => s.class_id)
      .map(s => ({
        class_id: s.class_id,
        student_code: s.code,
        student_name: s.name || s.code
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
      enrollments.push(enrollment);
      store.set('classEnrollments', enrollments);
    }
    return enrollment;
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
    const progressArr = store.get('goalProgress', []);
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
      const pYear = date.getFullYear();
      
      // Determine school year and quarter
      const schoolYear = month >= 7 ? pYear : pYear - 1;
      const quarter = 
        [7, 8, 9].includes(month) ? 'Q1' :
        [10, 11, 12].includes(month) ? 'Q2' :
        [1, 2, 3].includes(month) ? 'Q3' :
        [4, 5, 6].includes(month) ? 'Q4' : 'Unknown';
      
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
      created_at: new Date().toISOString()
    };
    
    arr.push(entry);
    store.set('goalProgress', arr);
    
    return entry;
  },
};

const remote = {
  async listStudents() {
    const supabase = await getSupabase();
    if (!supabase) throw new Error('supabase-not-configured');
    const { data, error } = await supabase.from('students').select('id, code, name, class_id').order('code');
    if (error) throw error; return data;
  },
  async upsertStudent({ code, name, class_id = null }) {
    const supabase = await getSupabase();
    if (!supabase) throw new Error('supabase-not-configured');
    
    // TC-3: Use server-backed function to avoid RLS errors
    // Call teacher-students-upsert function with batch of 1 student
    try {
      const response = await fetch('/.netlify/functions/teacher-students-upsert', {
        method: 'POST',
        credentials: 'include', // Include teacher session cookie
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          students: [{ code, name: name || code, class_id }]
        })
      });
      
      if (!response.ok) {
        // If unauthorized (401), fall back to direct Supabase (for student mode or local)
        if (response.status === 401 || response.status === 503) {
          console.log('[data-adapter] Teacher function unavailable, falling back to direct Supabase');
          const { data, error } = await supabase.from('students').upsert({ code, name, class_id }, { onConflict: 'code' }).select().single();
          if (error) throw error;
          return data;
        }
        
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || `Server error: ${response.status}`);
      }
      
      const result = await response.json();
      if (!result.ok || !result.students || result.students.length === 0) {
        throw new Error('Failed to upsert student: Empty result');
      }
      
      return result.students[0];
    } catch (err) {
      // If network error or other issue, try direct Supabase as fallback
      console.warn('[data-adapter] Server upsert failed, attempting direct Supabase:', err.message);
      const { data, error } = await supabase.from('students').upsert({ code, name, class_id }, { onConflict: 'code' }).select().single();
      if (error) throw error;
      return data;
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
      
      if (!response.ok) {
        // If unauthorized or service unavailable, fall back to direct Supabase
        if (response.status === 401 || response.status === 503) {
          console.log('[data-adapter] Teacher function unavailable for batch, falling back to direct Supabase');
          const studentsToUpsert = students.map(s => ({
            code: s.code,
            name: s.name || s.code,
            class_id: s.class_id || null
          }));
          const { data, error } = await supabase.from('students').upsert(studentsToUpsert, { onConflict: 'code' }).select();
          if (error) throw error;
          return data;
        }
        
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || `Server error: ${response.status}`);
      }
      
      const result = await response.json();
      if (!result.ok || !result.students) {
        throw new Error('Failed to batch upsert students');
      }
      
      return result.students;
    } catch (err) {
      // Network error fallback
      console.warn('[data-adapter] Server batch upsert failed, attempting direct Supabase:', err.message);
      const studentsToUpsert = students.map(s => ({
        code: s.code,
        name: s.name || s.code,
        class_id: s.class_id || null
      }));
      const { data, error } = await supabase.from('students').upsert(studentsToUpsert, { onConflict: 'code' }).select();
      if (error) throw error;
      return data;
    }
  },
  async listGoalsByStudentCode(code) {
    const supabase = await getSupabase();
    if (!supabase) throw new Error('supabase-not-configured');
    const { data: stu, error: e1 } = await supabase.from('students').select('id').eq('code', code).single();
    if (e1) throw e1;
    const { data, error } = await supabase.from('goals').select('id, code, desc, target, status').eq('student_id', stu.id).order('code');
    if (error) throw error; return data;
  },
  async upsertGoal({ student_code, code, desc, target = null, status = 'Open' }) {
    const supabase = await getSupabase();
    if (!supabase) throw new Error('supabase-not-configured');
    // Lookup student by code
    const { data: stu, error: e1 } = await supabase.from('students').select('id').eq('code', student_code).single();
    if (e1) throw e1;
    // Upsert goal: unique on (student_id, code)
    const { data, error } = await supabase.from('goals')
      .upsert({ student_id: stu.id, code, desc, target, status }, { onConflict: 'student_id,code' })
      .select()
      .single();
    if (error) throw error;
    return { student_code, ...data };
  },
  async listGoalsAll() {
    const supabase = await getSupabase();
    if (!supabase) throw new Error('supabase-not-configured');
    // Join students and goals
    const { data, error } = await supabase
      .from('goals')
      .select('id, code, desc, target, status, student_id, students!inner(code)')
      .order('code', { foreignTable: 'students', ascending: true });
    if (error) throw error;
    // Flatten to include student_code at top level
    return (data || []).map(g => ({
      id: g.id,
      student_code: g.students.code,
      code: g.code,
      desc: g.desc,
      target: g.target,
      status: g.status
    }));
  },
  async addProgress({ student_code, goal_id, date, points = '', percent = null, method = '', by_name = 'Teacher', via = 'manual', notes = '' }) {
    const supabase = await getSupabase();
    if (!supabase) throw new Error('supabase-not-configured');
    const { data: stu, error: e1 } = await supabase.from('students').select('id').eq('code', student_code).single();
    if (e1) throw e1;
    const { error } = await supabase.from('progress_entries').insert({ student_id: stu.id, goal_id, date, points, percent, method, by_name, via, notes });
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
    if (error) throw error; return true;
  },
  async verifyStudentPassword(code, plain) {
    const supabase = await getSupabase();
    if (!supabase) throw new Error('supabase-not-configured');
    const { data, error } = await supabase.rpc('verify_student_password', { p_code: code, p_password: plain });
    if (error) throw error; return !!data;
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
      created_by: a.created_by || null
    };
    const { data, error } = await supabase.from('assignments').insert(payload).select().single();
    if (error) throw error;
    return data;
  },
  
  async listAssignments() {
    const supabase = await getSupabase();
    if (!supabase) throw new Error('supabase-not-configured');
    const { data, error } = await supabase
      .from('assignments')
      .select('id, title, type, series, page, hero, meta, created_at')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  },
  
  async listAssignmentInstances() {
    const supabase = await getSupabase();
    if (!supabase) throw new Error('supabase-not-configured');
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
      `);
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
      settings: x.settings || {}
    };
    
    // Upsert on unique (assignment_id, student_id)
    const { error } = await supabase
      .from('assignment_instances')
      .upsert(payload, { onConflict: 'assignment_id,student_id' });
    if (error) throw error;
    return true;
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
  },

  // Portal B: List submissions (filtered by student if provided)
  async listSubmissions(filters = {}) {
    const supabase = await getSupabase();
    if (!supabase) throw new Error('supabase-not-configured');
    
    // Query submissions with nested joins: submissions -> assignment_instances -> students
    // This allows filtering by student_code even though it's not directly in submissions table
    let query = supabase
      .from('submissions')
      .select('*, assignment_instances!inner(student_id, students!inner(code))')
      .order('submitted_at', { ascending: false });
    
    if (filters.student_code) {
      query = query.eq('assignment_instances.students.code', filters.student_code);
    }
    
    if (filters.instance_id) {
      query = query.eq('instance_id', filters.instance_id);
    }
    
    const { data, error } = await query;
    if (error) throw error;
    
    return data || [];
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
    const supabase = await getSupabase();
    if (!supabase) throw new Error('supabase-not-configured');
    
    const { data, error } = await supabase
      .rpc('create_resubmission', {
        p_instance_id: instance_id,
        p_original_submission_id: original_submission_id,
        p_answers: answers
      });
    
    if (error) throw error;
    
    return { submission_id: data };
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
    const supabase = await getSupabase();
    if (!supabase) throw new Error('supabase-not-configured');
    // Primary: try class_enrollments table with joins
    const { data: enrollments, error: enrollError } = await supabase
      .from('class_enrollments')
      .select('class_id, student_id, students!inner(code, name), classes!inner(id, code, name)');
    
    if (enrollError) {
      console.warn('class_enrollments query failed, falling back to students.class_id:', enrollError);
    }
    
    // If we got data from class_enrollments, return it with defensive handling
    if (enrollments && enrollments.length > 0) {
      return enrollments
        .filter(e => e && e.students && e.classes) // Defensive null checks
        .map(e => ({
          class_id: e.class_id,
          class_code: e.classes?.code || '',
          student_code: e.students?.code || '',
          student_name: e.students?.name || e.students?.code || ''
        }));
    }
    
    // Fallback: derive from students.class_id (not recommended, but available)
    const { data: students, error: studentsError } = await supabase
      .from('students')
      .select('id, code, name, class_id')
      .not('class_id', 'is', null);
    
    if (studentsError) {
      console.warn('students fallback query failed:', studentsError);
      return []; // Return empty array if both queries fail
    }
    
    // Fallback returns empty class_code since we only have class_id (not the actual code)
    return (students || [])
      .filter(s => s && s.class_id) // Defensive null checks
      .map(s => ({
        class_id: s.class_id,
        class_code: '', // Empty: no actual class code available in this fallback
        student_code: s.code || '',
        student_name: s.name || s.code || ''
      }));
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
        { class_id: enrollment.class_id, student_id: studentId },
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
  async importResponsesFromCSV(assignmentId, csvData, answerKey) {
    const supabase = await getSupabase();
    if (!supabase) throw new Error('supabase-not-configured');
    // This is a complex operation that should be done in a transaction
    // For now, we'll implement a basic version
    
    // 1. Parse CSV data (caller should provide parsed rows)
    // 2. For each row:
    //    - Match student by code
    //    - Auto-grade if answer key exists
    //    - Build per_goal detail from iep_goal_codes
    //    - Create submission
    //    - Call process_submission
    
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
    
    console.log('[goal-progress] listGoalProgress (remote)', { studentCodes, goalCodes, classCodes, startDate, endDate, goalAreas, limit });
    
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
  },

  async listGoalQuarterAverages({ goalIds, studentIds, year } = {}) {
    const supabase = await getSupabase();
    if (!supabase) throw new Error('supabase-not-configured');
    
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
  },

  async upsertGoalProgress({ goal_code, student_code, date, value, source = 'manual', class_code = null, collected_by = null }) {
    const supabase = await getSupabase();
    if (!supabase) throw new Error('supabase-not-configured');
    
    console.log('[goal-progress] upsertGoalProgress (remote)', { goal_code, student_code, date, value, source });
    
    // Look up goal_id and student_id from codes
    const { data: goalData, error: goalError } = await supabase
      .from('goals')
      .select('id, student_id')
      .eq('code', goal_code)
      .limit(1)
      .single();
    
    if (goalError) throw new Error(`Goal not found with code: ${goal_code}`);
    
    const { data: studentData, error: studentError } = await supabase
      .from('students')
      .select('id, class_id')
      .eq('code', student_code)
      .limit(1)
      .single();
    
    if (studentError) throw new Error(`Student not found with code: ${student_code}`);
    
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
    const { data, error } = await supabase
      .from('goal_progress')
      .insert({
        goal_id: goalData.id,
        student_id: studentData.id,
        class_id: resolvedClassId,
        date,
        value: parseFloat(value),
        source,
        collected_by
      })
      .select()
      .single();
    
    if (error) throw error;
    
    return data;
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
