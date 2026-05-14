const settingsService = require('../services/settings.service');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const getSettings = async (req, res) => {
  try {
    const settings = await settingsService.getSettings();
    res.status(200).json({ success: true, settings });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const updateSettings = async (req, res) => {
  try {
    const { settings } = req.body; // Expecting { key: value, ... }
    for (const [key, value] of Object.entries(settings)) {
      await settingsService.updateSetting(key, value);
    }
    res.status(200).json({ success: true, message: 'Settings updated successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const resetSystem = async (req, res) => {
  try {
    if (req.user.role !== 'ADMIN') return res.status(403).json({ success: false, message: 'Forbidden' });
    
    // Wipe all records in the correct order to respect foreign key constraints
    await prisma.notification.deleteMany();
    await prisma.commission.deleteMany();
    await prisma.auditLog.deleteMany();
    await prisma.payment.deleteMany();
    await prisma.collateral.deleteMany();
    await prisma.loan.deleteMany();
    // Keep ADMIN users ONLY
    await prisma.user.deleteMany({ where: { role: { notIn: ['ADMIN'] } } });

    // Optional: Log the system wipe
    await prisma.auditLog.create({
      data: {
        action: 'SYSTEM_WIPE',
        performedBy: req.user.name,
        details: 'Admin performed a complete database reset.',
        ipAddress: req.ip || '0.0.0.0'
      }
    });

    res.status(200).json({ success: true, message: 'System database has been wiped securely.' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = { getSettings, updateSettings, resetSystem };
