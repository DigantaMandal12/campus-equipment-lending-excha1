const express = require('express');
const router = express.Router();
const equipmentController = require('../controllers/equipmentController');
const { requireAuth } = require('../middleware/auth');

// Marketplace & list
router.get('/', equipmentController.getMarketplace);

// Add Equipment
router.get('/add', requireAuth, equipmentController.getAddEquipment);
router.post('/add', requireAuth, equipmentController.postAddEquipment);

// Async Image Upload Endpoint
router.post('/upload-image', requireAuth, equipmentController.apiUploadImage);

// Details
router.get('/:id', equipmentController.getEquipmentDetails);

// Edit & Delete
router.get('/:id/edit', requireAuth, equipmentController.getEditEquipment);
router.post('/:id/edit', requireAuth, equipmentController.postEditEquipment);
router.post('/:id/delete', requireAuth, equipmentController.postDeleteEquipment);

module.exports = router;
