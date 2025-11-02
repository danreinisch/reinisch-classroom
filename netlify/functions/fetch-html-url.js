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

    // Fetch the HTML content
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'Reinisch-Classroom-Assignment-Importer/1.0'
      }
    });

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
