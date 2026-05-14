const cron = require('node-cron');
const prisma = require('../config/db');
const { calculateLateFee } = require('../services/payment.service');
const { sendLoanReminders } = require('../services/reminder.service');

const start = () => {
  // 1. Calculate overdue and update penalties at 1:00 AM daily
  cron.schedule('0 1 * * *', async () => {
    console.log('[Cron] Running daily penalty updates at 1:00 AM');
    try {
      const { processDailyPenalties } = require('../services/emi.service');
      await processDailyPenalties();
      console.log('[Cron] Penalty updates completed.');
    } catch (error) {
      console.error('[Cron Penalty Error]', error.message);
    }
  });

  // 2. Send SMS reminders at 8:00 AM daily
  cron.schedule('0 8 * * *', async () => {
    console.log('[Cron] Running daily SMS reminders at 8:00 AM');
    try {
      await sendLoanReminders();
      console.log('[Cron] SMS reminders completed.');
    } catch (error) {
      console.error('[Cron Reminder Error]', error.message);
    }
  });
};

module.exports = { start };
