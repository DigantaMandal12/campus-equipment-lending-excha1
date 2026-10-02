const otpRepo = require('../services/firebase/otp');

const Otp = {
  deleteMany: async function (query = {}) {
    if (query.email) {
      await otpRepo.deleteOtpsByEmail(query.email);
    }
    return { acknowledged: true };
  },

  create: async function (data = {}) {
    return await otpRepo.createOtp(data.email, data.otp);
  },

  findOne: async function (query = {}) {
    return await otpRepo.findOtp(query.email, query.otp);
  },

  deleteOne: async function (query = {}) {
    const id = query._id || query.id;
    if (id) {
      await otpRepo.deleteOtp(id);
    }
    return { acknowledged: true };
  }
};

module.exports = Otp;
