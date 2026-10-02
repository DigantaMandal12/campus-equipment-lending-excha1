const Notification = require('../models/Notification');

exports.getNotifications = async (req, res, next) => {
  try {
    const notifications = await Notification.find({ user: req.session.userId })
      .sort({ createdAt: -1 })
      .lean();

    res.render('notifications', {
      title: 'My Notifications',
      notifications
    });
  } catch (err) {
    next(err);
  }
};

exports.postMarkAllRead = async (req, res, next) => {
  try {
    await Notification.updateMany({ user: req.session.userId }, { isRead: true });
    req.session.alertSuccess = 'All notifications marked as read.';
    res.redirect('/notifications');
  } catch (err) {
    next(err);
  }
};
