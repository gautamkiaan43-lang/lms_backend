const prisma = require('../config/db');

const getReferrals = async (req, res) => {
  try {
    const referrals = await prisma.referral.findMany({
      where: { referrerId: req.user.id },
      include: { 
        referred: { 
          select: { name: true, createdAt: true } 
        } 
      },
      orderBy: { createdAt: 'desc' }
    });
    res.status(200).json({ success: true, referrals });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const getReferralStats = async (req, res) => {
  try {
    const referrals = await prisma.referral.findMany({
      where: { referrerId: req.user.id }
    });

    const stats = {
      total: referrals.length,
      qualified: referrals.filter(r => r.status === 'REWARDED').length,
      pending: referrals.filter(r => r.status === 'PENDING').length,
      earnings: referrals.filter(r => r.status === 'REWARDED').reduce((sum, r) => sum + Number(r.rewardAmount), 0)
    };

    res.status(200).json({ success: true, stats });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = { getReferrals, getReferralStats };
