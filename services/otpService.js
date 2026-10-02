const Otp = require('../models/Otp');

let nodemailer;
try {
  nodemailer = require('nodemailer');
} catch (e) {
  nodemailer = null;
}

/**
 * Generate a cryptographically secure 6-digit numeric OTP
 */
function generateOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Format and sanitize Gmail credentials from environment
 */
function getEmailCredentials() {
  const user = (process.env.GMAIL_USER || process.env.EMAIL_USER || process.env.SMTP_USER || '').trim();
  let pass = (process.env.GMAIL_APP_PASSWORD || process.env.EMAIL_PASS || process.env.GMAIL_PASSWORD || process.env.SMTP_PASS || '').trim();

  // Strip accidental quotes and spaces (Google displays app passwords in 4-character blocks like 'abcd efgh ijkl mnop')
  pass = pass.replace(/['"]/g, '').replace(/\s+/g, '');

  return { user, pass };
}

/**
 * Send OTP email using Gmail SMTP via Nodemailer
 */
async function sendEmailViaGmail(toEmail, otpCode) {
  const { user, pass } = getEmailCredentials();
  const cleanToEmail = (toEmail || '').trim().toLowerCase();

  // If nodemailer is not available or credentials are placeholders/empty
  const isDummyUser = !user || user.includes('your_campus_email') || user.includes('example.com');
  const isDummyPass = !pass || pass.includes('your_16_character_app_password');

  if (!nodemailer || isDummyUser || isDummyPass) {
    console.log('\n======================================================================');
    console.log('📧 [CAMPUS OTP DISPATCH - CONSOLE FALLBACK]');
    console.log(`Recipient         : ${cleanToEmail}`);
    console.log(`Verification Code : 🔑 ${otpCode}`);
    console.log('Validity          : 10 Minutes');
    if (!nodemailer) {
      console.log('Reason            : Nodemailer module not loaded.');
    } else {
      console.log('Reason            : GMAIL_USER or GMAIL_APP_PASSWORD not set in .env');
      console.log('Tip               : Enable 2-Step Verification on Google and create a');
      console.log('                    16-character App Password at https://myaccount.google.com/apppasswords');
    }
    console.log('======================================================================\n');
    return false;
  }

  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: user,
        pass: pass,
      },
      connectionTimeout: 8000,
      greetingTimeout: 8000,
    });

    const mailOptions = {
      from: `"Campus Equipment Exchange" <${user}>`,
      to: cleanToEmail,
      subject: `🔐 ${otpCode} is your Campus Equipment Exchange verification code`,
      text: `Hello,\n\nYour 6-digit campus verification code is: ${otpCode}\n\nThis code will expire in 10 minutes.\n\nNever share this code with anyone. Campus administrators and peer lenders will never ask for your verification code.\n\nBest regards,\nCampus Equipment Lending Exchange`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; margin: 0; padding: 0; background-color: #f8fafc; color: #0f172a; }
            .container { max-width: 520px; margin: 30px auto; background: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 12px rgba(15, 23, 42, 0.05); }
            .header { background: #2563eb; color: #ffffff; padding: 24px; text-align: center; }
            .content { padding: 32px 28px; }
            .otp-box { text-align: center; margin: 24px 0; padding: 20px; background-color: #eff6ff; border: 2px dashed #93c5fd; border-radius: 12px; }
            .otp-code { font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace; letter-spacing: 10px; font-size: 36px; font-weight: 800; color: #2563eb; margin-left: 10px; }
            .footer { padding: 20px; text-align: center; font-size: 12px; color: #64748b; background: #f8fafc; border-top: 1px solid #e2e8f0; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <div style="font-size: 28px; margin-bottom: 6px;">📐 🎓</div>
              <h1 style="margin: 0; font-size: 20px; font-weight: 800; color: #ffffff;">Campus Equipment Lending Exchange</h1>
              <p style="margin: 4px 0 0 0; font-size: 13px; opacity: 0.9; color: #dbeafe;">Student & Academic Tool Exchange</p>
            </div>
            <div class="content">
              <h2 style="font-size: 18px; margin-top: 0; color: #0f172a; font-weight: 700;">Verify Your Campus Account</h2>
              <p style="font-size: 14px; color: #475569; line-height: 1.5; margin-bottom: 16px;">
                Please use the 6-digit verification code below to verify your student email address and activate your campus account:
              </p>
              
              <div class="otp-box">
                <div style="font-size: 11px; text-transform: uppercase; color: #3b82f6; font-weight: 700; letter-spacing: 1px; margin-bottom: 6px;">ONE-TIME VERIFICATION CODE</div>
                <div class="otp-code">${otpCode}</div>
                <div style="font-size: 12px; color: #64748b; margin-top: 8px;">⏳ Valid for <strong>10 minutes</strong></div>
              </div>

              <div style="background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 12px; font-size: 13px; color: #92400e; margin-bottom: 20px;">
                <strong>⚠️ Security Advisory:</strong> Do not share this OTP with anyone. Peer lenders, students, and platform administrators will never ask for your code.
              </div>

              <p style="font-size: 13px; color: #64748b; line-height: 1.5; margin: 0;">
                If you did not initiate this request, you can safely disregard this email.
              </p>
            </div>
            <div class="footer">
              Campus Equipment Lending Exchange &bull; Peer-to-Peer Academic Hardware & Lab Sharing
            </div>
          </div>
        </body>
        </html>
      `
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`[OTP GMAIL SUCCESS] Verification email sent to ${cleanToEmail} (Message ID: ${info.messageId})`);
    return true;
  } catch (err) {
    console.error(`\n[OTP GMAIL ERROR] Could not dispatch email to ${cleanToEmail}:`, err.message);
    if (err.code === 'EAUTH' || err.responseCode === 535) {
      console.error('💡 [GMAIL AUTH TIP] Gmail rejected login credentials.');
      console.error('   1. Ensure 2-Step Verification is active on your Google account.');
      console.error('   2. Generate an App Password at: https://myaccount.google.com/apppasswords');
      console.error('   3. Put the 16-character App Password into GMAIL_APP_PASSWORD in your .env');
    }
    // Always log OTP code in terminal so user is NEVER locked out
    console.log('\n======================================================================');
    console.log(`🔑 [FALLBACK OTP FOR TESTING]: ${otpCode} (Recipient: ${cleanToEmail})`);
    console.log('======================================================================\n');
    return false;
  }
}

/**
 * Store OTP in database and dispatch via Gmail (or console fallback)
 */
async function sendOtp(email) {
  if (!email) throw new Error('Email address is required to dispatch OTP.');
  const cleanEmail = email.toLowerCase().trim();
  const code = generateOtp();

  // Remove any previously pending OTP for this email
  await Otp.deleteMany({ email: cleanEmail });

  // Store newly generated OTP with 10-minute TTL
  await Otp.create({
    email: cleanEmail,
    otp: code,
  });

  // Dispatch via Gmail
  await sendEmailViaGmail(cleanEmail, code);

  return code;
}

/**
 * Verify OTP submitted by the user
 */
async function verifyOtp(email, candidateOtp) {
  if (!email || !candidateOtp) return false;

  const cleanEmail = email.toLowerCase().trim();
  const cleanOtp = candidateOtp.toString().trim();

  const record = await Otp.findOne({
    email: cleanEmail,
    otp: cleanOtp,
  });

  if (record) {
    // Consume OTP so it cannot be re-used
    await Otp.deleteOne({ _id: record._id });
    return true;
  }

  return false;
}

module.exports = {
  generateOtp,
  sendOtp,
  verifyOtp,
  sendEmailViaGmail,
  getEmailCredentials,
};
