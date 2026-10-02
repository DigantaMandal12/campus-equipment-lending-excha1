const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

// Support both /signup and /register routes seamlessly
router.get('/signup', authController.getSignup);
router.post('/signup', authController.postSignup);
router.get('/register', authController.getSignup);
router.post('/register', authController.postSignup);

router.get('/login', authController.getLogin);
router.post('/login', authController.postLogin);

// Social Authentication Routes
router.get('/google', authController.getGoogleAuth);
router.get('/google/callback', authController.getGoogleCallback);
router.get('/facebook', authController.getFacebookAuth);
router.get('/facebook/callback', authController.getFacebookCallback);

// OTP Verification Routes (preserved unchanged)
router.get('/verify-otp', authController.getVerifyOtp);
router.post('/verify-otp', authController.postVerifyOtp);
router.post('/resend-otp', authController.resendOtp);

// Route safety: handle both POST and GET for logout
router.post('/logout', authController.logout);
router.get('/logout', authController.logout);

module.exports = router;
