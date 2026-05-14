const puppeteer = require('puppeteer');
const prisma = require('../config/db');

/**
 * Generate a PDF loan statement for a specific loan
 */
const generateLoanStatement = async (loanId) => {
  const loan = await prisma.loan.findUnique({
    where: { id: Number(loanId) },
    include: {
      user: true,
      payments: {
        orderBy: { createdAt: 'desc' }
      }
    }
  });

  if (!loan) throw new Error('Loan not found');

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: 'Arial', sans-serif; color: #333; line-height: 1.6; }
        .header { text-align: center; border-bottom: 2px solid #2563eb; padding-bottom: 20px; margin-bottom: 30px; }
        .header h1 { color: #2563eb; margin: 0; }
        .section { margin-bottom: 30px; }
        .section-title { font-weight: bold; border-bottom: 1px solid #ddd; margin-bottom: 15px; padding-bottom: 5px; color: #1e40af; }
        .grid { display: flex; flex-wrap: wrap; }
        .item { width: 50%; margin-bottom: 10px; }
        .label { font-weight: bold; font-size: 0.9em; color: #666; }
        .value { font-size: 1.1em; }
        table { width: 100%; border-collapse: collapse; margin-top: 10px; }
        th, td { border: 1px solid #ddd; padding: 12px; text-align: left; }
        th { bg-color: #f8fafc; color: #1e40af; }
        .status-active { color: green; font-weight: bold; }
        .status-late { color: red; font-weight: bold; }
        .footer { text-align: center; font-size: 0.8em; color: #777; margin-top: 50px; border-top: 1px solid #ddd; padding-top: 20px; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>ARKAD FINANCE</h1>
        <p>Official Loan Statement</p>
      </div>

      <div class="section">
        <div class="section-title">Borrower Information</div>
        <div class="grid">
          <div class="item"><div class="label">Name:</div><div class="value">${loan.user.name}</div></div>
          <div class="item"><div class="label">Email:</div><div class="value">${loan.user.email}</div></div>
          <div class="item"><div class="label">Phone:</div><div class="value">${loan.user.phone}</div></div>
          <div class="item"><div class="label">Address:</div><div class="value">${loan.user.address || 'N/A'}</div></div>
        </div>
      </div>

      <div class="section">
        <div class="section-title">Loan Summary</div>
        <div class="grid">
          <div class="item"><div class="label">Loan ID:</div><div class="value">#${loan.id}</div></div>
          <div class="item"><div class="label">Status:</div><div class="value font-bold">${loan.status}</div></div>
          <div class="item"><div class="label">Principal Amount:</div><div class="value">K${Number(loan.principalAmount).toLocaleString()}</div></div>
          <div class="item"><div class="label">Interest Rate:</div><div class="value">${loan.interestRate}% Monthly</div></div>
          <div class="item"><div class="label">Initiation Fee:</div><div class="value">K${Number(loan.initiationFee).toLocaleString()}</div></div>
          <div class="item"><div class="label">Currently Owed:</div><div class="value font-bold">K${Number(loan.currentPrincipal).toLocaleString()}</div></div>
          <div class="item"><div class="label">Next Due Date:</div><div class="value">${loan.dueDate ? new Date(loan.dueDate).toLocaleDateString() : 'N/A'}</div></div>
        </div>
      </div>

      <div class="section">
        <div class="section-title">Payment History</div>
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Type</th>
              <th>Total Collected</th>
              <th>Status</th>
              <th>Method</th>
            </tr>
          </thead>
          <tbody>
            ${loan.payments.map(p => `
              <tr>
                <td>${new Date(p.createdAt).toLocaleDateString()}</td>
                <td>${p.type}</td>
                <td>K${Number(p.totalCollected).toLocaleString()}</td>
                <td>${p.status}</td>
                <td>${p.method}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>

      <div class="footer">
        <p>This is a computer-generated document. No signature required.</p>
        <p>&copy; 2026 ARKAD FINANCE - Modern Lending Solutions</p>
      </div>
    </body>
    </html>
  `;

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'networkidle0' });
  const pdf = await page.pdf({ format: 'A4', printBackground: true });
  await browser.close();

  return pdf;
};

module.exports = { generateLoanStatement };
