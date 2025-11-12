// IEP Progress CSV validation rules
// Uses validation.js utilities to validate CSV structure and content

import {
  maxLen,
  matchRegex,
  safeTrim,
  toDateISO,
  toNumberInRange,
  sanitizeText,
  csvHeaderMap
} from './validation.js';

/**
 * Build IEP CSV validator with configurable limits
 * @param {Object} config
 * @param {number} config.maxBytes - Max file size in bytes (default 1MB)
 * @param {number} config.maxRows - Max number of rows (default 2000)
 * @param {number} config.maxErrorRate - Max percentage of invalid rows (default 0.10 = 10%)
 * @returns {Object} Validator functions
 */
export function buildIEPValidator(config = {}) {
  const {
    maxBytes = 1_000_000,
    maxRows = 2000,
    maxErrorRate = 0.10
  } = config;

  /**
   * Validate file constraints (type, size)
   * @param {File} file
   * @returns {Promise<{ ok: boolean, errors?: string[] }>}
   */
  async function validateFile(file) {
    const errors = [];

    // Check file type
    if (!file.type.includes('csv') && !file.name.endsWith('.csv')) {
      errors.push('File must be a CSV file (text/csv)');
    }

    // Check file size
    if (file.size > maxBytes) {
      const sizeMB = (maxBytes / 1_000_000).toFixed(1);
      errors.push(`File size exceeds ${sizeMB} MB limit`);
    }

    return { ok: errors.length === 0, errors };
  }

  /**
   * Validate CSV headers and rows
   * @param {string[]} headers - CSV headers
   * @param {Array<Object>} rows - Parsed CSV rows
   * @returns {{ ok: boolean, normalizedRows?: Array, errors?: Array, errorSummary?: Object }}
   */
  function validateRows(headers, rows) {
    const errors = [];
    const rowErrors = [];
    const normalizedRows = [];

    // Required headers: date, student_code, goal_code, and either percent or value
    const requiredHeaders = ['date', 'student_code', 'goal_code', 'collected_by'];
    
    // Check for required headers
    const headerResult = csvHeaderMap(headers, requiredHeaders);
    if (!headerResult.ok) {
      errors.push(headerResult.error);
      return { ok: false, errors };
    }

    // Check for percent OR value column
    const hasPercent = headers.some(h => safeTrim(h).toLowerCase() === 'percent');
    const hasValue = headers.some(h => safeTrim(h).toLowerCase() === 'value');
    
    if (!hasPercent && !hasValue) {
      errors.push('CSV must have either "percent" or "value" column');
      return { ok: false, errors };
    }

    // Empty file check
    if (rows.length === 0) {
      errors.push('CSV file is empty or contains only headers');
      return { ok: false, errors };
    }

    // Max rows check
    if (rows.length > maxRows) {
      errors.push(`CSV contains ${rows.length} rows, exceeding limit of ${maxRows}`);
      return { ok: false, errors };
    }

    // Validate each row
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2; // Row number in spreadsheet (header is row 1)
      const rowError = { row: rowNum, errors: [] };

      // Validate date
      const dateStr = safeTrim(row.date || '');
      if (!dateStr) {
        rowError.errors.push('date is required');
      } else {
        const dateResult = toDateISO(dateStr);
        if (!dateResult.ok) {
          rowError.errors.push(`date: ${dateResult.error}`);
        } else {
          row.date = dateResult.date; // Normalize to ISO format
        }
      }

      // Validate student_code (A-Z, 0-9, _, -, 1-32 chars)
      const studentCode = safeTrim(row.student_code || '');
      if (!studentCode) {
        rowError.errors.push('student_code is required');
      } else if (!maxLen(studentCode, 32)) {
        rowError.errors.push('student_code must be 32 characters or less');
      } else if (!matchRegex(studentCode, /^[A-Za-z0-9_-]+$/)) {
        rowError.errors.push('student_code must contain only A-Z, 0-9, _, -');
      } else {
        row.student_code = studentCode;
      }

      // Validate goal_code (same rules as student_code)
      const goalCode = safeTrim(row.goal_code || '');
      if (!goalCode) {
        rowError.errors.push('goal_code is required');
      } else if (!maxLen(goalCode, 32)) {
        rowError.errors.push('goal_code must be 32 characters or less');
      } else if (!matchRegex(goalCode, /^[A-Za-z0-9_-]+$/)) {
        rowError.errors.push('goal_code must contain only A-Z, 0-9, _, -');
      } else {
        row.goal_code = goalCode;
      }

      // Validate percent or value (0-100)
      const percentStr = safeTrim(row.percent || '');
      const valueStr = safeTrim(row.value || '');
      const numStr = percentStr || valueStr;
      
      if (!numStr) {
        rowError.errors.push('percent or value is required');
      } else {
        const numResult = toNumberInRange(numStr, 0, 100);
        if (!numResult.ok) {
          rowError.errors.push(`percent/value: ${numResult.error}`);
        } else {
          // Store as normalized value
          if (hasPercent) {
            row.percent = numResult.value;
          }
          if (hasValue) {
            row.value = numResult.value;
          }
        }
      }

      // Validate collected_by (1-64 chars)
      const collectedBy = safeTrim(row.collected_by || '');
      if (!collectedBy) {
        rowError.errors.push('collected_by is required');
      } else if (!maxLen(collectedBy, 64)) {
        rowError.errors.push('collected_by must be 64 characters or less');
      } else {
        row.collected_by = collectedBy;
      }

      // Validate optional: notes (<=500 chars, sanitized)
      if (row.notes !== undefined && row.notes !== null) {
        const notes = safeTrim(row.notes);
        if (!maxLen(notes, 500)) {
          rowError.errors.push('notes must be 500 characters or less');
        } else {
          row.notes = sanitizeText(notes);
        }
      }

      // Validate optional: method (sanitized)
      if (row.method !== undefined && row.method !== null) {
        row.method = sanitizeText(safeTrim(row.method));
      }

      // Validate optional: source (sanitized)
      if (row.source !== undefined && row.source !== null) {
        row.source = sanitizeText(safeTrim(row.source));
      }

      if (rowError.errors.length > 0) {
        rowErrors.push(rowError);
      } else {
        normalizedRows.push(row);
      }
    }

    // Calculate error rate
    const errorRate = rowErrors.length / rows.length;
    
    if (errorRate > maxErrorRate) {
      const errorPercent = (errorRate * 100).toFixed(1);
      const maxPercent = (maxErrorRate * 100).toFixed(0);
      errors.push(`Too many invalid rows: ${errorPercent}% (max ${maxPercent}%)`);
      
      return {
        ok: false,
        errors,
        errorSummary: {
          totalRows: rows.length,
          validRows: normalizedRows.length,
          invalidRows: rowErrors.length,
          errorRate: errorPercent,
          rowErrors: rowErrors.slice(0, 20) // First 20 errors
        }
      };
    }

    // Success - some rows may have errors but under threshold
    return {
      ok: true,
      normalizedRows,
      errorSummary: rowErrors.length > 0 ? {
        totalRows: rows.length,
        validRows: normalizedRows.length,
        invalidRows: rowErrors.length,
        errorRate: (errorRate * 100).toFixed(1),
        rowErrors: rowErrors.slice(0, 20) // First 20 errors
      } : null
    };
  }

  return {
    validateFile,
    validateRows
  };
}
