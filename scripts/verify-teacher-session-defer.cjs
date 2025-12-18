#!/usr/bin/env node

/**
 * Verification script for teacher-session deferred check implementation
 * 
 * This script validates that the code changes are correctly implemented:
 * 1. checkTeacherSession is NOT called on page load
 * 2. checkTeacherSession IS called when Teacher button is clicked
 * 3. 401 responses are logged at info level
 */

const fs = require('fs');
const path = require('path');

const hubIndexPath = path.join(__dirname, '..', 'site', 'hub', 'index.html');

console.log('🔍 Verifying teacher-session deferred check implementation...\n');

// Read the hub index file
const content = fs.readFileSync(hubIndexPath, 'utf8');

let allPassed = true;

// Test 1: Verify checkTeacherSession is NOT called on page load
console.log('Test 1: Checking that checkTeacherSession is NOT called on initialization...');
const hasAutoCall = content.includes('checkTeacherSession().then(');
if (hasAutoCall) {
  console.log('  ❌ FAIL: Found automatic checkTeacherSession() call on page load');
  allPassed = false;
} else {
  console.log('  ✅ PASS: No automatic checkTeacherSession() call found\n');
}

// Test 2: Verify checkTeacherSession IS called in Teacher button handler
console.log('Test 2: Checking that checkTeacherSession is called in Teacher button handler...');
const btnTeacherSection = content.match(/on\("#btnTeacher",[\s\S]{0,500}await checkTeacherSession\(\)/);
if (btnTeacherSection) {
  console.log('  ✅ PASS: checkTeacherSession() is called when Teacher button is clicked\n');
} else {
  console.log('  ❌ FAIL: checkTeacherSession() not found in Teacher button handler');
  allPassed = false;
}

// Test 3: Verify 401 is handled with console.info
console.log('Test 3: Checking that 401 responses are logged at info level...');
const has401InfoLog = content.includes('response.status === 401') && 
                       content.includes('console.info("[Teacher Auth] No active teacher session (401)")');
if (has401InfoLog) {
  console.log('  ✅ PASS: 401 responses are logged with console.info()\n');
} else {
  console.log('  ❌ FAIL: 401 responses not handled with console.info()');
  allPassed = false;
}

// Test 4: Verify session restoration logic exists
console.log('Test 4: Checking that session restoration logic is preserved...');
const hasSessionRestore = content.includes('if (currentAuth && currentAuth.role === "teacher")');
if (hasSessionRestore) {
  console.log('  ✅ PASS: Session restoration logic is present\n');
} else {
  console.log('  ❌ FAIL: Session restoration logic not found');
  allPassed = false;
}

// Test 5: Verify initialization comment
console.log('Test 5: Checking for explanatory comment about deferred check...');
const hasComment = content.includes('Teacher session check is now deferred until user clicks Teacher button');
if (hasComment) {
  console.log('  ✅ PASS: Explanatory comment is present\n');
} else {
  console.log('  ❌ FAIL: Explanatory comment not found');
  allPassed = false;
}

// Summary
console.log('═'.repeat(60));
if (allPassed) {
  console.log('✅ All verification checks passed!');
  console.log('\nImplementation is correct:');
  console.log('  • No automatic teacher-session call on page load');
  console.log('  • Teacher-session check deferred to Teacher button click');
  console.log('  • 401 responses logged at info level (not error)');
  console.log('  • Session restoration preserved for logged-in users');
  process.exit(0);
} else {
  console.log('❌ Some verification checks failed. Please review the implementation.');
  process.exit(1);
}
