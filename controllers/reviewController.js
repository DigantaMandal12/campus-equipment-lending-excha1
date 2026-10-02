const Review = require('../models/Review');
const Equipment = require('../models/Equipment');

exports.postAddReview = async (req, res, next) => {
  try {
    const { equipmentId, rating, comment } = req.body;

    if (!equipmentId || !rating || !comment) {
      req.session.alertError = 'Please provide both a star rating and comment.';
      return res.redirect(`/equipment/${equipmentId}`);
    }

    const numRating = Number(rating);
    if (isNaN(numRating) || numRating < 1 || numRating > 5) {
      req.session.alertError = 'Rating must be between 1 and 5.';
      return res.redirect(`/equipment/${equipmentId}`);
    }

    const equipment = await Equipment.findById(equipmentId);
    if (!equipment) {
      req.session.alertError = 'Equipment not found.';
      return res.redirect('/marketplace');
    }

    // Check if user already reviewed
    const existing = await Review.findOne({
      equipment: equipmentId,
      user: req.session.userId,
    });

    if (existing) {
      existing.rating = numRating;
      existing.comment = comment.trim();
      await existing.save();
      req.session.alertSuccess = 'Your review has been updated!';
    } else {
      await Review.create({
        equipment: equipmentId,
        user: req.session.userId,
        rating: numRating,
        comment: comment.trim(),
      });
      req.session.alertSuccess = 'Thank you for reviewing this equipment!';
    }

    return res.redirect(`/equipment/${equipmentId}`);
  } catch (err) {
    next(err);
  }
};
