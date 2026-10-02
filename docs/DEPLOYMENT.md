# Campus Equipment Lending Exchange - Production Deployment Guide

## Architecture Overview
- **Runtime**: Node.js 18+ Express / EJS Serverless Application
- **Hosting Platform**: Vercel Serverless Functions (`api/index.js`)
- **Database**: Firebase Realtime Database (Spark No-Cost Plan)
- **Session Store**: `FirebaseSessionStore` (serverless-compatible, stored under `/sessions` in Firebase RTDB)
- **Security Rules**: `database.rules.json` enforcing strict node-level authorization
- **Static Assets**: CSS, JavaScript, and client QR code engine served via Express and edge CDN

## Firebase Realtime Database (Spark No-Cost Plan)
The application is configured to operate fully within Firebase's no-cost Spark plan:
- **Storage Quota**: 1 GB of stored data (no Blaze billing required for standard operation).
  *Important Note*: 1 GB storage does not imply unlimited bandwidth or capacity; standard Spark plan bandwidth limits (10 GB/month) apply.
- **Record Persistence**: Academic user accounts, equipment inventory, borrow transactions, return logs, ratings, and trust scores persist indefinitely with **zero artificial application-level expiration**.
- **Security TTLs**: Only temporary OTP codes (10 minutes) and inactive sessions are subject to expiration.
- **Indexes**: Query paths (`status`, `category`, `department`, `owner`, `borrower`, `lender`, `email`) are indexed in `database.rules.json` to minimize bandwidth and query latency.

## Vercel Deployment Instructions

### Method 1: Git Integration (Recommended)
1. Push this repository to GitHub:
   ```bash
   git add .
   git commit -m "Migrate database to Firebase and fix Vercel deployment"
   git push origin main
   ```
2. Sign in to your [Vercel Dashboard](https://vercel.com).
3. Click **Add New...** &rarr; **Project** and import your repository.
4. Set the Framework Preset to **Other** (Vercel automatically detects `vercel.json`).
5. Configure **Environment Variables** in the Vercel dashboard:
   | Variable Name | Description |
   |---------------|-------------|
   | `FIREBASE_PROJECT_ID` | Firebase Project Identifier |
   | `FIREBASE_CLIENT_EMAIL` | Firebase Service Account Client Email |
   | `FIREBASE_PRIVATE_KEY` | Firebase Service Account Private Key |
   | `FIREBASE_DATABASE_URL` | Firebase Realtime Database URL (`https://<project>-default-rtdb.firebaseio.com`) |
   | `SESSION_SECRET` | Secret key for signing session cookies |
   | `NODE_ENV` | Environment identifier (`production`) |
   | `COOKIE_SECURE` | Set to `true` in production with HTTPS |
   | `ADMIN_INVITE_CODE` | Code required to register admin role (`CAMPUS_ADMIN_SECURE_2026`) |
   | `AI_ASSISTANT_NAME` | Display name of campus chatbot (`Campus Equipment Advisor`) |
   | `DEFAULT_UPI_ID` | Campus UPI Escrow VPA (`campus.equipment@icici`) |
   | `UPI_MERCHANT_NAME` | Display name for UPI QR transactions |
   | `OPENROUTER_API_KEY` | Optional: OpenRouter API key for live AI generation |
6. Click **Deploy**. Vercel will build and deploy the application.

### Method 2: Vercel CLI
1. Run deployment from the project directory:
   ```bash
   vercel
   ```
2. Add the required environment variables when prompted or in the dashboard.
3. For production rollout:
   ```bash
   vercel --prod
   ```

## Production Verification Checklist
- [x] `vercel.json` directs incoming requests to `api/index.js` with `"includeFiles": "views/**"`.
- [x] `app.set('trust proxy', 1)` enabled for Vercel edge reverse proxy compatibility.
- [x] Sessions persist via `FirebaseSessionStore` using Firebase Realtime Database.
- [x] All database operations migrated to Firebase services with 100% feature parity.
- [x] Static files (`public/css/style.css`, `public/js/main.js`, `public/js/qrcode.min.js`) served properly.
- [x] All 12 unit and 18 E2E integration test suites pass successfully.
