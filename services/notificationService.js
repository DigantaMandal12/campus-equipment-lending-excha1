const Notification = require('../models/Notification');

async function createNotification({ userId, title, message, type = 'SYSTEM', link = '/dashboard' }) {
  try {
    if (!userId || !message) return null;
    return await Notification.create({
      user: userId,
      title: title || 'Campus Lending Alert',
      message,
      type,
      link,
    });
  } catch (err) {
    console.error('[NOTIFICATION ERROR] Failed to create notification:', err.message);
    return null;
  }
}

module.exports = {
  createNotification,
};
