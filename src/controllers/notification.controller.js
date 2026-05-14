const prisma = require('../config/db');

const getNotifications = async (req, res) => {
  console.log("[NOTIFICATION CONTROLLER] Fetching all notifications...");
  try {
    const notifications = await prisma.notification.findMany({
      orderBy: { createdAt: 'desc' },
      include: { user: true }
    });
    console.log("[NOTIFICATION CONTROLLER] SUCCESS: Count =", notifications.length);
    res.status(200).json({ success: true, notifications });
  } catch (error) {
    console.error("[NOTIFICATION CONTROLLER] ERROR:", error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};

const getMyNotifications = async (req, res) => {
  console.log("[NOTIFICATION CONTROLLER] Fetching notifications for user:", req.user.id);
  try {
    const notifications = await prisma.notification.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'desc' }
    });
    console.log("[NOTIFICATION CONTROLLER] SUCCESS: Count =", notifications.length);
    res.status(200).json({ success: true, notifications });
  } catch (error) {
    console.error("[NOTIFICATION CONTROLLER] ERROR:", error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = { getNotifications, getMyNotifications };
