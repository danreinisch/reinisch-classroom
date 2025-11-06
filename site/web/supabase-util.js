// Reliability helpers for Supabase requests
// Provides retry logic with exponential backoff and jitter for transient failures

/**
 * Exponential backoff with jitter
 * @param {number} attempt - Current attempt number (0-indexed)
 * @param {number} baseDelayMs - Base delay in milliseconds
 * @returns {number} Delay in milliseconds with jitter
 */
function calculateBackoff(attempt, baseDelayMs = 200) {
  // Exponential backoff: baseDelay * 2^attempt
  const exponentialDelay = baseDelayMs * Math.pow(2, attempt);
  // Add random jitter: ±25% of the exponential delay
  const jitter = exponentialDelay * 0.25 * (Math.random() * 2 - 1);
  return Math.floor(exponentialDelay + jitter);
}

/**
 * Retry wrapper for async functions with exponential backoff and jitter
 * Useful for handling transient network failures, rate limits, or temporary service issues
 * 
 * @param {Function} asyncFn - Async function to execute
 * @param {Object} options - Retry options
 * @param {number} options.retries - Number of retry attempts (default: 3)
 * @param {number} options.baseDelayMs - Base delay in milliseconds (default: 200)
 * @param {Function} options.shouldRetry - Optional predicate to determine if error is retryable
 * @returns {Promise<any>} Result of asyncFn
 * @throws {Error} Last error if all retries fail
 * 
 * @example
 * // Basic usage
 * const data = await withRetry(() => supabase.from('students').select());
 * 
 * @example
 * // Custom retry configuration
 * const data = await withRetry(
 *   () => supabase.from('students').select(),
 *   { retries: 5, baseDelayMs: 300 }
 * );
 * 
 * @example
 * // Custom retry predicate
 * const data = await withRetry(
 *   () => supabase.from('students').select(),
 *   {
 *     retries: 3,
 *     shouldRetry: (err) => err.message.includes('timeout') || err.message.includes('ECONNRESET')
 *   }
 * );
 */
export async function withRetry(asyncFn, options = {}) {
  const {
    retries = 3,
    baseDelayMs = 200,
    shouldRetry = (err) => {
      // Default: retry on network errors, timeouts, rate limits
      const message = err?.message?.toLowerCase() || '';
      const code = err?.code?.toLowerCase() || '';
      
      // Retry on common transient errors
      return (
        message.includes('timeout') ||
        message.includes('network') ||
        message.includes('econnreset') ||
        message.includes('econnrefused') ||
        message.includes('rate limit') ||
        code.includes('pgrst') || // PostgREST errors (Supabase)
        code.includes('etimedout') ||
        code.includes('enotfound')
      );
    }
  } = options;
  
  let lastError;
  
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await asyncFn();
    } catch (err) {
      lastError = err;
      
      // Don't retry on last attempt or if error is not retryable
      if (attempt === retries || !shouldRetry(err)) {
        throw err;
      }
      
      // Calculate backoff delay
      const delay = calculateBackoff(attempt, baseDelayMs);
      
      console.warn(
        `[withRetry] Attempt ${attempt + 1}/${retries + 1} failed: ${err.message}. ` +
        `Retrying in ${delay}ms...`
      );
      
      // Wait before retry
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  // This should never be reached due to throw in loop, but TypeScript might complain
  throw lastError;
}

/**
 * Batch retry wrapper for multiple async operations
 * Retries each operation independently with exponential backoff
 * 
 * @param {Array<Function>} asyncFns - Array of async functions to execute
 * @param {Object} options - Retry options (same as withRetry)
 * @returns {Promise<Array<any>>} Array of results
 * 
 * @example
 * const results = await withRetryBatch([
 *   () => supabase.from('students').select(),
 *   () => supabase.from('goals').select(),
 *   () => supabase.from('classes').select()
 * ]);
 */
export async function withRetryBatch(asyncFns, options = {}) {
  return Promise.all(asyncFns.map(fn => withRetry(fn, options)));
}
