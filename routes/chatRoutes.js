const express = require('express');
const router = express.Router();
const chatController = require('../controllers/chatController');

router.get('/', chatController.getChat);
router.post('/', chatController.postChat);
router.post('/set-key', chatController.postSaveApiKey);

module.exports = router;
