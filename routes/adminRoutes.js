const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { requireAdmin } = require('../middleware/auth');

router.get('/', requireAdmin, adminController.getAdminDashboard);
router.post('/user-role', requireAdmin, adminController.postUpdateUserRole);

module.exports = router;
