// Utility functions for Supabase operations

/**
 * Retry a function with exponential backoff and jitter
 * @param {Function} fn - Async function to retry
 * @param {Object} options - Retry options
 * @param {number} options.retries - Number of retries (default: 2)
 * @param {number} options.baseDelayMs - Base delay in milliseconds (default: 250)
 * @returns {Promise<*>} Result of the function
 */
export async function withRetry(fn, { retries = 2, baseDelayMs = 250 } = {}) {
  let lastError;
  
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      // Don't retry on last attempt
      if (attempt === retries) {
        break;
      }
      
      // Don't retry certain errors (configuration, authorization, etc.)
      if (error.message === 'supabase-not-configured' ||
          error.code === 'PGRST301' || // Auth required
          error.code === 'PGRST116' || // JWT invalid
          error.code === '42501') {    // Insufficient privilege
        break;
      }
      
      // Calculate delay with exponential backoff and jitter
      const exponentialDelay = baseDelayMs * Math.pow(2, attempt);
      const jitter = Math.random() * baseDelayMs;
      const delay = exponentialDelay + jitter;
      
      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  // All retries exhausted, throw the last error
  throw lastError;
}
