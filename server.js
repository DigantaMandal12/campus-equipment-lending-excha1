const app = require('./app');
const connectDB = require('./config/db');

const PORT = process.env.PORT || 3000;

async function startServer() {
  try {
    await connectDB();
    console.log('[FIREBASE] Connected to Firebase Realtime Database.');
  } catch (err) {
    console.error('[DATABASE WARNING] Database initialization error at startup:', err.message);
  }

  app.listen(PORT, () => {
    console.log(`====================================================`);
    console.log(`Campus Equipment Lending Exchange Server is Running`);
    console.log(`Database:                Firebase Realtime Database`);
    console.log(`Server running at:       http://localhost:${PORT}`);
    console.log(`Smart Search:            http://localhost:${PORT}/search`);
    console.log(`AI Hardware Assistant:   http://localhost:${PORT}/chatbot`);
    console.log(`====================================================`);
  });
}

startServer();
