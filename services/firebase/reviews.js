const client = require('./firebaseClient');
const usersRepo = require('./users');
const equipmentRepo = require('./equipment');

async function getReviews(filter = {}) {
  const all = (await client.get('reviews')) || {};
  let list = Object.values(all);

  if (filter.equipment) {
    const equipId = typeof filter.equipment === 'object' ? String(filter.equipment._id || filter.equipment.id) : String(filter.equipment);
    list = list.filter(r => String(r.equipment) === equipId);
  }

  if (filter.user) {
    const userId = typeof filter.user === 'object' ? String(filter.user._id || filter.user.id) : String(filter.user);
    list = list.filter(r => {
      const rUserId = r.user && typeof r.user === 'object' ? String(r.user._id || r.user.id) : String(r.user);
      return rUserId === userId;
    });
  }

  // Populate users
  for (const r of list) {
    if (r.user && (typeof r.user === 'string' || !r.user.name)) {
      const u = await usersRepo.getUserById(typeof r.user === 'object' ? (r.user._id || r.user.id) : r.user);
      if (u) {
        r.user = {
          _id: u._id,
          id: u._id,
          name: u.name,
          department: u.department
        };
      }
    }
  }

  return list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

async function recalculateEquipmentRating(equipmentId) {
  if (!equipmentId) return;
  const allReviews = (await client.get('reviews')) || {};
  const equipReviews = Object.values(allReviews).filter(r => String(r.equipment) === String(equipmentId));
  const count = equipReviews.length;
  const avg = count > 0 ? equipReviews.reduce((sum, r) => sum + Number(r.rating || 0), 0) / count : 0;

  const finalRating = Math.round(avg * 10) / 10;
  await equipmentRepo.updateEquipment(equipmentId, {
    rating: finalRating,
    averageRating: finalRating,
    ratingsCount: count,
    numReviews: count
  });
}

async function createReview(data) {
  const id = data._id || data.id || client.generateKey();
  const equipId = typeof data.equipment === 'object' ? (data.equipment._id || data.equipment.id) : data.equipment;
  const userId = typeof data.user === 'object' ? (data.user._id || data.user.id) : data.user;

  const review = {
    _id: id,
    id: id,
    equipment: equipId,
    user: userId,
    rating: Number(data.rating),
    comment: (data.comment || '').trim(),
    createdAt: data.createdAt ? new Date(data.createdAt).toISOString() : new Date().toISOString()
  };

  await client.set(`reviews/${id}`, review);
  await recalculateEquipmentRating(equipId);
  return review;
}

async function updateReview(id, updates) {
  if (!id) return null;
  const existing = await client.get(`reviews/${id}`);
  if (!existing) return null;

  const updated = { ...existing, ...updates, _id: id, id: id };
  await client.set(`reviews/${id}`, updated);
  await recalculateEquipmentRating(updated.equipment);
  return updated;
}

module.exports = {
  getReviews,
  createReview,
  updateReview,
  recalculateEquipmentRating
};
