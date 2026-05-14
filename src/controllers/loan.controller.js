const loanService = require('../services/loan.service');
const prisma = require('../config/db');

const notifyAdminsForNewLoanRequest = async (loan, borrowerId) => {
  try {
    const admins = await prisma.user.findMany({
      where: { role: 'ADMIN' },
      select: { id: true },
    });
    if (!admins.length) return;

    await prisma.notification.createMany({
      data: admins.map((admin) => ({
        userId: admin.id,
        loanId: loan.id,
        title: 'New Loan Request',
        message: `Borrower #${borrowerId} submitted a new loan request.`,
        type: 'SYSTEM',
        status: 'SENT',
      })),
    });
  } catch (err) {
    console.error('[LOAN NOTIFICATION ERROR]', err.message);
  }
};

const applyLoan = async (req, res) => {
  console.log("[LOAN APPLY REQUEST]", req.user.id, req.body);
  try {
    const targetUserId = (req.user.role === 'ADMIN' || req.user.role === 'STAFF') ? (req.body.userId || req.user.id) : req.user.id;
    const loan = await loanService.applyForLoan(targetUserId, req.body);
    if (req.user.role === 'BORROWER') {
      await notifyAdminsForNewLoanRequest(loan, req.user.id);
    }
    console.log("[LOAN APPLY SUCCESS]", loan.id);
    res.status(201).json({ success: true, message: 'Loan application submitted successfully', loan });
  } catch (error) {
    console.error("[LOAN APPLY ERROR]", error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Borrower loan request — core fields: amount, duration, description.
 * Same persistence as /loans/apply (userId = borrower, status PENDING).
 */
const loanRequest = async (req, res) => {
  console.log("[LOAN REQUEST]", req.user.id, req.body);
  try {
    if (req.user.role !== 'BORROWER') {
      return res.status(403).json({ success: false, message: 'Only borrowers can submit a loan request' });
    }
    const { amount, duration, description } = req.body;
    const a = Number(amount);
    const d = Number(duration);
    if (!Number.isFinite(a) || a <= 0) {
      return res.status(400).json({ success: false, message: 'Valid amount is required' });
    }
    if (!Number.isFinite(d) || d <= 0 || !Number.isInteger(d)) {
      return res.status(400).json({ success: false, message: 'Valid duration (whole months) is required' });
    }
    const payload = {
      amount: a,
      duration: d,
      description: description != null ? String(description) : '',
      method: req.body.method || 'cash',
      address: req.body.address ?? '',
      whatsapp: req.body.whatsapp ?? '',
      bankName: req.body.bankName ?? '',
      accountNumber: req.body.accountNumber ?? '',
      accountName: req.body.accountName ?? '',
      interestAmount: req.body.interestAmount ?? req.body.interest,
      totalAmount: req.body.totalAmount,
    };
    const loan = await loanService.applyForLoan(req.user.id, payload);
    await notifyAdminsForNewLoanRequest(loan, req.user.id);
    res.status(201).json({
      success: true,
      message: 'Loan application submitted successfully',
      loan,
    });
  } catch (error) {
    console.error("[LOAN REQUEST ERROR]", error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};

const getMyLoans = async (req, res) => {
  try {
    const loans = await loanService.getLoansByUser(req.user.id);
    res.status(200).json({ success: true, count: loans.length, loans });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const getLoans = async (req, res) => {
  try {
    if (req.user.role === 'ADMIN' || req.user.role === 'STAFF') {
      const loans = await loanService.getAllLoans();
      res.status(200).json({ success: true, count: loans.length, loans });
    } else {
      const loans = await loanService.getLoansByUser(req.user.id);
      res.status(200).json({ success: true, count: loans.length, loans });
    }
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const setTerms = async (req, res) => {
  console.log("[LOAN SET_TERMS REQUEST]", req.params.id, req.body);
  try {
    const { id } = req.params;
    const loan = await loanService.setLoanTerms(id, req.body);
    // Notify borrower that a custom offer is ready for review.
    await prisma.notification.create({
      data: {
        userId: loan.userId,
        loanId: loan.id,
        title: 'Loan Offer Ready',
        message: `Your loan offer is ready. Open loan #${loan.id} to review and accept/reject terms.`,
        type: 'SYSTEM',
        status: 'SENT',
      },
    });
    console.log("[LOAN SET_TERMS SUCCESS]", loan.id);
    res.status(200).json({ success: true, message: 'Loan terms set. Awaiting borrower acceptance.', loan });
  } catch (error) {
    console.error("[LOAN SET_TERMS ERROR]", error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};

const acceptTerms = async (req, res) => {
  try {
    const { id } = req.params;
    const loan = await loanService.acceptLoanTerms(id);
    res.status(200).json({ success: true, message: 'Terms accepted. Awaiting fund confirmation.', loan });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const rejectOffer = async (req, res) => {
  try {
    const { id } = req.params;
    if (req.user.role !== 'BORROWER') {
      return res.status(403).json({ success: false, message: 'Only borrower can reject offer' });
    }
    const loan = await loanService.rejectLoanOffer(id, req.user.id);
    res.status(200).json({ success: true, message: 'Loan offer rejected.', loan });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

const confirmFunds = async (req, res) => {
  console.log("[LOAN CONFIRM_FUNDS REQUEST]", req.params.id);
  try {
    const { id } = req.params;
    const loan = await loanService.confirmLoanFunds(id);
    console.log("[LOAN CONFIRM_FUNDS SUCCESS]", loan.id);
    res.status(200).json({ success: true, message: 'Funds confirmed. Loan is now ACTIVE.', loan });
  } catch (error) {
    console.error("[LOAN CONFIRM_FUNDS ERROR]", error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};

const rejectLoan = async (req, res) => {
  console.log("[LOAN REJECT REQUEST]", req.params.id);
  try {
    const loan = await loanService.rejectLoan(req.params.id);
    console.log("[LOAN REJECT SUCCESS]", loan.id);
    res.status(200).json({ success: true, message: 'Loan rejected', loan });
  } catch (error) {
    console.error("[LOAN REJECT ERROR]", error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};

const updateInterest = async (req, res) => {
  try {
    const { id } = req.params;
    const { interestRate } = req.body;
    if (interestRate === undefined || interestRate === null) {
      return res.status(400).json({ success: false, message: 'interestRate is required' });
    }
    const loan = await loanService.updateInterestRate(id, interestRate);
    res.status(200).json({ success: true, message: 'Interest rate updated successfully.', loan });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const assignAgent = async (req, res) => {
  try {
    const { id } = req.params;
    const { agentId } = req.body;
    const loan = await loanService.assignLoanAgent(id, agentId ?? null);
    res.status(200).json({ success: true, message: 'Agent assignment updated successfully.', loan });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};
const deleteLoan = async (req, res) => {
  try {
    const { id } = req.params;
    await loanService.deleteLoan(id);
    res.status(200).json({ success: true, message: 'Loan deleted successfully.' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = { 
  applyLoan,
  loanRequest,
  getMyLoans, 
  getLoans, 
  setTerms, 
  acceptTerms, 
  rejectOffer,
  confirmFunds, 
  rejectLoan,
  updateInterest,
  assignAgent,
  deleteLoan
};
