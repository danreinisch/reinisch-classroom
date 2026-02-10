/**
 * Unit tests for isSchemaError() function
 * Tests the enhanced schema error detection logic
 */

// Mock implementation of isSchemaError (copied from data-adapter.js)
function isSchemaError(error) {
  if (!error) return false;

  // Check primary fields
  const msg = (error.message || "").toLowerCase();
  const code = String(error.code || "").toLowerCase();
  const details = (error.details || "").toLowerCase();
  const hint = (error.hint || "").toLowerCase();

  // PostgreSQL error codes for missing columns/tables
  const pgErrorCodes = ["42703", "42p01"];
  // PostgREST error codes for missing columns/relations
  const postgrestErrorCodes = ["pgrst204", "pgrst200"];

  // Check if any field contains PostgreSQL or PostgREST error codes
  const hasErrorCode =
    pgErrorCodes.some(
      (errCode) =>
        code.includes(errCode) ||
        details.includes(errCode) ||
        hint.includes(errCode) ||
        msg.includes(errCode)
    ) ||
    postgrestErrorCodes.some(
      (errCode) =>
        code.includes(errCode) ||
        details.includes(errCode) ||
        hint.includes(errCode) ||
        msg.includes(errCode)
    );

  // Check for HTTP 400 combined with column/relation keywords
  const isHttp400WithSchemaKeywords =
    (code === "400" || error.status === 400) &&
    (msg.includes("column") ||
      msg.includes("relation") ||
      details.includes("column") ||
      details.includes("relation"));

  // Check for explicit schema error messages
  const hasSchemaErrorMessage =
    (msg.includes("column") && msg.includes("does not exist")) ||
    (msg.includes("relation") && msg.includes("does not exist")) ||
    msg.includes("undefined column") ||
    (details.includes("column") && details.includes("does not exist")) ||
    (details.includes("relation") && details.includes("does not exist"));

  // As a last resort, check the stringified error object
  let hasErrorCodeInStringified = false;
  try {
    const errorStr = JSON.stringify(error).toLowerCase();
    hasErrorCodeInStringified =
      pgErrorCodes.some((errCode) => errorStr.includes(errCode)) ||
      postgrestErrorCodes.some((errCode) => errorStr.includes(errCode));
  } catch (e) {
    // Ignore JSON.stringify errors
  }

  return (
    hasErrorCode ||
    isHttp400WithSchemaKeywords ||
    hasSchemaErrorMessage ||
    hasErrorCodeInStringified
  );
}

// Test cases
const testCases = [
  // PostgreSQL error code in error.code
  {
    name: "PostgreSQL 42703 in error.code",
    error: { code: "42703", message: "column students.iep_due does not exist" },
    expected: true,
  },
  // PostgreSQL error code in error.details
  {
    name: "PostgreSQL 42703 in error.details",
    error: { code: "400", details: "Hint: 42703" },
    expected: true,
  },
  // PostgreSQL error code in error.hint
  {
    name: "PostgreSQL 42703 in error.hint",
    error: { code: "400", hint: "PostgreSQL error code: 42703" },
    expected: true,
  },
  // PostgreSQL error code in error.message
  {
    name: "PostgreSQL 42703 in error.message",
    error: { code: "400", message: "Error 42703: column not found" },
    expected: true,
  },
  // PostgREST error code PGRST204
  {
    name: "PostgREST PGRST204 in error.code",
    error: { code: "PGRST204", message: "Column not found" },
    expected: true,
  },
  // HTTP 400 with column keyword
  {
    name: "HTTP 400 with column keyword in message",
    error: { code: "400", message: "column iep_due not found" },
    expected: true,
  },
  // HTTP 400 with status field and column keyword
  {
    name: "HTTP 400 with status field and column keyword",
    error: { status: 400, message: "column does not exist" },
    expected: true,
  },
  // Error with "does not exist" message
  {
    name: "Column does not exist message",
    error: { message: "column students.iep_due does not exist" },
    expected: true,
  },
  // Error with "undefined column" message
  {
    name: "Undefined column message",
    error: { message: "undefined column iep_due" },
    expected: true,
  },
  // Error with relation does not exist
  {
    name: "Relation does not exist message",
    error: { message: "relation students_new does not exist" },
    expected: true,
  },
  // Error in details field
  {
    name: "Column does not exist in details",
    error: { code: "400", details: "column iep_due does not exist in table students" },
    expected: true,
  },
  // Error code in stringified JSON
  {
    name: "PostgreSQL code in stringified error",
    error: { metadata: { pgCode: "42703" }, message: "Database error" },
    expected: true,
  },
  // Case insensitive check for 42P01
  {
    name: "PostgreSQL 42P01 (uppercase) in code",
    error: { code: "42P01", message: "relation does not exist" },
    expected: true,
  },
  // Not a schema error - general 400
  {
    name: "HTTP 400 without schema keywords (negative)",
    error: { code: "400", message: "Bad request" },
    expected: false,
  },
  // Not a schema error - different error
  {
    name: "Different error type (negative)",
    error: { code: "500", message: "Internal server error" },
    expected: false,
  },
  // Null/undefined error
  {
    name: "Null error (negative)",
    error: null,
    expected: false,
  },
  // Empty error object
  {
    name: "Empty error object (negative)",
    error: {},
    expected: false,
  },
];

// Run tests
console.log("Running isSchemaError() tests...\n");
let passed = 0;
let failed = 0;

testCases.forEach(({ name, error, expected }) => {
  const result = isSchemaError(error);
  const status = result === expected ? "✅ PASS" : "❌ FAIL";

  if (result === expected) {
    passed++;
  } else {
    failed++;
    console.log(`${status}: ${name}`);
    console.log(`  Expected: ${expected}, Got: ${result}`);
    console.log(`  Error:`, error);
    console.log("");
  }
});

console.log(`\nTest Results: ${passed} passed, ${failed} failed out of ${testCases.length} total`);

if (failed > 0) {
  process.exit(1);
} else {
  console.log("\n✅ All tests passed!");
}
