// Adapter selection: use Supabase if available, else localStorage.
import { supabase } from './supabase-client.js';

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
};

const remote = supabase && {
  async listStudents() {
    const { data, error } = await supabase.from('students').select('id, code, name, class_id').order('code');
    if (error) throw error; return data;
  },
  async upsertStudent({ code, name, class_id = null }) {
    const { data, error } = await supabase.from('students').upsert({ code, name, class_id }, { onConflict: 'code' }).select().single();
    if (error) throw error; return data;
  },
  async listGoalsByStudentCode(code) {
    const { data: stu, error: e1 } = await supabase.from('students').select('id').eq('code', code).single();
    if (e1) throw e1;
    const { data, error } = await supabase.from('goals').select('id, code, desc, target, status').eq('student_id', stu.id).order('code');
    if (error) throw error; return data;
  },
  async upsertGoal({ student_code, code, desc, target = null, status = 'Open' }) {
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
    const { data: stu, error: e1 } = await supabase.from('students').select('id').eq('code', student_code).single();
    if (e1) throw e1;
    const { error } = await supabase.from('progress_entries').insert({ student_id: stu.id, goal_id, date, points, percent, method, by_name, via, notes });
    if (error) throw error; return true;
  },
  async addEvent({ type, student_code, date, due, notes }) {
    const { data: stu, error: e1 } = await supabase.from('students').select('id').eq('code', student_code).single();
    if (e1) throw e1;
    const { error } = await supabase.from('events').insert({ type, student_id: stu.id, date, due, notes });
    if (error) throw error; return true;
  },
  async listEvents() {
    const { data, error } = await supabase.from('events').select('id, type, student_id, date, due, notes, created_at').order('date', { ascending: true });
    if (error) throw error; return data;
  },
  async setStudentPassword(code, plain) {
    const { error } = await supabase.rpc('set_student_password', { p_code: code, p_plain: plain });
    if (error) throw error; return true;
  },
  async verifyStudentPassword(code, plain) {
    const { data, error } = await supabase.rpc('verify_student_password', { p_code: code, p_plain: plain });
    if (error) throw error; return !!data;
  },
  
  // Assignments
  async createAssignment(a) {
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
    const { data, error } = await supabase
      .from('assignments')
      .select('id, title, type, series, page, hero, meta, created_at')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  },
  
  async listAssignmentInstances() {
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
      p_submission_id: submission.id 
    });
    if (e2) throw e2;
    
    // Update assignment_instances status to 'Submitted'
    const { error: e3 } = await supabase
      .from('assignment_instances')
      .update({ status: 'Submitted' })
      .eq('id', payload.instance_id);
    if (e3) throw e3;
    
    return { submission_id: submission.id };
  }
};

export const db = remote || local;
export const isRemote = !!remote;
export const localStore = store; // exposed for CSV import/export bootstrap
