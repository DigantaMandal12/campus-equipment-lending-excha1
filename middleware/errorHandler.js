// Centralized error handling middleware
const errorHandler = (err, req, res, next) => {
  // Log the technical error to server console for debugging
  console.error('[SERVER ERROR]', {
    message: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    url: req.originalUrl || req.url,
    method: req.method,
  });

  const statusCode = err.status || err.statusCode || 500;
  let userFriendlyMessage = 'Something went wrong. Please try again.';

  if (statusCode === 404) {
    userFriendlyMessage = 'The page or resource you are looking for was not found.';
  } else if (statusCode === 403) {
    userFriendlyMessage = 'You do not have permission to perform this action.';
  } else if (statusCode === 401) {
    userFriendlyMessage = 'Please sign in to proceed.';
  } else if (err.name === 'ValidationError') {
    userFriendlyMessage = Object.values(err.errors).map(val => val.message).join(', ') || 'Invalid form input provided.';
  } else if (err.code === 11000) {
    userFriendlyMessage = 'An account with this email address already exists.';
  } else if (err.message && !err.message.includes('Mongoose') && !err.message.includes('SQL')) {
    userFriendlyMessage = err.message;
  }

  // Handle JSON / AJAX requests
  if (req.xhr || (req.headers && req.headers.accept && req.headers.accept.indexOf('json')) > -1) {
    return res.status(statusCode).json({
      success: false,
      message: userFriendlyMessage
    });
  }

  // Render friendly EJS error page with resilient HTML fallback (prevents lambda crash)
  try {
    return res.status(statusCode).render('error', {
      title: 'Error',
      statusCode,
      message: userFriendlyMessage,
      activePath: req.path
    });
  } catch (renderErr) {
    console.error('[RENDER FALLBACK]', renderErr.message);
    return res.status(statusCode).send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <title>Campus Equipment Exchange</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f8fafc; color: #1e293b; padding: 3rem 1rem; text-align: center; }
          .card { max-width: 480px; margin: 0 auto; background: #fff; padding: 2rem; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); }
          h1 { color: #0f172a; margin-bottom: 0.5rem; font-size: 1.5rem; }
          p { color: #64748b; line-height: 1.5; font-size: 0.95rem; }
          a { display: inline-block; margin-top: 1rem; padding: 0.6rem 1.2rem; background: #2563eb; color: #fff; text-decoration: none; border-radius: 8px; font-weight: 600; }
        </style>
      </head>
      <body>
        <div class="card">
          <h1>${statusCode === 404 ? 'Page Not Found' : 'Notice'}</h1>
          <p>${userFriendlyMessage}</p>
          <a href="/">Go to Homepage</a>
        </div>
      </body>
      </html>
    `);
  }
};

// 404 handler for unmatched routes
const notFoundHandler = (req, res, next) => {
  if (req.xhr || (req.headers && req.headers.accept && req.headers.accept.indexOf('json')) > -1) {
    return res.status(404).json({ success: false, message: 'Resource not found' });
  }

  try {
    return res.status(404).render('error', {
      title: 'Page Not Found',
      statusCode: 404,
      message: 'The page you requested could not be found.',
      activePath: req.path
    });
  } catch (renderErr) {
    return res.status(404).send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <title>404 - Not Found</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f8fafc; color: #1e293b; padding: 3rem 1rem; text-align: center; }
          .card { max-width: 480px; margin: 0 auto; background: #fff; padding: 2rem; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); }
          h1 { color: #0f172a; margin-bottom: 0.5rem; font-size: 1.5rem; }
          p { color: #64748b; line-height: 1.5; font-size: 0.95rem; }
          a { display: inline-block; margin-top: 1rem; padding: 0.6rem 1.2rem; background: #2563eb; color: #fff; text-decoration: none; border-radius: 8px; font-weight: 600; }
        </style>
      </head>
      <body>
        <div class="card">
          <h1>Page Not Found</h1>
          <p>The page you requested could not be found.</p>
          <a href="/">Go to Homepage</a>
        </div>
      </body>
      </html>
    `);
  }
};

module.exports = {
  errorHandler,
  notFoundHandler,
};
