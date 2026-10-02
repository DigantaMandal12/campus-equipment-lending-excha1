const client = require('./firebaseClient');
const crypto = require('crypto');

let bcrypt;
try {
  bcrypt = require('bcryptjs');
} catch (e) {
  bcrypt = null;
}

// Built-in crypto password hashing fallback when bcryptjs is not present
function hashPasswordFallback(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
  return `pbkdf2$${salt}$${hash}`;
}

function verifyPasswordFallback(password, storedHash) {
  if (!storedHash) return false;
  if (!storedHash.startsWith('pbkdf2$')) {
    return password === storedHash;
  }
  const parts = storedHash.split('$');
  if (parts.length !== 3) return false;
  const salt = parts[1];
  const originalHash = parts[2];
  const testHash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
  return testHash === originalHash;
}

async function hashPassword(password) {
  if (!password) return '';
  if (bcrypt) {
    const salt = await bcrypt.genSalt(10);
    return await bcrypt.hash(password, salt);
  }
  return hashPasswordFallback(password);
}

async function comparePassword(enteredPassword, storedPassword) {
  if (!enteredPassword || !storedPassword) return false;
  if (bcrypt && (storedPassword.startsWith('$2a$') || storedPassword.startsWith('$2b$'))) {
    return await bcrypt.compare(enteredPassword, storedPassword);
  }
  return verifyPasswordFallback(enteredPassword, storedPassword);
}

async function getAllUsers() {
  const all = (await client.get('users')) || {};
  return Object.values(all);
}

async function getUserById(id) {
  if (!id) return null;
  const user = await client.get(`users/${id}`);
  return user || null;
}

async function getUserByEmail(email) {
  if (!email) return null;
  const cleanEmail = email.toLowerCase().trim();
  const users = await getAllUsers();
  return users.find(u => u.email && u.email.toLowerCase() === cleanEmail) || null;
}

async function getUserByGoogleId(googleId) {
  if (!googleId) return null;
  const users = await getAllUsers();
  return users.find(u => u.googleId === googleId) || null;
}

async function getUserByFacebookId(facebookId) {
  if (!facebookId) return null;
  const users = await getAllUsers();
  return users.find(u => u.facebookId === facebookId) || null;
}

async function createUser(data) {
  const id = data._id || data.id || client.generateKey();
  let hashedPassword = data.password;
  if (data.password && !data.password.startsWith('$2') && !data.password.startsWith('pbkdf2$')) {
    hashedPassword = await hashPassword(data.password);
  }

  const user = {
    _id: id,
    id: id,
    name: (data.name || '').trim(),
    email: (data.email || '').toLowerCase().trim(),
    password: hashedPassword || '',
    googleId: data.googleId || null,
    facebookId: data.facebookId || null,
    provider: data.provider || 'local',
    profileImage: data.profileImage || '',
    college: data.college ? data.college.trim() : 'Apex Institute of Technology',
    year: data.year ? data.year.trim() : '1st Year',
    role: data.role || 'student',
    department: data.department || 'Computer Science',
    studentId: data.studentId || '',
    phone: data.phone || '',
    upiId: data.upiId || '',
    trustScore: data.trustScore !== undefined ? data.trustScore : 5.0,
    successfulBorrows: data.successfulBorrows || 0,
    onTimeReturns: data.onTimeReturns || 0,
    lateReturns: data.lateReturns || 0,
    isVerified: Boolean(data.isVerified),
    createdAt: data.createdAt ? new Date(data.createdAt).toISOString() : new Date().toISOString()
  };

  await client.set(`users/${id}`, user);
  return user;
}

async function updateUser(id, updates) {
  if (!id) return null;
  const existing = await getUserById(id);
  if (!existing) return null;

  const sanitized = { ...updates };
  if (sanitized.password && !sanitized.password.startsWith('$2') && !sanitized.password.startsWith('pbkdf2$')) {
    sanitized.password = await hashPassword(sanitized.password);
  }

  const updated = { ...existing, ...sanitized, _id: id, id: id };
  await client.set(`users/${id}`, updated);
  return updated;
}

async function countUsers() {
  const users = await getAllUsers();
  return users.length;
}

module.exports = {
  getAllUsers,
  getUserById,
  getUserByEmail,
  getUserByGoogleId,
  getUserByFacebookId,
  createUser,
  updateUser,
  countUsers,
  hashPassword,
  comparePassword
};
