/**
 * Hub Initialization Script
 * Loads all hub inline scripts in proper order
 * Part of Guardrails Stage 3B - externalized from inline scripts
 */

// Import theme boot first (should already be loaded via separate script tag)
// Import defensive wiring
import './hub-defensive-wiring.js';
// Import UX enhancement
import './hub-ux-enhancement.js';
// Import healthcheck
import './hub-healthcheck.js';

console.log('[Hub Init] All hub initialization modules loaded');
