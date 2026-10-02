const client = require('./firebaseClient');

async function getNotificationsByUser(userId) {
  if (!userId) return [];
  const all = (await client.get('notifications')) || {};
  const list = Object.values(all).filter(n => {
    const nUserId = n.user && typeof n.user === 'object' ? (n.user._id || n.user.id) : n.user;
    return String(nUserId) === String(userId);
  });
  return list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

async function createNotification(data) {
  const id = data._id || data.id || client.generateKey();
  const userId = typeof data.user === 'object' ? (data.user._id || data.user.id) : data.user;

  const notif = {
    _id: id,
    id: id,
    user: userId,
    title: (data.title || 'Campus Lending Alert').trim(),
    message: (data.message || '').trim(),
    type: data.type || 'SYSTEM',
    link: data.link || '/dashboard',
    isRead: Boolean(data.isRead),
    createdAt: data.createdAt ? new Date(data.createdAt).toISOString() : new Date().toISOString()
  };

  await client.set(`notifications/${id}`, notif);
  return notif;
}

async function markAllRead(userId) {
  if (!userId) return;
  const all = (await client.get('notifications')) || {};
  for (const [id, notif] of Object.entries(all)) {
    const nUserId = notif.user && typeof notif.user === 'object' ? (notif.user._id || notif.user.id) : notif.user;
    if (String(nUserId) === String(userId) && !notif.isRead) {
      await client.update(`notifications/${id}`, { isRead: true });
    }
  }
}

module.exports = {
  getNotificationsByUser,
  createNotification,
  markAllRead
};
