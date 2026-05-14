const prisma = require('../config/db');
const { hashPassword } = require('../utils/bcrypt');

/**
 * Get users with optional role and search filtering
 */
const getUsers = async (role, search) => {
  const where = {};
  if (role && role !== 'ALL') {
    where.role = role;
  }
  if (search) {
    where.OR = [
      { name: { contains: search } },
      { email: { contains: search } },
      { phone: { contains: search } }
    ];
  }

  return await prisma.user.findMany({
    where,
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      role: true,
      isVerified: true,
      isApproved: true,
      status: true,
      risk: true,
      businessName: true,
      nrc: true,
      dob: true,
      address: true,
      documentUrl: true,
      guarantorName: true,
      guarantorContact: true,
      guarantorRelation: true,
      internalNotes: true,
      vehicleNumber: true,
      vehicleType: true,
      vehicleModelYear: true,
      idProofUrl: true,
      documentUrls: true,
      createdAt: true,
      loans: {
        where: { status: 'ACTIVE' },
        select: { id: true, currentPrincipal: true, monthlyPaymentCurrent: true }
      },
      _count: { select: { loans: true } }
    },
    orderBy: { createdAt: 'desc' }
  });
};

const createUser = async (userData, files = []) => {
  const { 
    name, email, phone, password, role, businessName, nrc, dob, address, documentUrl, risk,
    guarantorName, guarantorContact, guarantorRelation, internalNotes,
    vehicleNumber, vehicleType, vehicleModelYear, idProofUrl
  } = userData;

  // Process files
  let processedDocuments = [];
  if (files && files.length > 0) {
    processedDocuments = files.map(file => ({
      name: file.originalname,
      type: file.fieldname === 'idProof' ? 'ID_PROOF' : 'DOCUMENT',
      url: `/uploads/${file.filename}`
    }));
  }
  
  const documentUrlsJson = JSON.stringify(processedDocuments);

  const normalizedRole = String(role || 'BORROWER').toUpperCase();
  const startsPendingApproval = normalizedRole === 'BORROWER' || normalizedRole === 'AGENT';

  const orConditions = [{ email }, { phone }];
  if (nrc) orConditions.push({ nrc });

  const existingUser = await prisma.user.findFirst({
    where: { OR: orConditions }
  });

  if (existingUser) {
    throw new Error('User with this email, phone, or NRC already exists');
  }

  const hashedPassword = await hashPassword(password);

  return await prisma.user.create({
    data: {
      name,
      email,
      phone,
      password: hashedPassword,
      role: normalizedRole,
      isVerified: !startsPendingApproval,
      isApproved: !startsPendingApproval,
      status: startsPendingApproval ? 'pending_approval' : 'active',
      risk: risk || 'GREEN',
      businessName,
      nrc,
      dob: dob ? new Date(dob) : null,
      address,
      documentUrl,
      guarantorName,
      guarantorContact,
      guarantorRelation,
      internalNotes,
      vehicleNumber,
      vehicleType,
      vehicleModelYear,
      idProofUrl,
      documentUrls: documentUrlsJson
    }
  });
};


const updateUser = async (id, data, files = []) => {
  const updateData = { ...data };
  
  if (files && files.length > 0) {
    const newDocs = files.map(file => ({
      name: file.originalname,
      type: file.fieldname === 'idProof' ? 'ID_PROOF' : 'DOCUMENT',
      url: `/uploads/${file.filename}`
    }));
    
    // Merge or overwrite? Let's overwrite or let the service decide.
    // For now, let's append if there are existing ones, or just use the new ones.
    updateData.documentUrls = JSON.stringify(newDocs);
  }

  
  if (updateData.password) {
    updateData.password = await hashPassword(updateData.password);
  }
  
  if (updateData.dob) {
    updateData.dob = new Date(updateData.dob);
  }

  return await prisma.user.update({
    where: { id: parseInt(id) },
    data: updateData
  });
};

const verifyUser = async (id, isVerified = true) => {
  return await prisma.user.update({
    where: { id: parseInt(id) },
    data: { isVerified }
  });
};

const approveUser = async (id, isApproved) => {
  return await prisma.user.update({
    where: { id: Number(id) },
    data: { 
      isApproved: isApproved,
      status: isApproved ? 'active' : 'pending_approval'
    }
  });
};

const deleteUser = async (id) => {
  const userId = parseInt(id);
  console.log(`[DEBUG] DELETING USER WITH ID: ${userId}. Cascading through related records...`);

  // 1. Get loan IDs to delete their related payments/schedules
  const loans = await prisma.loan.findMany({
    where: { OR: [{ userId: userId }, { agentId: userId }] },
    select: { id: true }
  });
  const loanIds = loans.map(l => l.id);

  return await prisma.$transaction(async (tx) => {
    // 2. Delete dependent records of loans
    if (loanIds.length > 0) {
      await tx.payment.deleteMany({ where: { loanId: { in: loanIds } } });
      await tx.eMISchedule.deleteMany({ where: { loanId: { in: loanIds } } });
      await tx.commission.deleteMany({ where: { loanId: { in: loanIds } } });
    }

    // 3. Delete loans
    await tx.loan.deleteMany({ where: { OR: [{ userId: userId }, { agentId: userId }] } });

    // 4. Delete other related records
    await tx.collateral.deleteMany({ where: { userId: userId } });
    await tx.notification.deleteMany({ where: { userId: userId } });
    await tx.payout.deleteMany({ where: { agentId: userId } });
    await tx.commission.deleteMany({ where: { OR: [{ agentId: userId }, { borrowerId: userId }] } });
    await tx.referral.deleteMany({ where: { OR: [{ referrerId: userId }, { referredId: userId }] } });

    // 5. Handle agent relationship (if this user was an agent for others)
    await tx.user.updateMany({
      where: { agentId: userId },
      data: { agentId: null }
    });

    // 6. Finally delete the user
    return await tx.user.delete({ where: { id: userId } });
  });
};

const getAgentClients = async (agentId) => {
  const aid = parseInt(agentId, 10);
  return await prisma.user.findMany({
    where: {
      role: 'BORROWER',
      OR: [
        { agentId: aid },
        {
          loans: {
            some: {
              agentId: aid,
            },
          },
        },
      ],
    },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      isVerified: true,
      risk: true,
      createdAt: true,
      loans: {
        where: { agentId: parseInt(agentId) },
        select: {
          id: true,
          principalAmount: true,
          status: true,
          interestRate: true
        }
      }
    },
    orderBy: { createdAt: 'desc' }
  });
};

module.exports = {
  getUsers,
  createUser,
  updateUser,
  verifyUser,
  approveUser,
  deleteUser,
  getAgentClients
};
