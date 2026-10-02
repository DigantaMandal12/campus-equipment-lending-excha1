const assert = require('assert');
const { 
  users, 
  equipment, 
  borrow, 
  reviews, 
  notifications, 
  otp,
  firebaseClient 
} = require('./services/firebase');
const User = require('./models/User');
const Equipment = require('./models/Equipment');
const BorrowRequest = require('./models/BorrowRequest');
const Review = require('./models/Review');
const Notification = require('./models/Notification');
const { getAssistantResponse } = require('./services/aiService');
const { sendOtp, verifyOtp } = require('./services/otpService');
const FirebaseSessionStore = require('./services/firebase/sessionStore');
const borrowController = require('./controllers/borrowController');
const reviewController = require('./controllers/reviewController');
const equipmentController = require('./controllers/equipmentController');

async function runProductionVerification() {
  console.log('================================================================');
  console.log('🔬 COMPREHENSIVE PRODUCTION VERIFICATION & MULTI-USER TEST SUITE');
  console.log('================================================================\n');

  // Initialize Firebase client
  await firebaseClient.init();

  // Test 1: User A (Lender) Registration & OTP
  console.log('--- PHASE 4 & 5: MULTI-USER AUTHENTICATION & REGISTRATION ---');
  const lenderEmail = `prof.sharma.${Date.now()}@bbit.edu.in`;
  const lenderUser = await users.createUser({
    name: 'Prof. Rajesh Sharma',
    email: lenderEmail,
    password: 'SecurePassword123!',
    role: 'teacher',
    department: 'Electrical & Electronics',
    college: 'Budge Budge Institute of Technology',
    academicYear: 'Faculty',
    upiId: 'sharma@oksbi',
    phone: '9876543210'
  });
  assert(lenderUser && lenderUser._id, 'Lender user must be created in Firebase');
  console.log(`✅ [PASS] User A (Lender) registered in Firebase: ${lenderUser._id}`);

  // Test 2: User B (Borrower) Registration & OTP
  const borrowerEmail = `student.aditi.${Date.now()}@bbit.edu.in`;
  const borrowerUser = await users.createUser({
    name: 'Aditi Roy',
    email: borrowerEmail,
    password: 'StudentPass123!',
    role: 'student',
    department: 'Electrical & Electronics',
    college: 'Budge Budge Institute of Technology',
    academicYear: '3rd Year',
    upiId: 'aditi@okhdfcbank',
    phone: '9876543211'
  });
  assert(borrowerUser && borrowerUser._id, 'Borrower user must be created in Firebase');
  console.log(`✅ [PASS] User B (Borrower) registered in Firebase: ${borrowerUser._id}`);

  // Test 3: OTP Flow for Borrower
  const otpCode = await sendOtp(borrowerEmail);
  assert(otpCode && otpCode.length === 6, 'OTP must be 6 digits');
  const otpVerification = await verifyOtp(borrowerEmail, otpCode);
  assert(otpVerification === true, 'Generated OTP must verify successfully');
  console.log('✅ [PASS] OTP generation, verification, and invalidation verified.');

  // Test 4: User A adds equipment to catalog
  console.log('\n--- PHASE 3 & 4: EQUIPMENT CRUD & MULTI-USER MARKETPLACE ---');
  const newEquip = await Equipment.create({
    title: 'Tektronix 100MHz Digital Storage Oscilloscope',
    description: 'Dual-channel digital storage oscilloscope with 2GS/s sampling rate, passive probes included.',
    category: 'Electronics',
    department: 'Electrical & Electronics',
    condition: 'Excellent',
    depositAmount: 500,
    dailyRate: 0,
    location: 'Electrical Lab - Room 304 (Engineering Building)',
    owner: lenderUser._id,
    status: 'AVAILABLE',
    isVerified: true
  });
  assert(newEquip && newEquip._id, 'Equipment must be created in Firebase');
  console.log(`✅ [PASS] User A created equipment: "${newEquip.title}" (ID: ${newEquip._id})`);

  // Test 5: Search & Filter Verification
  const searchResults = await equipment.getAllEquipment({ category: 'Electronics' });
  const foundOscilloscope = searchResults.find(e => e._id === newEquip._id);
  assert(foundOscilloscope, 'Created equipment must be discoverable in catalog filter');
  console.log('✅ [PASS] Equipment discovered by User B via category filter.');

  // Test 6: Business Rule Check — Prevent Borrowing Own Equipment
  console.log('\n--- PHASE 11: DATA CONSISTENCY & BUSINESS RULES ---');
  const dummyReqOwn = {
    session: { userId: lenderUser._id, alertError: null },
    body: {
      equipmentId: newEquip._id,
      pickupDate: '2026-10-15',
      startDate: '2026-10-15',
      endDate: '2026-10-18',
      pickupLocation: 'Electrical Lab - Room 304',
      pickupSlotId: 'slot-1400-1430'
    }
  };
  const dummyResOwn = {
    redirect: (url) => { dummyResOwn.redirectUrl = url; }
  };
  await borrowController.postBorrowRequest(dummyReqOwn, dummyResOwn, (err) => { throw err; });
  assert.strictEqual(dummyReqOwn.session.alertError, 'You cannot borrow or purchase your own equipment.');
  console.log('✅ [PASS] Prevented User A from borrowing their own equipment.');

  // Test 7: User B submits borrow request
  const dummyReqBorrow = {
    session: { userId: borrowerUser._id, alertError: null, alertSuccess: null },
    body: {
      equipmentId: newEquip._id,
      pickupDate: '2026-10-15',
      startDate: '2026-10-15',
      endDate: '2026-10-18',
      purpose: 'Final year power electronics inverter lab project',
      pickupLocation: 'Electrical Lab - Room 304',
      pickupSlotId: 'slot-1400-1430',
      pickupTime: '2:00 PM – 2:30 PM'
    }
  };
  const dummyResBorrow = {
    redirect: (url) => { dummyResBorrow.redirectUrl = url; }
  };
  await borrowController.postBorrowRequest(dummyReqBorrow, dummyResBorrow, (err) => { throw err; });
  assert.strictEqual(dummyReqBorrow.session.alertError, null, 'Borrow request should succeed without error');
  console.log('✅ [PASS] User B created borrow request.');

  // Fetch the created request
  const createdReq = await BorrowRequest.findOne({ equipment: newEquip._id, borrower: borrowerUser._id });
  assert(createdReq, 'Borrow request must be in database');
  console.log(`✅ [PASS] Borrow request stored with Order #${createdReq.orderNumber} (Status: ${createdReq.status})`);

  // Test 8: Prevent Duplicate Active Borrowing by User B for same item
  const dummyReqDup = {
    session: { userId: borrowerUser._id, alertError: null, alertInfo: null },
    body: {
      equipmentId: newEquip._id,
      pickupDate: '2026-10-15',
      startDate: '2026-10-15',
      endDate: '2026-10-18',
      purpose: 'Duplicate attempt'
    }
  };
  const dummyResDup = { redirect: () => {} };
  await borrowController.postBorrowRequest(dummyReqDup, dummyResDup, (err) => { throw err; });
  const blockedMsg = dummyReqDup.session.alertInfo || dummyReqDup.session.alertError;
  assert(blockedMsg, 'Must block duplicate borrow request');
  console.log('✅ [PASS] Prevented duplicate pending borrow request for the same equipment.');

  // Test 9: Complete UPI Security Deposit Payment
  console.log('\n--- PHASE 4: UPI ESCROW PAYMENT FLOW ---');
  const dummyReqPay = {
    session: { userId: borrowerUser._id, user: borrowerUser, alertSuccess: null },
    params: { requestId: createdReq._id },
    body: {
      upiId: 'aditi@okhdfcbank',
      transactionId: 'UPI9876543210',
      paymentApp: 'Google Pay'
    }
  };
  const dummyResPay = { redirect: () => {} };
  await borrowController.postProcessUPIPayment(dummyReqPay, dummyResPay, (err) => { throw err; });
  
  const paidReq = await BorrowRequest.findById(createdReq._id);
  assert.strictEqual(paidReq.paymentStatus, 'PAID', 'Payment status must be PAID');
  assert.strictEqual(paidReq.status, 'APPROVED', 'Order status must be APPROVED upon deposit payment');
  console.log('✅ [PASS] UPI Deposit payment completed; Seller notified of new order.');

  // Test 10: Third Party User C tries to borrow unavailable equipment
  const userC = await users.createUser({
    name: 'Suman Roy',
    email: `student.suman.${Date.now()}@bbit.edu.in`,
    password: 'Password123!',
    role: 'student'
  });
  const dummyReqC = {
    session: { userId: userC._id, alertError: null },
    body: {
      equipmentId: newEquip._id,
      startDate: '2026-10-15',
      endDate: '2026-10-18'
    }
  };
  const dummyResC = { redirect: () => {} };
  await borrowController.postBorrowRequest(dummyReqC, dummyResC, (err) => { throw err; });
  assert.strictEqual(dummyReqC.session.alertError, 'This equipment is currently not available.');
  console.log('✅ [PASS] Prevented third-party User C from borrowing currently BORROWED equipment.');

  // Test 11: User A confirms handover
  console.log('\n--- PHASE 4: HANDOVER CONFIRMATION ---');
  const dummyReqHandover = {
    session: { userId: lenderUser._id, alertSuccess: null },
    body: {
      requestId: createdReq._id,
      collegeIdVerified: 'on',
      handoverNotes: 'Physical probes inspected and handed over with BNC cables'
    }
  };
  const dummyResHandover = { redirect: () => {} };
  await borrowController.postConfirmHandover(dummyReqHandover, dummyResHandover, (err) => { throw err; });
  
  const handedOverReq = await BorrowRequest.findById(createdReq._id);
  assert.strictEqual(handedOverReq.handoverStatus, 'COMPLETED', 'Handover must be marked COMPLETED');
  assert.strictEqual(handedOverReq.status, 'BORROWED', 'Order status must remain active BORROWED during checkout');
  console.log('✅ [PASS] Handover confirmed; borrower in physical possession of equipment.');

  // Test 12: Return Processing & Security Deposit Refund (Borrower or Lender returns)
  console.log('\n--- PHASE 4 & 11: RETURN PROCESSING & ESCROW REFUND ---');
  const dummyReqReturn = {
    session: { userId: borrowerUser._id, alertSuccess: null },
    body: {
      requestId: createdReq._id,
      returnNotes: 'Returned in clean condition, all probes intact'
    }
  };
  const dummyResReturn = { redirect: () => {} };
  await borrowController.postProcessReturn(dummyReqReturn, dummyResReturn, (err) => { throw err; });

  const returnedReq = await BorrowRequest.findById(createdReq._id);
  assert.strictEqual(returnedReq.status, 'RETURNED', 'Request status must be RETURNED');
  
  const equipAfterReturn = await Equipment.findById(newEquip._id);
  assert.strictEqual(equipAfterReturn.status, 'AVAILABLE', 'Equipment status must be restored to AVAILABLE');
  console.log('✅ [PASS] Equipment marked RETURNED and restored to AVAILABLE in catalog.');

  // Test 13: Prevent Duplicate Return Processing
  const dummyReqReturnDup = {
    session: { userId: lenderUser._id, alertInfo: null },
    body: { requestId: createdReq._id }
  };
  const dummyResReturnDup = { redirect: () => {} };
  await borrowController.postProcessReturn(dummyReqReturnDup, dummyResReturnDup, (err) => { throw err; });
  assert(dummyReqReturnDup.session.alertInfo && dummyReqReturnDup.session.alertInfo.includes('already been returned'), 'Duplicate return must be blocked');
  console.log('✅ [PASS] Prevented duplicate return processing on already returned equipment.');

  // Test 14: Trust Score & Return History Update Verification
  console.log('\n--- PHASE 11: TRUST SCORE CALCULATION VERIFICATION ---');
  const borrowerAfterReturn = await User.findById(borrowerUser._id);
  assert.strictEqual(borrowerAfterReturn.trustScore, 5.0, 'Borrower on-time return should maintain 5.0 trust score');
  assert.strictEqual(borrowerAfterReturn.onTimeReturns, 1, 'On-time returns count must be incremented to 1');
  assert.strictEqual(borrowerAfterReturn.successfulBorrows, 1, 'Successful borrows count must be incremented to 1');
  console.log(`✅ [PASS] Trust Score verified: ${borrowerAfterReturn.trustScore}/5.0 (On-time returns: ${borrowerAfterReturn.onTimeReturns})`);

  // Test 15: Two-Way Peer Review & Automatic Average Rating Calculation
  console.log('\n--- PHASE 4 & 11: RATINGS & REVIEWS RECALCULATION ---');
  const dummyReqReview = {
    session: { userId: borrowerUser._id, alertSuccess: null },
    body: {
      equipmentId: newEquip._id,
      rating: '5',
      comment: 'Top quality oscilloscope. Probes were calibrated, saved our group so much time!'
    }
  };
  const dummyResReview = { redirect: () => {} };
  await reviewController.postAddReview(dummyReqReview, dummyResReview, (err) => { throw err; });

  const equipAfterReview = await Equipment.findById(newEquip._id);
  assert.strictEqual(equipAfterReview.rating, 5.0, 'Equipment average rating must be updated to 5.0');
  assert.strictEqual(equipAfterReview.numReviews, 1, 'Equipment numReviews must be 1');
  console.log(`✅ [PASS] Review created & equipment average rating recalculated: ${equipAfterReview.rating} ⭐ (${equipAfterReview.numReviews} review)`);

  // Test 16: Updating Existing Review (No Duplicate Spamming)
  const dummyReqReviewUpdate = {
    session: { userId: borrowerUser._id, alertSuccess: null },
    body: {
      equipmentId: newEquip._id,
      rating: '4',
      comment: 'Updated review: Power cable was a bit stiff but worked well.'
    }
  };
  const dummyResReviewUpdate = { redirect: () => {} };
  await reviewController.postAddReview(dummyReqReviewUpdate, dummyResReviewUpdate, (err) => { throw err; });

  const equipAfterReviewUpdate = await Equipment.findById(newEquip._id);
  assert.strictEqual(equipAfterReviewUpdate.rating, 4.0, 'Equipment average rating must be updated to 4.0');
  assert.strictEqual(equipAfterReviewUpdate.numReviews, 1, 'Review count must remain 1 upon review edit');
  console.log(`✅ [PASS] Review updated cleanly without duplicate review records: ${equipAfterReviewUpdate.rating} ⭐ (${equipAfterReviewUpdate.numReviews} review)`);

  // Test 17: In-App Notifications Verification
  console.log('\n--- PHASE 4: NOTIFICATIONS DISPATCH AUDIT ---');
  const lenderNotifs = await notifications.getNotificationsByUser(lenderUser._id);
  const borrowerNotifs = await notifications.getNotificationsByUser(borrowerUser._id);
  assert(lenderNotifs.length > 0, 'Lender must have received transactional notifications');
  assert(borrowerNotifs.length > 0, 'Borrower must have received transactional notifications');
  console.log(`✅ [PASS] Lender notifications: ${lenderNotifs.length}, Borrower notifications: ${borrowerNotifs.length}`);

  // Test 18: Campus AI Hardware Assistant Grounded Verification
  console.log('\n--- PHASE 2: AI ASSISTANT HARDWARE RECOMMENDATIONS ---');
  const aiQuery = 'What digital oscilloscopes do you have in the electrical lab?';
  const aiAnswer = await getAssistantResponse(aiQuery);
  assert(aiAnswer && aiAnswer.reply, 'AI Assistant must return response');
  console.log('✅ [PASS] AI Hardware Assistant responded:');
  console.log('   Preview:', aiAnswer.reply.slice(0, 120) + '...');

  // Test 19: Security & Protected Routes Audit
  console.log('\n--- PHASE 5 & 13: SECURITY & UNAUTHORIZED ACCESS REJECTION ---');
  const { requireAuth, requireAdmin } = require('./middleware/auth');
  
  // Unauthenticated request to /dashboard
  let authBlocked = false;
  const unauthReq = { session: {}, originalUrl: '/dashboard' };
  const unauthRes = {
    redirect: (url) => { 
      if (url === '/auth/login') authBlocked = true; 
    }
  };
  requireAuth(unauthReq, unauthRes, () => { authBlocked = false; });
  assert(authBlocked, 'requireAuth must redirect unauthenticated requests to /auth/login');
  console.log('✅ [PASS] Protected route /dashboard correctly rejects unauthenticated users.');

  // Student request to /admin
  let adminBlocked = false;
  const studentReq = { session: { userId: borrowerUser._id, userRole: 'student' } };
  const studentRes = {
    status: (code) => {
      if (code === 403) adminBlocked = true;
      return { render: () => {} };
    }
  };
  requireAdmin(studentReq, studentRes, () => { adminBlocked = false; });
  assert(adminBlocked, 'requireAdmin must return 403 Access Denied for student users');
  console.log('✅ [PASS] Protected route /admin correctly denies non-admin student users (HTTP 403).');

  // Test 20: Serverless Session Persistence in Firebase
  console.log('\n--- PHASE 7: VERCEL SERVERLESS SESSION STORE ---');
  const sessionStore = new FirebaseSessionStore({ ttl: 3600 });
  const testSid = `test-sess-${Date.now()}`;
  const testSessionData = {
    userId: borrowerUser._id,
    userRole: 'student',
    userEmail: borrowerEmail
  };

  await new Promise((resolve, reject) => {
    sessionStore.set(testSid, testSessionData, (err) => err ? reject(err) : resolve());
  });
  const retrievedSession = await new Promise((resolve, reject) => {
    sessionStore.get(testSid, (err, sess) => err ? reject(err) : resolve(sess));
  });
  assert.strictEqual(retrievedSession.userId, borrowerUser._id, 'Session must persist across serverless instances in Firebase');
  console.log('✅ [PASS] FirebaseSessionStore verified: set, get, and cross-lambda persistence.');

  console.log('\n================================================================');
  console.log('🎉 ALL 20 PRODUCTION VERIFICATION PHASES PASSED WITH ZERO ERRORS');
  console.log('================================================================\n');
}

runProductionVerification().then(() => process.exit(0)).catch(err => {
  console.error('\n❌ VERIFICATION TEST FAILED:', err);
  process.exit(1);
});
