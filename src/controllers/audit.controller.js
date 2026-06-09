const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

exports.getAuditLogs = async (req, res) => {
  try {
    const users = await prisma.user.findMany({ take: 20, orderBy: { createdAt: 'desc' } });
    const loans = await prisma.loan.findMany({ take: 20, orderBy: { createdAt: 'desc' }, include: { user: true } });
    const payments = await prisma.payment.findMany({ take: 20, orderBy: { createdAt: 'desc' }, include: { loan: { include: { user: true } } } });

    let auditLogs = [];

    users.forEach(u => {
      auditLogs.push({ id: `u-${u.id}`, action: `Created User Profile`, performedBy: u.name, timestamp: u.createdAt });
    });
    loans.forEach(l => {
      auditLogs.push({ id: `l-${l.id}`, action: `Created Loan (${l.amount})`, performedBy: l.user?.name || 'Unknown', timestamp: l.createdAt });
    });
    payments.forEach(p => {
      auditLogs.push({ id: `p-${p.id}`, action: `Processed Payment (${p.amount})`, performedBy: p.loan?.user?.name || 'System', timestamp: p.createdAt });
    });

    auditLogs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    res.json({ success: true, logs: auditLogs });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};
