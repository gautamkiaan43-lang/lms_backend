const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const uploadCollateral = async (req, res) => {
  try {
    const { name, type } = req.body;
    // Note: In a real app we'd handle file storage (S3/Multer).
    // For this project, we'll store a mock URL or a base64 if needed.
    // We'll use a placeholder for now as per project patterns.
    
    const collateral = await prisma.collateral.create({
      data: {
        userId: req.user.id,
        name: name || 'UNNAMED_ASSET',
        type: type || 'FILE',
        imageUrl: `https://api.placeholder.com/documents/${Date.now()}`,
        verified: false
      }
    });

    res.status(201).json({ success: true, message: 'Collateral uploaded for verification', collateral });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const getMyCollateral = async (req, res) => {
  try {
    const collaterals = await prisma.collateral.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'desc' }
    });
    res.status(200).json({ success: true, collaterals });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const getAllCollateral = async (req, res) => {
  try {
    const collaterals = await prisma.collateral.findMany({
      include: { user: true },
      orderBy: { createdAt: 'desc' }
    });
    res.status(200).json({ success: true, collaterals });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const verifyCollateral = async (req, res) => {
  try {
    const collateral = await prisma.collateral.update({
      where: { id: parseInt(req.params.id) },
      data: { verified: true }
    });
    res.status(200).json({ success: true, message: 'Collateral verified', collateral });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = { uploadCollateral, getMyCollateral, getAllCollateral, verifyCollateral };
