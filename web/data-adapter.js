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
  async listAssignmentInstances() { return store.get('assignmentInstances', []); },
  async upsertAssignmentInstance(x) {
    const arr = store.get('assignmentInstances', []);
    const i = arr.findIndex(ai => ai.assignmentId === x.assignmentId && ai.studentCode === x.studentCode);
    if (i >= 0) arr[i] = { ...arr[i], ...x };
    else arr.push(x);
    store.set('assignmentInstances', arr);
    return true;
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
  // Assignments / Instances: to be completed as we migrate those tabs
};

export const db = remote || local;
export const isRemote = !!remote;
export const localStore = store; // exposed for CSV import/export bootstrap
