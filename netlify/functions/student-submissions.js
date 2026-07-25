// Student submissions endpoint - returns submissions for a student
// GET /.netlify/functions/student-submissions?code=XXX
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

// Get Supabase configuration
const { url: SUPABASE_URL, key: SUPABASE_SERVICE_ROLE_KEY } = getSupabaseConfig();
const { SESSION_SECRET } = process.env;

function getCurrentSchoolYear() {
  const now = new Date();
  const month = now.getMonth() + 1;
  return month >= 8 ? now.getFullYear() : now.getFullYear() - 1;
}

exports.handler = async (event) => {
  const requestId = generateRequestId();
  console.log(`[student-submissions] [${requestId}] Request received`);

  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return handleCorsPreFlight(event, ['GET', 'OPTIONS'], ['Content-Type']);
  }
  
  if (event.httpMethod !== 'GET') {
    console.log(`[student-submissions] [${requestId}] Method not allowed: ${event.httpMethod}`);
    return jsonResponse(event, 405, { error: 'Method Not Allowed' }, {}, requestId);
  }

  // Check if Supabase is configured
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.log(`[student-submissions] [${requestId}] Supabase not configured`);
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
    console.log(`[student-submissions] [${requestId}] Missing or invalid code`);
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
    const studentUrl = `${SUPABASE_URL}/rest/v1/students?select=id&code=eq.${encodeURIComponent(codeNorm)}&limit=1`;
    
    console.log(`[student-submissions] [${requestId}] Looking up student ID for code:`, codeNorm);
    
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
      console.log(`[student-submissions] [${requestId}] Student not found:`, codeNorm);
      return jsonResponse(
        event,
        404,
        { ok: false, error: 'Student not found' },
        { 'Cache-Control': 'no-store' },
        requestId
      );
    }

    const studentId = studentData[0].id;

    // Fetch submissions via assignment_instances join, also joining assignments and classes for title/name.
    // The assignment_instances!inner join ensures we only return submissions that belong
    // to this student (via student_id), and the nested assignments+classes joins provide
    // the title/class_name needed by renderGradeRow() in student-portal-init.js.
    const schoolYear = getCurrentSchoolYear();
    const submissionsUrl = `${SUPABASE_URL}/rest/v1/submissions?select=*,assignment_instances!inner(id,assignment_id,student_id,settings,assignments(id,title,section,classes(name)))&assignment_instances.student_id=eq.${studentId}&or=(school_year.eq.${schoolYear},school_year.is.null)&order=submitted_at.desc`;
    
    console.log(`[student-submissions] [${requestId}] Fetching submissions for student ID:`, studentId);
    
    const submissionsResponse = await fetch(submissionsUrl, {
      method: 'GET',
      headers: {
        'apikey': SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      }
    });

    if (!submissionsResponse.ok) {
      throw new Error(`Submissions query failed: ${submissionsResponse.status}`);
    }

    const allSubmissions = await submissionsResponse.json();

    // Non-instructional instances remain preserved for provenance but must
    // never enter student grade/history surfaces.
    const rawSubmissions = (allSubmissions || []).filter(sub => {
      const instance = Array.isArray(sub.assignment_instances)
        ? sub.assignment_instances[0]
        : sub.assignment_instances;
      return instance?.settings?.non_instructional !== true;
    });
    
    // Enrich each submission with flat assignment_title and class_name fields
    // so student-portal-init.js renderGradeRow() can use them directly.
    const submissions = (rawSubmissions || []).map(sub => {
      const instance = Array.isArray(sub.assignment_instances)
        ? sub.assignment_instances[0]
        : sub.assignment_instances;
      const assignment = Array.isArray(instance?.assignments)
        ? instance.assignments[0]
        : instance?.assignments;
      const classRecord = Array.isArray(assignment?.classes)
        ? assignment.classes[0]
        : assignment?.classes;
      return {
        ...sub,
        assignment_title: assignment?.title || null,
        // Prefer the linked class name; fall back to section (subject category)
        class_name: classRecord?.name || assignment?.section || null,
      };
    });
    
    console.log(`[student-submissions] [${requestId}] Successfully fetched ${submissions.length} submissions`);
    
    return jsonResponse(
      event,
      200,
      { ok: true, submissions },
      { 'Cache-Control': 'no-store' },
      requestId
    );
  } catch (err) {
    console.error(`[student-submissions] [${requestId}] Error:`, err);
    return jsonResponse(
      event,
      500,
      { ok: false, error: 'Failed to fetch student submissions' },
      { 'Cache-Control': 'no-store' },
      requestId
    );
  }
};
