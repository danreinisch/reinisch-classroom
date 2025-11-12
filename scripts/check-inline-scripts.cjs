#!/usr/bin/env node
/**
 * Check for Inline Scripts
 * Guardrails Stage 3B - CI guard to prevent regression
 * 
 * Scans HTML files for:
 * 1. Inline <script> tags with content
 * 2. Inline JavaScript event attributes (onclick, onload, etc.)
 * 
 * Usage: node scripts/check-inline-scripts.cjs
 * Exit code: 0 if clean, 1 if violations found
 */

const fs = require('fs');
const path = require('path');

// Event attributes to check for
const EVENT_ATTRIBUTES = [
  'onclick', 'ondblclick', 'onmousedown', 'onmouseup', 'onmouseover', 'onmousemove', 'onmouseout',
  'onkeydown', 'onkeypress', 'onkeyup',
  'onload', 'onunload', 'onbeforeunload',
  'onfocus', 'onblur', 'onchange', 'onsubmit', 'onreset',
  'onscroll', 'onresize',
  'oninput', 'oninvalid',
  'oncontextmenu', 'ondrag', 'ondrop'
];

// Allowed inline scripts (exceptions)
const ALLOWED_INLINE_PATTERNS = [
  // Module scripts are CSP-compliant
  /<script\s+type=["']module["']/i,
  // External scripts are fine
  /<script\s+[^>]*src=/i
];

/**
 * Recursively find all HTML files in a directory
 */
function findHtmlFiles(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  
  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory()) {
      // Skip node_modules, .git, and prototypes
      if (file === 'node_modules' || file === '.git' || file === 'prototypes') {
        continue;
      }
      findHtmlFiles(filePath, fileList);
    } else if (file.endsWith('.html')) {
      fileList.push(filePath);
    }
  }
  
  return fileList;
}

/**
 * Check if HTML file contains inline scripts with content
 */
function checkInlineScripts(filePath, content) {
  const violations = [];
  
  // Match all <script> tags
  const scriptTagRegex = /<script(?:\s+[^>]*)?>[\s\S]*?<\/script>/gi;
  const matches = content.match(scriptTagRegex) || [];
  
  for (const match of matches) {
    // Skip if it's an allowed pattern
    if (ALLOWED_INLINE_PATTERNS.some(pattern => pattern.test(match))) {
      continue;
    }
    
    // Check if there's content between <script> and </script>
    const contentMatch = match.match(/<script(?:\s+[^>]*)?>(\s*[\s\S]*?)\s*<\/script>/i);
    if (contentMatch && contentMatch[1].trim()) {
      violations.push({
        type: 'inline-script',
        snippet: match.substring(0, 100).replace(/\n/g, ' ') + '...',
        line: getLineNumber(content, match)
      });
    }
  }
  
  return violations;
}

/**
 * Check if HTML file contains inline event attributes
 */
function checkEventAttributes(filePath, content) {
  const violations = [];
  
  for (const attr of EVENT_ATTRIBUTES) {
    // Match event attribute with value
    const regex = new RegExp(`\\s${attr}\\s*=\\s*["']([^"']+)["']`, 'gi');
    let match;
    
    while ((match = regex.exec(content)) !== null) {
      violations.push({
        type: 'inline-event-attribute',
        attribute: attr,
        snippet: match[0].substring(0, 80).replace(/\n/g, ' '),
        line: getLineNumber(content, match[0])
      });
    }
  }
  
  return violations;
}

/**
 * Get approximate line number for a substring in content
 */
function getLineNumber(content, substring) {
  const index = content.indexOf(substring);
  if (index === -1) return '?';
  
  const lines = content.substring(0, index).split('\n');
  return lines.length;
}

/**
 * Main check function
 */
function main() {
  console.log('🔍 Checking for inline scripts and event attributes...\n');
  
  // Find all HTML files in site/
  const siteDir = path.join(process.cwd(), 'site');
  
  if (!fs.existsSync(siteDir)) {
    console.log('⚠️  site/ directory not found');
    process.exit(1);
  }
  
  const htmlFiles = findHtmlFiles(siteDir);
  
  if (htmlFiles.length === 0) {
    console.log('⚠️  No HTML files found to check');
    process.exit(1);
  }
  
  console.log(`Found ${htmlFiles.length} HTML files to check:\n`);
  
  let totalViolations = 0;
  const fileViolations = {};
  
  for (const file of htmlFiles) {
    const content = fs.readFileSync(file, 'utf8');
    const relativePath = path.relative(process.cwd(), file);
    
    const scriptViolations = checkInlineScripts(relativePath, content);
    const eventViolations = checkEventAttributes(relativePath, content);
    
    const allViolations = [...scriptViolations, ...eventViolations];
    
    if (allViolations.length > 0) {
      fileViolations[relativePath] = allViolations;
      totalViolations += allViolations.length;
    }
  }
  
  // Report results
  if (totalViolations === 0) {
    console.log('✅ All checks passed! No inline scripts or event attributes found.\n');
    console.log('📦 Files checked:', htmlFiles.length);
    process.exit(0);
  } else {
    console.log(`❌ Found ${totalViolations} violation(s) in ${Object.keys(fileViolations).length} file(s):\n`);
    
    for (const [file, violations] of Object.entries(fileViolations)) {
      console.log(`📄 ${file}:`);
      
      for (const violation of violations) {
        if (violation.type === 'inline-script') {
          console.log(`   Line ~${violation.line}: Inline <script> with content`);
          console.log(`   Snippet: ${violation.snippet}`);
        } else if (violation.type === 'inline-event-attribute') {
          console.log(`   Line ~${violation.line}: Inline event attribute: ${violation.attribute}`);
          console.log(`   Snippet: ${violation.snippet}`);
        }
        console.log('');
      }
    }
    
    console.log('⚠️  To fix: Move inline scripts to external .js files and use addEventListener for events.\n');
    console.log('   See docs/GUARDRAILS.md for guidance.\n');
    
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}

module.exports = { checkInlineScripts, checkEventAttributes };
