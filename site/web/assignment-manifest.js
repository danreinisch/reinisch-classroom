// assignment-manifest.js - Assignment manifest API: detect questions, validate, load/save
// Handles HTML/TXT/Google Forms question detection and manifest management

import { normalizeSkillTag } from './codebook.js';

const MANIFEST_NS = 'rc_unified_assignment_manifests';

/**
 * Validate manifest against schema (basic validation)
 */
export function validateManifest(manifest) {
  const errors = [];
  
  if (!manifest) {
    errors.push('Manifest is null or undefined');
    return { valid: false, errors };
  }

  if (!manifest.assignment_id || typeof manifest.assignment_id !== 'string') {
    errors.push('assignment_id is required and must be a string');
  }

  if (!manifest.assignment_type || !['html', 'google_form', 'txt'].includes(manifest.assignment_type)) {
    errors.push('assignment_type must be one of: html, google_form, txt');
  }

  if (!Array.isArray(manifest.questions)) {
    errors.push('questions must be an array');
  } else {
    manifest.questions.forEach((q, idx) => {
      if (!q.q_ref || typeof q.q_ref !== 'string') {
        errors.push(`Question ${idx}: q_ref is required and must be a string`);
      }
      if (q.skill_tags && !Array.isArray(q.skill_tags)) {
        errors.push(`Question ${idx}: skill_tags must be an array`);
      }
    });
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

// Constants for question detection
const MIN_QUESTION_LENGTH = 10;
const MAX_QUESTION_LENGTH = 500;

/**
 * Detect questions from HTML content
 * Looks for data-qref attributes first, then auto-numbers block-level elements
 */
export function detectQuestionsFromHTML(htmlContent) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlContent, 'text/html');
  const questions = [];

  // First pass: look for elements with data-qref attribute
  const explicitQuestions = doc.querySelectorAll('[data-qref]');
  if (explicitQuestions.length > 0) {
    explicitQuestions.forEach((el, idx) => {
      const q_ref = el.getAttribute('data-qref');
      const label = el.textContent.trim().substring(0, 100); // First 100 chars as label
      questions.push({
        q_ref,
        label: label || `Question ${idx + 1}`,
        skill_tags: [],
        points: 1,
        default_goal_codes: [],
        per_student_overrides: {}
      });
    });
    return questions;
  }

  // Second pass: auto-number block-level elements (p, div, section, article, li)
  const blockElements = doc.querySelectorAll('p, div.question, section, article, li');
  blockElements.forEach((el, idx) => {
    // Skip if it's likely a container with nested questions
    const text = el.textContent.trim();
    if (text.length > MIN_QUESTION_LENGTH && text.length < MAX_QUESTION_LENGTH) {
      const q_ref = `Q${idx + 1}`;
      const label = text.substring(0, 100);
      questions.push({
        q_ref,
        label: label || q_ref,
        skill_tags: [],
        points: 1,
        default_goal_codes: [],
        per_student_overrides: {}
      });
    }
  });

  return questions;
}

/**
 * Detect questions from TXT content
 * Auto-numbers paragraphs/lines
 */
export function detectQuestionsFromTXT(txtContent) {
  const questions = [];
  const lines = txtContent.split('\n').filter(line => line.trim().length > 10);
  
  lines.forEach((line, idx) => {
    const q_ref = `Q${idx + 1}`;
    const label = line.trim().substring(0, 100);
    questions.push({
      q_ref,
      label: label || q_ref,
      skill_tags: [],
      points: 1,
      default_goal_codes: [],
      per_student_overrides: {}
    });
  });

  return questions;
}

/**
 * Detect questions from Google Forms CSV headers
 * CSV first row contains column headers; question columns start after standard fields
 * Note: Standard columns vary based on Google Forms settings
 */
export function detectQuestionsFromGoogleFormCSV(csvHeaders) {
  const questions = [];
  
  // Common Google Forms standard columns (exact matches, case-insensitive)
  const standardColumns = [
    'timestamp', 
    'email', 
    'email address', 
    'score', 
    'username', 
    'name',
    'first name',
    'last name',
    'full name',
    'student id',
    'form id',
    'response id'
  ];
  
  csvHeaders.forEach((header, idx) => {
    const normalized = header.toLowerCase().trim();
    
    // Skip standard columns (exact match only to avoid false positives)
    if (standardColumns.includes(normalized)) {
      return;
    }

    // Use header as both q_ref and label
    questions.push({
      q_ref: header,
      label: header.substring(0, 100),
      skill_tags: [],
      points: 1,
      default_goal_codes: [],
      per_student_overrides: {}
    });
  });

  return questions;
}

/**
 * Save manifest to localStorage
 */
export function saveManifest(manifest) {
  const validation = validateManifest(manifest);
  if (!validation.valid) {
    console.error('Invalid manifest:', validation.errors);
    return { success: false, errors: validation.errors };
  }

  try {
    // Load existing manifests
    const stored = localStorage.getItem(MANIFEST_NS);
    const manifests = stored ? JSON.parse(stored) : {};

    // Update manifest with timestamp
    manifest.metadata = {
      ...manifest.metadata,
      updated_at: new Date().toISOString()
    };

    // Save by assignment_id
    manifests[manifest.assignment_id] = manifest;
    localStorage.setItem(MANIFEST_NS, JSON.stringify(manifests));

    return { success: true };
  } catch (err) {
    console.error('Error saving manifest:', err);
    return { success: false, errors: [err.message] };
  }
}

/**
 * Load manifest from localStorage by assignment_id
 */
export function loadManifest(assignment_id) {
  try {
    const stored = localStorage.getItem(MANIFEST_NS);
    if (!stored) return null;
    
    const manifests = JSON.parse(stored);
    return manifests[assignment_id] || null;
  } catch (err) {
    console.error('Error loading manifest:', err);
    return null;
  }
}

/**
 * Load all manifests from localStorage
 */
export function loadAllManifests() {
  try {
    const stored = localStorage.getItem(MANIFEST_NS);
    if (!stored) return {};
    return JSON.parse(stored);
  } catch (err) {
    console.error('Error loading manifests:', err);
    return {};
  }
}

/**
 * Delete manifest from localStorage
 */
export function deleteManifest(assignment_id) {
  try {
    const stored = localStorage.getItem(MANIFEST_NS);
    if (!stored) return true;
    
    const manifests = JSON.parse(stored);
    delete manifests[assignment_id];
    localStorage.setItem(MANIFEST_NS, JSON.stringify(manifests));
    return true;
  } catch (err) {
    console.error('Error deleting manifest:', err);
    return false;
  }
}

/**
 * Create a new empty manifest for an assignment
 */
export function createManifest(assignment_id, assignment_type, questions = []) {
  return {
    assignment_id,
    assignment_type,
    questions,
    metadata: {
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }
  };
}

/**
 * Resolve goal codes for a specific student and question
 * Resolution order: per_student_overrides → codebook → default_goal_codes
 */
export function resolveGoalCodes(question, student_code, codebook) {
  // 1. Check per-student overrides
  if (question.per_student_overrides && question.per_student_overrides[student_code]) {
    const codes = question.per_student_overrides[student_code];
    if (codes && codes.length > 0) {
      return codes;
    }
  }

  // 2. Check codebook for each skill tag
  if (question.skill_tags && question.skill_tags.length > 0 && codebook && codebook[student_code]) {
    const resolvedCodes = [];
    for (const tag of question.skill_tags) {
      const codes = codebook[student_code][tag];
      if (codes && codes.length > 0) {
        resolvedCodes.push(...codes);
      }
    }
    if (resolvedCodes.length > 0) {
      return [...new Set(resolvedCodes)]; // Remove duplicates
    }
  }

  // 3. Fall back to default goal codes
  if (question.default_goal_codes && question.default_goal_codes.length > 0) {
    return question.default_goal_codes;
  }

  return [];
}

/**
 * Generate preview grid data for UI display
 */
export function generatePreviewGrid(manifest, codebook, students) {
  const grid = [];

  for (const question of manifest.questions) {
    const row = {
      q_ref: question.q_ref,
      label: question.label,
      skill_tags: question.skill_tags.join(', '),
      default_codes: question.default_goal_codes.join(', '),
      overrides: []
    };

    // Add override information
    if (question.per_student_overrides) {
      for (const [student_code, codes] of Object.entries(question.per_student_overrides)) {
        if (codes && codes.length > 0) {
          row.overrides.push(`${student_code}: ${codes.join(', ')}`);
        }
      }
    }

    grid.push(row);
  }

  return grid;
}
