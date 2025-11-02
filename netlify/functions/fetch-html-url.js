// Netlify Function to fetch HTML from external URL
// This bypasses CORS restrictions for the client

exports.handler = async (event) => {
  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const { url } = JSON.parse(event.body);

    if (!url) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'URL parameter is required' })
      };
    }

    // Validate URL format
    let parsedUrl;
    try {
      parsedUrl = new URL(url);
    } catch {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Invalid URL format' })
      };
    }

    // Only allow http and https protocols
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Only HTTP and HTTPS URLs are allowed' })
      };
    }

    // Prevent SSRF: Block private network ranges and localhost
    const hostname = parsedUrl.hostname.toLowerCase();
    const privateRanges = [
      'localhost', '127.0.0.1', '0.0.0.0',
      '10.', '192.168.', '172.16.', '172.17.', '172.18.', '172.19.',
      '172.20.', '172.21.', '172.22.', '172.23.', '172.24.', '172.25.',
      '172.26.', '172.27.', '172.28.', '172.29.', '172.30.', '172.31.',
      '169.254.' // link-local
    ];
    
    if (hostname === 'localhost' || 
        hostname === '127.0.0.1' || 
        hostname === '0.0.0.0' ||
        hostname.startsWith('[::1]') ||
        hostname.startsWith('[0:0:0:0:0:0:0:1]') ||
        privateRanges.some(range => hostname.startsWith(range))) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Private network addresses are not allowed' })
      };
    }

    // Fetch the HTML content with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'User-Agent': 'Reinisch-Classroom-Assignment-Importer/1.0'
        },
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        return {
          statusCode: response.status,
          body: JSON.stringify({ 
            error: `Failed to fetch URL: HTTP ${response.status} ${response.statusText}` 
          })
        };
      }

      // Get content type to verify it's HTML
      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
        console.warn(`Warning: Content-Type is ${contentType}, expected text/html`);
      }

      const html = await response.text();

      // Basic size limit: 5MB
      if (html.length > 5 * 1024 * 1024) {
        return {
          statusCode: 413,
          body: JSON.stringify({ error: 'HTML content exceeds maximum size (5MB)' })
        };
      }

      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 
          html,
          contentType,
          url
        })
      };
    } catch (fetchError) {
      clearTimeout(timeoutId);
      if (fetchError.name === 'AbortError') {
        return {
          statusCode: 504,
          body: JSON.stringify({ error: 'Request timeout: URL took too long to respond' })
        };
      }
      throw fetchError;
    }

  } catch (error) {
    console.error('Error fetching HTML:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ 
        error: 'Failed to fetch HTML: ' + error.message 
      })
    };
  }
};
