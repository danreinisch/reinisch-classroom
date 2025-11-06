// Adapter selection: use Supabase if available, else localStorage.
import { getSupabase } from './supabase-client.js';
import { withRetry } from '../site/web/supabase-util.js';

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
};

const remote = {
  async listStudents() {
    const supabase = await getSupabase();
    if (!supabase) throw new Error('supabase-not-configured');
    return await withRetry(async () => {
      const { data, error } = await supabase.from('students').select('id, code, name, class_id').order('code');
      if (error) throw error;
      return data;
    });
  },
  async upsertStudent({ code, name, class_id = null }) {
    const supabase = await getSupabase();
    if (!supabase) throw new Error('supabase-not-configured');
    return await withRetry(async () => {
      const { data, error } = await supabase.from('students').upsert({ code, name, class_id }, { onConflict: 'code' }).select().single();
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
  async upsertGoal({ student_code, code, desc, target = null, status = 'Open' }) {
    const supabase = await getSupabase();
    if (!supabase) throw new Error('supabase-not-configured');
    return await withRetry(async () => {
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
    });
  },
  async listGoalsAll() {
    const supabase = await getSupabase();
    if (!supabase) throw new Error('supabase-not-configured');
    return await withRetry(async () => {
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
      const { error } = await supabase.rpc('set_student_password', { p_code: code, p_plain: plain });
      if (error) throw error;
      return true;
    });
  },
  async verifyStudentPassword(code, plain) {
    const supabase = await getSupabase();
    if (!supabase) throw new Error('supabase-not-configured');
    return await withRetry(async () => {
      const { data, error } = await supabase.rpc('verify_student_password', { p_code: code, p_plain: plain });
      if (error) throw error;
      return !!data;
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
  
  async listAssignments() {
    const supabase = await getSupabase();
    if (!supabase) throw new Error('supabase-not-configured');
    return await withRetry(async () => {
      const { data, error } = await supabase
        .from('assignments')
        .select('id, title, type, series, page, hero, meta, created_at')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    });
  },
  
  async listAssignmentInstances() {
    const supabase = await getSupabase();
    if (!supabase) throw new Error('supabase-not-configured');
    return await withRetry(async () => {
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
      
      // Upsert on unique (assignment_id, student_id)
      const { error } = await supabase
        .from('assignment_instances')
        .upsert(payload, { onConflict: 'assignment_id,student_id' });
      if (error) throw error;
      return true;
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
    });
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
        .select('class_id, student_id, students!inner(code, name), classes!inner(id)');
      
      if (enrollError) {
        console.warn('class_enrollments query failed, falling back to students.class_id:', enrollError);
      }
      
      // If we got data from class_enrollments, return it
      if (enrollments && enrollments.length > 0) {
        return enrollments.map(e => ({
          class_id: e.class_id,
          student_id: e.student_id,
          student_code: e.students.code,
          student_name: e.students.name
        }));
      }
      
      // Fallback: derive from students.class_id
      const { data: students, error: studentsError } = await supabase
        .from('students')
        .select('id, code, name, class_id')
        .not('class_id', 'is', null);
      
      if (studentsError) throw studentsError;
      
      // Return array of { class_id, student_id, student_code, student_name }
      return (students || []).map(s => ({
        class_id: s.class_id,
        student_id: s.id,
        student_code: s.code,
        student_name: s.name
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
      
      const { error } = await supabase
        .from('class_enrollments')
        .upsert(
          { class_id: enrollment.class_id, student_id: studentId },
          { onConflict: 'class_id,student_id' }
        );
      if (error) throw error;
      return enrollment;
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
    
    // This is a complex operation that should be done in a transaction
    // For now, we'll implement a basic version
    // Note: We don't wrap the entire loop in withRetry since it's a bulk operation
    // Individual queries inside are simple enough that they'll fail-fast appropriately
    
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
          p_submission_id: submission.id
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
