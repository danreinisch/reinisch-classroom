// Unit tests for supa.js helper functions
// Testing parseBooleanRpcResponse function

const { parseBooleanRpcResponse } = require('../netlify/functions/_lib/supa');

function assert(condition, message) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

function testParseBooleanRpcResponse() {
  console.log('Testing parseBooleanRpcResponse...');
  
  // Test direct boolean true
  assert(parseBooleanRpcResponse(true) === true, 'Direct boolean true should return true');
  
  // Test direct boolean false
  assert(parseBooleanRpcResponse(false) === false, 'Direct boolean false should return false');
  
  // Test array with true
  assert(parseBooleanRpcResponse([true]) === true, 'Array [true] should return true');
  
  // Test array with false
  assert(parseBooleanRpcResponse([false]) === false, 'Array [false] should return false');
  
  // Test empty array (should be falsy)
  assert(parseBooleanRpcResponse([]) === false, 'Empty array should return false');
  
  // Test truthy values
  assert(parseBooleanRpcResponse(1) === true, 'Number 1 should return true');
  assert(parseBooleanRpcResponse('yes') === true, 'String "yes" should return true');
  
  // Test falsy values
  assert(parseBooleanRpcResponse(0) === false, 'Number 0 should return false');
  assert(parseBooleanRpcResponse('') === false, 'Empty string should return false');
  assert(parseBooleanRpcResponse(null) === false, 'null should return false');
  assert(parseBooleanRpcResponse(undefined) === false, 'undefined should return false');
  
  console.log('✅ All parseBooleanRpcResponse tests passed!');
}

// Run tests
try {
  testParseBooleanRpcResponse();
  process.exit(0);
} catch (error) {
  console.error('❌ Test failed:', error.message);
  process.exit(1);
}
