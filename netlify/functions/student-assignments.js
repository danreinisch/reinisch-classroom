// Student assignments endpoint - returns assignment instances for a student
// GET /.netlify/functions/student-assignments?code=XXX
// Auth: Requires code parameter
const {
  generateRequestId,
  jsonResponse,
  handleCorsPreFlight,
} = require('./_lib/http');

const {
  getSupabaseConfig,
} = require('./_lib/supa');

const {
  requireStudent,
} = require('./_lib/student-auth');

const {
  getStudentVisibleSchoolYears,
} = require('./_lib/student-visible-school-years');

// Get Supabase configuration
const { url: SUPABASE_URL, key: SUPABASE_SERVICE_ROLE_KEY } = getSupabaseConfig();
const { SESSION_SECRET } = process.env;

exports.handler = async (event) => {
  const requestId = generateRequestId();
  console.log(`[student-assignments] [${requestId}] Request received`);

  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return handleCorsPreFlight(event, ['GET', 'OPTIONS'], ['Content-Type']);
  }
  
  if (event.httpMethod !== 'GET') {
    console.log(`[student-assignments] [${requestId}] Method not allowed: ${event.httpMethod}`);
    return jsonResponse(event, 405, { error: 'Method Not Allowed' }, {}, requestId);
  }

  // Check if Supabase is configured
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.log(`[student-assignments] [${requestId}] Supabase not configured`);
    return jsonResponse(
      event, 
      503, 
      { ok: false, error: 'Service unavailable' },
      { 'Cache-Control': 'no-store' },
      requestId
    );
  }

  // Parse query params
  const params = event.queryStringParameters || {};
  const code = params.code;

  // Validate input
  if (!code || typeof code !== 'string' || code.trim().length === 0) {
    console.log(`[student-assignments] [${requestId}] Missing or invalid code`);
    return jsonResponse(
      event,
      400,
      { ok: false, error: 'Student code is required' },
      { 'Cache-Control': 'no-store' },
      requestId
    );
  }

  // Normalize student code to uppercase
  const codeNorm = code.trim().toUpperCase();

  const studentAuth =
    requireStudent(
      event,
      SESSION_SECRET,
      codeNorm
    );

  if (!studentAuth.ok) {
    return jsonResponse(
      event,
      studentAuth.statusCode,
      {
        ok: false,
        error: studentAuth.error,
      },
      {
        'Cache-Control': 'no-store',
      },
      requestId
    );
  }

  try {
    // First, get student ID from code
    const studentUrl = `${SUPABASE_URL}/rest/v1/students?select=id,code,name&code=eq.${encodeURIComponent(codeNorm)}&limit=1`;
    
    console.log(`[student-assignments] [${requestId}] Looking up student ID for code:`, codeNorm);
    
    const studentResponse = await fetch(studentUrl, {
      method: 'GET',
      headers: {
        'apikey': SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    if (!studentResponse.ok) {
      throw new Error(`Student lookup failed: ${studentResponse.status}`);
    }

    const studentData = await studentResponse.json();
    
    if (!studentData || studentData.length === 0) {
      console.log(`[student-assignments] [${requestId}] Student not found:`, codeNorm);
      return jsonResponse(
        event,
        404,
        { ok: false, error: 'Student not found' },
        { 'Cache-Control': 'no-store' },
        requestId
      );
    }

    const student = studentData[0];
    const studentId = student.id;

    // Fetch assignment instances for this student with joined assignment data
    const visibleSchoolYears =
      getStudentVisibleSchoolYears();

    const schoolYearFilters = visibleSchoolYears
      .map(year => `school_year.eq.${year}`)
      .concat('school_year.is.null')
      .join(',');

    const instancesUrl =
      `${SUPABASE_URL}/rest/v1/assignment_instances` +
      `?select=id,assignment_id,student_id,assigned_at,due_at,status,settings,resubmission_count,school_year,assignments!inner(id,title,type,series,page,hero,meta)` +
      `&student_id=eq.${studentId}` +
      `&or=(${schoolYearFilters})` +
      `&order=assigned_at.desc`;
    
    console.log(`[student-assignments] [${requestId}] Fetching assignment instances for student ID:`, studentId);
    
    const instancesResponse = await fetch(instancesUrl, {
      method: 'GET',
      headers: {
        'apikey': SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    if (!instancesResponse.ok) {
      throw new Error(`Instances query failed: ${instancesResponse.status}`);
    }

    const instances = await instancesResponse.json();
    
    // Flatten the response to include assignment data at top level
    const flattened = (instances || []).map(inst => ({
      id: inst.id,
      assignment_id: inst.assignment_id,
      student_id: inst.student_id,
      student_code: student.code,
      student_name: student.name || student.code,
      assigned_at: inst.assigned_at,
      due_at: inst.due_at,
      status: inst.status,
      settings: inst.settings || {},
      resubmission_count: inst.resubmission_count || 0,
      school_year: inst.school_year,
      assignment: inst.assignments
    }));
    
    console.log(`[student-assignments] [${requestId}] Successfully fetched ${flattened.length} assignment instances`);
    
    return jsonResponse(
      event,
      200,
      { ok: true, instances: flattened },
      { 'Cache-Control': 'no-store' },
      requestId
    );
  } catch (err) {
    console.error(`[student-assignments] [${requestId}] Error:`, err);
    return jsonResponse(
      event,
      500,
      { ok: false, error: 'Failed to fetch student assignments' },
      { 'Cache-Control': 'no-store' },
      requestId
    );
  }
};
