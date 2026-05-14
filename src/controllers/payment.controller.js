const paymentService = require('../services/payment.service');
const { convertToCSV } = require('../utils/csv');

const createPayment = async (req, res) => {
  console.log("[PAYMENT CREATE REQUEST]", req.body);
  try {
    const { loanId, amount, method, trxId, type } = req.body;
    const payment = await paymentService.submitPayment(loanId, { amount, method, trxId, type });
    console.log("[PAYMENT CREATE SUCCESS]", payment.id);
    res.status(201).json({ success: true, message: 'Payment submitted for verification', payment });
  } catch (error) {
    console.error("[PAYMENT CREATE ERROR]", error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};

const verifyPayment = async (req, res) => {
  console.log("[PAYMENT VERIFY REQUEST]", req.params.id);
  try {
    const payment = await paymentService.verifyPayment(req.params.id);
    console.log("[PAYMENT VERIFY SUCCESS]", payment.id);
    res.status(200).json({ success: true, message: 'Payment verified', payment });
  } catch (error) {
    console.error("[PAYMENT VERIFY ERROR]", error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};

const getPayments = async (req, res) => {
  try {
    if (req.user.role === 'ADMIN' || req.user.role === 'STAFF') {
        const payments = await paymentService.getAllPayments();
        res.status(200).json({ success: true, count: payments.length, payments });
    } else {
        const payments = await paymentService.getPaymentsByUser(req.user.id);
        res.status(200).json({ success: true, count: payments.length, payments });
    }
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const exportPayments = async (req, res) => {
  try {
    const payments = await paymentService.getAllPayments();
    
    // Format data for CSV
    const csvData = payments.map(p => ({
      id: p.id,
      borrower: p.loan?.user?.name || 'Unknown',
      loanId: p.loanId,
      amount: Number(p.totalCollected || p.baseAmount || 0),
      lateAmount: Number(p.penaltyAmount || 0),
      totalAmount: Number(p.totalCollected || 0),
      status: p.status,
      method: p.method,
      trxId: p.trxId || 'N/A',
      paidAt: p.paidAt ? new Date(p.paidAt).toLocaleDateString() : 'Pending',
      createdAt: new Date(p.createdAt).toLocaleDateString()
    }));

    const headers = [
      { label: 'Payment ID', key: 'id' },
      { label: 'Borrower', key: 'borrower' },
      { label: 'Loan ID', key: 'loanId' },
      { label: 'Amount', key: 'amount' },
      { label: 'Late Fee', key: 'lateAmount' },
      { label: 'Total Paid', key: 'totalAmount' },
      { label: 'Status', key: 'status' },
      { label: 'Method', key: 'method' },
      { label: 'Transaction ID', key: 'trxId' },
      { label: 'Payment Date', key: 'paidAt' },
      { label: 'Created At', key: 'createdAt' }
    ];

    const csv = convertToCSV(csvData, headers);
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=financial_report_${new Date().toISOString().split('T')[0]}.csv`);
    res.status(200).send(csv);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const updatePayment = async (req, res) => {
  console.log("[PAYMENT UPDATE REQUEST]", req.params.id, req.body);
  try {
    const { trxId, method, principalPaid, totalCollected } = req.body;
    const payment = await paymentService.updatePaymentProof(req.params.id, { trxId, method, principalPaid, totalCollected });
    console.log("[PAYMENT UPDATE SUCCESS]", payment.id);
    res.status(200).json({ success: true, message: 'Payment proof updated', payment });
  } catch (error) {
    console.error("[PAYMENT UPDATE ERROR]", error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};

const getUpcomingPayments = async (req, res) => {
  try {
    const all = await paymentService.getAllPayments();
    const upcoming = all.filter(p => p.status === 'PENDING');
    res.status(200).json({ success: true, count: upcoming.length, payments: upcoming });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const getPaidPayments = async (req, res) => {
  try {
    const all = await paymentService.getAllPayments();
    const paid = all.filter(p => p.status === 'VERIFIED');
    res.status(200).json({ success: true, count: paid.length, payments: paid });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const getLatePayments = async (req, res) => {
  try {
    const all = await paymentService.getAllPayments();
    const late = all.filter(p => p.status === 'LATE' || Number(p.penaltyAmount) > 0);
    res.status(200).json({ success: true, count: late.length, payments: late });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = { 
  createPayment, 
  verifyPayment, 
  getPayments, 
  exportPayments, 
  updatePayment,
  getUpcomingPayments,
  getPaidPayments,
  getLatePayments
};
