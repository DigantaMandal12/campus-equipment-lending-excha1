let bcrypt;
try {
  bcrypt = require('bcryptjs');
} catch (e) {
  bcrypt = {
    genSalt: async () => 'mock-salt',
    hash: async (pass) => pass,
    compare: async (p1, p2) => p1 === p2,
  };
}
const User = require('../models/User');
const { sendOtp, verifyOtp } = require('./otpService');

// Service function to register a new user
async function registerUser({ name, email, password, confirmPassword, college, department, year, role, adminCode, studentId, phone }) {
  if (!name || !email || !password) {
    throw new Error('Please fill in all required fields.');
  }

  if (confirmPassword && password !== confirmPassword) {
    throw new Error('Passwords do not match.');
  }

  if (password.length < 6) {
    throw new Error('Password must be at least 6 characters long.');
  }

  const cleanEmail = email.toLowerCase().trim();

  // Check if account already exists
  const existingUser = await User.findOne({ email: cleanEmail });
  if (existingUser) {
    throw new Error('An account with this email already exists.');
  }

  // Handle administrator invite code verification
  let assignedRole = 'student';
  if (role === 'teacher') {
    assignedRole = 'teacher';
  } else if (role === 'admin') {
    const validAdminCode = process.env.ADMIN_INVITE_CODE || 'CAMPUS_ADMIN_SECURE_2026';
    if (adminCode === validAdminCode) {
      assignedRole = 'admin';
    } else {
      throw new Error('Invalid administrator invite code.');
    }
  }

  // Note: Password will be hashed by User model's pre('save') hook. Do not pre-hash here.
  const user = new User({
    name: name.trim(),
    email: cleanEmail,
    password: password,
    college: college && college.trim() ? college.trim() : 'Apex Institute of Technology',
    year: year && year.trim() ? year.trim() : '1st Year',
    department: department || 'General',
    role: assignedRole,
    studentId: studentId || '',
    phone: phone || '',
    isVerified: false,
  });

  await user.save();

  let generatedOtp = null;
  // Dispatch OTP email to user's Gmail
  try {
    generatedOtp = await sendOtp(user.email);
  } catch (otpErr) {
    console.error('[OTP ERROR] Could not dispatch OTP:', otpErr.message);
  }

  return {
    _id: user._id,
    name: user.name,
    email: user.email,
    college: user.college,
    year: user.year,
    role: user.role,
    department: user.department,
    isVerified: user.isVerified,
    otpCode: generatedOtp
  };
}

// Service function to authenticate a user
async function loginUser({ email, password }) {
  if (!email || !password) {
    throw new Error('Please provide both email and password.');
  }

  const cleanEmail = email.toLowerCase().trim();
  const user = await User.findOne({ email: cleanEmail });

  if (!user) {
    throw new Error('Invalid email or password.');
  }

  // Safely check password with fallback support for comparePassword, matchPassword, or bcrypt directly
  let isMatch = false;
  if (typeof user.comparePassword === 'function') {
    isMatch = await user.comparePassword(password);
  } else if (typeof user.matchPassword === 'function') {
    isMatch = await user.matchPassword(password);
  } else if (user.password) {
    isMatch = await bcrypt.compare(password, user.password);
  }

  if (!isMatch) {
    throw new Error('Invalid email or password.');
  }

  return {
    _id: user._id,
    name: user.name,
    email: user.email,
    college: user.college || 'Apex Institute of Technology',
    year: user.year || '1st Year',
    role: user.role,
    department: user.department,
    isVerified: user.isVerified,
    upiId: user.upiId || ''
  };
}

/**
 * Find or create a user via OAuth (Google or Facebook)
 * Rules:
 * CASE 1: Google account already linked (match by googleId) -> Login immediately.
 * CASE 2: Facebook account already linked (match by facebookId) -> Login immediately.
 * CASE 3: Social account is new, but verified email matches existing account -> Safely link provider.
 * CASE 4: No matching account exists -> Create new user with verified status (default student role).
 */
async function findOrCreateSocialUser({ provider, providerId, email, name, picture }) {
  if (!providerId) {
    throw new Error('Provider account ID is required.');
  }

  // CASE 1 & CASE 2: Check by provider ID
  let user = null;
  if (provider === 'google') {
    user = await User.findOne({ googleId: providerId });
  } else if (provider === 'facebook') {
    user = await User.findOne({ facebookId: providerId });
  }

  if (user) {
    if (!user.isVerified) {
      user.isVerified = true;
      await user.save();
    }
    return {
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        college: user.college || 'Apex Institute of Technology',
        year: user.year || '1st Year',
        role: user.role || 'student',
        department: user.department || 'General',
        isVerified: user.isVerified,
        upiId: user.upiId || '',
        profileImage: user.profileImage || picture || '',
      },
      isNew: false,
      linked: false,
    };
  }

  // CASE 3: Provider ID not linked yet, check by verified email
  if (email && email.trim()) {
    const cleanEmail = email.toLowerCase().trim();
    user = await User.findOne({ email: cleanEmail });

    if (user) {
      if (provider === 'google') {
        user.googleId = providerId;
      } else if (provider === 'facebook') {
        user.facebookId = providerId;
      }
      if (picture && !user.profileImage) {
        user.profileImage = picture;
      }
      user.isVerified = true; // Email verified by Google / Facebook
      await user.save();

      return {
        user: {
          _id: user._id,
          name: user.name,
          email: user.email,
          college: user.college || 'Apex Institute of Technology',
          year: user.year || '1st Year',
          role: user.role || 'student',
          department: user.department || 'General',
          isVerified: user.isVerified,
          upiId: user.upiId || '',
          profileImage: user.profileImage || picture || '',
        },
        isNew: false,
        linked: true,
      };
    }
  }

  // CASE 4: No matching account exists -> Create new user
  if (!email || !email.trim()) {
    throw new Error('Email address is required from your social account to create a campus profile.');
  }

  const cleanEmail = email.toLowerCase().trim();
  const newUser = new User({
    name: (name || 'Campus Student').trim(),
    email: cleanEmail,
    googleId: provider === 'google' ? providerId : null,
    facebookId: provider === 'facebook' ? providerId : null,
    provider: provider,
    profileImage: picture || '',
    role: 'student', // Default safe role; never automatically grant admin
    college: 'Apex Institute of Technology',
    year: '1st Year',
    department: 'General',
    isVerified: true, // Pre-verified via OAuth provider
  });

  await newUser.save();

  return {
    user: {
      _id: newUser._id,
      name: newUser.name,
      email: newUser.email,
      college: newUser.college,
      year: newUser.year,
      role: newUser.role,
      department: newUser.department,
      isVerified: newUser.isVerified,
      upiId: '',
      profileImage: newUser.profileImage || '',
    },
    isNew: true,
    linked: false,
  };
}

module.exports = {
  registerUser,
  loginUser,
  findOrCreateSocialUser,
};
