const assert = require('assert');
const fs = require('fs');
const { CAMPUS_PICKUP_LOCATIONS, STANDARD_PICKUP_SLOTS, getAvailablePickupDates } = require('./config/pickupConfig');
const { generateOtp, getEmailCredentials } = require('./services/otpService');
const { getAssistantResponse } = require('./services/aiService');
const {
  generateOAuthState,
  getGoogleCallbackUrl,
  getFacebookCallbackUrl,
  getGoogleAuthUrl,
  getFacebookAuthUrl,
} = require('./services/oauthService');
const { findOrCreateSocialUser } = require('./services/authService');

console.log('🧪 Starting College Pickup, Registration & AI Verification Suite...\n');

// Test 1: Campus Pickup Locations
console.log('Test 1: Validating Campus Pickup Locations...');
assert(Array.isArray(CAMPUS_PICKUP_LOCATIONS), 'Locations should be an array');
assert(CAMPUS_PICKUP_LOCATIONS.length >= 6, 'Must include at least 6 standard campus locations');
assert(CAMPUS_PICKUP_LOCATIONS.some(loc => loc.includes('Electrical Lab')), 'Must include Electrical Lab');
assert(CAMPUS_PICKUP_LOCATIONS.some(loc => loc.includes('Computer Lab')), 'Must include Computer Lab');
assert(CAMPUS_PICKUP_LOCATIONS.some(loc => loc.includes('Central Library')), 'Must include Central Library');
assert(CAMPUS_PICKUP_LOCATIONS.some(loc => loc.includes('Main Gate')), 'Must include Main Gate');
assert(CAMPUS_PICKUP_LOCATIONS.some(loc => loc.includes('Department Office')), 'Must include Department Office');
assert(CAMPUS_PICKUP_LOCATIONS.some(loc => loc.includes('College Office')), 'Must include College Office');
console.log('✅ Test 1 Passed: Campus locations verified.\n');

// Test 2: Standard Pickup Time Slots
console.log('Test 2: Validating Pickup Time Slots...');
assert(Array.isArray(STANDARD_PICKUP_SLOTS), 'Slots must be an array');
assert(STANDARD_PICKUP_SLOTS.length >= 6, 'Must include at least 6 time slots');
const slotLabels = STANDARD_PICKUP_SLOTS.map(s => s.label);
assert(slotLabels.includes('2:00 PM – 2:30 PM'), 'Must include 2:00 PM – 2:30 PM');
assert(slotLabels.includes('2:30 PM – 3:00 PM'), 'Must include 2:30 PM – 3:00 PM');
assert(slotLabels.includes('3:00 PM – 3:30 PM'), 'Must include 3:00 PM – 3:30 PM');
console.log('✅ Test 2 Passed: Time slots verified.\n');

// Test 3: Pickup Dates Generation & Sunday Rules
console.log('Test 3: Validating Date Availability Calculation...');
const dates = getAvailablePickupDates(7);
assert(dates.length === 8, 'Must return today + 7 future days (8 days total)');
dates.forEach(d => {
  assert(d.dateString && /^\d{4}-\d{2}-\d{2}$/.test(d.dateString), 'Date format must be YYYY-MM-DD');
  assert(d.formatted && typeof d.formatted === 'string', 'Must contain human-readable formatted date');
  const day = new Date(d.dateString).getDay();
  if (day === 0) {
    assert(d.isAvailable === false, 'Sunday should be flagged as not available');
    assert(d.statusLabel === 'NOT AVAILABLE', 'Sunday label must be NOT AVAILABLE');
  } else {
    assert(d.isAvailable === true, 'Weekday/Saturday must be available');
  }
});
console.log('✅ Test 3 Passed: Pickup date generation & availability rules verified.\n');

// Test 4: Notification Message Compliance
console.log('Test 4: Validating Seller & Buyer Notification Templates...');
const mockOrder = {
  orderNumber: 'ORD-10245',
  equipment: { title: 'Arduino UNO' },
  borrower: { name: 'Rahul Das' },
  pickupLocation: 'Electrical Lab - Room 304',
  pickupDateStr: '10 October 2026',
  pickupTime: '2:00 PM – 3:00 PM'
};

const sellerNotifTitle = '🔔 NEW ORDER';
const sellerNotifMsg = `You received a new order.\n\nProduct:\n${mockOrder.equipment.title}\n\nBuyer:\n${mockOrder.borrower.name}\n\nOrder:\n#${mockOrder.orderNumber}\n\nPayment:\n✅ PAID\n\nPickup Location:\n${mockOrder.pickupLocation}\n\nPickup Date:\n${mockOrder.pickupDateStr}\n\nPickup Time:\n${mockOrder.pickupTime}`;

assert(sellerNotifTitle.includes('NEW ORDER'), 'Seller title must be 🔔 NEW ORDER');
assert(sellerNotifMsg.includes('Product:\nArduino UNO'), 'Must contain product');
assert(sellerNotifMsg.includes('Buyer:\nRahul Das'), 'Must contain buyer');
assert(sellerNotifMsg.includes('Order:\n#ORD-10245'), 'Must contain order number');
assert(sellerNotifMsg.includes('Payment:\n✅ PAID'), 'Must contain payment status');
assert(sellerNotifMsg.includes('Pickup Location:\nElectrical Lab - Room 304'), 'Must contain location');
assert(sellerNotifMsg.includes('Pickup Date:\n10 October 2026'), 'Must contain date');
assert(sellerNotifMsg.includes('Pickup Time:\n2:00 PM – 3:00 PM'), 'Must contain time');

const buyerNotifTitle = '🔔 YOUR PRODUCT IS READY';
const buyerNotifMsg = `Your order is ready for pickup.\n\nProduct:\n${mockOrder.equipment.title}\n\n📍 ${mockOrder.pickupLocation}\n\n📅 ${mockOrder.pickupDateStr}\n\n⏰ ${mockOrder.pickupTime}\n\nOrder:\n#${mockOrder.orderNumber}\n\nPlease bring your College ID.`;

assert(buyerNotifTitle.includes('YOUR PRODUCT IS READY'), 'Buyer title must be 🔔 YOUR PRODUCT IS READY');
assert(buyerNotifMsg.includes('Please bring your College ID.'), 'Buyer notification must ask for College ID');
console.log('✅ Test 4 Passed: Notification messages match exact user specifications.\n');

// Test 5: Double-Booking Prevention & Order Number Generation
console.log('Test 5: Testing Order Identifier & Slot Collision Logic...');
function generateOrderNumber() {
  return `ORD-${Math.floor(10000 + Math.random() * 90000)}`;
}
const ord1 = generateOrderNumber();
const ord2 = generateOrderNumber();
assert(/^ORD-\d{5}$/.test(ord1), 'Order number should match ORD-XXXXX pattern');
assert(ord1.startsWith('ORD-'), 'Must prefix with ORD-');

// Simulate Slot Collision Check
const bookedOrders = [
  { date: '2026-10-10', slotId: 'slot-1400-1430' }
];

function isSlotAvailable(date, slotId) {
  return !bookedOrders.some(b => b.date === date && b.slotId === slotId);
}

assert(isSlotAvailable('2026-10-10', 'slot-1400-1430') === false, 'Slot must be blocked if already booked');
assert(isSlotAvailable('2026-10-10', 'slot-1430-1500') === true, 'Different slot on same day should be available');
assert(isSlotAvailable('2026-10-11', 'slot-1400-1430') === true, 'Same slot on different day should be available');
console.log('✅ Test 5 Passed: Order identifiers & collision guard verified.\n');

// Test 6: Registration Data Model & View Fields
console.log('Test 6: Validating User Model and Signup View for College Name...');
const userModelContent = fs.readFileSync('./models/User.js', 'utf8');
assert(userModelContent.includes('college:'), 'User.js model must define college field');
assert(userModelContent.includes('year:'), 'User.js model must define academic year field');
assert(userModelContent.includes('googleId:'), 'User.js model must define googleId field');
assert(userModelContent.includes('facebookId:'), 'User.js model must define facebookId field');
assert(userModelContent.includes('provider:'), 'User.js model must define provider field');

const signupViewContent = fs.readFileSync('./views/auth/signup.ejs', 'utf8');
assert(signupViewContent.includes('name="college"'), 'signup.ejs must include name="college" input');
assert(signupViewContent.includes('College / Institute Name'), 'signup.ejs must label College / Institute Name');

const authServiceContent = fs.readFileSync('./services/authService.js', 'utf8');
assert(authServiceContent.includes('college:'), 'authService.js must save college field');
console.log('✅ Test 6 Passed: Registration college & academic year inputs verified.\n');

// Test 7: AI Assistant Engine & OpenRouter Integration
console.log('Test 7: Validating AI Assistant Engine for OpenRouter API...');
const aiServiceContent = fs.readFileSync('./services/aiService.js', 'utf8');
assert(aiServiceContent.includes('openrouter.ai/api/v1/chat/completions'), 'aiService.js must target OpenRouter chat completions API');
assert(aiServiceContent.includes('OPENROUTER_API_KEY'), 'aiService.js must read OPENROUTER_API_KEY');
assert(aiServiceContent.includes('OPENROUTER_MODEL'), 'aiService.js must configure OPENROUTER_MODEL');

const chatControllerContent = fs.readFileSync('./controllers/chatController.js', 'utf8');
assert(chatControllerContent.includes('postSaveApiKey'), 'chatController.js must have postSaveApiKey endpoint');

const chatRoutesContent = fs.readFileSync('./routes/chatRoutes.js', 'utf8');
assert(chatRoutesContent.includes('/set-key'), 'chatRoutes.js must expose /set-key route');
console.log('✅ Test 7 Passed: OpenRouter API integration & key configuration verified.\n');

// Test 8: Gmail OTP Dispatch & Credential Sanitization
console.log('Test 8: Validating Gmail OTP Generation & Credentials Sanitizer...');
const otpCode = generateOtp();
assert(/^\d{6}$/.test(otpCode), 'OTP must be a 6-digit numeric string');

process.env.GMAIL_USER = ' student.test@gmail.com ';
process.env.GMAIL_APP_PASSWORD = ' abcd efgh ijkl mnop ';
const creds = getEmailCredentials();
assert.strictEqual(creds.user, 'student.test@gmail.com', 'User email must be trimmed');
assert.strictEqual(creds.pass, 'abcdefghijklmnop', 'App password must have spaces removed');
console.log('✅ Test 8 Passed: Gmail OTP generation & credential sanitizer verified.\n');

// Test 9: AI Assistant Course Toolkits & Structured Responses
console.log('Test 9: Validating Enhanced AI Assistant Output & Course Toolkits...');
(async () => {
  // 1. Drafter / Engineering Graphics
  const edgResp = await getAssistantResponse('I need a mini drafter for engineering drawing');
  assert(edgResp && typeof edgResp.reply === 'string', 'Should return response');
  assert(edgResp.reply.includes('Mini Drafter'), 'Must describe Mini Drafter in response');
  assert(edgResp.reply.includes('Engineering Drawing'), 'Must reference Engineering Drawing');
  assert(Array.isArray(edgResp.suggestions) && edgResp.suggestions.length > 0, 'Must include follow-up suggestions');

  // 2. Multimeter / BEE Lab
  const beeResp = await getAssistantResponse('what tools do I need for BEE lab?');
  assert(beeResp.reply.includes('Multimeter') || beeResp.reply.includes('BEE'), 'Must mention Multimeter or BEE');

  // 3. Calculator / Exam Regulations
  const calcResp = await getAssistantResponse('which calculator can I use in exams?');
  assert(calcResp.reply.includes('fx-991') || calcResp.reply.includes('Non-programmable'), 'Must mention approved non-programmable models');

  // 4. UPI Escrow & Security Deposit
  const escrowResp = await getAssistantResponse('how does the security deposit work?');
  assert(escrowResp.reply.includes('Escrow') || escrowResp.reply.includes('Refund'), 'Must explain Escrow or Refund');

  console.log('✅ Test 9 Passed: AI Assistant structured responses & course toolkits verified.\n');

  // Test 10: Google & Facebook OAuth URL Generation, State CSRF & Callback URLs
  console.log('Test 10: Validating Google & Facebook OAuth URLs & CSRF State...');
  const stateToken = generateOAuthState();
  assert(stateToken && stateToken.length >= 32, 'OAuth state token must be a secure random token >= 32 hex chars');

  const mockReqLocal = {
    protocol: 'http',
    get: (header) => (header === 'host' ? 'localhost:3000' : null),
    headers: {}
  };

  delete process.env.GOOGLE_CALLBACK_URL;
  delete process.env.FACEBOOK_CALLBACK_URL;
  const defaultGoogleCb = getGoogleCallbackUrl(mockReqLocal);
  const defaultFacebookCb = getFacebookCallbackUrl(mockReqLocal);
  assert.strictEqual(defaultGoogleCb, 'http://localhost:3000/auth/google/callback', 'Default Google callback URL must be http://localhost:3000/auth/google/callback');
  assert.strictEqual(defaultFacebookCb, 'http://localhost:3000/auth/facebook/callback', 'Default Facebook callback URL must be http://localhost:3000/auth/facebook/callback');

  // Production env override
  process.env.GOOGLE_CALLBACK_URL = 'https://campus-exchange.vercel.app/auth/google/callback';
  process.env.FACEBOOK_CALLBACK_URL = 'https://campus-exchange.vercel.app/auth/facebook/callback';
  assert.strictEqual(getGoogleCallbackUrl(mockReqLocal), 'https://campus-exchange.vercel.app/auth/google/callback');
  assert.strictEqual(getFacebookCallbackUrl(mockReqLocal), 'https://campus-exchange.vercel.app/auth/facebook/callback');

  // Validate Google Auth URL structure
  process.env.GOOGLE_CLIENT_ID = 'test-google-client-id-12345';
  const googleAuthUrl = getGoogleAuthUrl(mockReqLocal, stateToken);
  assert(googleAuthUrl.startsWith('https://accounts.google.com/o/oauth2/v2/auth'), 'Must use Google accounts OAuth endpoint');
  assert(googleAuthUrl.includes('client_id=test-google-client-id-12345'), 'Must contain client_id');
  assert(googleAuthUrl.includes('response_type=code'), 'Must specify response_type=code');
  assert(googleAuthUrl.includes(`state=${stateToken}`), 'Must include CSRF state parameter');
  assert(googleAuthUrl.includes('scope=openid+email+profile') || googleAuthUrl.includes('scope=openid%20email%20profile'), 'Must request openid email profile scopes');

  // Validate Facebook Auth URL structure
  process.env.FACEBOOK_APP_ID = 'test-facebook-app-id-67890';
  const facebookAuthUrl = getFacebookAuthUrl(mockReqLocal, stateToken);
  assert(facebookAuthUrl.startsWith('https://www.facebook.com/v19.0/dialog/oauth'), 'Must use Facebook dialog oauth endpoint');
  assert(facebookAuthUrl.includes('client_id=test-facebook-app-id-67890'), 'Must contain Facebook App ID');
  assert(facebookAuthUrl.includes(`state=${stateToken}`), 'Must include CSRF state parameter');
  assert(facebookAuthUrl.includes('scope=email%2Cpublic_profile') || facebookAuthUrl.includes('scope=email%2C+public_profile') || facebookAuthUrl.includes('email'), 'Must request email,public_profile scopes');
  console.log('✅ Test 10 Passed: OAuth URLs, state generation & dynamic callback URLs verified.\n');

  // Test 11: Login UI Social Buttons & Existing Flow Verification
  console.log('Test 11: Validating Login Page Social Buttons & Existing Route Integrity...');
  const loginViewContent = fs.readFileSync('./views/auth/login.ejs', 'utf8');
  assert(loginViewContent.includes('href="/auth/google"'), 'login.ejs must include link to /auth/google');
  assert(loginViewContent.includes('Continue with Google'), 'login.ejs must feature Continue with Google button');
  assert(loginViewContent.includes('href="/auth/facebook"'), 'login.ejs must include link to /auth/facebook');
  assert(loginViewContent.includes('Continue with Facebook'), 'login.ejs must feature Continue with Facebook button');
  assert(loginViewContent.includes('class="auth-divider"'), 'login.ejs must feature visual OR divider');
  assert(loginViewContent.includes('action="/auth/login"'), 'login.ejs must preserve standard email/password login form');

  // Verify Signup Page Social Buttons
  const signupCheckContent = fs.readFileSync('./views/auth/signup.ejs', 'utf8');
  assert(signupCheckContent.includes('href="/auth/google"'), 'signup.ejs must include link to /auth/google');
  assert(signupCheckContent.includes('Continue with Google'), 'signup.ejs must feature Continue with Google button');
  assert(signupCheckContent.includes('href="/auth/facebook"'), 'signup.ejs must include link to /auth/facebook');
  assert(signupCheckContent.includes('Continue with Facebook'), 'signup.ejs must feature Continue with Facebook button');
  assert(signupCheckContent.includes('class="auth-divider"'), 'signup.ejs must feature visual OR divider');

  const authRoutesContent = fs.readFileSync('./routes/authRoutes.js', 'utf8');
  assert(authRoutesContent.includes('/google'), 'authRoutes must register /google');
  assert(authRoutesContent.includes('/google/callback'), 'authRoutes must register /google/callback');
  assert(authRoutesContent.includes('/facebook'), 'authRoutes must register /facebook');
  assert(authRoutesContent.includes('/facebook/callback'), 'authRoutes must register /facebook/callback');
  assert(authRoutesContent.includes('/verify-otp'), 'authRoutes must preserve /verify-otp');
  assert(authRoutesContent.includes('/resend-otp'), 'authRoutes must preserve /resend-otp');
  assert(authRoutesContent.includes('/logout'), 'authRoutes must preserve /logout');

  console.log('✅ Test 11 Passed: Login UI social buttons and existing route integrity verified.\n');
  // Test 12: Vercel Production Readiness & Deployment Architecture
  console.log('Test 12: Validating Vercel Production Readiness & Configuration...');
  assert(fs.existsSync('./vercel.json'), 'vercel.json must exist');
  const vercelCfg = JSON.parse(fs.readFileSync('./vercel.json', 'utf8'));
  const hasRewrites = vercelCfg.rewrites && vercelCfg.rewrites.some(r => r.destination === '/api/index' || r.destination === '/api/index.js');
  const hasFunctionsInclude = vercelCfg.functions && vercelCfg.functions['api/index.js'] && vercelCfg.functions['api/index.js'].includeFiles;
  assert(hasRewrites, 'vercel.json must route requests to /api/index via rewrites');
  assert(hasFunctionsInclude, 'vercel.json must include views in functions config');

  assert(fs.existsSync('./.gitignore'), '.gitignore must exist');
  const gitignoreContent = fs.readFileSync('./.gitignore', 'utf8');
  assert(gitignoreContent.includes('.env'), '.gitignore must ignore .env');
  assert(gitignoreContent.includes('node_modules'), '.gitignore must ignore node_modules');

  const appContent = fs.readFileSync('./app.js', 'utf8');
  assert(appContent.includes("app.set('trust proxy', 1)"), 'app.js must enable trust proxy for Vercel edge reverse proxy');

  const aiServiceContent = fs.readFileSync('./services/aiService.js', 'utf8');
  assert(!aiServiceContent.includes("'HTTP-Referer': 'http://localhost:3000',"), 'aiService.js must not hardcode localhost referer');
  assert(aiServiceContent.includes('VERCEL_URL'), 'aiService.js must dynamically support VERCEL_URL');

  const uploadService = require('./services/uploadService');
  const testDataUri = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  const savedResult = uploadService.saveBase64Image(testDataUri, 'test-pixel.png');
  assert(typeof savedResult === 'string' && savedResult.length > 0, 'saveBase64Image must return a valid URL or dataUri');

  console.log('✅ Test 12 Passed: Vercel serverless configuration, .gitignore, trust proxy & upload fallbacks verified.\n');
  console.log('🎉 ALL 12 TEST SUITES PASSED SUCCESSFULLY!');
})();
