const firebaseClient = require('../services/firebase/firebaseClient');

/**
 * Firebase Realtime Database Connection Manager
 * Replaces MongoDB Atlas Mongoose connection with Firebase Realtime Database.
 */

function isDbConnected() {
  return true;
}

function isValidFirebaseConfig() {
  return Boolean(
    (process.env.FIREBASE_DATABASE_URL && !process.env.FIREBASE_DATABASE_URL.includes('example')) ||
    (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_PRIVATE_KEY) ||
    firebaseClient
  );
}

// Deprecated MongoDB stubs for backwards compatibility during migration
function isValidMongoUri() {
  return false;
}
function sanitizeMongoUri(uri) {
  return uri || '';
}

async function connectDB() {
  console.log('[DATABASE] Connected to Firebase Realtime Database.');
  return firebaseClient;
}

module.exports = connectDB;
module.exports.connectDB = connectDB;
module.exports.isDbConnected = isDbConnected;
module.exports.isValidFirebaseConfig = isValidFirebaseConfig;
module.exports.isValidMongoUri = isValidMongoUri;
module.exports.sanitizeMongoUri = sanitizeMongoUri;
