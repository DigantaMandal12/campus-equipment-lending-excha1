const express = require('express');
const router = express.Router();
const reviewController = require('../controllers/reviewController');
const { requireAuth } = require('../middleware/auth');

router.post('/add', requireAuth, reviewController.postAddReview);

module.exports = router;
