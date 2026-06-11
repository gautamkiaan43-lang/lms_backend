const prisma = require('../config/db');

const addCommission = async (agentId, borrowerId, amount, percentage) => {
  return await prisma.commission.create({
    data: {
      agentId,
      borrowerId,
      amount,
      percentage
    }
  });
};

const getCommissionsByAgent = async (agentId) => {
  return await prisma.commission.findMany({
    where: { agentId },
    include: { borrower: true }
  });
};

const getAllCommissions = async () => {
  return await prisma.commission.findMany({
    include: { agent: true, borrower: true }
  });
};

module.exports = { addCommission, getCommissionsByAgent, getAllCommissions };
