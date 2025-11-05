// codebook.js - Build and query student→skill_tag→goal_code mappings from IEP CSV
// Local-first storage with future Supabase sync support

const CODEBOOK_NS = 'rc_unified_codebook';

/**
 * Normalize a Goal Area label to a skill tag (snake_case, lowercase, alphanumeric+underscore only)
 * Example: "Reading Comprehension" → "reading_comprehension"
 */
export function normalizeSkillTag(goalArea) {
  if (!goalArea || typeof goalArea !== 'string') return '';
  return goalArea
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s]/g, '') // remove non-alphanumeric except spaces
    .replace(/\s+/g, '_'); // spaces to underscore
}

/**
 * Build codebook from IEP CSV data
 * Expected CSV format: Student Code, Student Name, Goal Area, Goal Code, Goal Description, ...
 * Returns: { student_code → { skill_tag → [goal_codes] } }
 */
export function buildCodebookFromIEPCsv(csvData) {
  const codebook = {};
  const stats = {
    students: new Set(),
    skills: new Set(),
    entries: 0,
    errors: []
  };

  // Skip header row (index 0)
  for (let i = 1; i < csvData.length; i++) {
    const row = csvData[i];
    
    // Expect at least: [student_code, student_name, goal_area, goal_code, ...]
    if (row.length < 4) {
      stats.errors.push(`Row ${i + 1}: insufficient columns (expected 4+, got ${row.length})`);
      continue;
    }

    const [student_code, student_name, goal_area, goal_code] = row.map(cell => 
      typeof cell === 'string' ? cell.trim() : String(cell || '').trim()
    );

    // Skip rows with empty critical fields
    if (!student_code || !goal_area || !goal_code) {
      continue;
    }

    const skill_tag = normalizeSkillTag(goal_area);
    if (!skill_tag) {
      stats.errors.push(`Row ${i + 1}: could not normalize goal_area "${goal_area}"`);
      continue;
    }

    // Initialize nested structure
    if (!codebook[student_code]) {
      codebook[student_code] = {};
    }
    if (!codebook[student_code][skill_tag]) {
      codebook[student_code][skill_tag] = [];
    }

    // Add goal code if not already present
    if (!codebook[student_code][skill_tag].includes(goal_code)) {
      codebook[student_code][skill_tag].push(goal_code);
      stats.entries++;
    }

    stats.students.add(student_code);
    stats.skills.add(skill_tag);
  }

  return {
    codebook,
    stats: {
      students: stats.students.size,
      skills: stats.skills.size,
      entries: stats.entries,
      errors: stats.errors
    }
  };
}

/**
 * Save codebook to localStorage
 */
export function saveCodebook(codebook) {
  try {
    localStorage.setItem(CODEBOOK_NS, JSON.stringify({
      codebook,
      updated_at: new Date().toISOString()
    }));
    return true;
  } catch (err) {
    console.error('Error saving codebook:', err);
    return false;
  }
}

/**
 * Load codebook from localStorage
 */
export function loadCodebook() {
  try {
    const stored = localStorage.getItem(CODEBOOK_NS);
    if (!stored) return null;
    const data = JSON.parse(stored);
    return data.codebook || null;
  } catch (err) {
    console.error('Error loading codebook:', err);
    return null;
  }
}

/**
 * Get goal codes for a specific student and skill tag
 * Returns array of goal codes, or empty array if not found
 */
export function getGoalCodesFor(student_code, skill_tag) {
  const codebook = loadCodebook();
  if (!codebook || !codebook[student_code]) return [];
  return codebook[student_code][skill_tag] || [];
}

/**
 * Get all skill tags available in the codebook (for autocomplete/suggestions)
 */
export function getAllSkillTags() {
  const codebook = loadCodebook();
  if (!codebook) return [];
  
  const tags = new Set();
  for (const student of Object.values(codebook)) {
    for (const tag of Object.keys(student)) {
      tags.add(tag);
    }
  }
  
  return Array.from(tags).sort();
}

/**
 * Get summary of codebook contents
 */
export function getCodebookSummary() {
  const codebook = loadCodebook();
  if (!codebook) {
    return { students: 0, skills: 0, entries: 0 };
  }

  const students = Object.keys(codebook).length;
  const skills = new Set();
  let entries = 0;

  for (const studentMap of Object.values(codebook)) {
    for (const [tag, codes] of Object.entries(studentMap)) {
      skills.add(tag);
      entries += codes.length;
    }
  }

  return {
    students,
    skills: skills.size,
    entries
  };
}
