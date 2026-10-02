const express = require('express');
const router = express.Router();
const Equipment = require('../models/Equipment');
const BorrowRequest = require('../models/BorrowRequest');
const authController = require('../controllers/authController');
const { requireAuth } = require('../middleware/auth');
const { isDbConnected } = require('../config/db');
const { getFallbackEquipment } = require('../config/sampleData');

// Home / Landing Page
router.get('/', async (req, res, next) => {
  try {
    let featuredEquipment = [];

    if (isDbConnected()) {
      featuredEquipment = await Equipment.find({ status: 'AVAILABLE' })
        .populate('owner', 'name department')
        .sort({ createdAt: -1 })
        .limit(6)
        .lean();
    } else {
      // In-memory fallback prevents buffering timeout when running without local MongoDB
      featuredEquipment = getFallbackEquipment().slice(0, 6);
    }

    res.render('index', {
      title: 'Campus Equipment Lending Exchange',
      featuredEquipment
    });
  } catch (err) {
    console.warn('[HOMEPAGE DB FALLBACK]', err.message);
    res.render('index', {
      title: 'Campus Equipment Lending Exchange',
      featuredEquipment: getFallbackEquipment().slice(0, 6)
    });
  }
});

// Dashboard (User Overview)
router.get('/dashboard', requireAuth, async (req, res, next) => {
  try {
    const userId = req.session.userId;

    if (!isDbConnected()) {
      return res.render('dashboard', {
        title: 'My Dashboard',
        myItems: [],
        activeLoans: [],
        pendingIncomingRequests: [],
        pendingMyRequests: []
      });
    }

    const [
      myItems,
      activeLoans,
      pendingIncomingRequests,
      pendingMyRequests
    ] = await Promise.all([
      Equipment.find({ owner: userId }).sort({ createdAt: -1 }).lean(),
      BorrowRequest.find({
        $or: [{ borrower: userId }, { lender: userId }],
        status: { $in: ['APPROVED', 'PREPARING', 'READY_FOR_PICKUP', 'BORROWED'] }
      }).populate('equipment borrower lender').lean(),
      BorrowRequest.find({ 
        lender: userId, 
        $or: [
          { status: 'PENDING' },
          { handoverStatus: { $in: ['PREPARING', 'READY_FOR_PICKUP'] } }
        ]
      }).populate('equipment borrower').sort({ createdAt: -1 }).lean(),
      BorrowRequest.find({ 
        borrower: userId, 
        status: { $in: ['PENDING', 'APPROVED', 'PREPARING', 'READY_FOR_PICKUP'] } 
      }).populate('equipment lender').sort({ createdAt: -1 }).lean(),
    ]);

    res.render('dashboard', {
      title: 'My Dashboard',
      myItems,
      activeLoans,
      pendingIncomingRequests,
      pendingMyRequests,
    });
  } catch (err) {
    next(err);
  }
});

// Profile View
router.get('/profile', requireAuth, authController.getProfile);
router.post('/profile', requireAuth, authController.postProfile);

module.exports = router;
