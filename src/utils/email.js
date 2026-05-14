const nodemailer = require('nodemailer');

// Build transporter from env vars — falls back to console mock if not configured
const buildTransporter = () => {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) return null;
  if (SMTP_USER.includes('your_') || SMTP_PASS.includes('your_')) return null;
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT) || 587,
    secure: Number(SMTP_PORT) === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
};

const sendEmail = async (email, subject, text, html) => {
  const transporter = buildTransporter();
  if (!transporter) {
    console.log(`[EMAIL MOCK] To: ${email} | Subject: ${subject}`);
    return true;
  }
  try {
    await transporter.sendMail({
      from: `"${process.env.SMTP_FROM_NAME || 'Global Loan'}" <${process.env.SMTP_USER}>`,
      to: email,
      subject,
      text,
      html: html || `<p>${text}</p>`,
    });
    console.log(`[EMAIL SENT] To: ${email} | Subject: ${subject}`);
    return true;
  } catch (err) {
    console.error(`[EMAIL ERROR] To: ${email} | ${err.message}`);
    return false;
  }
};

module.exports = { sendEmail };
