const prisma = require('../config/db');
const { sendSMS } = require('../utils/sms');

// Called by cron daily — sends reminders based on how many days until/after due date
const sendLoanReminders = async () => {
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  const activeLoans = await prisma.loan.findMany({
    where: { status: 'ACTIVE' },
    include: { user: true }
  });

  for (const loan of activeLoans) {
    if (!loan.dueDate || !loan.user?.phone) continue;

    const dueDate = new Date(loan.dueDate);
    dueDate.setHours(0, 0, 0, 0);

    const diffTime = now.getTime() - dueDate.getTime();
    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24)); // negative = before due

    const phone = loan.user.phone;
    const amountStr = `K${Number(loan.principalAmount).toLocaleString()}`;

    let msg = '';
    let title = '';

    if (diffDays === -3) {
      msg = `⏳ Reminder: Your loan payment for ${amountStr} is due in 3 days. Prepare your funds.`;
      title = 'Loan Reminder (3 Days Before)';
    } else if (diffDays === 0) {
      msg = `📅 Today is your payment due date. Please pay ${amountStr} now to avoid penalties.`;
      title = 'Loan Due Reminder';
    } else if (diffDays === (loan.graceDays || 0) + 1) {
      msg = `🚨 LATE ALERT: Your loan payment of ${amountStr} is now overdue. Late fees are being applied daily.`;
      title = 'Late Payment Alert (After Grace)';
    } else if (diffDays > (loan.graceDays || 0) + 1 && (diffDays - (loan.graceDays || 0)) % 7 === 0) {
      // Weekly overdue reminder
      msg = `⚠️ WEEKLY REMINDER: Your loan payment for ${amountStr} is still overdue. Total balance is increasing. Please settle immediately.`;
      title = 'Weekly Overdue Reminder';
    }

    if (msg) {
      const success = await sendSMS(phone, msg);
      
      // Log SMS
      await prisma.notification.create({
        data: { 
          userId: loan.userId, 
          title, 
          message: msg, 
          type: 'SMS', 
          status: success ? 'SENT' : 'FAILED' 
        }
      });

      // Log EMAIL (Mock)
      await prisma.notification.create({
        data: { 
          userId: loan.userId, 
          title, 
          message: msg, 
          type: 'EMAIL', 
          status: 'SENT' 
        }
      });
    }
  }

  console.log(`[Reminder] Processed ${activeLoans.length} active loans`);
};

module.exports = { sendLoanReminders };
