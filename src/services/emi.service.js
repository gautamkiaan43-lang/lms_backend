const prisma = require('../config/db');

/**
 * Generates an EMI schedule for a loan.
 * @param {Object} loan The loan object
 */
const generateEMISchedule = async (loan) => {
  const {
    id: loanId,
    principalAmount,
    duration,
    interestRate,
    interestType,
    loanStartDate,
    dueDay
  } = loan;

  const principal = Number(principalAmount);
  const months = Number(duration);
  const monthlyRate = Number(interestRate) / 100;
  const startDate = loanStartDate ? new Date(loanStartDate) : new Date();

  const schedule = [];
  let remainingPrincipal = principal;

  // Logic: generate months EMIs
  for (let i = 1; i <= months; i++) {
    const dueDate = new Date(startDate.getFullYear(), startDate.getMonth() + i, dueDay);
    
    let interestComponent = 0;
    let principalComponent = 0;
    let amount = 0;

    if (interestType === 'REDUCING') {
      // REDUCING Balance (EMI = [P x R x (1+R)^N]/[(1+R)^N-1])
      const emi = (principal * monthlyRate * Math.pow(1 + monthlyRate, months)) / (Math.pow(1 + monthlyRate, months) - 1);
      amount = emi;
      interestComponent = remainingPrincipal * monthlyRate;
      principalComponent = emi - interestComponent;
      remainingPrincipal -= principalComponent;
    } else {
      // FLAT Interest
      // Formula: Total Interest = Principal * Rate / 100
      // Total Repayable = Principal + Total Interest
      // EMI = Total Repayable / Months
      const totalInterest = principal * (Number(interestRate) / 100);
      interestComponent = totalInterest / months;
      principalComponent = principal / months;
      amount = interestComponent + principalComponent;
      remainingPrincipal -= principalComponent;
    }

    schedule.push({
      loanId,
      dueDate,
      amount: Number(amount.toFixed(2)),
      principalComponent: Number(principalComponent.toFixed(2)),
      interestComponent: Number(interestComponent.toFixed(2)),
      remainingBalance: Number(Math.max(0, remainingPrincipal).toFixed(2)),
      status: 'PENDING'
    });
  }

  // Delete existing schedules if any (re-generation)
  await prisma.eMISchedule.deleteMany({ where: { loanId } });

  // Bulk create schedule
  await prisma.eMISchedule.createMany({
    data: schedule
  });

  return schedule;
};

/**
 * Daily job to calculate penalties and update statuses.
 */
const processDailyPenalties = async () => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Find all pending or overdue EMI schedules where due date is before today
  const overdueEmis = await prisma.eMISchedule.findMany({
    where: {
      dueDate: { lt: today },
      status: { in: ['PENDING', 'OVERDUE', 'PARTIAL'] }
    },
    include: {
      loan: true
    }
  });

  for (const emi of overdueEmis) {
    const penaltyPerDay = Number(emi.loan.penaltyAmountPerDay || 0);
    
    // Calculate days overdue
    const diffTime = today.getTime() - new Date(emi.dueDate).getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    const totalPenalty = diffDays * penaltyPerDay;

    await prisma.eMISchedule.update({
      where: { id: emi.id },
      data: {
        status: 'OVERDUE',
        daysOverdue: diffDays,
        penaltyAccumulated: totalPenalty
      }
    });
  }
};

module.exports = {
  generateEMISchedule,
  processDailyPenalties
};
