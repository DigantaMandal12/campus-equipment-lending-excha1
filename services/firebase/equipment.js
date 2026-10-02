const client = require('./firebaseClient');
const usersRepo = require('./users');

async function getAllEquipment(filter = {}) {
  const all = (await client.get('equipment')) || {};
  let list = Object.values(all);

  if (filter.status) {
    if (typeof filter.status === 'object') {
      if (Array.isArray(filter.status.$in)) {
        list = list.filter(item => filter.status.$in.includes(item.status));
      } else if (filter.status.$ne) {
        list = list.filter(item => item.status !== filter.status.$ne);
      }
    } else {
      list = list.filter(item => item.status === filter.status);
    }
  }

  if (filter.category && filter.category !== 'ALL') {
    list = list.filter(item => item.category === filter.category);
  }

  if (filter.department && filter.department !== 'ALL') {
    list = list.filter(item => item.department === filter.department);
  }

  if (filter.owner) {
    const ownerId = typeof filter.owner === 'object' ? String(filter.owner._id || filter.owner.id) : String(filter.owner);
    list = list.filter(item => {
      const itemOwnerId = item.owner && typeof item.owner === 'object' ? String(item.owner._id || item.owner.id) : String(item.owner);
      return itemOwnerId === ownerId;
    });
  }

  if (filter.$or && Array.isArray(filter.$or)) {
    list = list.filter(item => {
      return filter.$or.some(clause => {
        for (const [key, val] of Object.entries(clause)) {
          if (val && val.$regex) {
            const regex = new RegExp(val.$regex, val.$options || 'i');
            if (regex.test(item[key] || '')) return true;
          }
        }
        return false;
      });
    });
  }

  return list;
}

async function getEquipmentById(id, populateOwner = false) {
  if (!id) return null;
  const item = await client.get(`equipment/${id}`);
  if (!item) return null;

  if (populateOwner && item.owner) {
    const ownerId = typeof item.owner === 'object' ? (item.owner._id || item.owner.id) : item.owner;
    const owner = await usersRepo.getUserById(ownerId);
    if (owner) {
      item.owner = {
        _id: owner._id,
        id: owner._id,
        name: owner.name,
        email: owner.email,
        department: owner.department,
        phone: owner.phone || '',
        upiId: owner.upiId || ''
      };
    }
  }

  // Virtual name property
  if (!item.name && item.title) {
    item.name = item.title;
  }

  return item;
}

async function createEquipment(data) {
  const id = data._id || data.id || client.generateKey();
  const ownerId = typeof data.owner === 'object' ? (data.owner._id || data.owner.id) : data.owner;

  const equipment = {
    _id: id,
    id: id,
    title: (data.title || '').trim(),
    name: (data.title || '').trim(),
    description: (data.description || '').trim(),
    category: data.category || 'Electronics',
    department: data.department || 'General',
    condition: data.condition || 'Good',
    status: data.status || 'AVAILABLE',
    depositAmount: Number(data.depositAmount) || 0,
    dailyFee: Number(data.dailyFee) || 0,
    owner: ownerId,
    imageUrl: data.imageUrl || '',
    serialNumber: (data.serialNumber || '').trim(),
    location: (data.location || 'Campus Library / Lab').trim(),
    averageRating: Number(data.averageRating) || 0,
    ratingsCount: Number(data.ratingsCount) || 0,
    createdAt: data.createdAt ? new Date(data.createdAt).toISOString() : new Date().toISOString()
  };

  await client.set(`equipment/${id}`, equipment);
  return equipment;
}

async function updateEquipment(id, updates) {
  if (!id) return null;
  const existing = await getEquipmentById(id);
  if (!existing) return null;

  const updated = {
    ...existing,
    ...updates,
    _id: id,
    id: id,
    name: updates.title ? updates.title.trim() : existing.title
  };

  await client.set(`equipment/${id}`, updated);
  return updated;
}

async function deleteEquipment(id) {
  if (!id) return false;
  return await client.remove(`equipment/${id}`);
}

async function countEquipment(filter = {}) {
  const items = await getAllEquipment(filter);
  return items.length;
}

module.exports = {
  getAllEquipment,
  getEquipmentById,
  createEquipment,
  updateEquipment,
  deleteEquipment,
  countEquipment
};
