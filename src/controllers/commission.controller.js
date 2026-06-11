const commissionService = require('../services/commission.service');

const getCommissions = async (req, res) => {
  try {
    let commissions;
    if (req.user.role === 'ADMIN' || req.user.role === 'STAFF') {
      commissions = await commissionService.getAllCommissions();
    } else {
      commissions = await commissionService.getCommissionsByAgent(req.user.id);
    }
    res.status(200).json({ success: true, commissions });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = { getCommissions };
