// Student roster endpoint for dropdown population
// Returns code-only list of active students (no PII)
// Used by hub student sign-in modal to populate dropdown
const {
  generateRequestId,
  jsonResponse,
  handleCorsPreFlight,
} = require('./_lib/http');

// Support both SUPABASE_SERVICE_ROLE_KEY and SUPABASE_SERVICE_KEY
const SUPABASE_URL = process.env.SUPABASE_URL_RUNTIME || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = 
  process.env.SUPABASE_SERVICE_KEY_RUNTIME || 
  process.env.SUPABASE_SERVICE_ROLE_KEY || 
  process.env.SUPABASE_SERVICE_KEY;

exports.handler = async (event) => {
  const requestId = generateRequestId();
  console.log(`[student-roster] [${requestId}] Request received`);

  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return handleCorsPreFlight(event, ['GET', 'OPTIONS'], ['Content-Type']);
  }
  
  if (event.httpMethod !== 'GET') {
    console.log(`[student-roster] [${requestId}] Method not allowed: ${event.httpMethod}`);
    return jsonResponse(event, 405, { error: 'Method Not Allowed' }, {}, requestId);
  }

  // Check if Supabase is configured
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.log(`[student-roster] [${requestId}] Supabase not configured, returning empty list`);
    return jsonResponse(
      event, 
      200, 
      { ok: true, students: [], source: 'unconfigured' },
      { 'Cache-Control': 'no-store' },
      requestId
    );
  }

  try {
    // Query Supabase REST API for students
    // Select minimal fields: code, active
    // Filter for active students if the column exists
    const url = `${SUPABASE_URL}/rest/v1/students?select=code,active&order=code`;
    
    console.log(`[student-roster] [${requestId}] Fetching from Supabase: ${url}`);
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'apikey': SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[student-roster] [${requestId}] Supabase error:`, response.status, errorText);
      
      // If column doesn't exist, try without active filter
      if (errorText.includes('column') && errorText.includes('does not exist')) {
        console.log(`[student-roster] [${requestId}] Active column doesn't exist, querying without it`);
        
        const fallbackUrl = `${SUPABASE_URL}/rest/v1/students?select=code&order=code`;
        const fallbackResponse = await fetch(fallbackUrl, {
          method: 'GET',
          headers: {
            'apikey': SUPABASE_SERVICE_ROLE_KEY,
            'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            'Content-Type': 'application/json'
          }
        });
        
        if (!fallbackResponse.ok) {
          throw new Error(`Supabase query failed: ${fallbackResponse.status}`);
        }
        
        const data = await fallbackResponse.json();
        console.log(`[student-roster] [${requestId}] Successfully fetched ${data.length} students (no active filter)`);
        
        return jsonResponse(
          event,
          200,
          { ok: true, students: data, source: 'supabase' },
          { 'Cache-Control': 'no-store' },
          requestId
        );
      }
      
      throw new Error(`Supabase query failed: ${response.status}`);
    }

    const data = await response.json();
    
    // Filter for active students if active field exists
    let students = data;
    if (data.length > 0 && 'active' in data[0]) {
      students = data.filter(s => s.active === true);
      console.log(`[student-roster] [${requestId}] Filtered to ${students.length} active students from ${data.length} total`);
    } else {
      console.log(`[student-roster] [${requestId}] Successfully fetched ${students.length} students (no active filtering)`);
    }
    
    return jsonResponse(
      event,
      200,
      { ok: true, students, source: 'supabase' },
      { 'Cache-Control': 'no-store' },
      requestId
    );
  } catch (err) {
    console.error(`[student-roster] [${requestId}] Error:`, err);
    return jsonResponse(
      event,
      500,
      { ok: false, error: 'Failed to fetch student roster', students: [] },
      { 'Cache-Control': 'no-store' },
      requestId
    );
  }
};
