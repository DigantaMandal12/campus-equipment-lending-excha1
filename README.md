# Campus Equipment Lending Exchange

A web platform where students, researchers, and faculty can list, discover, borrow, return, and manage academic equipment across campus departments.

## Tech Stack
- **Backend**: Node.js & Express.js
- **Database**: Firebase Realtime Database (Spark No-Cost Plan, 1 GB Storage Quota)
- **Frontend / Templating**: EJS, Semantic HTML5, Vanilla CSS, Vanilla JavaScript
- **Deployment**: Vercel Serverless Functions (`api/index.js` and `vercel.json`)
- **Authentication & Security**: Password hashing (`bcryptjs`), Session management (`express-session` + `FirebaseSessionStore`), Role-based access control, OTP email verification, and Social OAuth (Google & Facebook).

## Core Features
1. **Academic Equipment Marketplace**: Multi-factor filtering by academic category, department, and live availability. Keyword search with partial matching.
2. **Borrow & Lending Lifecycle**: Request workflow with date ranges, purpose specification, lender approval/rejection, cancellation, and receipt confirmation.
3. **Active Loans & Returns**: Overdue status monitoring, return condition inspection notes, 48-hour return alerts, and deposit status tracking.
4. **Deposit & Escrow System**: Security deposits for delicate or high-value lab equipment held in campus escrow via UPI, marked as paid and refundable upon return.
5. **Peer Reviews & Ratings**: 1-to-5 star rating system with automated average calculation and student feedback.
6. **Campus AI Assistant**: Interactive chat interface providing instant answers about borrowing procedures, return rules, deposit guidelines, and equipment recommendations.
7. **Social Authentication**: Google & Facebook OAuth integration alongside existing local email/password registration with OTP verification.
8. **Role-Based Access Control**: Student, Teacher, and Administrator roles with protected administration panels.
9. **Automated Notifications**: In-app alerts for borrow requests, approvals, declines, return confirmations, and reminders.

## Project Structure
```text
├── api/
│   └── index.js             # Vercel serverless function entrypoint
├── config/
│   ├── db.js                # Firebase Realtime Database connection manager
│   ├── pickupConfig.js      # Campus pickup locations and date slot rules
│   └── sampleData.js        # Seed catalog data for instant development and testing
├── controllers/
│   ├── adminController.js   # Administrator oversight and role moderation
│   ├── authController.js    # Local auth, OTP, and Google/Facebook OAuth handlers
│   ├── borrowController.js  # Borrow requests, approvals, and return cycle
│   ├── chatController.js    # AI Assistant chat handling
│   ├── equipmentController.js # Marketplace discovery and CRUD operations
│   ├── notificationController.js # Alerts and notification status
│   └── reviewController.js  # Equipment ratings and reviews
├── database.rules.json      # Firebase Realtime Database security rules
├── middleware/
│   ├── auth.js              # Authentication, authorization, and view locals
│   └── errorHandler.js      # Production error safety and 404 handler
├── models/
│   ├── BorrowRequest.js     # Lending transactions and loan states
│   ├── Equipment.js         # Equipment catalog item model
│   ├── Notification.js      # User notification model
│   ├── Otp.js               # One-time passcode model with TTL invalidation
│   ├── Review.js            # Equipment peer review model
│   └── User.js              # Campus student/faculty/admin account model
├── public/
│   ├── css/style.css        # Clean responsive styles
│   └── js/                  # Client-side scripts & QR code rendering
├── routes/                  # Express route definitions
├── scripts/
│   └── migrate-mongodb-to-firebase.js # Data migration and seed pipeline
├── services/
│   ├── aiService.js         # AI Hardware Advisor engine
│   ├── authService.js       # User registration and authentication logic
│   ├── firebase/            # Firebase Realtime Database data access layer
│   │   ├── borrow.js        # Borrow repository
│   │   ├── equipment.js     # Equipment repository
│   │   ├── firebaseClient.js # Unified Firebase Admin SDK / REST / Memory client
│   │   ├── index.js         # Unified Firebase services export
│   │   ├── notifications.js # Notifications repository
│   │   ├── otp.js           # OTP repository
│   │   ├── reviews.js       # Reviews & ratings repository
│   │   ├── sessionStore.js  # Firebase session store for Vercel
│   │   └── users.js         # Users repository
│   ├── notificationService.js
│   ├── oauthService.js      # Google and Facebook OAuth 2.0 flows
│   ├── otpService.js        # 6-digit OTP dispatch and verification
│   ├── qrService.js         # Dynamic SVG QR code generator
│   └── uploadService.js     # Safe serverless base64 image handling
├── views/                   # EJS UI Templates
└── vercel.json              # Vercel deployment configuration
```

## Running Locally

1. **Clone & Install Dependencies**:
   ```bash
   npm install
   ```

2. **Configure Environment Variables**:
   Copy `.env.example` to `.env`:
   ```env
   PORT=3000
   NODE_ENV=development
   FIREBASE_PROJECT_ID=campus-equipment-exchange
   FIREBASE_DATABASE_URL=https://campus-equipment-exchange-default-rtdb.firebaseio.com
   SESSION_SECRET=campus-equipment-lending-secret-key-2026

   # Social OAuth (Optional for testing)
   GOOGLE_CLIENT_ID=
   GOOGLE_CLIENT_SECRET=
   GOOGLE_CALLBACK_URL=http://localhost:3000/auth/google/callback

   FACEBOOK_APP_ID=
   FACEBOOK_APP_SECRET=
   FACEBOOK_CALLBACK_URL=http://localhost:3000/auth/facebook/callback

   # Gmail OTP
   GMAIL_USER=your_email@gmail.com
   GMAIL_APP_PASSWORD=your_16_char_app_password
   ```

3. **Run Automated Test Suite**:
   ```bash
   npm test
   node test_firebase_e2e.js
   ```

4. **Start the Application**:
   ```bash
   npm start
   ```
   Open `http://localhost:3000` in your web browser.

## Deployment to Vercel

1. Push your repository to GitHub:
   ```bash
   git add .
   git commit -m "Migrate database to Firebase and fix Vercel deployment"
   git push origin main
   ```
2. Import the project into Vercel.
3. Add Environment Variables in Vercel Project Settings:
   - `FIREBASE_PROJECT_ID`
   - `FIREBASE_CLIENT_EMAIL`
   - `FIREBASE_PRIVATE_KEY`
   - `FIREBASE_DATABASE_URL`
   - `SESSION_SECRET`
   - `NODE_ENV=production`
   - `COOKIE_SECURE=true`
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`
   - `GOOGLE_CALLBACK_URL=https://YOUR-VERCEL-DOMAIN.vercel.app/auth/google/callback`
   - `FACEBOOK_APP_ID`
   - `FACEBOOK_APP_SECRET`
   - `FACEBOOK_CALLBACK_URL=https://YOUR-VERCEL-DOMAIN.vercel.app/auth/facebook/callback`
4. Deploy! Requests are routed automatically via `vercel.json` and `api/index.js`.
