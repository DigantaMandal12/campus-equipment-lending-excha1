const User = require('../models/User');
const Equipment = require('../models/Equipment');
const BorrowRequest = require('../models/BorrowRequest');

exports.getAdminDashboard = async (req, res, next) => {
  try {
    const [totalUsers, totalEquipment, activeLoans, totalCompleted, recentRequests, users, allEquipment] = await Promise.all([
      User.countDocuments(),
      Equipment.countDocuments(),
      BorrowRequest.countDocuments({ status: { $in: ['APPROVED', 'BORROWED'] } }),
      BorrowRequest.countDocuments({ status: 'RETURNED' }),
      BorrowRequest.find().populate('equipment borrower lender').sort({ createdAt: -1 }).limit(8).lean(),
      User.find().select('-password').sort({ createdAt: -1 }).lean(),
      Equipment.find().populate('owner', 'name email department').sort({ createdAt: -1 }).lean(),
    ]);

    res.render('admin/dashboard', {
      title: 'Administrator Panel',
      stats: {
        totalUsers,
        totalEquipment,
        activeLoans,
        totalCompleted
      },
      recentRequests,
      users,
      allEquipment
    });
  } catch (err) {
    next(err);
  }
};

exports.postUpdateUserRole = async (req, res, next) => {
  try {
    const { userId, role } = req.body;
    if (!['student', 'teacher', 'admin'].includes(role)) {
      req.session.alertError = 'Invalid role specified.';
      return res.redirect('/admin');
    }

    await User.findByIdAndUpdate(userId, { role });
    req.session.alertSuccess = 'User role updated successfully.';
    return res.redirect('/admin');
  } catch (err) {
    next(err);
  }
};
