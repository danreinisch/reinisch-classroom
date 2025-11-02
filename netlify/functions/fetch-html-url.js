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
    
    // Block localhost and loopback
    if (hostname === 'localhost' || 
        hostname === '127.0.0.1' || 
        hostname === '0.0.0.0' ||
        /^127\.\d+\.\d+\.\d+$/.test(hostname) || // any 127.x.x.x
        hostname === '::1' || // IPv6 localhost
        hostname === '0:0:0:0:0:0:0:1') {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Localhost and loopback addresses are not allowed' })
      };
    }
    
    // Block private IPv4 ranges
    const ipv4Match = hostname.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
    if (ipv4Match) {
      const octets = ipv4Match.slice(1, 5).map(Number);
      const [a, b, c, d] = octets;
      
      // Validate octets are in valid range
      if (octets.some(o => o < 0 || o > 255)) {
        return {
          statusCode: 400,
          body: JSON.stringify({ error: 'Invalid IP address format' })
        };
      }
      
      // Check private ranges
      if (a === 10 || // 10.0.0.0/8
          (a === 172 && b >= 16 && b <= 31) || // 172.16.0.0/12
          (a === 192 && b === 168) || // 192.168.0.0/16
          (a === 169 && b === 254)) { // 169.254.0.0/16 (link-local)
        return {
          statusCode: 400,
          body: JSON.stringify({ error: 'Private network addresses are not allowed' })
        };
      }
    }
    
    // Block IPv6 private ranges (simplified check)
    if (hostname.includes(':')) {
      // Check for common private IPv6 patterns
      if (hostname.startsWith('fc') || // fc00::/7 (unique local)
          hostname.startsWith('fd') || // fc00::/7 (unique local)
          hostname.startsWith('fe80')) { // fe80::/10 (link-local)
        return {
          statusCode: 400,
          body: JSON.stringify({ error: 'Private IPv6 addresses are not allowed' })
        };
      }
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
