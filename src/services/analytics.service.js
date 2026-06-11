const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const getDashboardStats = async (user) => {
  const { id } = user;
  const role = user?.role?.toUpperCase();

  if (role === 'ADMIN' || role === 'LENDER' || role === 'STAFF') {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const in7Days = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const [
      totalUsers,
      totalLoans,
      pendingLoans,
      activeLoans,
      overdueLoans,
      totalPrincipal,
      pendingPayments,
      verifiedPayments,
      totalCommissions,
      upcomingPaymentsCount,
      latePaymentsCount,
      paidTodayCount,
      dailyCollections,
      monthlyCollections,
      expectedMonthly,
      todayDueEmis,
      overdueTotal,
      defaulters,
    ] = await Promise.all([
      prisma.user.count({ where: { role: 'BORROWER' } }),
      prisma.loan.count(),
      prisma.loan.count({ where: { status: { in: ['PENDING', 'TERMS_SET', 'TERMS_ACCEPTED', 'FUNDS_CONFIRMED'] } } }),
      prisma.loan.count({ where: { status: 'ACTIVE' } }),
      prisma.payment.count({ where: { status: 'LATE' } }),
      prisma.loan.aggregate({ _sum: { principalAmount: true } }),
      prisma.payment.aggregate({
        where: { status: 'PENDING' },
        _sum: { totalCollected: true },
        _count: { id: true },
      }),
      prisma.payment.aggregate({
        where: { status: 'VERIFIED' },
        _sum: { baseAmount: true, penaltyAmount: true, principalPaid: true },
        _count: { id: true },
      }),
      prisma.commission.aggregate({ _sum: { amount: true } }),
      // Upcoming: PENDING payments due within next 7 days
      prisma.payment.count({
        where: { status: 'PENDING', dueDate: { gte: new Date(), lte: in7Days } },
      }),
      // Late payments
      prisma.payment.count({ where: { status: 'LATE' } }),
      // Verified today
      prisma.payment.count({
        where: { status: 'VERIFIED', paidAt: { gte: today } },
      }),
      // Daily Collections
      prisma.payment.aggregate({
        where: { status: 'VERIFIED', paidAt: { gte: today } },
        _sum: { totalCollected: true }
      }),
      // Monthly Collections
      prisma.payment.aggregate({
        where: { 
          status: 'VERIFIED', 
          paidAt: { gte: new Date(today.getFullYear(), today.getMonth(), 1) } 
        },
        _sum: { totalCollected: true }
      }),
      // Expected Monthly
      prisma.eMISchedule.aggregate({
        where: { 
          dueDate: { 
            gte: new Date(today.getFullYear(), today.getMonth(), 1), 
            lte: new Date(today.getFullYear(), today.getMonth() + 1, 0) 
          } 
        },
        _sum: { amount: true }
      }),
      // Today's due payments list
      prisma.eMISchedule.findMany({
        where: { dueDate: today },
        include: { loan: { include: { user: true } } },
        take: 10
      }),
      // Overdue total
      prisma.eMISchedule.aggregate({
        where: { status: 'OVERDUE' },
        _sum: { remainingBalance: true, penaltyAccumulated: true }
      }),
      // Defaulters list
      prisma.user.findMany({
        where: { 
          loans: { 
            some: { 
              emiSchedules: { 
                some: { status: 'OVERDUE' } 
              } 
            } 
          } 
        },
        select: { id: true, name: true, phone: true },
        take: 10
      })
    ]);

    return {
      totalUsers,
      totalLoans,
      pendingLoans,
      activeLoans,
      overdueLoans,
      totalPrincipal: Number(totalPrincipal?._sum?.principalAmount || 0),
      totalRevenue: Number(verifiedPayments?._sum?.baseAmount || 0) + Number(verifiedPayments?._sum?.penaltyAmount || 0) + Number(verifiedPayments?._sum?.principalPaid || 0),
      totalInterest: Number(verifiedPayments?._sum?.baseAmount || 0),
      totalLateFees: Number(verifiedPayments?._sum?.penaltyAmount || 0),
      totalPrincipalPaid: Number(verifiedPayments?._sum?.principalPaid || 0),
      totalCommission: Number(totalCommissions?._sum?.amount || 0),
      netRevenue: (Number(verifiedPayments?._sum?.baseAmount || 0) + Number(verifiedPayments?._sum?.penaltyAmount || 0)) - Number(totalCommissions?._sum?.amount || 0),
      pendingPaymentsCount: pendingPayments?._count?.id || 0,
      pendingPaymentsAmount: Number(pendingPayments?._sum?.totalCollected || 0),
      verifiedPaymentsCount: verifiedPayments?._count?.id || 0,
      // New breakdown
      upcomingPaymentsCount,
      latePaymentsCount,
      paidTodayCount,
      // New collections breakdown
      dailyCollections: Number(dailyCollections?._sum?.totalCollected || 0),
      monthlyCollections: Number(monthlyCollections?._sum?.totalCollected || 0),
      expectedMonthlyCollections: Number(expectedMonthly?._sum?.amount || 0),
      todayDuePayments: todayDueEmis,
      overdueTotalAmount: Number(overdueTotal?._sum?.remainingBalance || 0) + Number(overdueTotal?._sum?.penaltyAccumulated || 0),
      defaultersList: defaulters,
    };
  }

  if (role === 'BORROWER') {
    const activeLoan = await prisma.loan.findFirst({
      where: { userId: id, status: 'ACTIVE' },
      include: { payments: { orderBy: { createdAt: 'desc' }, take: 5 } }
    });

    const totalPaidSum = activeLoan ? await prisma.payment.aggregate({
      where: { loanId: activeLoan.id, status: 'VERIFIED' },
      _sum: { totalCollected: true }
    }) : { _sum: { totalCollected: 0 } };

    return {
      activeLoan,
      totalPaid: Number(totalPaidSum?._sum?.totalCollected || 0)
    };
  }

  if (role === 'AGENT') {
    const [clientsCount, totalEarnings, commissions, activeLoans, pendingPayouts] = await Promise.all([
      prisma.user.count({
        where: {
          role: 'BORROWER',
          OR: [
            { agentId: id },
            { loans: { some: { agentId: id } } },
          ],
        },
      }),
      prisma.commission.aggregate({ where: { agentId: id }, _sum: { amount: true } }),
      prisma.commission.findMany({
        where: { agentId: id },
        include: { borrower: true },
        orderBy: { createdAt: 'desc' },
        take: 10
      }),
      prisma.loan.count({ where: { agentId: id, status: 'ACTIVE' } }),
      prisma.payout.aggregate({ where: { agentId: id, status: 'PENDING' }, _sum: { amount: true } })
    ]);

    return {
      clientsCount,
      totalEarnings: Number(totalEarnings?._sum?.amount || 0),
      recentCommissions: commissions,
      activeLoans,
      pendingPayout: Number(pendingPayouts?._sum?.amount || 0)
    };
  }

  return {};
};

module.exports = { getDashboardStats };
