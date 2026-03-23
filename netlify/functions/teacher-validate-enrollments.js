// Teacher validate enrollments endpoint
// POST /.netlify/functions/teacher-validate-enrollments
// Auth: Requires teacher session cookie
// Body: { pairs: [{ studentCode, className }] }
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

// Class name aliases — must stay in sync with teacher-issue-draft.js
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
 * Fetch enrolled student codes for a class (by class DB ID).
 * Tries class_enrollments first; falls back to enrollments table.
 * Returns an array of student codes (strings).
 */
async function fetchEnrolledCodes(classId, requestId) {
  const logPrefix = `[teacher-validate-enrollments] [${requestId}]`;

  // Primary: class_enrollments (UUID-based junction table)
  const ceUrl = `${SUPABASE_URL}/rest/v1/class_enrollments?select=student_id,students!inner(code)&class_id=eq.${encodeURIComponent(classId)}`;
  const ceResp = await fetch(ceUrl, {
    method: 'GET',
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    },
  });

  if (ceResp.ok) {
    const rows = await ceResp.json();
    if (Array.isArray(rows) && rows.length > 0) {
      return rows.map(r => r.students?.code).filter(Boolean);
    }
    // Empty result — fall through to enrollments fallback
    console.log(`${logPrefix} class_enrollments empty for class ${classId}, trying enrollments fallback`);
  } else {
    console.warn(`${logPrefix} class_enrollments returned ${ceResp.status} for class ${classId}, trying enrollments fallback`);
  }

  // Fallback: enrollments table (text-based student_code)
  const enUrl = `${SUPABASE_URL}/rest/v1/enrollments?select=student_code&class_id=eq.${encodeURIComponent(classId)}`;
  const enResp = await fetch(enUrl, {
    method: 'GET',
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    },
  });

  if (!enResp.ok) {
    console.warn(`${logPrefix} enrollments fallback returned ${enResp.status} for class ${classId}`);
    return [];
  }

  const rows = await enResp.json();
  return (Array.isArray(rows) ? rows : []).map(r => r.student_code).filter(Boolean);
}

exports.handler = async (event) => {
  const requestId = generateRequestId();
  const logPrefix = `[teacher-validate-enrollments] [${requestId}]`;
  console.log(`${logPrefix} Request received: ${event.httpMethod}`);

  if (event.httpMethod === 'OPTIONS') {
    return handleCorsPreFlight(event, ['POST', 'OPTIONS'], ['Content-Type']);
  }

  if (event.httpMethod !== 'POST') {
    return jsonResponse(event, 405, { ok: false, error: 'Method Not Allowed' }, {}, requestId);
  }

  if (!SESSION_SECRET) {
    console.error(`${logPrefix} Server not configured: Missing SESSION_SECRET`);
    return jsonResponse(event, 500, { ok: false, error: 'Server not configured' }, {}, requestId);
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error(`${logPrefix} Supabase not configured`);
    return jsonResponse(event, 503, { ok: false, error: 'Service unavailable' }, { 'Cache-Control': 'no-store' }, requestId);
  }

  const sizeCheck = validateBodySize(event.body, 10 /* KB */);
  if (!sizeCheck.valid) {
    return jsonResponse(event, 400, { ok: false, error: 'Request body too large' }, {}, requestId);
  }

  const authResult = requireTeacher(event, SESSION_SECRET);
  if (!authResult.ok) {
    console.log(`${logPrefix} Unauthorized access attempt`);
    return jsonResponse(event, 401, { ok: false, error: 'Unauthorized' }, {}, requestId);
  }

  const teacherUsername = authResult.user.username;
  console.log(`${logPrefix} Authorized user: ${teacherUsername}`);

  const parseResult = safeJsonParse(event.body);
  if (!parseResult.ok) {
    return jsonResponse(event, 400, { ok: false, error: 'Invalid JSON in request body' }, {}, requestId);
  }

  const { pairs } = parseResult.data;

  if (!Array.isArray(pairs) || pairs.length === 0) {
    return jsonResponse(event, 400, { ok: false, error: 'pairs must be a non-empty array' }, {}, requestId);
  }

  // Validate each pair
  for (const pair of pairs) {
    if (!pair || typeof pair !== 'object') {
      return jsonResponse(event, 400, { ok: false, error: 'Each pair must be an object with studentCode and className' }, {}, requestId);
    }
    if (typeof pair.studentCode !== 'string' || pair.studentCode.trim().length === 0) {
      return jsonResponse(event, 400, { ok: false, error: 'Each pair.studentCode must be a non-empty string' }, {}, requestId);
    }
    if (typeof pair.className !== 'string' || pair.className.trim().length === 0) {
      return jsonResponse(event, 400, { ok: false, error: 'Each pair.className must be a non-empty string' }, {}, requestId);
    }
  }

  console.log(`${logPrefix} Validating ${pairs.length} student-class pair(s)`);

  try {
    // Step 1: Resolve teacher UUID for class scoping
    let teacherUUID = null;
    try {
      const teacherUrl = `${SUPABASE_URL}/rest/v1/teacher?select=id&teacher_code=eq.${encodeURIComponent(teacherUsername)}&limit=1`;
      const teacherResp = await fetch(teacherUrl, {
        method: 'GET',
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
        },
      });
      if (teacherResp.ok) {
        const rows = await teacherResp.json();
        if (rows.length > 0) {
          teacherUUID = rows[0].id;
          console.log(`${logPrefix} Resolved teacher UUID: ${teacherUUID}`);
        } else {
          console.warn(`${logPrefix} No teacher record found for teacher_code="${teacherUsername}"; class lookup will not be teacher-scoped`);
        }
      } else {
        console.warn(`${logPrefix} Teacher lookup returned ${teacherResp.status}; class lookup will not be teacher-scoped`);
      }
    } catch (err) {
      console.warn(`${logPrefix} Teacher lookup failed: ${err.message}; class lookup will not be teacher-scoped`);
    }

    // Step 2: Resolve unique class names and fetch enrolled codes per class
    const uniqueClassNames = [...new Set(pairs.map(p => p.className.trim()))];
    console.log(`${logPrefix} Unique class names: ${uniqueClassNames.join(', ')}`);

    // Map: resolvedClassName → { classFound: bool, enrolledCodes: Set<string> }
    const classEnrollmentMap = {};

    for (const rawClassName of uniqueClassNames) {
      const resolvedName = CLASS_ALIASES[rawClassName] || rawClassName;
      if (CLASS_ALIASES[rawClassName]) {
        console.log(`${logPrefix} Resolved alias "${rawClassName}" → "${resolvedName}"`);
      }

      // Look up the class (teacher-scoped if possible)
      let classesUrl;
      if (teacherUUID) {
        classesUrl = `${SUPABASE_URL}/rest/v1/classes?select=id,name,teacher_id&name=eq.${encodeURIComponent(resolvedName)}&teacher_id=eq.${encodeURIComponent(teacherUUID)}`;
      } else {
        classesUrl = `${SUPABASE_URL}/rest/v1/classes?select=id,name,teacher_id&name=eq.${encodeURIComponent(resolvedName)}`;
      }

      const classesResp = await fetch(classesUrl, {
        method: 'GET',
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
        },
      });

      if (!classesResp.ok) {
        console.warn(`${logPrefix} Class query failed for "${resolvedName}": ${classesResp.status}`);
        classEnrollmentMap[rawClassName] = { classFound: false, enrolledCodes: new Set() };
        continue;
      }

      const classes = await classesResp.json();

      if (classes.length > 1) {
        console.warn(`${logPrefix} WARNING: ${classes.length} classes matched name "${resolvedName}" — picking first. IDs: ${classes.map(c => c.id).join(', ')}`);
      }

      if (!classes[0]) {
        console.log(`${logPrefix} Class "${resolvedName}" not found for teacher`);
        classEnrollmentMap[rawClassName] = { classFound: false, enrolledCodes: new Set() };
        continue;
      }

      const targetClass = classes[0];
      console.log(`${logPrefix} Found class "${targetClass.name}" (ID: ${targetClass.id})`);

      const codes = await fetchEnrolledCodes(targetClass.id, requestId);
      console.log(`${logPrefix} Class "${rawClassName}": ${codes.length} enrolled student(s)`);

      classEnrollmentMap[rawClassName] = { classFound: true, enrolledCodes: new Set(codes) };
    }

    // Step 3: Build results for each pair
    const results = pairs.map(pair => {
      const { studentCode, className } = pair;
      const entry = classEnrollmentMap[className.trim()];
      if (!entry) {
        return { studentCode, className, enrolled: false, classFound: false };
      }
      return {
        studentCode,
        className,
        enrolled: entry.enrolledCodes.has(studentCode),
        classFound: entry.classFound,
      };
    });

    // Step 4: Build enrolledStudentsByClass map (raw className → sorted array of codes)
    const enrolledStudentsByClass = {};
    for (const [rawClassName, entry] of Object.entries(classEnrollmentMap)) {
      if (entry.classFound) {
        enrolledStudentsByClass[rawClassName] = [...entry.enrolledCodes].sort();
      }
    }

    console.log(`${logPrefix} Validation complete: ${results.filter(r => r.enrolled).length}/${results.length} enrolled`);

    return jsonResponse(
      event,
      200,
      { ok: true, results, enrolledStudentsByClass },
      { 'Cache-Control': 'no-store' },
      requestId
    );
  } catch (err) {
    console.error(`${logPrefix} Error:`, err);
    return jsonResponse(
      event,
      500,
      { ok: false, error: err.message || 'Failed to validate enrollments' },
      { 'Cache-Control': 'no-store' },
      requestId
    );
  }
};
