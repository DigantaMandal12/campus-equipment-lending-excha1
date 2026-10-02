const User = require('../models/User');
const { registerUser, loginUser, findOrCreateSocialUser } = require('../services/authService');
const { sendOtp, verifyOtp } = require('../services/otpService');
const {
  generateOAuthState,
  isGoogleConfigured,
  isFacebookConfigured,
  getGoogleAuthUrl,
  exchangeGoogleCode,
  getFacebookAuthUrl,
  exchangeFacebookCode,
} = require('../services/oauthService');

// Render Sign Up / Register page
exports.getSignup = (req, res) => {
  if (req.session && req.session.userId) {
    return res.redirect('/dashboard');
  }
  res.render('auth/signup', {
    title: 'Create Account',
    error: null,
    formData: {}
  });
};

// Handle Sign Up / Register
exports.postSignup = async (req, res) => {
  try {
    const user = await registerUser(req.body);

    req.session.userId = user._id;
    req.session.userRole = user.role;
    req.session.user = user;
    if (user.otpCode) {
      req.session.currentOtp = user.otpCode;
    }

    req.session.alertSuccess = 'Account created successfully! A verification code has been sent to your email.';
    return res.redirect('/auth/verify-otp');
  } catch (err) {
    console.error('Registration error:', err);
    return res.status(400).render('auth/signup', {
      title: 'Create Account',
      error: err.message || 'An unexpected error occurred during signup.',
      formData: req.body
    });
  }
};

exports.register = exports.postSignup;

// Render Login page
exports.getLogin = (req, res) => {
  if (req.session && req.session.userId) {
    return res.redirect('/dashboard');
  }
  res.render('auth/login', {
    title: 'Sign In',
    error: null,
    formData: {},
    isGoogleConfigured: isGoogleConfigured(),
    isFacebookConfigured: isFacebookConfigured(),
  });
};

// Handle Login
exports.postLogin = async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await loginUser({ email, password });

    req.session.userId = user._id;
    req.session.userRole = user.role;
    req.session.user = user;

    const redirectUrl = req.session.returnTo || '/dashboard';
    delete req.session.returnTo;
    req.session.alertSuccess = `Welcome back, ${user.name}!`;
    return res.redirect(redirectUrl);
  } catch (err) {
    console.error('Login error:', err);
    return res.status(401).render('auth/login', {
      title: 'Sign In',
      error: err.message || 'Invalid email or password.',
      formData: { email: req.body.email },
      isGoogleConfigured: isGoogleConfigured(),
      isFacebookConfigured: isFacebookConfigured(),
    });
  }
};

exports.login = exports.postLogin;

// ==============================================================================
// Google OAuth Flow
// ==============================================================================

exports.getGoogleAuth = (req, res) => {
  if (req.session && req.session.userId) {
    return res.redirect('/dashboard');
  }

  if (!isGoogleConfigured()) {
    req.session.alertError = 'Google Login is not configured. Please set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in environment variables.';
    return res.redirect('/auth/login');
  }

  try {
    const state = generateOAuthState();
    req.session.oauthState = state;
    const authUrl = getGoogleAuthUrl(req, state);
    return res.redirect(authUrl);
  } catch (err) {
    console.error('[GOOGLE AUTH INIT ERROR]', err.message);
    req.session.alertError = 'Could not initialize Google authentication. Please try again.';
    return res.redirect('/auth/login');
  }
};

exports.getGoogleCallback = async (req, res) => {
  try {
    // 1. Check for provider-level errors (cancellation, access_denied)
    if (req.query.error) {
      if (req.query.error === 'access_denied') {
        req.session.alertError = 'Google login was cancelled.';
      } else {
        req.session.alertError = 'Google authentication was not completed. Please try again.';
      }
      return res.redirect('/auth/login');
    }

    // 2. Validate CSRF state parameter
    const incomingState = req.query.state;
    const expectedState = req.session.oauthState;
    delete req.session.oauthState; // Single-use state

    if (!incomingState || !expectedState || incomingState !== expectedState) {
      req.session.alertError = 'Invalid or expired authentication session state. Please try again.';
      return res.redirect('/auth/login');
    }

    // 3. Validate authorization code
    const code = req.query.code;
    if (!code) {
      req.session.alertError = 'No authorization code returned from Google.';
      return res.redirect('/auth/login');
    }

    // 4. Exchange code for user profile
    const profile = await exchangeGoogleCode(code, req);

    if (!profile.email) {
      req.session.alertError = 'Email address is required to create your account.';
      return res.redirect('/auth/login');
    }

    // 5. Database user resolution (Cases 1, 2, 3, 4)
    const { user, isNew, linked } = await findOrCreateSocialUser({
      provider: 'google',
      providerId: profile.id,
      email: profile.email,
      name: profile.name,
      picture: profile.picture,
    });

    // 6. Establish authenticated session
    req.session.userId = user._id;
    req.session.userRole = user.role;
    req.session.user = user;

    if (isNew) {
      req.session.alertSuccess = `Welcome to Campus Lending, ${user.name}! Your account has been created via Google.`;
    } else if (linked) {
      req.session.alertSuccess = `Your Google account has been linked successfully. Welcome back, ${user.name}!`;
    } else {
      req.session.alertSuccess = `Welcome back, ${user.name}!`;
    }

    const redirectUrl = req.session.returnTo || '/dashboard';
    delete req.session.returnTo;
    return res.redirect(redirectUrl);
  } catch (err) {
    console.error('[GOOGLE CALLBACK ERROR]', err.message);
    req.session.alertError = err.message.includes('required')
      ? err.message
      : 'Google login failed. Please try again.';
    return res.redirect('/auth/login');
  }
};

// ==============================================================================
// Facebook OAuth Flow
// ==============================================================================

exports.getFacebookAuth = (req, res) => {
  if (req.session && req.session.userId) {
    return res.redirect('/dashboard');
  }

  if (!isFacebookConfigured()) {
    req.session.alertError = 'Facebook Login is not configured. Please set FACEBOOK_APP_ID and FACEBOOK_APP_SECRET in environment variables.';
    return res.redirect('/auth/login');
  }

  try {
    const state = generateOAuthState();
    req.session.oauthState = state;
    const authUrl = getFacebookAuthUrl(req, state);
    return res.redirect(authUrl);
  } catch (err) {
    console.error('[FACEBOOK AUTH INIT ERROR]', err.message);
    req.session.alertError = 'Could not initialize Facebook authentication. Please try again.';
    return res.redirect('/auth/login');
  }
};

exports.getFacebookCallback = async (req, res) => {
  try {
    // 1. Check for provider-level errors (cancellation, access_denied)
    if (req.query.error || req.query.error_reason) {
      req.session.alertError = 'Facebook login was cancelled.';
      return res.redirect('/auth/login');
    }

    // 2. Validate CSRF state parameter
    const incomingState = req.query.state;
    const expectedState = req.session.oauthState;
    delete req.session.oauthState; // Single-use state

    if (!incomingState || !expectedState || incomingState !== expectedState) {
      req.session.alertError = 'Invalid or expired authentication session state. Please try again.';
      return res.redirect('/auth/login');
    }

    // 3. Validate authorization code
    const code = req.query.code;
    if (!code) {
      req.session.alertError = 'No authorization code returned from Facebook.';
      return res.redirect('/auth/login');
    }

    // 4. Exchange code for user profile
    const profile = await exchangeFacebookCode(code, req);

    if (!profile.email) {
      req.session.alertError = 'Email address is required from your Facebook account. Please ensure email permission is granted.';
      return res.redirect('/auth/login');
    }

    // 5. Database user resolution (Cases 1, 2, 3, 4)
    const { user, isNew, linked } = await findOrCreateSocialUser({
      provider: 'facebook',
      providerId: profile.id,
      email: profile.email,
      name: profile.name,
      picture: profile.picture,
    });

    // 6. Establish authenticated session
    req.session.userId = user._id;
    req.session.userRole = user.role;
    req.session.user = user;

    if (isNew) {
      req.session.alertSuccess = `Welcome to Campus Lending, ${user.name}! Your account has been created via Facebook.`;
    } else if (linked) {
      req.session.alertSuccess = `Your Facebook account has been linked successfully. Welcome back, ${user.name}!`;
    } else {
      req.session.alertSuccess = `Welcome back, ${user.name}!`;
    }

    const redirectUrl = req.session.returnTo || '/dashboard';
    delete req.session.returnTo;
    return res.redirect(redirectUrl);
  } catch (err) {
    console.error('[FACEBOOK CALLBACK ERROR]', err.message);
    req.session.alertError = err.message.includes('required')
      ? err.message
      : 'Facebook login failed. Please try again.';
    return res.redirect('/auth/login');
  }
};

// Render OTP Verification page
exports.getVerifyOtp = (req, res) => {
  if (!req.session || !req.session.userId) {
    return res.redirect('/auth/login');
  }
  res.render('auth/verify-otp', {
    title: 'Verify Account',
    error: null,
    email: req.session.user?.email,
    otpHint: req.session.currentOtp || null
  });
};

// Handle OTP Verification
exports.postVerifyOtp = async (req, res) => {
  try {
    const { otp } = req.body;
    const email = req.session.user?.email;

    if (!otp) {
      return res.render('auth/verify-otp', {
        title: 'Verify Account',
        error: 'Please enter the 6-digit verification code.',
        email,
        otpHint: req.session.currentOtp || null
      });
    }

    const isValid = await verifyOtp(email, otp);
    if (!isValid) {
      return res.render('auth/verify-otp', {
        title: 'Verify Account',
        error: 'Invalid or expired verification code. Please check your email or request a new code.',
        email,
        otpHint: req.session.currentOtp || null
      });
    }

    await User.findByIdAndUpdate(req.session.userId, { isVerified: true });
    if (req.session.user) {
      req.session.user.isVerified = true;
    }
    delete req.session.currentOtp;
    req.session.alertSuccess = 'Your account has been verified successfully!';
    return res.redirect('/dashboard');
  } catch (err) {
    console.error('[OTP VERIFY ERROR]', err);
    return res.render('auth/verify-otp', {
      title: 'Verify Account',
      error: 'Verification failed. Please try again.',
      email: req.session.user?.email,
      otpHint: req.session.currentOtp || null
    });
  }
};

// Resend OTP
exports.resendOtp = async (req, res) => {
  try {
    const email = req.session.user?.email;
    if (email) {
      const code = await sendOtp(email);
      req.session.currentOtp = code;
      req.session.alertSuccess = 'A new verification code has been dispatched to your email.';
    }
    return res.redirect('/auth/verify-otp');
  } catch (err) {
    console.error('[RESEND OTP ERROR]', err);
    req.session.alertError = 'Could not send verification code. Please try again.';
    return res.redirect('/auth/verify-otp');
  }
};

// Logout
exports.logout = (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('[LOGOUT ERROR]', err);
    }
    res.redirect('/auth/login');
  });
};

// Get Profile
exports.getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.session.userId).select('-password').lean();
    if (!user) {
      return res.redirect('/auth/login');
    }
    res.render('profile', {
      title: 'My Profile',
      user
    });
  } catch (err) {
    console.error('[PROFILE ERROR]', err);
    res.redirect('/dashboard');
  }
};

// Update Profile
exports.updateProfile = async (req, res) => {
  try {
    const { name, college, department, year, phone, studentId, upiId } = req.body;
    const updated = await User.findByIdAndUpdate(
      req.session.userId,
      {
        name: name ? name.trim() : req.session.user.name,
        college: college ? college.trim() : (req.session.user.college || 'Apex Institute of Technology'),
        department: department || 'General',
        year: year ? year.trim() : (req.session.user.year || '1st Year'),
        phone: phone || '',
        studentId: studentId || '',
        upiId: upiId ? upiId.trim() : '',
      },
      { new: true, runValidators: true }
    ).select('-password');

    req.session.user = {
      _id: updated._id,
      name: updated.name,
      email: updated.email,
      college: updated.college,
      year: updated.year,
      role: updated.role,
      department: updated.department,
      isVerified: updated.isVerified,
      upiId: updated.upiId || '',
      profileImage: updated.profileImage || '',
    };

    req.session.alertSuccess = 'Profile updated successfully.';
    res.redirect('/profile');
  } catch (err) {
    console.error('[UPDATE PROFILE ERROR]', err);
    req.session.alertError = 'Failed to update profile. Please try again.';
    res.redirect('/profile');
  }
};

// Backward compatibility alias for route binding
exports.postProfile = exports.updateProfile;
