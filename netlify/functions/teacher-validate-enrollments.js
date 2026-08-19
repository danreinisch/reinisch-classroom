// Teacher validate enrollments endpoint
// POST /.netlify/functions/teacher-validate-enrollments
// Auth: Requires teacher session cookie
// Body: { pairs: [{ studentCode, className }], classNames?: string[] }
//   - pairs: required (may be empty when classNames is provided)
//   - classNames: optional array of class names; returns enrolledStudentsByClass for those classes
// Returns: { ok, results: [{ studentCode, className, enrolled, classFound }], enrolledStudentsByClass }

const {
  generateRequestId,
  jsonResponse,
  handleCorsPreFlight,
  validateBodySize,
  safeJsonParse,
} = require('./_lib/http');

const { requireTeacher } = require('./_lib/auth');
const { getSupabaseConfig } = require('./_lib/supa');

// Class name aliases for backward compatibility
const CLASS_ALIASES = {
  "LA 1 SC": "Language Arts 1 SC",
  "LA 2 SC": "Language Arts 2 SC",
  "LA 3 SC": "Language Arts 3 SC",
  "LA 4 SC": "Language Arts 4 SC",
  "Life Skills LA": "Life Skills Language Arts SC",
};

const { url: SUPABASE_URL, key: SUPABASE_SERVICE_ROLE_KEY } = getSupabaseConfig();
const { SESSION_SECRET } = process.env;

/**
 * Fetch the list of enrolled student codes for a given class ID.
 * Uses active class_enrollments as authoritative current membership.
 * Uses legacy enrollments only when the primary compatibility surface is unavailable.
 * Returns an array of student code strings.
 * Class-not-found is handled by the caller before this function is invoked.
 */
async function fetchEnrolledCodes(classId, requestId) {
  // Primary: class_enrollments (UUID-based junction table with embedded student info)
  const classEnrollmentsUrl = `${SUPABASE_URL}/rest/v1/class_enrollments?select=students!inner(code)&class_id=eq.${encodeURIComponent(classId)}&active=eq.true`;

  const ceResponse = await fetch(classEnrollmentsUrl, {
    method: 'GET',
    headers: {
      'apikey': SUPABASE_SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    },
  });

  if (ceResponse.ok) {
    const rows = await ceResponse.json();
    const codes = rows.filter(r => r.students && r.students.code).map(r => r.students.code);
    console.log(`[teacher-validate-enrollments] [${requestId}] Found ${codes.length} active students via class_enrollments for class ${classId}`);
    return codes;
  }

  if (ceResponse.status === 400 || ceResponse.status === 404) {
    console.warn(`[teacher-validate-enrollments] [${requestId}] class_enrollments compatibility surface unavailable (${ceResponse.status}), trying legacy enrollments fallback`);
  } else {
    console.warn(`[teacher-validate-enrollments] [${requestId}] class_enrollments query failed (${ceResponse.status}); refusing legacy enrollment fallback`);
    return [];
  }

  // Fallback: enrollments table (text-based student_code + class_id)
  const enrollmentsUrl = `${SUPABASE_URL}/rest/v1/enrollments?select=student_code&class_id=eq.${encodeURIComponent(classId)}`;
  const eResponse = await fetch(enrollmentsUrl, {
    method: 'GET',
    headers: {
      'apikey': SUPABASE_SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    },
  });

  if (!eResponse.ok) {
    console.warn(`[teacher-validate-enrollments] [${requestId}] enrollments fallback also failed (${eResponse.status})`);
    return [];
  }

  const enrollments = await eResponse.json();
  const codes = enrollments.map(e => e.student_code).filter(Boolean);
  console.log(`[teacher-validate-enrollments] [${requestId}] Found ${codes.length} students via enrollments fallback for class ${classId}`);
  return codes;
}

exports.handler = async (event) => {
  const requestId = generateRequestId();
  console.log(`[teacher-validate-enrollments] [${requestId}] Request received: ${event.httpMethod}`);

  if (event.httpMethod === 'OPTIONS') {
    return handleCorsPreFlight(event, ['POST', 'OPTIONS'], ['Content-Type']);
  }

  if (event.httpMethod !== 'POST') {
    return jsonResponse(event, 405, { ok: false, error: 'Method Not Allowed' }, {}, requestId);
  }

  if (!SESSION_SECRET) {
    console.error(`[teacher-validate-enrollments] [${requestId}] Server not configured: Missing SESSION_SECRET`);
    return jsonResponse(event, 500, { ok: false, error: 'Server not configured' }, {}, requestId);
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error(`[teacher-validate-enrollments] [${requestId}] Supabase not configured`);
    return jsonResponse(event, 503, { ok: false, error: 'Service unavailable' }, { 'Cache-Control': 'no-store' }, requestId);
  }

  const authResult = requireTeacher(event, SESSION_SECRET);
  if (!authResult.ok) {
    console.log(`[teacher-validate-enrollments] [${requestId}] Unauthorized access attempt`);
    return jsonResponse(event, 401, { ok: false, error: 'Unauthorized' }, {}, requestId);
  }

  console.log(`[teacher-validate-enrollments] [${requestId}] Authorized user: ${authResult.user.username}`);

  const bodySizeCheck = validateBodySize(event.body, 10);
  if (!bodySizeCheck.valid) {
    console.log(`[teacher-validate-enrollments] [${requestId}] Body too large: ${bodySizeCheck.error}`);
    return jsonResponse(event, 400, { ok: false, error: 'Request body too large' }, {}, requestId);
  }

  const parseResult = safeJsonParse(event.body);
  if (!parseResult.ok) {
    console.log(`[teacher-validate-enrollments] [${requestId}] Invalid JSON: ${parseResult.error}`);
    return jsonResponse(event, 400, { ok: false, error: 'Invalid JSON in request body' }, {}, requestId);
  }

  const { pairs, classNames } = parseResult.data;

  const hasPairs = Array.isArray(pairs) && pairs.length > 0;
  const hasClassNames = Array.isArray(classNames) && classNames.length > 0;

  if (!hasPairs && !hasClassNames) {
    return jsonResponse(event, 400, { ok: false, error: 'pairs must be a non-empty array, or classNames must be provided' }, {}, requestId);
  }

  const safePairs = Array.isArray(pairs) ? pairs : [];

  if (safePairs.length > 200) {
    return jsonResponse(event, 400, { ok: false, error: 'Too many pairs (max 200)' }, {}, requestId);
  }

  // Validate pair structure
  for (const pair of safePairs) {
    if (!pair || typeof pair.studentCode !== 'string' || typeof pair.className !== 'string') {
      return jsonResponse(event, 400, { ok: false, error: 'Each pair must have studentCode and className strings' }, {}, requestId);
    }
  }

  if (hasClassNames) {
    for (const cn of classNames) {
      if (typeof cn !== 'string') {
        return jsonResponse(event, 400, { ok: false, error: 'Each entry in classNames must be a string' }, {}, requestId);
      }
    }
  }

  console.log(`[teacher-validate-enrollments] [${requestId}] Checking ${safePairs.length} pairs across classes${hasClassNames ? ` + roster for [${classNames.join(', ')}]` : ''}`);

  try {
    // Collect unique class names from pairs and optional classNames array
    const uniqueClassNames = [...new Set([
      ...safePairs.map(p => p.className).filter(Boolean),
      ...(hasClassNames ? classNames : []),
    ])];

    // For each unique class name, look up the class and its enrolled student codes
    // enrolledByClass maps original className → string[] of enrolled student codes (or null if class not found)
    const enrolledByClass = {};

    for (const className of uniqueClassNames) {
      const resolvedName = CLASS_ALIASES[className] || className;

      // Look up class by resolved name
      const classesUrl = `${SUPABASE_URL}/rest/v1/classes?select=id&name=eq.${encodeURIComponent(resolvedName)}&limit=1`;
      const classesResponse = await fetch(classesUrl, {
        method: 'GET',
        headers: {
          'apikey': SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
        },
      });

      if (!classesResponse.ok) {
        console.warn(`[teacher-validate-enrollments] [${requestId}] Class lookup failed for "${resolvedName}": ${classesResponse.status}`);
        enrolledByClass[className] = null;
        continue;
      }

      const classes = await classesResponse.json();
      if (classes.length === 0) {
        console.log(`[teacher-validate-enrollments] [${requestId}] Class not found: "${resolvedName}"`);
        enrolledByClass[className] = null;
        continue;
      }

      const classId = classes[0].id;
      console.log(`[teacher-validate-enrollments] [${requestId}] Found class "${resolvedName}" (id: ${classId})`);

      enrolledByClass[className] = await fetchEnrolledCodes(classId, requestId);
    }

    // Build per-pair results
    const results = safePairs.map(pair => {
      const { studentCode, className } = pair;
      const codes = enrolledByClass[className];
      const classFound = codes !== null;
      const enrolled = classFound && Array.isArray(codes) && codes.includes(studentCode);
      return { studentCode, className, enrolled, classFound };
    });

    // Build enrolledStudentsByClass (omit entries where class wasn't found)
    const enrolledStudentsByClass = {};
    for (const [className, codes] of Object.entries(enrolledByClass)) {
      if (codes !== null) {
        enrolledStudentsByClass[className] = codes;
      }
    }

    console.log(`[teacher-validate-enrollments] [${requestId}] Validated ${results.length} pairs; ${results.filter(r => !r.enrolled).length} not enrolled`);

    return jsonResponse(event, 200, {
      ok: true,
      results,
      enrolledStudentsByClass,
    }, { 'Cache-Control': 'no-store' }, requestId);

  } catch (err) {
    console.error(`[teacher-validate-enrollments] [${requestId}] Unexpected error:`, err);
    return jsonResponse(event, 500, { ok: false, error: 'Internal server error' }, { 'Cache-Control': 'no-store' }, requestId);
  }
};
