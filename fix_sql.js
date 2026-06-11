const fs = require('fs');
const filePath = 'c:/Users/Administrator/Desktop/kiaan-all-project/sidhnat-loan-wp-priya-10june/lms_loan_db.sql';

try {
  let sql = fs.readFileSync(filePath, 'utf8');

  // Replace uppercase model names in index and constraint names with lowercase to match Prisma
  const replacements = [
    'Collateral', 'Commission', 'EMISchedule', 'Loan', 'Notification',
    'Payment', 'Payout', 'Referral', 'Settings', 'User'
  ];

  replacements.forEach(model => {
    const regex = new RegExp('`' + model + '_', 'g');
    sql = sql.replace(regex, '`' + model.toLowerCase() + '_');
  });

  fs.writeFileSync(filePath, sql, 'utf8');
  console.log("SQL file updated successfully.");
} catch (error) {
  console.error("Error updating SQL file:", error);
}
