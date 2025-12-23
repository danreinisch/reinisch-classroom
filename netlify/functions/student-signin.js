// Compatibility alias for student-login endpoint
// Forwards to student-login.js for backward compatibility with existing callers
// New code should use /.netlify/functions/student-login instead

const studentLogin = require('./student-login');

exports.handler = async (event, context) => {
  console.log('[student-signin] Forwarding to student-login handler (compatibility alias)');
  return studentLogin.handler(event, context);
};
