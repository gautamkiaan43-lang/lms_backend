const analyticsService = require('../services/analytics.service');

const getDashboardStats = async (req, res) => {
  try {
    const stats = await analyticsService.getDashboardStats(req.user);
    res.status(200).json({ success: true, stats });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  getDashboardStats
};
