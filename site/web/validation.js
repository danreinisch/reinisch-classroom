// Shared client-side validation and sanitization utilities
// Used for CSV imports and form validation

/**
 * Check if value is a string
 * @param {*} value 
 * @returns {boolean}
 */
export function isString(value) {
  return typeof value === 'string';
}

/**
 * Check if string is non-empty after trimming
 * @param {string} value 
 * @returns {boolean}
 */
export function nonEmpty(value) {
  return isString(value) && value.trim().length > 0;
}

/**
 * Check if string length is within max length
 * @param {string} value 
 * @param {number} max 
 * @returns {boolean}
 */
export function maxLen(value, max) {
  return isString(value) && value.length <= max;
}

/**
 * Check if string matches regex pattern
 * @param {string} value 
 * @param {RegExp} regex 
 * @returns {boolean}
 */
export function matchRegex(value, regex) {
  return isString(value) && regex.test(value);
}

/**
 * Safely trim string, returns empty string if not a string
 * @param {*} value 
 * @returns {string}
 */
export function safeTrim(value) {
  return isString(value) ? value.trim() : '';
}

/**
 * Convert date to ISO format (yyyy-mm-dd)
 * Accepts ISO (yyyy-mm-dd) or US (MM/DD/YYYY) format
 * @param {string} dateStr 
 * @returns {{ ok: boolean, date?: string, error?: string }}
 */
export function toDateISO(dateStr) {
  if (!isString(dateStr)) {
    return { ok: false, error: 'Date must be a string' };
  }

  const trimmed = dateStr.trim();
  
  // Try ISO format: yyyy-mm-dd
  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    const date = new Date(year, parseInt(month, 10) - 1, parseInt(day, 10));
    
    // Validate date is real
    if (date.getFullYear() === parseInt(year, 10) &&
        date.getMonth() === parseInt(month, 10) - 1 &&
        date.getDate() === parseInt(day, 10)) {
      return { ok: true, date: trimmed };
    }
    return { ok: false, error: 'Invalid date' };
  }

  // Try US format: MM/DD/YYYY
  const usMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (usMatch) {
    const [, month, day, year] = usMatch;
    const date = new Date(year, parseInt(month, 10) - 1, parseInt(day, 10));
    
    // Validate date is real
    if (date.getFullYear() === parseInt(year, 10) &&
        date.getMonth() === parseInt(month, 10) - 1 &&
        date.getDate() === parseInt(day, 10)) {
      // Convert to ISO format
      const isoYear = year;
      const isoMonth = month.padStart(2, '0');
      const isoDay = day.padStart(2, '0');
      return { ok: true, date: `${isoYear}-${isoMonth}-${isoDay}` };
    }
    return { ok: false, error: 'Invalid date' };
  }

  return { ok: false, error: 'Date must be yyyy-mm-dd or MM/DD/YYYY' };
}

/**
 * Convert string to number within range
 * @param {string} value 
 * @param {number} min 
 * @param {number} max 
 * @returns {{ ok: boolean, value?: number, error?: string }}
 */
export function toNumberInRange(value, min, max) {
  const trimmed = safeTrim(value);
  
  if (trimmed === '') {
    return { ok: false, error: 'Value is required' };
  }

  const num = parseFloat(trimmed);
  
  if (isNaN(num)) {
    return { ok: false, error: 'Value must be a number' };
  }

  if (num < min || num > max) {
    return { ok: false, error: `Value must be between ${min} and ${max}` };
  }

  return { ok: true, value: num };
}

/**
 * Sanitize text by escaping HTML special characters
 * @param {string} text 
 * @returns {string}
 */
export function sanitizeText(text) {
  if (!isString(text)) {
    return '';
  }
  
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Create a case-insensitive header index map from CSV headers
 * @param {string[]} headers - Actual headers from CSV
 * @param {string[]} expectedHeaders - Expected header names (case-insensitive)
 * @returns {{ ok: boolean, map?: Object, missing?: string[], error?: string }}
 */
export function csvHeaderMap(headers, expectedHeaders) {
  if (!Array.isArray(headers) || !Array.isArray(expectedHeaders)) {
    return { ok: false, error: 'Headers must be arrays' };
  }

  const map = {};
  const lowerHeaders = headers.map(h => safeTrim(h).toLowerCase());
  const missing = [];

  for (const expected of expectedHeaders) {
    const expectedLower = expected.toLowerCase();
    const index = lowerHeaders.indexOf(expectedLower);
    
    if (index === -1) {
      missing.push(expected);
    } else {
      map[expected] = index;
    }
  }

  if (missing.length > 0) {
    return { ok: false, missing, error: `Missing required headers: ${missing.join(', ')}` };
  }

  return { ok: true, map };
}
