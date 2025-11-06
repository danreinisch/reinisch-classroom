// Simple retry helper with jitter for transient network errors
/**
 * Retry an async function with exponential backoff and jitter
 * @param {Function} fn - Async function to retry
 * @param {Object} options - Retry options
 * @param {number} options.retries - Number of retries (default: 2)
 * @param {number} options.baseDelayMs - Base delay in milliseconds (default: 250)
 * @returns {Promise<*>} Result of the async function
 */
export async function withRetry(fn, { retries = 2, baseDelayMs = 250 } = {}) {
  let attempt = 0;
  let lastErr;
  
  while (attempt <= retries) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      
      // Don't retry on the last attempt
      if (attempt === retries) {
        break;
      }
      
      // Exponential backoff with jitter
      const delay = baseDelayMs * Math.pow(2, attempt) + Math.floor(Math.random() * 100);
      await new Promise(r => setTimeout(r, delay));
      attempt++;
    }
  }
  
  throw lastErr;
}
