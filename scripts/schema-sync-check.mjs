#!/usr/bin/env node
/**
 * Schema Sync Check Script
 * 
 * Compares the production schema dump (supabase:schema_full_dump.sql) against
 * code references to detect mismatches between schema and codebase.
 * 
 * Usage:
 *   node scripts/schema-sync-check.mjs
 * 
 * Exit codes:
 *   0 - All checks passed
 *   1 - Mismatches found
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');

// Configuration
const SCHEMA_FILE = join(rootDir, 'supabase:schema_full_dump.sql');
const CODE_FILES = [
  join(rootDir, 'web/data-adapter.js'),
  join(rootDir, 'netlify/functions/_lib/supa.js'),
  join(rootDir, 'netlify/functions/teacher-login.js'),
  join(rootDir, 'netlify/functions/admin-session.js'),
  join(rootDir, 'netlify/functions/assignments-list.js'),
  join(rootDir, 'netlify/functions/submissions-create.js'),
];

// Parse tables from schema
function extractTablesFromSchema(schemaContent) {
  const tables = new Set();
  const regex = /CREATE TABLE IF NOT EXISTS\s+"public"\."([^"]+)"/gi;
  let match;
  while ((match = regex.exec(schemaContent)) !== null) {
    tables.add(match[1]);
  }
  return tables;
}

// Parse functions from schema
function extractFunctionsFromSchema(schemaContent) {
  const functions = new Map(); // name -> array of signatures
  const regex = /CREATE OR REPLACE FUNCTION\s+"public"\."([^"]+)"\(([^)]*)\)/gi;
  let match;
  while ((match = regex.exec(schemaContent)) !== null) {
    const name = match[1];
    const params = match[2] || '';
    // Parse parameter names
    const paramNames = params
      .split(',')
      .map(p => p.trim().split(/\s+/)[0])
      .filter(p => p && p !== '');
    
    if (!functions.has(name)) {
      functions.set(name, []);
    }
    functions.get(name).push(paramNames);
  }
  return functions;
}

// Parse table references from code
function extractTableRefsFromCode(codeContent) {
  const tables = new Set();
  
  // Match .from('tablename') patterns
  const fromRegex = /\.from\(['"]([^'"]+)['"]\)/g;
  let match;
  while ((match = fromRegex.exec(codeContent)) !== null) {
    const table = match[1];
    // Skip storage paths and special patterns
    if (!table.includes('/') && table !== 'assignments') {
      tables.add(table);
    } else if (table === 'assignments') {
      tables.add(table);
    }
  }
  
  // Match /rest/v1/tablename patterns (but not /rest/v1/rpc/)
  const restRegex = /\/rest\/v1\/(?!rpc\/)([a-z_]+)/gi;
  while ((match = restRegex.exec(codeContent)) !== null) {
    tables.add(match[1]);
  }
  
  return tables;
}

// Parse RPC calls from code
function extractRpcCallsFromCode(codeContent) {
  const rpcs = new Map(); // name -> array of param objects
  
  // Match .rpc('functionname', { params }) patterns
  const rpcRegex = /\.rpc\(['"]([^'"]+)['"],\s*\{([^}]+)\}/gs;
  let match;
  while ((match = rpcRegex.exec(codeContent)) !== null) {
    const name = match[1];
    const paramsBlock = match[2];
    
    // Extract parameter names from the object
    const paramNameRegex = /(\w+)\s*:/g;
    const params = [];
    let paramMatch;
    while ((paramMatch = paramNameRegex.exec(paramsBlock)) !== null) {
      params.push(paramMatch[1]);
    }
    
    if (!rpcs.has(name)) {
      rpcs.set(name, []);
    }
    rpcs.get(name).push(params);
  }
  
  // Also match rpc('/rest/v1/rpc/' + functionName) patterns from supa.js helper
  // This is called from teacher-login.js and admin-session.js
  
  return rpcs;
}

// Main check function
function runChecks() {
  console.log('🔍 Schema Sync Check\n');
  
  // Check if schema file exists
  if (!existsSync(SCHEMA_FILE)) {
    console.error('❌ Schema file not found:', SCHEMA_FILE);
    process.exit(1);
  }
  
  const schemaContent = readFileSync(SCHEMA_FILE, 'utf8');
  const schemaTables = extractTablesFromSchema(schemaContent);
  const schemaFunctions = extractFunctionsFromSchema(schemaContent);
  
  console.log(`📊 Schema Summary:`);
  console.log(`   Tables: ${schemaTables.size}`);
  console.log(`   Functions: ${schemaFunctions.size}\n`);
  
  // Aggregate code references
  const codeTables = new Set();
  const codeRpcs = new Map();
  
  for (const filePath of CODE_FILES) {
    if (!existsSync(filePath)) {
      console.log(`⚠️  Code file not found (skipping): ${filePath}`);
      continue;
    }
    
    const codeContent = readFileSync(filePath, 'utf8');
    
    // Extract table references
    const fileTables = extractTableRefsFromCode(codeContent);
    fileTables.forEach(t => codeTables.add(t));
    
    // Extract RPC calls
    const fileRpcs = extractRpcCallsFromCode(codeContent);
    fileRpcs.forEach((calls, name) => {
      if (!codeRpcs.has(name)) {
        codeRpcs.set(name, []);
      }
      codeRpcs.get(name).push(...calls);
    });
  }
  
  let hasErrors = false;
  
  // Check for missing tables
  console.log('📋 Table Reference Check:');
  const missingTables = [];
  codeTables.forEach(table => {
    if (!schemaTables.has(table)) {
      missingTables.push(table);
    }
  });
  
  if (missingTables.length > 0) {
    console.log(`   ❌ Tables referenced in code but NOT in schema:`);
    missingTables.forEach(t => console.log(`      - ${t}`));
    hasErrors = true;
  } else {
    console.log(`   ✅ All ${codeTables.size} referenced tables exist in schema`);
  }
  
  // Check for RPC parameter mismatches
  console.log('\n📋 RPC Call Check:');
  const rpcIssues = [];
  
  codeRpcs.forEach((calls, name) => {
    if (!schemaFunctions.has(name)) {
      rpcIssues.push({ name, issue: 'Function not found in schema' });
    } else {
      // Check parameter names
      const schemaParams = schemaFunctions.get(name);
      calls.forEach(callParams => {
        // Find matching signature
        let matched = false;
        for (const sigParams of schemaParams) {
          // Check if call params match any signature
          const allMatch = callParams.every(p => sigParams.includes(p) || sigParams.includes(p.replace(/^p_/, '')));
          if (allMatch) {
            matched = true;
            break;
          }
        }
        if (!matched && callParams.length > 0) {
          rpcIssues.push({
            name,
            issue: `Parameter mismatch. Code uses: [${callParams.join(', ')}], Schema has: [${schemaParams.map(s => s.join(', ')).join(' OR ')}]`
          });
        }
      });
    }
  });
  
  if (rpcIssues.length > 0) {
    console.log(`   ⚠️  RPC issues found:`);
    rpcIssues.forEach(r => console.log(`      - ${r.name}: ${r.issue}`));
    // Note: This is a warning, not an error, as some mismatches might be intentional
  } else {
    console.log(`   ✅ All ${codeRpcs.size} RPC calls look valid`);
  }
  
  // Summary
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  if (hasErrors) {
    console.log('❌ Schema sync check FAILED');
    console.log('\nTo fix missing tables:');
    console.log('  1. Check if migrations exist in supabase/migrations/');
    console.log('  2. Apply pending migrations to production');
    console.log('  3. Re-export schema with: supabase db dump -f supabase:schema_full_dump.sql');
    process.exit(1);
  } else {
    console.log('✅ Schema sync check PASSED');
    if (rpcIssues.length > 0) {
      console.log('   (Warnings were found - review RPC issues above)');
    }
    process.exit(0);
  }
}

runChecks();
