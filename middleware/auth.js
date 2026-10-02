const User = require('../models/User');

// Middleware to ensure user is logged in
const requireAuth = (req, res, next) => {
  if (req.session && req.session.userId) {
    return next();
  }
  
  if (req.xhr || (req.headers && req.headers.accept && req.headers.accept.indexOf('json') > -1)) {
    return res.status(401).json({ success: false, message: 'Please sign in to continue.' });
  }

  if (req.session) {
    req.session.returnTo = req.originalUrl;
  }
  return res.redirect('/auth/login');
};

// Middleware to check specific user roles
const requireRole = (...roles) => {
  return (req, res, next) => {
    if (!req.session || !req.session.userId) {
      return res.redirect('/auth/login');
    }
    
    if (roles.includes(req.session.userRole)) {
      return next();
    }

    return res.status(403).render('error', {
      title: 'Access Denied',
      statusCode: 403,
      message: 'You do not have permission to access this area.'
    });
  };
};

// Admin only middleware
const requireAdmin = requireRole('admin');

// Middleware to populate user locals in all EJS templates
const populateUserLocals = async (req, res, next) => {
  res.locals.activePath = req.path;
  res.locals.currentUser = null;
  res.locals.alertSuccess = req.session?.alertSuccess || null;
  res.locals.alertError = req.session?.alertError || null;
  res.locals.alertInfo = req.session?.alertInfo || null;

  // Clear single-turn alerts
  if (req.session) {
    delete req.session.alertSuccess;
    delete req.session.alertError;
    delete req.session.alertInfo;
  }

  if (req.session && req.session.userId) {
    try {
      // Use cached user in session or fetch if missing
      if (req.session.user) {
        res.locals.currentUser = req.session.user;
      } else {
        const user = await User.findById(req.session.userId).select('-password').lean();
        if (user) {
          req.session.user = user;
          res.locals.currentUser = user;
        }
      }
    } catch (err) {
      console.error('[AUTH ERROR] Failed to fetch session user:', err.message);
    }
  }

  next();
};

module.exports = {
  requireAuth,
  requireRole,
  requireAdmin,
  populateUserLocals,
};
