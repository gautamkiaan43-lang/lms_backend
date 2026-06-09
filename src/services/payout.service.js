const prisma = require('../config/db');

const requestPayout = async (agentId, amount) => {
  const agent = await prisma.user.findUnique({ where: { id: agentId } });
  if (!agent) throw new Error('Agent not found');

  // Find all PENDING commissions for this agent
  const commissions = await prisma.commission.findMany({
    where: { agentId, status: 'PENDING' }
  });

  const totalAvailable = commissions.reduce((sum, c) => sum + Number(c.amount), 0);
  if (totalAvailable < Number(amount)) {
    throw new Error('Insufficient balance. Available: K' + totalAvailable);
  }

  // Create payout request
  return await prisma.payout.create({
    data: {
      agentId,
      amount: Number(amount),
      status: 'PENDING'
    }
  });
};

const getPayouts = async (filters = {}) => {
  return await prisma.payout.findMany({
    where: filters,
    include: { agent: true },
    orderBy: { createdAt: 'desc' }
  });
};

const processPayout = async (payoutId, data) => {
  const { status, trxId, method } = data;
  
  const payout = await prisma.payout.findUnique({ 
    where: { id: payoutId },
    include: { agent: true }
  });

  if (!payout) throw new Error('Payout not found');
  if (payout.status !== 'PENDING') throw new Error('Payout already processed');

  return await prisma.$transaction(async (tx) => {
    const updatedPayout = await tx.payout.update({
      where: { id: payoutId },
      data: {
        status,
        trxId,
        method,
        processedAt: status === 'COMPLETED' ? new Date() : null
      }
    });

    if (status === 'COMPLETED') {
      // Mark commissions as PAID up to the payout amount
      // For simplicity, we'll mark ALL pending commissions as PAID if they were part of this cycle
      // Or we can just mark all current PENDING ones. 
      // Professional way: link commissions to payouts. But our schema doesn't have that link yet.
      // So we'll mark all commissions created BEFORE the payout request as PAID.
      await tx.commission.updateMany({
        where: { 
          agentId: payout.agentId, 
          status: 'PENDING',
          createdAt: { lte: payout.createdAt }
        },
        data: { status: 'PAID' }
      });
    }

    return updatedPayout;
  });
};

const createPayoutForAgent = async (agentId, amount, method, trxId) => {
  const agent = await prisma.user.findUnique({ where: { id: Number(agentId) } });
  if (!agent) throw new Error('Agent not found');

  const payout = await prisma.payout.create({
    data: {
      agentId: Number(agentId),
      amount: Number(amount),
      status: 'COMPLETED',
      method: method || 'BANK',
      trxId: trxId || null,
      processedAt: new Date()
    }
  });

  // Mark all pending commissions as PAID
  await prisma.commission.updateMany({
    where: { agentId: Number(agentId), status: 'PENDING' },
    data: { status: 'PAID' }
  });

  return payout;
};

module.exports = {
  requestPayout,
  getPayouts,
  processPayout,
  createPayoutForAgent
};
