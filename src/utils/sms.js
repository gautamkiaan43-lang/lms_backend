const twilio = require('twilio');

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const twilioPhone = process.env.TWILIO_PHONE_NUMBER;

const isPlaceholder = !accountSid || !authToken ||
  accountSid.includes('xxxx') ||
  authToken.includes('your_') ||
  twilioPhone === '+1234567890';

let client;
if (!isPlaceholder) {
  client = twilio(accountSid, authToken);
} else {
  console.log('[Twilio] Using mock mode — dummy credentials detected');
}

const sendSMS = async (to, body) => {
  try {
    if (!client) {
      console.log(`[Twilio Mock] SMS to ${to}: ${body}`);
      return true;
    }
    const message = await client.messages.create({
      body,
      from: twilioPhone,
      to,
    });
    console.log(`[Twilio SMS] Sent to ${to} (SID: ${message.sid})`);
    return true;
  } catch (error) {
    console.error(`[Twilio Error] Failed to send SMS to ${to}:`, error.message);
    return false;
  }
};

module.exports = { sendSMS };
