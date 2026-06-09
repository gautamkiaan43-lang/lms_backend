const prisma = require('../config/db');
const settingsService = require('./settings.service');
const emiService = require('./emi.service');

const normalizePaymentMethod = (value) => {
  const raw = String(value || '').trim().toUpperCase();
  if (raw === 'CASH') return 'CASH';
  if (raw === 'WIRE') return 'WIRE';
  if (raw === 'TRX') return 'TRX';
  if (raw === 'MOBILE_MONEY' || raw === 'MOBILEMONEY') return 'MOBILE_MONEY';
  if (raw === 'BANK_TRANSFER' || raw === 'BANKTRANSFER' || raw === 'BANK') return 'BANK_TRANSFER';
  return 'CASH';
};

const applyForLoan = async (userId, data) => {
  const {
    amount, duration, interest, interestAmount, totalAmount,
    method, address, whatsapp,
    bankName, accountNumber, accountName,
    description
  } = data;

  const principal = Number(amount);
  const months = Number(duration || data.totalMonth);
  if (!Number.isFinite(principal) || principal <= 0) {
    throw new Error('Invalid loan amount');
  }
  if (!Number.isFinite(months) || months <= 0 || !Number.isInteger(months)) {
    throw new Error('Invalid loan duration (months)');
  }

  const settings = await settingsService.getSettings();

  const parsedInterestAmount = Number(interestAmount ?? 0);
  const parsedInterestRate = Number.isFinite(Number(interest)) ? Number(interest) : NaN;
  const parsedTotalAmount = Number(totalAmount || 0);

  const interestAmountValue = Number.isFinite(parsedInterestAmount) && parsedInterestAmount >= 0
    ? parsedInterestAmount
    : 0;

  const inferredInterestAmount = interestAmountValue > 0
    ? interestAmountValue
    : (parsedTotalAmount > principal ? parsedTotalAmount - principal : 0);

  const computedTotalAmount = parsedTotalAmount > 0
    ? parsedTotalAmount
    : principal + inferredInterestAmount;

  const computedInterestRate = principal > 0
    ? Number.isFinite(parsedInterestRate)
      ? parsedInterestRate
      : Number((inferredInterestAmount / principal) * 100)
    : Number(settings.default_interest || 10);

  const monthlyPayment = computedTotalAmount / months;

  const loan = await prisma.loan.create({
    data: {
      userId,
      principalAmount: principal,
      currentPrincipal: principal,
      disbursementMethod: method ?? 'cash',
      deliveryAddress: address ?? null,
      whatsapp: whatsapp ?? null,
      bankName: bankName ?? null,
      accountNumber: accountNumber ?? null,
      accountName: accountName ?? null,
      description: description != null && description !== '' ? String(description) : null,
      duration: months,
      // Set values from settings or fallback to hardcoded defaults
      initiationFeeRate: 0,
      initiationFee: 0,
      disbursedAmount: principal,
      interestRate: computedInterestRate,
      dueDay: 1,
      graceDays: settings.default_grace_days || 3,
      latePenaltyRate: settings.default_late_fee || 5,
      agentCommissionRate: settings.default_agent_percentage || 5,
      status: 'PENDING',
      monthlyPaymentCurrent: monthlyPayment,
      // Extension Fields
      interestType: data.interestType || data.interest_type || 'FLAT',
      penaltyAmountPerDay: Number(data.penaltyAmountPerDay || data.penalty_amount_per_day || 0),
    }
  });

  // Update user profile if additional fields provided
  const userUpdateData = {};
  if (data.idProofUrl) userUpdateData.idProofUrl = data.idProofUrl;
  if (data.guarantorName) userUpdateData.guarantorName = data.guarantorName;
  if (data.guarantorContact) userUpdateData.guarantorContact = data.guarantorContact;
  if (data.guarantorRelation) userUpdateData.guarantorRelation = data.guarantorRelation;
  if (data.internalNotes) userUpdateData.internalNotes = data.internalNotes;
  if (data.documentUrls) userUpdateData.documentUrls = data.documentUrls;
  if (data.vehicleNumber) userUpdateData.vehicleNumber = data.vehicleNumber;
  if (data.vehicleType) userUpdateData.vehicleType = data.vehicleType;
  if (data.vehicleModelYear) userUpdateData.vehicleModelYear = data.vehicleModelYear;
  if (data.address) userUpdateData.address = data.address;

  if (Object.keys(userUpdateData).length > 0) {
    await prisma.user.update({
      where: { id: userId },
      data: userUpdateData
    });
  }
  console.log("[LOAN SERVICE] CREATED", loan.id);
  return loan;
};

const getLoansByUser = async (userId) => {
  return await prisma.loan.findMany({ 
    where: { userId }, 
    include: { payments: true, agent: true, emiSchedules: { orderBy: { dueDate: 'asc' } } } 
  });
};

const getAllLoans = async () => {
  return await prisma.loan.findMany({ 
    include: { user: true, agent: true, payments: true, emiSchedules: { orderBy: { dueDate: 'asc' } } } 
  });
};

const setLoanTerms = async (loanId, terms) => {
  const settings = await settingsService.getSettings();

  // Support both snake_case and existing camelCase payloads.
  const interestRateRaw = terms.interest_rate ?? terms.interestRate ?? (settings.default_interest || 10);
  const latePenaltyRateRaw = terms.late_fee_rate ?? terms.latePenaltyRate ?? (settings.default_late_fee || 5);
  const graceDaysRaw = terms.grace_days ?? terms.graceDays ?? (settings.default_grace_days || 3);
  const dueDayRaw = terms.due_day ?? terms.dueDay ?? 1;
  const agentCommissionRateRaw = terms.agent_commission_rate ?? terms.agentCommissionRate ?? (settings.default_agent_percentage || 5);
  const agentIdRaw = terms.agent_id ?? terms.agentId ?? null;
  const initiationFeeRaw = terms.initiation_fee;
  const initiationFeeRateRaw = terms.initiation_fee_rate ?? terms.initiationFeeRate ?? 0;

  const loan = await prisma.loan.findUnique({ where: { id: Number(loanId) } });
  if (!loan) throw new Error('Loan not found');

  const principal = Number(loan.principalAmount);
  const rateCandidate = Number(initiationFeeRateRaw || 0);
  const amountCandidate = initiationFeeRaw == null ? NaN : Number(initiationFeeRaw);

  let feeAmount;
  let feePercent;
  if (Number.isFinite(amountCandidate) && amountCandidate >= 0) {
    feeAmount = amountCandidate;
    feePercent = principal > 0 ? (feeAmount / principal) * 100 : 0;
  } else {
    feePercent = Number.isFinite(rateCandidate) ? rateCandidate : 0;
    feeAmount = principal * (feePercent / 100);
  }

  if (feeAmount < 0 || feeAmount > principal) {
    throw new Error('initiation_fee must be between 0 and principal amount');
  }

  const interestRate = Number(interestRateRaw);
  const latePenaltyRate = Number(latePenaltyRateRaw);
  const graceDays = Number(graceDaysRaw);
  const dueDay = Number(dueDayRaw || 5);
  const agentCommissionRate = Number(agentCommissionRateRaw);
  const agentId = agentIdRaw ? Number(agentIdRaw) : null;
  
  const interestType = terms.interestType || terms.interest_type || 'FLAT';
  const loanStartDate = (terms.loanStartDate || terms.loan_start_date) ? new Date(terms.loanStartDate || terms.loan_start_date) : null;
  const penaltyAmountPerDay = Number(terms.penaltyAmountPerDay || terms.penalty_amount_per_day || 0);

  const disbursed = principal - feeAmount;

  const updatedLoan = await prisma.loan.update({
    where: { id: Number(loanId) },
    data: {
      initiationFeeRate: feePercent,
      initiationFee: feeAmount,
      disbursedAmount: disbursed,
      interestRate,
      dueDay,
      graceDays,
      latePenaltyRate,
      agentCommissionRate,
      agentId: agentId ? Number(agentId) : null,
      status: 'TERMS_SET',
      monthlyPaymentCurrent: (principal + (principal * (interestRate / 100))) / Number(loan.duration),
      interestType,
      loanStartDate,
      penaltyAmountPerDay
    }
  });
  console.log("[LOAN SERVICE] TERMS UPDATED", updatedLoan.id);
  return updatedLoan;
};

const acceptLoanTerms = async (loanId) => {
  return await prisma.loan.update({
    where: { id: Number(loanId) },
    data: {
      borrowerAcceptedTerms: true,
      termsAcceptedAt: new Date(),
      status: 'TERMS_ACCEPTED'
    }
  });
};

const rejectLoanOffer = async (loanId, userId) => {
  const loan = await prisma.loan.findUnique({ where: { id: Number(loanId) } });
  if (!loan) throw new Error('Loan not found');
  if (Number(loan.userId) !== Number(userId)) {
    throw new Error('Not allowed to reject this loan offer');
  }
  if (loan.status !== 'TERMS_SET') {
    throw new Error('Only terms-set loan offers can be rejected');
  }
  return prisma.loan.update({
    where: { id: Number(loanId) },
    data: { status: 'REJECTED' },
  });
};

const confirmLoanFunds = async (loanId) => {
  const existingLoan = await prisma.loan.findUnique({
    where: { id: Number(loanId) },
    select: { id: true, userId: true, status: true },
  });
  if (!existingLoan) throw new Error('Loan not found');

  // KYC gate bypassed for testing
  /*
  const settings = await settingsService.getSettings();
  const collateralEnabled = String(settings.collateral_enabled ?? 'true') !== 'false';
  if (collateralEnabled) {
    const verifiedCount = await prisma.collateral.count({
      where: { userId: existingLoan.userId, verified: true },
    });
    if (verifiedCount === 0) {
      throw new Error('KYC not completed: verify borrower collateral before confirming funds');
    }
  }
  */

  const loan = await prisma.loan.update({
    where: { id: Number(loanId) },
    data: {
      adminConfirmedFunds: true,
      fundsConfirmedAt: new Date(),
      status: 'ACTIVE'
    },
    include: { user: true }
  });

  // Generate the full EMI schedule
  await emiService.generateEMISchedule(loan);

  // Calculate first due date based on dueDay
  const now = new Date();
  let firstDueDate = new Date(now.getFullYear(), now.getMonth() + 1, loan.dueDay);
  
  await prisma.loan.update({
    where: { id: loan.id },
    data: { dueDate: firstDueDate }
  });

  // Automatically generate the first EMI payment record (placeholder)
  const emiAmount = Number(loan.monthlyPaymentCurrent || ((Number(loan.principalAmount) + (Number(loan.principalAmount) * (Number(loan.interestRate || 0) / 100))) / Number(loan.duration)));
  if (emiAmount > 0) {
    // Split EMI into interest and principal for recording
    const totalInterest = Number(loan.principalAmount) * (Number(loan.interestRate || 0) / 100);
    const interestPart = totalInterest / Number(loan.duration);
    const principalPart = Number(loan.principalAmount) / Number(loan.duration);

    await prisma.payment.create({
      data: {
        loanId: loan.id,
        type: 'MONTHLY_INTEREST',
        baseAmount: interestPart,
        penaltyAmount: 0,
        principalPaid: principalPart,
        totalCollected: emiAmount,
        status: 'PENDING',
        dueDate: firstDueDate,
        method: normalizePaymentMethod(loan.disbursementMethod)
      }
    });
  }

  // Notify Borrower (System Log)
  await prisma.notification.create({
    data: {
      userId: loan.userId,
      title: 'Funds Disbursed',
      message: `Your loan of K${Number(loan.principalAmount).toLocaleString()} is now ACTIVE. Disbursed: K${Number(loan.disbursedAmount).toLocaleString()}.`,
      type: 'SYSTEM'
    }
  });

  // Notify Borrower (Email Log)
  await prisma.notification.create({
    data: {
      userId: loan.userId,
      title: 'Funds Disbursed',
      message: `Your loan of K${Number(loan.principalAmount).toLocaleString()} is now ACTIVE. Disbursed: K${Number(loan.disbursedAmount).toLocaleString()}.`,
      type: 'EMAIL'
    }
  });

  // Notify Borrower (SMS Log)
  await prisma.notification.create({
    data: {
      userId: loan.userId,
      title: 'Funds Disbursed',
      message: `Your loan of K${Number(loan.principalAmount).toLocaleString()} is now ACTIVE. Disbursed: K${Number(loan.disbursedAmount).toLocaleString()}.`,
      type: 'SMS'
    }
  });

  console.log("[LOAN SERVICE] FUNDS CONFIRMED", loan.id);
  return loan;
};

const rejectLoan = async (loanId) => {
  return await prisma.loan.update({
    where: { id: Number(loanId) },
    data: { status: 'REJECTED' }
  });
};

const updateInterestRate = async (loanId, interestRate) => {
  return await prisma.loan.update({
    where: { id: Number(loanId) },
    data: { interestRate: Number(interestRate) }
  });
};

const assignLoanAgent = async (loanId, agentId) => {
  const loan = await prisma.loan.findUnique({ where: { id: Number(loanId) } });
  if (!loan) throw new Error('Loan not found');

  let nextAgentId = null;
  if (agentId !== null && agentId !== undefined && agentId !== '') {
    const parsed = Number(agentId);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      throw new Error('Invalid agent id');
    }
    const agent = await prisma.user.findUnique({
      where: { id: parsed },
      select: { id: true, role: true },
    });
    if (!agent || agent.role !== 'AGENT') {
      throw new Error('Selected user is not a valid agent');
    }
    nextAgentId = parsed;
  }

  return prisma.loan.update({
    where: { id: Number(loanId) },
    data: { agentId: nextAgentId },
    include: { user: true, agent: true, payments: true },
  });
};

const deleteLoan = async (loanId) => {
  console.log('[DELETE LOAN] loanId:', loanId);
  console.log('[DELETE LOAN] prisma models:', Object.keys(prisma).filter(k => !k.startsWith('_')));

  const id = Number(loanId);
  const loan = await prisma.loan.findUnique({ where: { id } });
  if (!loan) throw new Error('Loan not found');
  
  // Cascading deletes for related entities to avoid FK constraints
  // Use try/catch for each to avoid stopping if one table is empty or missing
  try { await prisma.payment.deleteMany({ where: { loanId: id } }); } catch (e) { console.log('Payment delete error:', e.message); }
  try { await prisma.eMISchedule.deleteMany({ where: { loanId: id } }); } catch (e) { console.log('EMI delete error:', e.message); }
  try { await prisma.commission.deleteMany({ where: { loanId: id } }); } catch (e) { console.log('Commission delete error:', e.message); }
  try { await prisma.notification.deleteMany({ where: { loanId: id } }); } catch (e) { console.log('Notification delete error:', e.message); }
  
  try {
    // Delete the loan
    return await prisma.loan.delete({ where: { id } });
  } catch (err) {
    console.error('[DELETE LOAN] Final delete error:', err.message);
    throw new Error('Failed to delete loan: ' + err.message);
  }
};

module.exports = { 
  applyForLoan, 
  getLoansByUser, 
  getAllLoans, 
  setLoanTerms, 
  acceptLoanTerms, 
  rejectLoanOffer,
  confirmLoanFunds, 
  rejectLoan,
  updateInterestRate,
  assignLoanAgent,
  deleteLoan
};
