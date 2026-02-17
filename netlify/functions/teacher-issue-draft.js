// Teacher issue draft endpoint
// POST /.netlify/functions/teacher-issue-draft
// Auth: Requires teacher session cookie
// Body: { draft } - Draft object containing title, className, assignmentText, mappingText, etc.
// Returns: { ok, assignment_id, issued_count }
const {
  generateRequestId,
  jsonResponse,
  handleCorsPreFlight,
  validateBodySize,
  safeJsonParse,
} = require('./_lib/http');

const { requireTeacher } = require('./_lib/auth');
const { getSupabaseConfig } = require('./_lib/supa');

// Class name aliases for backward compatibility with old drafts
const CLASS_ALIASES = {
  "LA 1 SC": "Language Arts 1 SC",
  "LA 2 SC": "Language Arts 2 SC",
  "LA 3 SC": "Language Arts 3 SC",
  "LA 4 SC": "Language Arts 4 SC",
  "Life Skills LA": "Life Skills Language Arts SC",
};

// Get Supabase configuration
const { url: SUPABASE_URL, key: SUPABASE_SERVICE_ROLE_KEY } = getSupabaseConfig();
const { SESSION_SECRET } = process.env;

exports.handler = async (event) => {
  const requestId = generateRequestId();
  console.log(`[teacher-issue-draft] [${requestId}] Request received`);

  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return handleCorsPreFlight(event, ['POST', 'OPTIONS'], ['Content-Type']);
  }
  
  if (event.httpMethod !== 'POST') {
    console.log(`[teacher-issue-draft] [${requestId}] Method not allowed: ${event.httpMethod}`);
    return jsonResponse(event, 405, { error: 'Method Not Allowed' }, {}, requestId);
  }

  // Validate Content-Type
  const contentType = event.headers['content-type'] || event.headers['Content-Type'] || '';
  if (!contentType.includes('application/json')) {
    console.log(`[teacher-issue-draft] [${requestId}] Invalid Content-Type: ${contentType}`);
    return jsonResponse(event, 400, { ok: false, error: 'Content-Type must be application/json' }, {}, requestId);
  }

  // Validate body size (allow up to 100KB for draft content)
  const bodySizeCheck = validateBodySize(event.body, 100);
  if (!bodySizeCheck.valid) {
    console.log(`[teacher-issue-draft] [${requestId}] Body too large: ${bodySizeCheck.error}`);
    return jsonResponse(event, 400, { ok: false, error: 'Request body too large' }, {}, requestId);
  }

  // Check if Supabase is configured
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.log(`[teacher-issue-draft] [${requestId}] Supabase not configured`);
    return jsonResponse(
      event, 
      503, 
      { ok: false, error: 'Service unavailable' },
      { 'Cache-Control': 'no-store' },
      requestId
    );
  }

  // Check if SESSION_SECRET is configured
  if (!SESSION_SECRET) {
    console.error(`[teacher-issue-draft] [${requestId}] Server not configured: Missing SESSION_SECRET`);
    return jsonResponse(event, 500, { ok: false, error: 'Server not configured' }, {}, requestId);
  }

  // Verify teacher session
  const authResult = requireTeacher(event, SESSION_SECRET);
  if (!authResult.ok) {
    console.log(`[teacher-issue-draft] [${requestId}] Unauthorized access attempt`);
    return jsonResponse(event, 401, { ok: false, error: 'Unauthorized' }, {}, requestId);
  }

  console.log(`[teacher-issue-draft] [${requestId}] Authorized user: ${authResult.user.username}`);

  // Parse JSON safely
  const parseResult = safeJsonParse(event.body);
  if (!parseResult.ok) {
    console.log(`[teacher-issue-draft] [${requestId}] Invalid JSON: ${parseResult.error}`);
    return jsonResponse(event, 400, { ok: false, error: 'Invalid JSON in request body' }, {}, requestId);
  }

  const { draft } = parseResult.data;

  // Validate draft object
  if (!draft || typeof draft !== 'object') {
    console.log(`[teacher-issue-draft] [${requestId}] Missing or invalid draft object`);
    return jsonResponse(event, 400, { ok: false, error: 'draft is required and must be an object' }, {}, requestId);
  }

  // Validate draft has required fields
  if (!draft.title || typeof draft.title !== 'string') {
    console.log(`[teacher-issue-draft] [${requestId}] Missing or invalid draft.title`);
    return jsonResponse(event, 400, { ok: false, error: 'draft.title is required and must be a string' }, {}, requestId);
  }

  if (!draft.className || typeof draft.className !== 'string') {
    console.log(`[teacher-issue-draft] [${requestId}] Missing or invalid draft.className`);
    return jsonResponse(event, 400, { ok: false, error: 'draft.className is required and must be a string' }, {}, requestId);
  }

  console.log(`[teacher-issue-draft] [${requestId}] Issuing draft "${draft.title}" to class "${draft.className}"`);

  try {
    // Resolve class name alias (for backward compatibility with old drafts)
    const resolvedClassName = CLASS_ALIASES[draft.className] || draft.className;
    if (CLASS_ALIASES[draft.className]) {
      console.log(`[teacher-issue-draft] [${requestId}] Resolved alias "${draft.className}" → "${resolvedClassName}"`);
    }

    // Step 1: Fetch class by name to get class ID
    const classesUrl = `${SUPABASE_URL}/rest/v1/classes?select=id,name&name=eq.${encodeURIComponent(resolvedClassName)}`;
    
    console.log(`[teacher-issue-draft] [${requestId}] Fetching class by name`);
    
    const classesResponse = await fetch(classesUrl, {
      method: 'GET',
      headers: {
        'apikey': SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    if (!classesResponse.ok) {
      console.error(`[teacher-issue-draft] [${requestId}] Class query failed with status: ${classesResponse.status}`);
      throw new Error(`Class query failed: ${classesResponse.status}`);
    }

    const classes = await classesResponse.json();
    let targetClass = classes[0];

    if (!targetClass) {
      // Auto-create the class if it doesn't exist
      console.log(`[teacher-issue-draft] [${requestId}] Class "${resolvedClassName}" not found, auto-creating...`);
      
      const createClassUrl = `${SUPABASE_URL}/rest/v1/classes`;
      const createClassResponse = await fetch(createClassUrl, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation'
        },
        body: JSON.stringify({ name: resolvedClassName })
      });

      if (!createClassResponse.ok) {
        const errorText = await createClassResponse.text();
        console.error(`[teacher-issue-draft] [${requestId}] Failed to auto-create class: ${createClassResponse.status} - ${errorText}`);
        throw new Error(`Failed to auto-create class "${resolvedClassName}": ${createClassResponse.status}`);
      }

      const createdClasses = await createClassResponse.json();
      targetClass = createdClasses[0];
      
      if (!targetClass) {
        console.error(`[teacher-issue-draft] [${requestId}] Class auto-created but no record returned`);
        throw new Error('Class auto-created but no record returned');
      }

      console.log(`[teacher-issue-draft] [${requestId}] Auto-created class: ${targetClass.name} (ID: ${targetClass.id})`);
    } else {
      console.log(`[teacher-issue-draft] [${requestId}] Found class: ${targetClass.name} (ID: ${targetClass.id})`);
    }

    // Step 2: Fetch enrollments for this class
    // Try class_enrollments first (for forward compatibility), then fall back to enrollments table
    let studentIds = [];
    let enrollmentSource = '';
    
    try {
      // Primary: try class_enrollments table (UUID-based junction table)
      const classEnrollmentsUrl = `${SUPABASE_URL}/rest/v1/class_enrollments?select=student_id,students!inner(id,code,name)&class_id=eq.${encodeURIComponent(targetClass.id)}`;
      
      console.log(`[teacher-issue-draft] [${requestId}] Fetching class enrollments from class_enrollments table`);
      
      const classEnrollmentsResponse = await fetch(classEnrollmentsUrl, {
        method: 'GET',
        headers: {
          'apikey': SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json'
        }
      });

      let classEnrollments = [];
      
      if (!classEnrollmentsResponse.ok) {
        console.warn(`[teacher-issue-draft] [${requestId}] class_enrollments query returned ${classEnrollmentsResponse.status}, trying enrollments fallback`);
        
        // Fallback: query enrollments table (text-based student_code + class_id)
        const enrollmentsUrl = `${SUPABASE_URL}/rest/v1/enrollments?select=student_code&class_id=eq.${encodeURIComponent(targetClass.id)}`;
        
        const enrollmentsResponse = await fetch(enrollmentsUrl, {
          method: 'GET',
          headers: {
            'apikey': SUPABASE_SERVICE_ROLE_KEY,
            'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            'Content-Type': 'application/json'
          }
        });

        if (!enrollmentsResponse.ok) {
          console.warn(`[teacher-issue-draft] [${requestId}] enrollments fallback also returned ${enrollmentsResponse.status}, returning empty student list`);
          studentIds = [];
        } else {
          const enrollments = await enrollmentsResponse.json();
          const studentCodes = enrollments.map(e => e.student_code).filter(Boolean);

          console.log(`[teacher-issue-draft] [${requestId}] Found ${studentCodes.length} student codes from enrollments table, looking up student IDs`);

          // Validate student codes match expected pattern (alphanumeric, hyphen, underscore)
          // This prevents injection by ensuring codes can be safely quoted in the query
          const validCodePattern = /^[a-zA-Z0-9_-]+$/;
          const validCodes = [];
          const invalidCodes = [];
          
          for (const code of studentCodes) {
            if (validCodePattern.test(code)) {
              validCodes.push(code);
            } else {
              invalidCodes.push(code);
            }
          }
          
          if (invalidCodes.length > 0) {
            console.warn(`[teacher-issue-draft] [${requestId}] Found invalid student codes (skipping):`, invalidCodes);
          }

          if (validCodes.length > 0) {
            // Look up students by their codes to get UUIDs
            // For PostgREST 'in' operator with text fields, wrap each value in quotes
            // Since we've validated that codes only contain [a-zA-Z0-9_-], quoting is safe
            const quotedCodes = validCodes.map(code => `"${code}"`);
            const studentsLookupUrl = `${SUPABASE_URL}/rest/v1/students?select=id,code&code=in.(${quotedCodes.join(',')})`;
            
            const studentsLookupResponse = await fetch(studentsLookupUrl, {
              method: 'GET',
              headers: {
                'apikey': SUPABASE_SERVICE_ROLE_KEY,
                'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
                'Content-Type': 'application/json'
              }
            });

            if (!studentsLookupResponse.ok) {
              console.warn(`[teacher-issue-draft] [${requestId}] Students lookup failed with status: ${studentsLookupResponse.status}, returning empty student list`);
              studentIds = [];
            } else {
              const studentsFromCodes = await studentsLookupResponse.json();
              studentIds = studentsFromCodes.map(s => s.id).filter(Boolean);

              if (studentIds.length > 0) {
                enrollmentSource = 'enrollments';
                console.log(`[teacher-issue-draft] [${requestId}] Found ${studentIds.length} student IDs from enrollments table`);
              }
            }
          }
        }
      } else {
        classEnrollments = await classEnrollmentsResponse.json();
        studentIds = classEnrollments.map(e => e.student_id).filter(Boolean);

        if (studentIds.length > 0) {
          enrollmentSource = 'class_enrollments';
          console.log(`[teacher-issue-draft] [${requestId}] Found ${studentIds.length} enrolled students from class_enrollments table`);
        } else {
          // Empty results from class_enrollments, try enrollments fallback
          console.log(`[teacher-issue-draft] [${requestId}] No enrollments in class_enrollments, trying enrollments table`);
          
          const enrollmentsUrl = `${SUPABASE_URL}/rest/v1/enrollments?select=student_code&class_id=eq.${encodeURIComponent(targetClass.id)}`;
          
          const enrollmentsResponse = await fetch(enrollmentsUrl, {
            method: 'GET',
            headers: {
              'apikey': SUPABASE_SERVICE_ROLE_KEY,
              'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
              'Content-Type': 'application/json'
            }
          });

          if (!enrollmentsResponse.ok) {
            console.warn(`[teacher-issue-draft] [${requestId}] enrollments fallback also returned ${enrollmentsResponse.status}, returning empty student list`);
            studentIds = [];
          } else {
            const enrollments = await enrollmentsResponse.json();
            const studentCodes = enrollments.map(e => e.student_code).filter(Boolean);

            console.log(`[teacher-issue-draft] [${requestId}] Found ${studentCodes.length} student codes from enrollments table, looking up student IDs`);

            // Validate student codes match expected pattern (alphanumeric, hyphen, underscore)
            // This prevents injection by ensuring codes can be safely quoted in the query
            const validCodePattern = /^[a-zA-Z0-9_-]+$/;
            const validCodes = [];
            const invalidCodes = [];
            
            for (const code of studentCodes) {
              if (validCodePattern.test(code)) {
                validCodes.push(code);
              } else {
                invalidCodes.push(code);
              }
            }
            
            if (invalidCodes.length > 0) {
              console.warn(`[teacher-issue-draft] [${requestId}] Found invalid student codes (skipping):`, invalidCodes);
            }

            if (validCodes.length > 0) {
              // Look up students by their codes to get UUIDs
              // For PostgREST 'in' operator with text fields, wrap each value in quotes
              // Since we've validated that codes only contain [a-zA-Z0-9_-], quoting is safe
              const quotedCodes = validCodes.map(code => `"${code}"`);
              const studentsLookupUrl = `${SUPABASE_URL}/rest/v1/students?select=id,code&code=in.(${quotedCodes.join(',')})`;
              
              const studentsLookupResponse = await fetch(studentsLookupUrl, {
                method: 'GET',
                headers: {
                  'apikey': SUPABASE_SERVICE_ROLE_KEY,
                  'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
                  'Content-Type': 'application/json'
                }
              });

              if (!studentsLookupResponse.ok) {
                console.warn(`[teacher-issue-draft] [${requestId}] Students lookup failed with status: ${studentsLookupResponse.status}, returning empty student list`);
                studentIds = [];
              } else {
                const studentsFromCodes = await studentsLookupResponse.json();
                studentIds = studentsFromCodes.map(s => s.id).filter(Boolean);

                if (studentIds.length > 0) {
                  enrollmentSource = 'enrollments';
                  console.log(`[teacher-issue-draft] [${requestId}] Found ${studentIds.length} student IDs from enrollments table`);
                }
              }
            }
          }
        }
      }
    } catch (err) {
      console.warn('[teacher-issue-draft] Enrollment query error:', err.message, '— returning empty student list');
      studentIds = [];
    }

    console.log(`[teacher-issue-draft] [${requestId}] Using enrollment source: ${enrollmentSource}`);

    // Step 3: Create assignment in Supabase
    // Determine assignment type based on draft's assignment kind
    let assignmentType = "html"; // default
    if (draft.assignment && draft.assignment.kind === "link") {
      assignmentType = "link";
    } else if (draft.assignment && draft.assignment.kind === "file") {
      assignmentType = "html";
    }

    const assignmentData = {
      title: draft.title,
      type: assignmentType,
      series: (draft.assignment && draft.assignment.link) ? draft.assignment.link : null, // For link type, series stores the external URL
      description: draft.notes || null,
      class_id: targetClass.id,
      active: true
    };

    console.log(`[teacher-issue-draft] [${requestId}] Creating assignment record`);

    const assignmentsUrl = `${SUPABASE_URL}/rest/v1/assignments`;
    const createAssignmentResponse = await fetch(assignmentsUrl, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify(assignmentData)
    });

    if (!createAssignmentResponse.ok) {
      const errorText = await createAssignmentResponse.text();
      console.error(`[teacher-issue-draft] [${requestId}] Assignment creation failed: ${createAssignmentResponse.status} - ${errorText}`);
      throw new Error(`Failed to create assignment: ${createAssignmentResponse.status}`);
    }

    const createdAssignments = await createAssignmentResponse.json();
    const assignmentId = createdAssignments[0]?.id;

    if (!assignmentId) {
      console.error(`[teacher-issue-draft] [${requestId}] Assignment created but no ID returned`);
      throw new Error('Assignment created but no ID returned');
    }

    console.log(`[teacher-issue-draft] [${requestId}] Created assignment with ID: ${assignmentId}`);

    // Step 4: Convert due date to ISO 8601 if provided
    let dueAt = null;
    if (draft.dueAt) {
      try {
        const dueDate = new Date(draft.dueAt);
        if (!isNaN(dueDate.getTime())) {
          dueAt = dueDate.toISOString();
        }
      } catch (err) {
        console.warn(`[teacher-issue-draft] [${requestId}] Invalid due date:`, err);
      }
    }

    // Step 5: Fetch student details to prepare assignment instances
    // If no students enrolled, skip instance creation
    let issued_count = 0;
    
    if (studentIds.length === 0) {
      console.log(`[teacher-issue-draft] [${requestId}] No students enrolled, assignment created but no instances issued`);
    } else {
      // Note: studentIds come from database enrollment query above, already validated as UUIDs by Supabase
      // PostgREST syntax requires wrapping UUIDs in double quotes for `in` operator
      const studentsUrl = `${SUPABASE_URL}/rest/v1/students?select=id,code,name&id=in.(${studentIds.map(id => `"${id}"`).join(',')})`;
      
      console.log(`[teacher-issue-draft] [${requestId}] Fetching student details`);
      
      const studentsResponse = await fetch(studentsUrl, {
        method: 'GET',
        headers: {
          'apikey': SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json'
        }
      });

      if (!studentsResponse.ok) {
        console.error(`[teacher-issue-draft] [${requestId}] Students query failed with status: ${studentsResponse.status}`);
        throw new Error(`Students query failed: ${studentsResponse.status}`);
      }

      const students = await studentsResponse.json();
      
      if (!students || students.length === 0) {
        console.log(`[teacher-issue-draft] [${requestId}] No students found for provided IDs`);
      } else {
        console.log(`[teacher-issue-draft] [${requestId}] Found ${students.length} students`);

        // Step 6: Build instances to upsert
        const instances = students.map(student => ({
          assignment_id: assignmentId,
          student_id: student.id,
          student_code: student.code,
          student_name: student.name || student.code,
          assigned_at: new Date().toISOString(),
          due_at: dueAt || null,
          status: 'Assigned',
          settings: {},
        }));

        // Use upsert with resolution=merge-duplicates for idempotency
        const instancesUrl = `${SUPABASE_URL}/rest/v1/assignment_instances`;
        
        console.log(`[teacher-issue-draft] [${requestId}] Upserting ${instances.length} assignment instances`);
        
        const upsertResponse = await fetch(instancesUrl, {
          method: 'POST',
          headers: {
            'apikey': SUPABASE_SERVICE_ROLE_KEY,
            'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            'Content-Type': 'application/json',
            'Prefer': 'resolution=merge-duplicates,return=representation'
          },
          body: JSON.stringify(instances)
        });

        if (!upsertResponse.ok) {
          const errorText = await upsertResponse.text();
          console.error(`[teacher-issue-draft] [${requestId}] Upsert failed with status ${upsertResponse.status}: ${errorText}`);
          throw new Error(`Failed to issue assignments: ${upsertResponse.status}`);
        }

        const upsertedInstances = await upsertResponse.json();
        issued_count = upsertedInstances.length;
      }
    }

    console.log(`[teacher-issue-draft] [${requestId}] Successfully issued: ${issued_count} instances created/updated`);
    
    return jsonResponse(
      event,
      200,
      { 
        ok: true, 
        assignment_id: assignmentId,
        issued_count: issued_count
      },
      { 'Cache-Control': 'no-store' },
      requestId
    );
  } catch (err) {
    console.error(`[teacher-issue-draft] [${requestId}] Error:`, err);
    return jsonResponse(
      event,
      500,
      { ok: false, error: err.message || 'Failed to issue draft' },
      { 'Cache-Control': 'no-store' },
      requestId
    );
  }
};
