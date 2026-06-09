const prisma = require('../config/db');

const normalizePaymentMethod = (value) => {
  const raw = String(value || '').trim().toUpperCase();
  if (raw === 'CASH') return 'CASH';
  if (raw === 'WIRE') return 'WIRE';
  if (raw === 'TRX') return 'TRX';
  if (raw === 'MOBILE_MONEY' || raw === 'MOBILEMONEY') return 'MOBILE_MONEY';
  if (raw === 'BANK_TRANSFER' || raw === 'BANKTRANSFER' || raw === 'BANK') return 'BANK_TRANSFER';
  return 'CASH';
};

// ─────────────────────────────────────────
// calculateLateFee(loan, payment)
// Returns: { lateDays, lateAmount, totalAmount }
// ─────────────────────────────────────────
const calculateLateFee = (loan) => {
  if (!loan.dueDate) return { lateDays: 0, penaltyAmount: 0 };
  
  const currentDate = new Date();
  currentDate.setHours(0, 0, 0, 0);

  const dueDate = new Date(loan.dueDate);
  dueDate.setHours(0, 0, 0, 0);

  const graceDays = loan.graceDays || 0;
  const graceDeadline = new Date(dueDate);
  graceDeadline.setDate(graceDeadline.getDate() + graceDays);

  if (currentDate > graceDeadline) {
    const diffTime = currentDate.getTime() - graceDeadline.getTime();
    const lateDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    // formula: penalty = overdue_amount × (penalty_rate / 30) × days
    // overdue_amount is the monthly interest
    const monthlyInterest = Number(loan.currentPrincipal) * (Number(loan.interestRate) / 100);
    const penaltyRate = Number(loan.latePenaltyRate) / 100;
    const penaltyAmount = monthlyInterest * (penaltyRate / 30) * lateDays;

    return { lateDays, penaltyAmount: parseFloat(penaltyAmount.toFixed(2)) };
  }

  return { lateDays: 0, penaltyAmount: 0 };
};

const ensurePendingPaymentsForActiveLoans = async () => {
  const activeLoans = await prisma.loan.findMany({
    where: { status: 'ACTIVE' },
    select: {
      id: true,
      dueDate: true,
      dueDay: true,
      disbursementMethod: true,
      monthlyPaymentCurrent: true,
      principalAmount: true,
      interestRate: true,
    },
  });

  for (const loan of activeLoans) {
    const pendingExists = await prisma.payment.findFirst({
      where: {
        loanId: loan.id,
        type: 'MONTHLY_INTEREST',
        status: 'PENDING',
      },
      select: { id: true },
    });

    if (pendingExists) continue;

    const emiAmount = Number(
      loan.monthlyPaymentCurrent ||
      ((Number(loan.principalAmount || 0) + (Number(loan.principalAmount || 0) * (Number(loan.interestRate || 0) / 100))) / Number(loan.duration || 1))
    );
    if (!Number.isFinite(emiAmount) || emiAmount <= 0) continue;

    const totalInterest = Number(loan.principalAmount || 0) * (Number(loan.interestRate || 0) / 100);
    const interestPart = totalInterest / Number(loan.duration || 1);
    const principalPart = Number(loan.principalAmount || 0) / Number(loan.duration || 1);

    const now = new Date();
    const dueDay = Number(loan.dueDay || 1);
    const fallbackDueDate = new Date(now.getFullYear(), now.getMonth() + 1, dueDay);
    const dueDate = loan.dueDate ? new Date(loan.dueDate) : fallbackDueDate;

    await prisma.payment.create({
      data: {
        loanId: loan.id,
        type: 'MONTHLY_INTEREST',
        baseAmount: interestPart,
        penaltyAmount: 0,
        principalPaid: principalPart,
        totalCollected: emiAmount,
        status: 'PENDING',
        dueDate,
        method: normalizePaymentMethod(loan.disbursementMethod),
      },
    });
  }
};

const submitPayment = async (loanId, { amount, method, trxId, type = 'MONTHLY_INTEREST' }) => {
  const loan = await prisma.loan.findUnique({ 
    where: { id: Number(loanId) },
    include: { payments: { where: { status: 'VERIFIED', type: 'MONTHLY_INTEREST' } } }
  });

  if (!loan) throw new Error('Loan not found');

  if (!loan) throw new Error('Loan not found');

  const expectedEmi = Number(loan.monthlyPaymentCurrent);
  const totalInterest = Number(loan.principalAmount) * (Number(loan.interestRate) / 100);
  const interestPart = totalInterest / Number(loan.duration || 1);
  const principalPart = Number(loan.principalAmount) / Number(loan.duration || 1);

  const { lateDays, penaltyAmount } = calculateLateFee(loan);

  let baseAmount = 0;
  let principalPaid = 0;
  let totalCollected = Number(amount);

  if (type === 'MONTHLY_INTEREST') {
    // For FLAT, use fixed components. For partials, it's more complex but we'll follow the logic.
    baseAmount = Math.min(Number(amount), interestPart);
    principalPaid = Math.max(0, Number(amount) - baseAmount);
  } else if (type === 'PRINCIPAL_PAYDOWN') {
    principalPaid = totalCollected;
  } else if (type === 'PAYOFF') {
    // Payoff is remaining principal + remaining interest? 
    // Usually it's just remaining principal in flat if they are early, 
    // but the user's formula implies interest is fixed.
    principalPaid = Number(loan.currentPrincipal);
    // Calculate remaining interest... for simplicity we'll assume total repayable - already paid
    baseAmount = 0; // Simplified for now
    totalCollected = principalPaid + penaltyAmount;
  }

  let emiScheduleId = null;
  if (type === 'MONTHLY_INTEREST') {
    const oldestEmi = await prisma.eMISchedule.findFirst({
      where: { loanId: Number(loanId), status: { in: ['PENDING', 'OVERDUE', 'PARTIAL'] } },
      orderBy: { dueDate: 'asc' }
    });
    if (oldestEmi) emiScheduleId = oldestEmi.id;
  }

  const payment = await prisma.payment.create({
    data: {
      loanId: Number(loanId),
      type,
      baseAmount,
      penaltyAmount,
      principalPaid,
      totalCollected,
      method: normalizePaymentMethod(method),
      trxId,
      status: 'PENDING',
      lateDays,
      emiScheduleId
    }
  });
  console.log("[PAYMENT SERVICE] SUBMITTED", payment.id);
  return payment;
};

const verifyPayment = async (paymentId) => {
  console.log(`[PAYMENT SERVICE] VERIFYING: paymentId=${paymentId}`);
  const payment = await prisma.payment.findUnique({
    where: { id: Number(paymentId) },
    include: { loan: { include: { user: true } } }
  });

  if (!payment) throw new Error('Payment not found');

  // Update payment status
  const updatedPayment = await prisma.payment.update({
    where: { id: Number(paymentId) },
    data: { status: 'VERIFIED', paidAt: new Date() }
  });

  // Update EMI Schedule if linked
  if (updatedPayment.emiScheduleId) {
    const emi = await prisma.eMISchedule.findUnique({
      where: { id: updatedPayment.emiScheduleId }
    });
    if (emi) {
      const newRemaining = Number(emi.remainingBalance) - Number(updatedPayment.totalCollected);
      await prisma.eMISchedule.update({
        where: { id: emi.id },
        data: {
          remainingBalance: Math.max(0, newRemaining),
          status: newRemaining <= 0 ? 'PAID' : 'PARTIAL'
        }
      });
    }
  }

  const loan = payment.loan;

  // If principal was paid, update current principal of the loan
  if (Number(payment.principalPaid) > 0) {
    const newPrincipal = Number(loan.currentPrincipal) - Number(payment.principalPaid);
    
    // For FLAT interest, the monthly payment doesn't change based on remaining balance
    const isFlat = (loan.interestType || 'FLAT') === 'FLAT';
    const newMonthlyPayment = isFlat ? Number(loan.monthlyPaymentCurrent) : (newPrincipal * (Number(loan.interestRate) / 100));

    await prisma.loan.update({
      where: { id: loan.id },
      data: { 
        currentPrincipal: newPrincipal,
        monthlyPaymentCurrent: newMonthlyPayment,
        status: newPrincipal <= 0 ? 'COMPLETED' : loan.status
      }
    });

    // Also update any EXISTING pending monthly interest payment for this loan
    await prisma.payment.updateMany({
      where: {
        loanId: loan.id,
        status: 'PENDING',
        type: 'MONTHLY_INTEREST'
      },
      data: {
        // Only update if it's REDUCING, otherwise FLAT EMI stays same
        ...(isFlat ? {} : { 
          baseAmount: newMonthlyPayment,
          totalCollected: newMonthlyPayment
        })
      }
    });
  }

  // Update due date if it was a monthly interest payment
  if (payment.type === 'MONTHLY_INTEREST') {
    const currentDueDate = new Date(loan.dueDate);
    const nextDueDate = new Date(currentDueDate.getFullYear(), currentDueDate.getMonth() + 1, loan.dueDay);
    
    await prisma.loan.update({
      where: { id: loan.id },
      data: { dueDate: nextDueDate }
    });

    // Automatically generate the NEXT monthly payment record (placeholder)
    const newLoanForNext = await prisma.loan.findUnique({ where: { id: loan.id } });
    const emiAmountNext = Number(newLoanForNext.monthlyPaymentCurrent);
    if (emiAmountNext > 0) {
      const totalInt = Number(newLoanForNext.principalAmount) * (Number(newLoanForNext.interestRate) / 100);
      const intPart = totalInt / Number(newLoanForNext.duration || 1);
      const princPart = Number(newLoanForNext.principalAmount) / Number(newLoanForNext.duration || 1);

      await prisma.payment.create({
        data: {
          loanId: loan.id,
          type: 'MONTHLY_INTEREST',
          baseAmount: intPart,
          penaltyAmount: 0,
          principalPaid: princPart,
          totalCollected: emiAmountNext,
          status: 'PENDING',
          dueDate: nextDueDate,
          method: normalizePaymentMethod(payment.method)
        }
      });
    }
  }

  // Record Agent Commission
  if (loan.agentId && Number(loan.agentCommissionRate) > 0) {
    const commissionAmount = Number(payment.baseAmount) * (Number(loan.agentCommissionRate) / 100);

    if (commissionAmount > 0) {
      await prisma.commission.create({
        data: {
          agentId: loan.agentId,
          borrowerId: loan.userId,
          loanId: loan.id,
          paymentId: updatedPayment.id,
          amount: commissionAmount,
          percentage: loan.agentCommissionRate
        }
      });

      // Notify Agent (System)
      await prisma.notification.create({
        data: {
          userId: loan.agentId,
          title: 'Commission Earned',
          message: `You earned a commission of K${commissionAmount.toLocaleString()} from ${loan.user.name}'s payment.`,
          type: 'SYSTEM'
        }
      });

      // Notify Agent (Email Log)
      await prisma.notification.create({
        data: {
          userId: loan.agentId,
          title: 'Commission Earned',
          message: `You earned a commission for loan #${loan.id}.`,
          type: 'EMAIL'
        }
      });

      // Notify Agent (SMS Log)
      await prisma.notification.create({
        data: {
          userId: loan.agentId,
          title: 'Commission Earned',
          message: `You earned a commission for loan #${loan.id}.`,
          type: 'SMS'
        }
      });
    }
  }

  // Notify Borrower (System)
  await prisma.notification.create({
    data: {
      userId: loan.userId,
      title: 'Payment Verified',
      message: `Your payment of K${Number(payment.totalCollected).toLocaleString()} has been verified. Type: ${payment.type}.`,
      type: 'SYSTEM'
    }
  });

  // Notify Borrower (Email Log)
  await prisma.notification.create({
    data: {
      userId: loan.userId,
      title: 'Payment Verified',
      message: `Confirmed: Your payment of K${Number(payment.totalCollected).toLocaleString()} has been processed successfully.`,
      type: 'EMAIL'
    }
  });

  // Notify Borrower (SMS Log)
  await prisma.notification.create({
    data: {
      userId: loan.userId,
      title: 'Payment Verified',
      message: `Confirmed: Your payment of K${Number(payment.totalCollected).toLocaleString()} has been processed successfully.`,
      type: 'SMS'
    }
  });

  console.log("[PAYMENT SERVICE] VERIFIED", updatedPayment.id);
  return updatedPayment;
};

const getAllPayments = async () => {
  await ensurePendingPaymentsForActiveLoans();
  return await prisma.payment.findMany({
    include: { loan: { include: { user: true } } },
    orderBy: { createdAt: 'desc' }
  });
};

const getPaymentsByUser = async (userId) => {
  await ensurePendingPaymentsForActiveLoans();
  return await prisma.payment.findMany({
    where: { loan: { userId } },
    include: { loan: true }
  });
};

const updatePaymentProof = async (paymentId, { trxId, method, principalPaid, totalCollected }) => {
  const data = { trxId, method, paidAt: null };
  if (principalPaid !== undefined) data.principalPaid = Number(principalPaid);
  if (totalCollected !== undefined) data.totalCollected = Number(totalCollected);
  
  const updatedPayment = await prisma.payment.update({
    where: { id: Number(paymentId) },
    data
  });
  console.log("[PAYMENT SERVICE] PROOF UPDATED", updatedPayment.id);
  return updatedPayment;
};

module.exports = { submitPayment, verifyPayment, getAllPayments, getPaymentsByUser, calculateLateFee, updatePaymentProof };
