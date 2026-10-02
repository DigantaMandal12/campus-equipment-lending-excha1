const client = require('./firebaseClient');
const usersRepo = require('./users');
const equipmentRepo = require('./equipment');

async function getAllBorrowRequests(filter = {}) {
  const all = (await client.get('borrowRequests')) || {};
  let list = Object.values(all);

  if (filter.borrower) {
    const borrowerId = typeof filter.borrower === 'object' ? String(filter.borrower._id || filter.borrower.id) : String(filter.borrower);
    list = list.filter(item => {
      const bId = item.borrower && typeof item.borrower === 'object' ? String(item.borrower._id || item.borrower.id) : String(item.borrower);
      return bId === borrowerId;
    });
  }

  if (filter.lender) {
    const lenderId = typeof filter.lender === 'object' ? String(filter.lender._id || filter.lender.id) : String(filter.lender);
    list = list.filter(item => {
      const lId = item.lender && typeof item.lender === 'object' ? String(item.lender._id || item.lender.id) : String(item.lender);
      return lId === lenderId;
    });
  }

  if (filter.equipment) {
    const equipId = typeof filter.equipment === 'object' ? String(filter.equipment._id || filter.equipment.id) : String(filter.equipment);
    list = list.filter(item => {
      const eId = item.equipment && typeof item.equipment === 'object' ? String(item.equipment._id || item.equipment.id) : String(item.equipment);
      return eId === equipId;
    });
  }

  if (filter.status) {
    if (typeof filter.status === 'object') {
      if (Array.isArray(filter.status.$in)) {
        list = list.filter(item => filter.status.$in.includes(item.status));
      } else if (Array.isArray(filter.status.$nin)) {
        list = list.filter(item => !filter.status.$nin.includes(item.status));
      } else if (filter.status.$ne) {
        list = list.filter(item => item.status !== filter.status.$ne);
      }
    } else {
      list = list.filter(item => item.status === filter.status);
    }
  }

  if (filter.$or && Array.isArray(filter.$or)) {
    list = list.filter(item => {
      return filter.$or.some(clause => {
        let match = true;
        for (const [key, val] of Object.entries(clause)) {
          if (val && typeof val === 'object' && Array.isArray(val.$in)) {
            if (!val.$in.includes(item[key])) match = false;
          } else if (key === 'borrower') {
            const bId = item.borrower && typeof item.borrower === 'object' ? String(item.borrower._id || item.borrower.id) : String(item.borrower);
            if (bId !== String(val)) match = false;
          } else if (key === 'lender') {
            const lId = item.lender && typeof item.lender === 'object' ? String(item.lender._id || item.lender.id) : String(item.lender);
            if (lId !== String(val)) match = false;
          } else if (item[key] !== val) {
            match = false;
          }
        }
        return match;
      });
    });
  }

  return list;
}

async function populateBorrowRequest(request) {
  if (!request) return null;

  // Clone to avoid mutating internal cache
  const item = { ...request };

  if (item.equipment && (typeof item.equipment === 'string' || !item.equipment.title)) {
    const equipId = typeof item.equipment === 'object' ? (item.equipment._id || item.equipment.id) : item.equipment;
    const equip = await equipmentRepo.getEquipmentById(equipId, false);
    if (equip) item.equipment = equip;
  }

  if (item.borrower && (typeof item.borrower === 'string' || !item.borrower.name)) {
    const borrowerId = typeof item.borrower === 'object' ? (item.borrower._id || item.borrower.id) : item.borrower;
    const borrower = await usersRepo.getUserById(borrowerId);
    if (borrower) item.borrower = borrower;
  }

  if (item.lender && (typeof item.lender === 'string' || !item.lender.name)) {
    const lenderId = typeof item.lender === 'object' ? (item.lender._id || item.lender.id) : item.lender;
    const lender = await usersRepo.getUserById(lenderId);
    if (lender) item.lender = lender;
  }

  return item;
}

async function getBorrowRequestById(id, populateRefs = true) {
  if (!id) return null;
  const item = await client.get(`borrowRequests/${id}`);
  if (!item) return null;
  if (populateRefs) {
    return await populateBorrowRequest(item);
  }
  return item;
}

async function createBorrowRequest(data) {
  const id = data._id || data.id || client.generateKey();
  const equipId = typeof data.equipment === 'object' ? (data.equipment._id || data.equipment.id) : data.equipment;
  const borrowerId = typeof data.borrower === 'object' ? (data.borrower._id || data.borrower.id) : data.borrower;
  const lenderId = typeof data.lender === 'object' ? (data.lender._id || data.lender.id) : data.lender;

  const orderNumber = data.orderNumber || `ORD-${Math.floor(10000 + Math.random() * 90000)}`;
  const verificationCode = data.verificationCode || Math.random().toString(36).substring(2, 8).toUpperCase();

  const borrowRequest = {
    _id: id,
    id: id,
    equipment: equipId,
    borrower: borrowerId,
    lender: lenderId,
    orderNumber,
    startDate: data.startDate ? new Date(data.startDate).toISOString() : new Date().toISOString(),
    endDate: data.endDate ? new Date(data.endDate).toISOString() : new Date().toISOString(),
    purpose: (data.purpose || 'Academic course project / lab research').trim(),
    status: data.status || 'PENDING',
    depositAmount: Number(data.depositAmount) || 0,
    paymentStatus: data.paymentStatus || 'WAIVED',
    paymentDetails: data.paymentDetails || {
      paymentMethod: 'UPI',
      upiId: '',
      payeeUpiId: 'campus.equipment@icici',
      transactionId: '',
      paymentApp: 'UPI',
      receiptNumber: '',
      amount: 0
    },
    refundDetails: data.refundDetails || {
      refundMethod: 'UPI',
      refundTxnId: '',
      refundUpiId: '',
      refundAmount: 0
    },
    pickupLocation: (data.pickupLocation || 'Electrical Lab - Room 304 (Engineering Building)').trim(),
    pickupDate: data.pickupDate ? new Date(data.pickupDate).toISOString() : new Date().toISOString(),
    pickupTime: data.pickupTime || '2:00 PM – 2:30 PM',
    pickupSlotId: data.pickupSlotId || 'slot-1400-1430',
    handoverStatus: data.handoverStatus || 'PENDING',
    readyForPickupAt: data.readyForPickupAt ? new Date(data.readyForPickupAt).toISOString() : null,
    handoverAt: data.handoverAt ? new Date(data.handoverAt).toISOString() : null,
    handoverNotes: data.handoverNotes || '',
    collegeIdVerified: Boolean(data.collegeIdVerified),
    verificationCode,
    returnDate: data.returnDate ? new Date(data.returnDate).toISOString() : null,
    returnNotes: data.returnNotes || '',
    createdAt: data.createdAt ? new Date(data.createdAt).toISOString() : new Date().toISOString()
  };

  await client.set(`borrowRequests/${id}`, borrowRequest);
  return borrowRequest;
}

async function updateBorrowRequest(id, updates) {
  if (!id) return null;
  const existing = await client.get(`borrowRequests/${id}`);
  if (!existing) return null;

  const updated = {
    ...existing,
    ...updates,
    _id: id,
    id: id
  };

  await client.set(`borrowRequests/${id}`, updated);
  return updated;
}

async function countBorrowRequests(filter = {}) {
  const items = await getAllBorrowRequests(filter);
  return items.length;
}

module.exports = {
  getAllBorrowRequests,
  getBorrowRequestById,
  createBorrowRequest,
  updateBorrowRequest,
  countBorrowRequests,
  populateBorrowRequest
};
