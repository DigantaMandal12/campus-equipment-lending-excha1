const client = require('./firebaseClient');

const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes

async function deleteOtpsByEmail(email) {
  if (!email) return;
  const cleanEmail = email.toLowerCase().trim();
  const all = (await client.get('otp')) || {};
  for (const [id, item] of Object.entries(all)) {
    if (item.email && item.email.toLowerCase() === cleanEmail) {
      await client.remove(`otp/${id}`);
    }
  }
}

async function createOtp(email, otpCode) {
  const cleanEmail = email.toLowerCase().trim();
  await deleteOtpsByEmail(cleanEmail);

  const id = client.generateKey();
  const record = {
    _id: id,
    id: id,
    email: cleanEmail,
    otp: String(otpCode).trim(),
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + OTP_TTL_MS).toISOString()
  };

  await client.set(`otp/${id}`, record);
  return record;
}

async function findOtp(email, candidateOtp) {
  if (!email || !candidateOtp) return null;
  const cleanEmail = email.toLowerCase().trim();
  const cleanCandidate = String(candidateOtp).trim();

  const all = (await client.get('otp')) || {};
  const now = Date.now();

  for (const [id, item] of Object.entries(all)) {
    if (item.email && item.email.toLowerCase() === cleanEmail) {
      const expTime = new Date(item.expiresAt || item.createdAt).getTime() + (item.expiresAt ? 0 : OTP_TTL_MS);
      if (now > expTime) {
        // Expired OTP, prune immediately
        await client.remove(`otp/${id}`);
        continue;
      }
      if (String(item.otp).trim() === cleanCandidate) {
        return item;
      }
    }
  }

  return null;
}

async function deleteOtp(id) {
  if (!id) return;
  await client.remove(`otp/${id}`);
}

module.exports = {
  createOtp,
  findOtp,
  deleteOtp,
  deleteOtpsByEmail
};
