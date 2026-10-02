const Equipment = require('../models/Equipment');
const Review = require('../models/Review');
const BorrowRequest = require('../models/BorrowRequest');
const { saveBase64Image } = require('../services/uploadService');
const { CAMPUS_PICKUP_LOCATIONS, STANDARD_PICKUP_SLOTS, getAvailablePickupDates } = require('../config/pickupConfig');
const { isDbConnected } = require('../config/db');
const { getFallbackEquipment, getFallbackEquipmentById, filterFallbackEquipment } = require('../config/sampleData');

const CATEGORIES = [
  'Lab Equipment',
  'Electronics',
  'Calculators',
  'Laptops & Tablets',
  'Audio/Visual',
  'Books & Manuals',
  'Mechanical & Tools',
  'Other'
];

const DEPARTMENTS = [
  'Computer Science',
  'Electrical & Electronics',
  'Mechanical Engineering',
  'Civil Engineering',
  'Physics & Chemistry',
  'Biotechnology',
  'Mathematics',
  'General'
];

// Marketplace view with robust search & multi-factor filters
exports.getMarketplace = async (req, res, next) => {
  try {
    const { q, category, department, availability } = req.query;

    const filter = {};

    // 1. Search filter: case-insensitive, trimmed, partial match on title and description
    if (q && q.trim()) {
      const cleanQ = q.trim();
      filter.$or = [
        { title: { $regex: cleanQ, $options: 'i' } },
        { description: { $regex: cleanQ, $options: 'i' } },
        { location: { $regex: cleanQ, $options: 'i' } },
      ];
    }

    // 2. Category filter
    if (category && category !== 'ALL') {
      filter.category = category;
    }

    // 3. Department filter
    if (department && department !== 'ALL') {
      filter.department = department;
    }

    // 4. Availability filter
    if (availability === 'AVAILABLE') {
      filter.status = 'AVAILABLE';
    } else if (availability === 'UNAVAILABLE') {
      filter.status = { $ne: 'AVAILABLE' };
    } else {
      // By default exclude DRAFT unless owned by current user
      filter.status = { $in: ['AVAILABLE', 'UNAVAILABLE', 'BORROWED'] };
    }

    let equipmentList = [];
    if (isDbConnected()) {
      equipmentList = await Equipment.find(filter)
        .populate('owner', 'name email department')
        .sort({ createdAt: -1 })
        .lean();
    } else {
      equipmentList = filterFallbackEquipment(q, category, department, availability);
    }

    res.render('marketplace', {
      title: 'Equipment Marketplace',
      equipmentList,
      categories: CATEGORIES,
      departments: DEPARTMENTS,
      selectedCategory: category || 'ALL',
      selectedDepartment: department || 'ALL',
      selectedAvailability: availability || 'ALL',
      searchQuery: q ? q.trim() : ''
    });
  } catch (err) {
    console.warn('[MARKETPLACE DB FALLBACK]', err.message);
    const { q, category, department, availability } = req.query;
    res.render('marketplace', {
      title: 'Equipment Marketplace',
      equipmentList: filterFallbackEquipment(q, category, department, availability),
      categories: CATEGORIES,
      departments: DEPARTMENTS,
      selectedCategory: category || 'ALL',
      selectedDepartment: department || 'ALL',
      selectedAvailability: availability || 'ALL',
      searchQuery: q ? q.trim() : ''
    });
  }
};

// Details view
exports.getEquipmentDetails = async (req, res, next) => {
  try {
    const { id } = req.params;
    let equipment = null;
    if (isDbConnected()) {
      equipment = await Equipment.findById(id).populate('owner', 'name email department phone upiId').lean();
    } else {
      equipment = getFallbackEquipmentById(id);
    }

    if (!equipment) {
      return res.status(404).render('error', {
        title: 'Equipment Not Found',
        statusCode: 404,
        message: 'The requested equipment item was not found.'
      });
    }

    // Fetch reviews
    const reviews = await Review.find({ equipment: id }).populate('user', 'name department').sort({ createdAt: -1 }).lean();

    // Check if current user is owner
    const isOwner = req.session && req.session.userId && String(equipment.owner._id) === String(req.session.userId);
    const isAdmin = req.session && req.session.userRole === 'admin';

    // Check if user has an active/pending borrow request
    let activeRequest = null;
    if (req.session && req.session.userId) {
      activeRequest = await BorrowRequest.findOne({
        equipment: id,
        borrower: req.session.userId,
        status: { $in: ['PENDING', 'APPROVED', 'PREPARING', 'READY_FOR_PICKUP', 'BORROWED'] }
      }).lean();
    }

    // Existing bookings for this equipment to determine slot occupancy (prevent double booking)
    const existingBookings = await BorrowRequest.find({
      equipment: id,
      status: { $nin: ['CANCELLED', 'REJECTED', 'RETURNED'] }
    }).select('pickupDate pickupSlotId').lean();

    const bookedSlotsMap = {};
    existingBookings.forEach(b => {
      if (b.pickupDate && b.pickupSlotId) {
        const dStr = new Date(b.pickupDate).toISOString().split('T')[0];
        const key = `${dStr}_${b.pickupSlotId}`;
        bookedSlotsMap[key] = true;
      }
    });

    const availableDates = getAvailablePickupDates(7);

    // Merge predefined campus locations with equipment's designated location
    let pickupLocations = [...CAMPUS_PICKUP_LOCATIONS];
    if (equipment.location && !pickupLocations.includes(equipment.location)) {
      pickupLocations.unshift(equipment.location);
    }

    res.render('equipment/details', {
      title: `${equipment.title} - Details`,
      equipment,
      reviews,
      isOwner,
      isAdmin,
      activeRequest,
      pickupLocations,
      availableDates,
      pickupSlots: STANDARD_PICKUP_SLOTS,
      bookedSlotsMap
    });
  } catch (err) {
    next(err);
  }
};

// Render Add Equipment form
exports.getAddEquipment = (req, res) => {
  res.render('equipment/add', {
    title: 'Add Academic Equipment',
    categories: CATEGORIES,
    departments: DEPARTMENTS,
    error: null,
    formData: {}
  });
};

// Process Add Equipment
exports.postAddEquipment = async (req, res, next) => {
  try {
    const { title, description, category, department, condition, depositAmount, dailyFee, location, serialNumber, imageUrl } = req.body;

    if (!title || !description || !category) {
      return res.render('equipment/add', {
        title: 'Add Academic Equipment',
        categories: CATEGORIES,
        departments: DEPARTMENTS,
        error: 'Please enter the item name, description, and category.',
        formData: req.body
      });
    }

    // Process image: decode base64 upload or use pasted URL
    let finalImageUrl = imageUrl ? imageUrl.trim() : '';
    if (finalImageUrl.startsWith('data:image/')) {
      try {
        finalImageUrl = saveBase64Image(finalImageUrl, title);
      } catch (err) {
        console.error('[IMAGE UPLOAD ERROR in postAddEquipment]', err.message);
      }
    }

    const equipment = new Equipment({
      title: title.trim(),
      description: description.trim(),
      category,
      department: department || 'General',
      condition: condition || 'Good',
      depositAmount: Number(depositAmount) || 0,
      dailyFee: Number(dailyFee) || 0,
      location: location ? location.trim() : 'Campus Lab / Library',
      serialNumber: serialNumber ? serialNumber.trim() : '',
      imageUrl: finalImageUrl,
      owner: req.session.userId,
      status: 'AVAILABLE'
    });

    await equipment.save();

    req.session.alertSuccess = 'Equipment listed successfully on the Marketplace!';
    return res.redirect(`/equipment/${equipment._id}`);
  } catch (err) {
    next(err);
  }
};

// Render Edit Equipment form
exports.getEditEquipment = async (req, res, next) => {
  try {
    const { id } = req.params;
    const equipment = await Equipment.findById(id).lean();

    if (!equipment) {
      return res.status(404).render('error', {
        title: 'Item Not Found',
        statusCode: 404,
        message: 'Equipment item not found.'
      });
    }

    const isOwner = String(equipment.owner) === String(req.session.userId);
    const isAdmin = req.session.userRole === 'admin';

    if (!isOwner && !isAdmin) {
      return res.status(403).render('error', {
        title: 'Unauthorized',
        statusCode: 403,
        message: 'You are not authorized to edit this equipment.'
      });
    }

    res.render('equipment/edit', {
      title: `Edit ${equipment.title}`,
      equipment,
      categories: CATEGORIES,
      departments: DEPARTMENTS,
      error: null
    });
  } catch (err) {
    next(err);
  }
};

// Process Edit Equipment
exports.postEditEquipment = async (req, res, next) => {
  try {
    const { id } = req.params;
    const equipment = await Equipment.findById(id);

    if (!equipment) {
      return res.status(404).render('error', {
        title: 'Item Not Found',
        statusCode: 404,
        message: 'Equipment not found.'
      });
    }

    const isOwner = String(equipment.owner) === String(req.session.userId);
    const isAdmin = req.session.userRole === 'admin';

    if (!isOwner && !isAdmin) {
      return res.status(403).render('error', {
        title: 'Unauthorized',
        statusCode: 403,
        message: 'You are not authorized to update this item.'
      });
    }

    const { title, description, category, department, condition, status, depositAmount, dailyFee, location, imageUrl } = req.body;

    equipment.title = title.trim();
    equipment.description = description.trim();
    equipment.category = category;
    equipment.department = department || 'General';
    equipment.condition = condition || 'Good';
    if (status) equipment.status = status;
    equipment.depositAmount = Number(depositAmount) || 0;
    equipment.dailyFee = Number(dailyFee) || 0;
    equipment.location = location ? location.trim() : equipment.location;
    
    if (imageUrl !== undefined) {
      let finalImageUrl = imageUrl.trim();
      if (finalImageUrl.startsWith('data:image/')) {
        try {
          finalImageUrl = saveBase64Image(finalImageUrl, equipment.title);
        } catch (err) {
          console.error('[IMAGE UPLOAD ERROR in postEditEquipment]', err.message);
        }
      }
      equipment.imageUrl = finalImageUrl;
    }

    await equipment.save();

    req.session.alertSuccess = 'Equipment details updated successfully.';
    return res.redirect(`/equipment/${equipment._id}`);
  } catch (err) {
    next(err);
  }
};

// Process Delete Equipment
exports.postDeleteEquipment = async (req, res, next) => {
  try {
    const { id } = req.params;
    const equipment = await Equipment.findById(id);

    if (!equipment) {
      req.session.alertError = 'Equipment not found.';
      return res.redirect('/marketplace');
    }

    const isOwner = String(equipment.owner) === String(req.session.userId);
    const isAdmin = req.session.userRole === 'admin';

    if (!isOwner && !isAdmin) {
      return res.status(403).render('error', {
        title: 'Unauthorized',
        statusCode: 403,
        message: 'You are not authorized to delete this equipment.'
      });
    }

    // Check if there are active loans
    const activeLoans = await BorrowRequest.find({
      equipment: id,
      status: { $in: ['APPROVED', 'BORROWED'] }
    });

    if (activeLoans.length > 0) {
      req.session.alertError = 'Cannot delete equipment that is currently borrowed or has approved bookings.';
      return res.redirect(`/equipment/${id}`);
    }

    await Equipment.findByIdAndDelete(id);
    req.session.alertSuccess = 'Equipment removed from catalog.';
    return res.redirect('/marketplace');
  } catch (err) {
    next(err);
  }
};

// API Endpoint for async image upload (Base64 file upload)
exports.apiUploadImage = async (req, res) => {
  try {
    const { image, filename } = req.body;
    if (!image) {
      return res.status(400).json({ success: false, message: 'No image data provided.' });
    }
    const savedUrl = saveBase64Image(image, filename || 'equipment-photo.png');
    return res.json({ success: true, imageUrl: savedUrl });
  } catch (err) {
    console.error('[API UPLOAD ERROR]', err);
    return res.status(400).json({ success: false, message: err.message || 'Image upload failed.' });
  }
};
