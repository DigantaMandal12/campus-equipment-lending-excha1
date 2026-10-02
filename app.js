const express = require('express');
const path = require('path');
const session = require('express-session');
const cookieParser = require('cookie-parser');
require('dotenv').config();

const connectDB = require('./config/db');
const FirebaseSessionStore = require('./services/firebase/sessionStore');
const { populateUserLocals, requireAuth } = require('./middleware/auth');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');

// Route modules
const indexRoutes = require('./routes/indexRoutes');
const authRoutes = require('./routes/authRoutes');
const equipmentRoutes = require('./routes/equipmentRoutes');
const borrowRoutes = require('./routes/borrowRoutes');
const reviewRoutes = require('./routes/reviewRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const adminRoutes = require('./routes/adminRoutes');
const chatRoutes = require('./routes/chatRoutes');
const equipmentController = require('./controllers/equipmentController');

const app = express();

// Trust proxy for Vercel / reverse proxy edge environments (enables secure cookies and correct protocol detection)
app.set('trust proxy', 1);

// Normalize request URL for Vercel serverless rewrites
// Ensures incoming paths match expected Express routes (/marketplace, /search, etc.)
app.use((req, res, next) => {
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
  next();
});

// View engine setup
app.set('views', [path.join(__dirname, 'views'), path.join(process.cwd(), 'views')]);
app.set('view engine', 'ejs');

// Static assets
app.use(express.static(path.join(__dirname, 'public')));

// Body parsing with 10MB limit for image uploads
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());

// Production session configuration with FirebaseSessionStore for Vercel serverless persistence
const sessionConfig = {
  secret: process.env.SESSION_SECRET || 'campus-equipment-lending-secret-key-2026',
  resave: false,
  saveUninitialized: false,
  store: new FirebaseSessionStore({ ttl: 7 * 24 * 60 * 60 }),
  cookie: {
    maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production' && process.env.COOKIE_SECURE !== 'false',
  }
};

app.use(session(sessionConfig));

// Ensure database connection is active
app.use(async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (err) {
    console.error('[DATABASE INIT ERROR]', err.message);
    next();
  }
});

// Populate view locals & active navigation states
app.use(populateUserLocals);

// Direct API endpoint for asynchronous equipment image uploads
app.post('/api/upload-image', requireAuth, equipmentController.apiUploadImage);

// Mount application routes
app.use('/', indexRoutes);
app.use('/auth', authRoutes);
app.use('/equipment', equipmentRoutes);
app.use('/search', equipmentRoutes); // Route alias for Smart Search
app.use('/borrow', borrowRoutes);
app.use('/reviews', reviewRoutes);
app.use('/notifications', notificationRoutes);
app.use('/admin', adminRoutes);
app.use('/chat', chatRoutes);
app.use('/chatbot', chatRoutes); // Route alias for AI Hardware Assistant

// Handle 404 & Global errors
app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
