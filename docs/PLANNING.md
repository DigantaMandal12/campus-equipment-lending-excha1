# Campus Equipment Lending Exchange - Project Planning

## Objectives
1. Provide a campus-wide portal for students, lab technicians, and faculty to discover and borrow academic equipment.
2. Reduce equipment hoarding and redundant purchases across academic departments.
3. Establish accountability via role authorization, automated return tracking, condition reporting, and security deposits.
4. Deliver a seamless deployment configuration for serverless hosting on Vercel.

## System Architecture Flow
```text
Browser
   ↓
EJS Views / Semantic HTML5 / Vanilla CSS
   ↓
Fetch / Standard Form Submissions (POST/GET)
   ↓
Vercel Serverless Function (api/index.js) OR Express Server (server.js)
   ↓
Express App (app.js)
   ↓
Auth / Locals / Error-Handling Middleware
   ↓
Modular Controllers (auth, equipment, borrow, review, notification, admin, chat)
   ↓
Business Services (AI guidance, OTP verification, Notifications)
   ↓
Mongoose ODM & Connection Pooling (config/db.js)
   ↓
MongoDB Atlas Cluster
   ↓
EJS Render / JSON Response
   ↓
Browser
```

## Security & Reliability Considerations
- Passwords hashed with `bcryptjs`.
- Sensitive routes guarded with `requireAuth` and `requireRole`.
- Administrative invite code required to register as campus administrator.
- No raw database or system error traces exposed to end-users (`middleware/errorHandler.js`).
- Database connections cached across serverless invocations to avoid exhaustion.
