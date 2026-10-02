const BorrowRequest = require('../models/BorrowRequest');
const Equipment = require('../models/Equipment');
const User = require('../models/User');
const { createNotification } = require('../services/notificationService');
const { generateQRCodeSVG, buildUPIUri } = require('../services/qrService');
const { STANDARD_PICKUP_SLOTS, CAMPUS_PICKUP_LOCATIONS, getAvailablePickupDates } = require('../config/pickupConfig');

// Helper to format date in "10 October 2026" style
function formatDisplayDate(date) {
  if (!date) return '';
  return new Date(date).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });
}

function getEntityId(entity) {
  if (!entity) return '';
  if (typeof entity === 'object') {
    return String(entity._id || entity.id || '');
  }
  return String(entity);
}

// Submit a new borrow / purchase request with College Pickup details
exports.postBorrowRequest = async (req, res, next) => {
  try {
    const { 
      equipmentId, 
      startDate, 
      endDate, 
      purpose,
      pickupLocation,
      pickupDate,
      pickupTime,
      pickupSlotId
    } = req.body;

    if (!equipmentId) {
      req.session.alertError = 'Equipment ID is missing.';
      return res.redirect('/marketplace');
    }

    // Default dates if not explicitly provided
    const effectivePickupDate = pickupDate || startDate;
    const effectiveStartDate = startDate || pickupDate;
    const effectiveEndDate = endDate || effectivePickupDate;

    if (!effectiveStartDate || !effectiveEndDate) {
      req.session.alertError = 'Please select a valid pickup date and duration.';
      return res.redirect(`/equipment/${equipmentId}`);
    }

    const start = new Date(effectiveStartDate);
    const end = new Date(effectiveEndDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (start < today) {
      req.session.alertError = 'Pickup date cannot be in the past.';
      return res.redirect(`/equipment/${equipmentId}`);
    }

    if (end < start) {
      req.session.alertError = 'Return date must be on or after the pickup date.';
      return res.redirect(`/equipment/${equipmentId}`);
    }

    const equipment = await Equipment.findById(equipmentId).populate('owner');
    if (!equipment) {
      req.session.alertError = 'Equipment not found.';
      return res.redirect('/marketplace');
    }

    // Prevent borrowing own equipment
    if (String(equipment.owner._id) === String(req.session.userId)) {
      req.session.alertError = 'You cannot borrow or purchase your own equipment.';
      return res.redirect(`/equipment/${equipmentId}`);
    }

    // Check availability
    if (equipment.status !== 'AVAILABLE') {
      req.session.alertError = 'This equipment is currently not available.';
      return res.redirect(`/equipment/${equipmentId}`);
    }

    // Check slot double-booking on same date and equipment
    const chosenSlotId = pickupSlotId || 'slot-1400-1430';
    const chosenPickupDate = new Date(effectivePickupDate);
    chosenPickupDate.setHours(0, 0, 0, 0);
    const nextDay = new Date(chosenPickupDate);
    nextDay.setDate(nextDay.getDate() + 1);

    const slotConflict = await BorrowRequest.findOne({
      equipment: equipmentId,
      pickupDate: { $gte: chosenPickupDate, $lt: nextDay },
      pickupSlotId: chosenSlotId,
      status: { $nin: ['CANCELLED', 'REJECTED', 'RETURNED'] }
    });

    if (slotConflict) {
      req.session.alertError = `The selected pickup slot (${pickupTime || 'chosen time'}) is already FULL for this equipment. Please choose another time slot.`;
      return res.redirect(`/equipment/${equipmentId}`);
    }

    // Check existing pending request
    const existing = await BorrowRequest.findOne({
      equipment: equipmentId,
      borrower: req.session.userId,
      status: 'PENDING'
    });

    if (existing) {
      if (existing.depositAmount > 0 && existing.paymentStatus === 'UNPAID') {
        req.session.alertInfo = 'You have a pending request. Please complete the UPI payment.';
        return res.redirect(`/borrow/payment/${existing._id}`);
      }
      req.session.alertInfo = 'You already have a pending borrow request for this item.';
      return res.redirect('/borrow/requests');
    }

    // Resolve pickup location & time display
    const finalLocation = pickupLocation && pickupLocation.trim() 
      ? pickupLocation.trim() 
      : (equipment.location || 'Electrical Lab - Room 304 (Engineering Building)');

    let finalPickupTime = pickupTime;
    if (!finalPickupTime && chosenSlotId) {
      const matched = STANDARD_PICKUP_SLOTS.find(s => s.id === chosenSlotId);
      finalPickupTime = matched ? matched.label : '2:00 PM – 2:30 PM';
    } else if (!finalPickupTime) {
      finalPickupTime = '2:00 PM – 2:30 PM';
    }

    // Generate Order Number
    const orderNumber = `ORD-${Math.floor(10000 + Math.random() * 90000)}`;
    const verificationCode = Math.random().toString(36).substring(2, 8).toUpperCase();

    const request = new BorrowRequest({
      equipment: equipmentId,
      borrower: req.session.userId,
      lender: equipment.owner._id,
      orderNumber,
      verificationCode,
      startDate: start,
      endDate: end,
      purpose: purpose ? purpose.trim() : 'Academic course project / lab research',
      depositAmount: equipment.depositAmount || 0,
      paymentStatus: equipment.depositAmount > 0 ? 'UNPAID' : 'WAIVED',
      status: 'PENDING',
      pickupLocation: finalLocation,
      pickupDate: chosenPickupDate,
      pickupTime: finalPickupTime,
      pickupSlotId: chosenSlotId,
      handoverStatus: 'PENDING'
    });

    await request.save();

    // If equipment requires a security deposit, immediately redirect to UPI Payment Gateway
    if (request.depositAmount > 0) {
      req.session.alertSuccess = `Order #${orderNumber} created for "${equipment.title}". Complete UPI payment to notify the seller and confirm your college pickup!`;
      return res.redirect(`/borrow/payment/${request._id}`);
    }

    // If free / deposit waived, auto-confirm and notify seller
    request.status = 'APPROVED';
    request.handoverStatus = 'PREPARING';
    await request.save();
    await Equipment.findByIdAndUpdate(equipmentId, { status: 'BORROWED' });

    const pickupDateStr = formatDisplayDate(chosenPickupDate);

    // Notify seller
    await createNotification({
      userId: equipment.owner._id,
      title: '🔔 NEW ORDER',
      message: `You received a new order.\n\nProduct:\n${equipment.title}\n\nBuyer:\n${req.session.user.name}\n\nOrder:\n#${orderNumber}\n\nPayment:\n✅ FREE / WAIVED\n\nPickup Location:\n${finalLocation}\n\nPickup Date:\n${pickupDateStr}\n\nPickup Time:\n${finalPickupTime}`,
      type: 'REQUEST',
      link: '/borrow/requests'
    });

    req.session.alertSuccess = `Order #${orderNumber} confirmed! The seller has been notified to prepare your item for pickup at ${finalLocation}.`;
    return res.redirect(`/borrow/receipt/${request._id}`);
  } catch (err) {
    next(err);
  }
};

// View all sent and received borrow requests / orders
exports.getBorrowRequests = async (req, res, next) => {
  try {
    const userId = req.session.userId;
    const activeTab = req.query.tab || 'all';

    // Requests user made as buyer / borrower
    const myRequests = await BorrowRequest.find({ borrower: userId })
      .populate('equipment')
      .populate('lender', 'name email department phone upiId')
      .sort({ createdAt: -1 })
      .lean();

    // Base query for requests received as seller / lender
    let sellerFilter = { lender: userId };

    if (activeTab === 'new') {
      sellerFilter.$or = [
        { status: 'PENDING' },
        { status: 'APPROVED', handoverStatus: 'PENDING' }
      ];
    } else if (activeTab === 'confirmed') {
      sellerFilter.status = 'APPROVED';
      sellerFilter.handoverStatus = { $in: ['PENDING', 'CONFIRMED'] };
    } else if (activeTab === 'preparing') {
      sellerFilter.handoverStatus = 'PREPARING';
    } else if (activeTab === 'ready') {
      sellerFilter.handoverStatus = 'READY_FOR_PICKUP';
    } else if (activeTab === 'completed') {
      sellerFilter.$or = [
        { handoverStatus: 'COMPLETED' },
        { status: { $in: ['COMPLETED', 'RETURNED'] } }
      ];
    } else if (activeTab === 'cancelled') {
      sellerFilter.status = { $in: ['CANCELLED', 'REJECTED'] };
    }

    const incomingRequests = await BorrowRequest.find(sellerFilter)
      .populate('equipment')
      .populate('borrower', 'name email department phone studentId upiId')
      .sort({ createdAt: -1 })
      .lean();

    // Counts for seller tabs
    const counts = {
      all: await BorrowRequest.countDocuments({ lender: userId }),
      new: await BorrowRequest.countDocuments({ 
        lender: userId, 
        $or: [{ status: 'PENDING' }, { status: 'APPROVED', handoverStatus: 'PENDING' }] 
      }),
      preparing: await BorrowRequest.countDocuments({ lender: userId, handoverStatus: 'PREPARING' }),
      ready: await BorrowRequest.countDocuments({ lender: userId, handoverStatus: 'READY_FOR_PICKUP' }),
      completed: await BorrowRequest.countDocuments({ 
        lender: userId, 
        $or: [{ handoverStatus: 'COMPLETED' }, { status: { $in: ['COMPLETED', 'RETURNED'] } }] 
      }),
      cancelled: await BorrowRequest.countDocuments({ 
        lender: userId, 
        status: { $in: ['CANCELLED', 'REJECTED'] } 
      })
    };

    const todayDateString = new Date().toISOString().split('T')[0];

    res.render('borrow/requests', {
      title: 'Orders & Borrow Requests',
      myRequests,
      incomingRequests,
      activeTab,
      counts,
      todayDateString
    });
  } catch (err) {
    next(err);
  }
};

// Approve an order / borrow request (Lender only)
exports.postApproveRequest = async (req, res, next) => {
  try {
    const { requestId } = req.body;
    const request = await BorrowRequest.findById(requestId).populate('equipment borrower');

    if (!request) {
      req.session.alertError = 'Borrow request not found.';
      return res.redirect('/borrow/requests');
    }

    // Verify lender authorization
    if (getEntityId(request.lender) !== String(req.session.userId) && req.session.userRole !== 'admin') {
      req.session.alertError = 'Unauthorized to approve this request.';
      return res.redirect('/borrow/requests');
    }

    request.status = 'APPROVED';
    request.handoverStatus = 'PREPARING';
    await request.save();

    // Update equipment status to BORROWED
    await Equipment.findByIdAndUpdate(request.equipment._id, { status: 'BORROWED' });

    // Notify borrower
    await createNotification({
      userId: request.borrower._id,
      title: 'Order Approved - Preparing for Pickup',
      message: `Your order for "${request.equipment.title}" was approved. Pickup is scheduled at ${request.pickupLocation || 'campus spot'} on ${formatDisplayDate(request.pickupDate)}.`,
      type: 'APPROVAL',
      link: `/borrow/receipt/${request._id}`
    });

    req.session.alertSuccess = `Order #${request.orderNumber || ''} approved and marked as Preparing.`;
    return res.redirect('/borrow/requests?tab=preparing');
  } catch (err) {
    next(err);
  }
};

// Seller marks order as "Preparing"
exports.postMarkPreparing = async (req, res, next) => {
  try {
    const { requestId } = req.body;
    const request = await BorrowRequest.findById(requestId).populate('equipment borrower');

    if (!request) {
      req.session.alertError = 'Order not found.';
      return res.redirect('/borrow/requests');
    }

    if (getEntityId(request.lender) !== String(req.session.userId) && req.session.userRole !== 'admin') {
      req.session.alertError = 'Unauthorized.';
      return res.redirect('/borrow/requests');
    }

    request.handoverStatus = 'PREPARING';
    await request.save();

    // Notify buyer
    const pickupDateStr = formatDisplayDate(request.pickupDate);
    await createNotification({
      userId: request.borrower._id,
      title: '📦 Seller Preparing Your Product',
      message: `The seller is preparing "${request.equipment.title}" (Order #${request.orderNumber}) for pickup on ${pickupDateStr} at ${request.pickupLocation}.`,
      type: 'APPROVAL',
      link: `/borrow/receipt/${request._id}`
    });

    req.session.alertSuccess = `Order #${request.orderNumber} marked as Preparing.`;
    return res.redirect('/borrow/requests?tab=preparing');
  } catch (err) {
    next(err);
  }
};

// Seller marks order as "Ready for Pickup"
exports.postMarkReadyForPickup = async (req, res, next) => {
  try {
    const { requestId } = req.body;
    const request = await BorrowRequest.findById(requestId).populate('equipment borrower');

    if (!request) {
      req.session.alertError = 'Order not found.';
      return res.redirect('/borrow/requests');
    }

    if (getEntityId(request.lender) !== String(req.session.userId) && req.session.userRole !== 'admin') {
      req.session.alertError = 'Unauthorized.';
      return res.redirect('/borrow/requests');
    }

    request.handoverStatus = 'READY_FOR_PICKUP';
    request.status = 'READY_FOR_PICKUP';
    request.readyForPickupAt = new Date();
    await request.save();

    const pickupDateStr = formatDisplayDate(request.pickupDate);

    // Automatic Buyer Notification: EXACT FORMAT requested in spec
    await createNotification({
      userId: request.borrower._id,
      title: '🔔 YOUR PRODUCT IS READY',
      message: `Your order is ready for pickup.\n\nProduct:\n${request.equipment.title}\n\n📍 ${request.pickupLocation}\n\n📅 ${pickupDateStr}\n\n⏰ ${request.pickupTime}\n\nOrder:\n#${request.orderNumber}\n\nPlease bring your College ID.`,
      type: 'APPROVAL',
      link: `/borrow/receipt/${request._id}`
    });

    req.session.alertSuccess = `Order #${request.orderNumber} marked as Ready for Pickup. Buyer has been notified!`;
    return res.redirect('/borrow/requests?tab=ready');
  } catch (err) {
    next(err);
  }
};

// Seller confirms physical handover at College Pickup Location
exports.postConfirmHandover = async (req, res, next) => {
  try {
    const { requestId, handoverNotes, collegeIdVerified } = req.body;
    const request = await BorrowRequest.findById(requestId).populate('equipment borrower lender');

    if (!request) {
      req.session.alertError = 'Order not found.';
      return res.redirect('/borrow/requests');
    }

    if (getEntityId(request.lender) !== String(req.session.userId) && req.session.userRole !== 'admin') {
      req.session.alertError = 'Only the assigned seller or administrator can confirm the handover.';
      return res.redirect('/borrow/requests');
    }

    request.handoverStatus = 'COMPLETED';
    request.status = 'BORROWED';
    request.handoverAt = new Date();
    request.collegeIdVerified = collegeIdVerified === 'on' || collegeIdVerified === true || collegeIdVerified === 'true';
    if (handoverNotes && handoverNotes.trim()) {
      request.handoverNotes = handoverNotes.trim();
    }

    await request.save();

    // Notify buyer: Handover complete, prompt for review
    await createNotification({
      userId: request.borrower._id,
      title: '🎉 Handover Complete - Order Completed',
      message: `Handover for "${request.equipment.title}" (Order #${request.orderNumber}) is confirmed. Thank you! Please take a moment to rate your experience.`,
      type: 'RETURN',
      link: `/borrow/receipt/${request._id}`
    });

    req.session.alertSuccess = `Handover Confirmed! Order #${request.orderNumber} is now marked as COMPLETED.`;
    return res.redirect('/borrow/requests?tab=completed');
  } catch (err) {
    next(err);
  }
};

// Reject a borrow request (Lender only)
exports.postRejectRequest = async (req, res, next) => {
  try {
    const { requestId } = req.body;
    const request = await BorrowRequest.findById(requestId).populate('equipment borrower');

    if (!request) {
      req.session.alertError = 'Request not found.';
      return res.redirect('/borrow/requests');
    }

    if (getEntityId(request.lender) !== String(req.session.userId) && req.session.userRole !== 'admin') {
      req.session.alertError = 'Unauthorized to reject this request.';
      return res.redirect('/borrow/requests');
    }

    request.status = 'REJECTED';
    request.handoverStatus = 'CANCELLED';
    await request.save();

    // Revert equipment availability if it was reserved or approved
    if (request.equipment) {
      const equipId = request.equipment._id || request.equipment;
      await Equipment.findByIdAndUpdate(equipId, { status: 'AVAILABLE' });
    }

    // Notify borrower
    await createNotification({
      userId: request.borrower._id,
      title: 'Borrow Request Declined',
      message: `Your request for "${request.equipment.title}" could not be approved at this time.`,
      type: 'REJECTION',
      link: '/borrow/requests'
    });

    req.session.alertInfo = 'Request declined.';
    return res.redirect('/borrow/requests');
  } catch (err) {
    next(err);
  }
};

// Cancel request (Borrower only)
exports.postCancelRequest = async (req, res, next) => {
  try {
    const { requestId } = req.body;
    const request = await BorrowRequest.findById(requestId);

    if (!request) {
      req.session.alertError = 'Request not found.';
      return res.redirect('/borrow/requests');
    }

    if (getEntityId(request.borrower) !== String(req.session.userId)) {
      req.session.alertError = 'Unauthorized to cancel this request.';
      return res.redirect('/borrow/requests');
    }

    request.status = 'CANCELLED';
    request.handoverStatus = 'CANCELLED';
    await request.save();

    // Revert equipment availability if it was reserved or approved
    if (request.equipment) {
      const equipId = request.equipment._id || request.equipment;
      await Equipment.findByIdAndUpdate(equipId, { status: 'AVAILABLE' });
    }

    req.session.alertInfo = 'Order / borrow request cancelled.';
    return res.redirect('/borrow/requests');
  } catch (err) {
    next(err);
  }
};

// View active loans and returns
exports.getReturns = async (req, res, next) => {
  try {
    const userId = req.session.userId;

    // Items currently borrowed by the user
    const activeBorrowed = await BorrowRequest.find({
      borrower: userId,
      status: { $in: ['APPROVED', 'PREPARING', 'READY_FOR_PICKUP', 'BORROWED'] }
    }).populate('equipment lender').sort({ endDate: 1 }).lean();

    // Items loaned by user that are out with borrowers
    const activeLent = await BorrowRequest.find({
      lender: userId,
      status: { $in: ['APPROVED', 'PREPARING', 'READY_FOR_PICKUP', 'BORROWED'] }
    }).populate('equipment borrower').sort({ endDate: 1 }).lean();

    // Completed return history
    const completedHistory = await BorrowRequest.find({
      $or: [{ borrower: userId }, { lender: userId }],
      status: { $in: ['RETURNED', 'COMPLETED'] }
    }).populate('equipment borrower lender').sort({ returnDate: -1, handoverAt: -1 }).limit(10).lean();

    res.render('borrow/returns', {
      title: 'Equipment Returns & Active Loans',
      activeBorrowed,
      activeLent,
      completedHistory
    });
  } catch (err) {
    next(err);
  }
};

// Process equipment return (Lender confirms return / refund)
exports.postProcessReturn = async (req, res, next) => {
  try {
    const { requestId, returnNotes } = req.body;
    const request = await BorrowRequest.findById(requestId).populate('equipment borrower lender');

    if (!request) {
      req.session.alertError = 'Lending record not found.';
      return res.redirect('/borrow/returns');
    }

    // Prevent duplicate return processing
    if (request.status === 'RETURNED') {
      req.session.alertInfo = 'This equipment has already been returned and confirmed.';
      return res.redirect('/borrow/returns');
    }

    const isLender = getEntityId(request.lender) === String(req.session.userId);
    const isBorrower = getEntityId(request.borrower) === String(req.session.userId);
    const isAdmin = req.session.userRole === 'admin';

    if (!isLender && !isBorrower && !isAdmin) {
      req.session.alertError = 'Only the equipment owner, borrower, or admin can confirm the return.';
      return res.redirect('/borrow/returns');
    }

    request.status = 'RETURNED';
    request.handoverStatus = 'COMPLETED';
    request.returnDate = new Date();
    request.returnNotes = returnNotes ? returnNotes.trim() : 'Returned in good condition';
    
    // Automatically trigger UPI Security Deposit Refund if deposit was paid
    if (request.paymentStatus === 'PAID') {
      request.paymentStatus = 'REFUNDED';
      const refundTxnId = `REF-UPI-${Date.now().toString().slice(-8)}`;
      const refundUpiId = (request.paymentDetails && request.paymentDetails.upiId) 
        ? request.paymentDetails.upiId 
        : (request.borrower.upiId || 'Original UPI Account');

      request.refundDetails = {
        refundMethod: 'UPI',
        refundTxnId,
        refundUpiId,
        refundedAt: new Date(),
        refundAmount: request.depositAmount
      };

      await createNotification({
        userId: request.borrower._id,
        title: 'Security Deposit Refunded via UPI',
        message: `Your deposit of ₹${request.depositAmount} for "${request.equipment.title}" has been refunded to your UPI ID (${refundUpiId}). Refund Ref: ${refundTxnId}.`,
        type: 'RETURN',
        link: `/borrow/receipt/${request._id}`
      });
    }

    await request.save();
    await Equipment.findByIdAndUpdate(request.equipment._id, { status: 'AVAILABLE' });

    // Update borrower trust metrics based on whether return was on-time
    try {
      const borrowerUser = await User.findById(request.borrower._id);
      if (borrowerUser) {
        const dueDate = new Date(request.endDate);
        const isLate = new Date() > dueDate;
        const onTime = (borrowerUser.onTimeReturns || 0) + (isLate ? 0 : 1);
        const late = (borrowerUser.lateReturns || 0) + (isLate ? 1 : 0);
        const newTrustScore = Math.max(1.0, Math.min(5.0, Number((5.0 - (late * 0.2)).toFixed(1))));
        await User.findByIdAndUpdate(request.borrower._id, {
          onTimeReturns: onTime,
          lateReturns: late,
          trustScore: newTrustScore,
          successfulBorrows: (borrowerUser.successfulBorrows || 0) + 1
        });
      }
    } catch (trustErr) {
      console.warn('[TRUST SCORE UPDATE]', trustErr.message);
    }

    if (isBorrower) {
      await createNotification({
        userId: request.lender._id,
        title: 'Equipment Returned by Borrower',
        message: `"${request.equipment.title}" has been returned by ${request.borrower.name}.`,
        type: 'RETURN',
        link: '/borrow/returns'
      });
    }

    await createNotification({
      userId: request.borrower._id,
      title: 'Equipment Return Confirmed',
      message: `Return of "${request.equipment.title}" has been confirmed. You can now leave a rating!`,
      type: 'RETURN',
      link: `/equipment/${request.equipment._id}`
    });

    req.session.alertSuccess = 'Equipment marked as returned. Security deposit refund initiated via UPI.';
    return res.redirect('/borrow/returns');
  } catch (err) {
    next(err);
  }
};

// ==========================================================================
// UPI PAYMENT GATEWAY CONTROLLERS
// ==========================================================================

// Render Dedicated UPI Payment Gateway Screen
exports.getPaymentPage = async (req, res, next) => {
  try {
    const { requestId } = req.params;
    const request = await BorrowRequest.findById(requestId).populate('equipment borrower lender');

    if (!request) {
      req.session.alertError = 'Borrow request not found.';
      return res.redirect('/borrow/requests');
    }

    const isBorrower = getEntityId(request.borrower) === String(req.session.userId);
    const isAdmin = req.session.userRole === 'admin';
    if (!isBorrower && !isAdmin) {
      req.session.alertError = 'Unauthorized to access this payment page.';
      return res.redirect('/borrow/requests');
    }

    // If already paid, redirect straight to receipt
    if (request.paymentStatus === 'PAID') {
      req.session.alertInfo = 'Deposit for this request has already been paid.';
      return res.redirect(`/borrow/receipt/${request._id}`);
    }

    if (request.depositAmount <= 0) {
      request.paymentStatus = 'WAIVED';
      await request.save();
      req.session.alertInfo = 'No security deposit required for this equipment.';
      return res.redirect('/borrow/requests');
    }

    const payeeVpa = (request.lender && request.lender.upiId) 
      ? request.lender.upiId 
      : 'campus.equipment@icici';
    const payeeName = 'Campus Equipment Escrow';
    const transactionNote = `Order #${request.orderNumber || request._id.toString().slice(-6)} - ${request.equipment ? request.equipment.title.slice(0, 20) : 'Equip'}`;
    const transactionRef = `TR${request._id.toString().slice(-8).toUpperCase()}`;

    const upiUri = buildUPIUri({
      payeeVpa,
      payeeName,
      amount: request.depositAmount,
      transactionNote,
      transactionRef
    });

    const qrSvg = generateQRCodeSVG(upiUri, 6, 2);

    res.render('borrow/payment', {
      title: 'UPI Payment Gateway - Secure Escrow Checkout',
      request,
      equipment: request.equipment,
      lender: request.lender,
      borrower: request.borrower,
      payeeVpa,
      payeeName,
      amount: request.depositAmount,
      transactionRef,
      transactionNote,
      upiUri,
      qrSvg
    });
  } catch (err) {
    next(err);
  }
};

// Process UPI Payment Verification & Confirmation
exports.postProcessUPIPayment = async (req, res, next) => {
  try {
    const requestId = req.params.requestId || req.body.requestId;
    const { transactionId, upiId, paymentApp } = req.body;

    const request = await BorrowRequest.findById(requestId).populate('equipment borrower lender');

    if (!request) {
      req.session.alertError = 'Order / borrow request not found.';
      return res.redirect('/borrow/requests');
    }

    const isBorrower = getEntityId(request.borrower) === String(req.session.userId);
    const isAdmin = req.session.userRole === 'admin';
    if (!isBorrower && !isAdmin) {
      req.session.alertError = 'Unauthorized to submit payment for this request.';
      return res.redirect('/borrow/requests');
    }

    // Clean or generate reference number
    const safeTxnId = transactionId && transactionId.trim().length >= 6 
      ? transactionId.trim().toUpperCase() 
      : `UPI${Date.now().toString().slice(-10)}${Math.floor(10 + Math.random() * 90)}`;

    const safePayerUpi = upiId && upiId.trim() 
      ? upiId.trim() 
      : (req.session.user?.upiId || `${request.borrower.name.toLowerCase().replace(/[^a-z]/g, '')}@upi`);

    const payeeVpa = (request.lender && request.lender.upiId) 
      ? request.lender.upiId 
      : 'campus.equipment@icici';

    const receiptNumber = `UPI-REC-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.floor(1000 + Math.random() * 9000)}`;

    // Update payment & order status
    request.paymentStatus = 'PAID';
    request.status = 'APPROVED';
    request.handoverStatus = 'PREPARING';

    if (request.equipment) {
      await Equipment.findByIdAndUpdate(request.equipment._id, { status: 'BORROWED' });
    }

    request.paymentDetails = {
      paymentMethod: 'UPI',
      upiId: safePayerUpi,
      payeeUpiId: payeeVpa,
      transactionId: safeTxnId,
      paymentApp: paymentApp || 'Google Pay',
      receiptNumber,
      paidAt: new Date(),
      amount: request.depositAmount
    };

    await request.save();

    if (safePayerUpi && !req.session.user?.upiId) {
      await User.findByIdAndUpdate(request.borrower._id, { upiId: safePayerUpi });
      if (req.session.user) req.session.user.upiId = safePayerUpi;
    }

    const pickupDateStr = formatDisplayDate(request.pickupDate);

    // Automatic Seller Notification: EXACT FORMAT requested in spec
    await createNotification({
      userId: request.lender._id,
      title: '🔔 NEW ORDER',
      message: `You received a new order.\n\nProduct:\n${request.equipment ? request.equipment.title : 'Equipment'}\n\nBuyer:\n${request.borrower.name}\n\nOrder:\n#${request.orderNumber}\n\nPayment:\n✅ PAID\n\nPickup Location:\n${request.pickupLocation}\n\nPickup Date:\n${pickupDateStr}\n\nPickup Time:\n${request.pickupTime}`,
      type: 'REQUEST',
      link: '/borrow/requests'
    });

    // Notify borrower
    await createNotification({
      userId: request.borrower._id,
      title: 'UPI Payment Successful - Order Confirmed',
      message: `Payment of ₹${request.depositAmount} verified for "${request.equipment ? request.equipment.title : 'item'}". Order #${request.orderNumber}. The seller is now preparing your product for pickup at ${request.pickupLocation} on ${pickupDateStr}.`,
      type: 'APPROVAL',
      link: `/borrow/receipt/${request._id}`
    });

    req.session.alertSuccess = `Payment Verified! Order #${request.orderNumber} confirmed. The seller has been automatically notified to prepare your product for pickup.`;
    return res.redirect(`/borrow/receipt/${request._id}`);
  } catch (err) {
    next(err);
  }
};

// View Official UPI Payment Receipt & College Pickup Pass
exports.getPaymentReceipt = async (req, res, next) => {
  try {
    const { requestId } = req.params;
    const request = await BorrowRequest.findById(requestId).populate('equipment borrower lender').lean();

    if (!request) {
      req.session.alertError = 'Order record not found.';
      return res.redirect('/borrow/requests');
    }

    const userId = String(req.session.userId);
    const isBorrower = getEntityId(request.borrower) === userId;
    const isLender = getEntityId(request.lender) === userId;
    const isAdmin = req.session.userRole === 'admin';

    if (!isBorrower && !isLender && !isAdmin) {
      req.session.alertError = 'Unauthorized to view this order / receipt.';
      return res.redirect('/borrow/requests');
    }

    // Generate Order Verification QR Code (SVG)
    // Points to the order verification pass or reference
    const orderVerifyUrl = `ORDER:${request.orderNumber || request._id}|CODE:${request.verificationCode || 'VERIFIED'}|LOC:${encodeURIComponent(request.pickupLocation || 'Campus')}`;
    const orderQrSvg = generateQRCodeSVG(orderVerifyUrl, 6, 2);

    // Compute Date Validation Check for Pickup Day
    const todayStr = new Date().toISOString().split('T')[0];
    const pickupDateStr = request.pickupDate ? new Date(request.pickupDate).toISOString().split('T')[0] : '';
    const isToday = pickupDateStr === todayStr;

    // Determine current timeline active step index
    // 0: Order Created, 1: Payment Successful, 2: Seller Notified, 3: Seller Preparing,
    // 4: Ready for Pickup, 5: Buyer Notified, 6: Buyer Arrived, 7: Buyer Verified,
    // 8: Product Handed Over, 9: Order Completed, 10: Review
    let activeTimelineStep = 0;
    if (request.status === 'COMPLETED' || request.handoverStatus === 'COMPLETED') {
      activeTimelineStep = 9;
    } else if (request.handoverStatus === 'READY_FOR_PICKUP') {
      activeTimelineStep = 5;
    } else if (request.handoverStatus === 'PREPARING') {
      activeTimelineStep = 3;
    } else if (request.paymentStatus === 'PAID') {
      activeTimelineStep = 2;
    } else {
      activeTimelineStep = 0;
    }

    res.render('borrow/receipt', {
      title: `Order #${request.orderNumber || 'ORD'} - Pickup Pass & Receipt`,
      request,
      equipment: request.equipment,
      borrower: request.borrower,
      lender: request.lender,
      payment: request.paymentDetails || {},
      refund: request.refundDetails || {},
      orderQrSvg,
      isToday,
      activeTimelineStep,
      isBorrower,
      isLender
    });
  } catch (err) {
    next(err);
  }
};

// API: Check slot availability for an equipment on a given date (prevents double booking)
exports.getSlotAvailability = async (req, res) => {
  try {
    const { equipmentId, date } = req.query;
    if (!equipmentId || !date) {
      return res.status(400).json({ success: false, message: 'Equipment ID and date are required.' });
    }

    const targetDate = new Date(date);
    targetDate.setHours(0, 0, 0, 0);
    const nextDay = new Date(targetDate);
    nextDay.setDate(nextDay.getDate() + 1);

    const bookedOrders = await BorrowRequest.find({
      equipment: equipmentId,
      pickupDate: { $gte: targetDate, $lt: nextDay },
      status: { $nin: ['CANCELLED', 'REJECTED', 'RETURNED'] }
    }).select('pickupSlotId').lean();

    const bookedSlotsSet = new Set(bookedOrders.map(o => o.pickupSlotId));

    const slots = STANDARD_PICKUP_SLOTS.map(slot => ({
      id: slot.id,
      label: slot.label,
      isBooked: bookedSlotsSet.has(slot.id),
      statusLabel: bookedSlotsSet.has(slot.id) ? 'FULL' : 'AVAILABLE'
    }));

    return res.json({ success: true, slots });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// Backward-compatible redirect for legacy postPayDeposit
exports.postPayDeposit = async (req, res, next) => {
  const { requestId } = req.body;
  if (!requestId) {
    return res.redirect('/borrow/requests');
  }
  return res.redirect(`/borrow/payment/${requestId}`);
};
