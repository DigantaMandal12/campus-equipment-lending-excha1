const app = require('../app');

// Vercel serverless function entrypoint
// In Vercel CLI 62+, internal rewrites route requests using the destination path (/api/index).
// This wrapper normalizes req.url to the original client request path (x-forwarded-uri)
// before passing it to Express, ensuring all routes, query parameters, and view rendering work seamlessly.
module.exports = (req, res) => {
  const forwardedUri = req.headers['x-forwarded-uri'] || req.headers['x-original-url'];
  if (forwardedUri && !forwardedUri.startsWith('/api/index')) {
    req.url = forwardedUri;
  } else {
    const matched = req.headers['x-matched-path'] || req.headers['x-vercel-matched-path'];
    if (matched && !matched.startsWith('/api/index') && !matched.startsWith('/api')) {
      req.url = matched;
    } else if (req.url === '/api/index' || req.url === '/api/index.js' || req.url === '/api') {
      req.url = '/';
    } else if (req.url.startsWith('/api/index/')) {
      req.url = req.url.replace(/^\/api\/index/, '') || '/';
    } else if (req.url.startsWith('/api/')) {
      req.url = req.url.replace(/^\/api/, '') || '/';
    }
  }

  return app(req, res);
};
