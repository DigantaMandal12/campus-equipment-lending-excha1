const express = require('express');
const router = express.Router();
const borrowController = require('../controllers/borrowController');
const { requireAuth } = require('../middleware/auth');

// Order / Borrow Requests List
router.get('/requests', requireAuth, borrowController.getBorrowRequests);
router.post('/request', requireAuth, borrowController.postBorrowRequest);
router.post('/approve', requireAuth, borrowController.postApproveRequest);
router.post('/reject', requireAuth, borrowController.postRejectRequest);
router.post('/cancel', requireAuth, borrowController.postCancelRequest);

// Seller Order Workflow Actions
router.post('/prepare', requireAuth, borrowController.postMarkPreparing);
router.post('/ready-for-pickup', requireAuth, borrowController.postMarkReadyForPickup);
router.post('/confirm-handover', requireAuth, borrowController.postConfirmHandover);

// Returns & Active Loans Management
router.get('/returns', requireAuth, borrowController.getReturns);
router.post('/return', requireAuth, borrowController.postProcessReturn);

// UPI Payment Gateway Routes
router.get('/payment/:requestId', requireAuth, borrowController.getPaymentPage);
router.post('/payment/:requestId', requireAuth, borrowController.postProcessUPIPayment);
router.get('/receipt/:requestId', requireAuth, borrowController.getPaymentReceipt);

// API for real-time pickup slot availability (prevents double booking)
router.get('/api/slots-availability', requireAuth, borrowController.getSlotAvailability);

// Backward-compatible deposit redirect
router.post('/pay-deposit', requireAuth, borrowController.postPayDeposit);

module.exports = router;
