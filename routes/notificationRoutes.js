const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notificationController');
const { requireAuth } = require('../middleware/auth');

router.get('/', requireAuth, notificationController.getNotifications);
router.post('/mark-read', requireAuth, notificationController.postMarkAllRead);

module.exports = router;
