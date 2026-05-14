const payoutService = require('../services/payout.service');
const commissionService = require('../services/commission.service');

const requestPayout = async (req, res) => {
  try {
    const { amount } = req.body;
    const agentId = req.user.id;
    const payout = await payoutService.requestPayout(agentId, amount);
    res.status(201).json({ success: true, payout });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const getPayouts = async (req, res) => {
  try {
    let filters = {};
    if (req.user.role === 'AGENT') {
      filters.agentId = req.user.id;
    }
    const payouts = await payoutService.getPayouts(filters);
    res.status(200).json({ success: true, payouts });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const processPayout = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, trxId, method } = req.body;
    const payout = await payoutService.processPayout(Number(id), { status, trxId, method });
    res.status(200).json({ success: true, payout });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const adminCreatePayout = async (req, res) => {
  try {
    const { agentId, amount, method, trxId } = req.body;
    const payout = await payoutService.createPayoutForAgent(agentId, amount, method, trxId);
    res.status(201).json({ success: true, payout });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

module.exports = {
  requestPayout,
  getPayouts,
  processPayout,
  adminCreatePayout
};
