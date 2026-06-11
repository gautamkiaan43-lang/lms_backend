const prisma = require('../config/db');
const { hashPassword } = require('../utils/bcrypt');

/** Fields Prisma accepts on User.update (no role/id junk from multipart). */
const USER_UPDATE_WHITELIST = new Set([
  'name',
  'email',
  'phone',
  'address',
  'businessName',
  'nrc',
  'agreementNumber',
  'risk',
  'guarantorName',
  'guarantorContact',
  'guarantorRelation',
  'guarantorYearsKnown',
  'internalNotes',
  'vehicleNumber',
  'vehicleType',
  'vehicleModelYear',
  'isVerified',
  'isApproved',
  'status',
]);

/**
 * Parse DOB from multipart (YYYY-MM-DD or DD/MM/YYYY). Invalid → omit (do not write).
 * Empty string → null (clear optional dob).
 */
function parseDobForPrisma(input) {
  if (input === undefined || input === null) return { mode: 'omit' };
  const s = String(input).trim();
  if (!s) return { mode: 'null' };

  let y;
  let mo;
  let day;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return { mode: 'omit' };
    y = m[1];
    mo = m[2];
    day = m[3];
  } else if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s)) {
    const parts = s.split('/');
    day = parts[0].padStart(2, '0');
    mo = parts[1].padStart(2, '0');
    y = parts[2];
  } else {
    return { mode: 'omit' };
  }

  const iso = `${y}-${mo}-${day}`;
  const dt = new Date(`${iso}T12:00:00.000Z`);
  if (Number.isNaN(dt.getTime())) return { mode: 'omit' };
  return { mode: 'set', date: dt };
}

async function uniqueBorrowerEmail(phone, agreementNumber) {
  const p = String(phone || '').replace(/\D/g, '').slice(-12) || 'x';
  const a = String(agreementNumber || '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toLowerCase()
    .slice(0, 40);
  const base = a ? `borrower.a.${a}` : `borrower.p.${p}`;
  let email = `${base}@lms.internal`;
  let n = 0;
  while (await prisma.user.findUnique({ where: { email } })) {
    n += 1;
    email = `${base}+${n}@lms.internal`;
  }
  return email;
}

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
      { phone: { contains: search } },
      { agreementNumber: { contains: search } },
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
      agreementNumber: true,
      dob: true,
      address: true,
      documentUrl: true,
      guarantorName: true,
      guarantorContact: true,
      guarantorRelation: true,
      guarantorYearsKnown: true,
      internalNotes: true,
      vehicleNumber: true,
      vehicleType: true,
      vehicleModelYear: true,
      idProofUrl: true,
      documentUrls: true,
      createdAt: true,
      loans: {
        where: { status: 'ACTIVE' },
        select: { id: true, currentPrincipal: true, monthlyPaymentCurrent: true },
      },
      _count: { select: { loans: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
};

const createUser = async (userData, files = []) => {
  const {
    name,
    email,
    phone,
    password,
    role,
    businessName,
    nrc,
    agreementNumber,
    dob,
    address,
    documentUrl,
    risk,
    guarantorName,
    guarantorContact,
    guarantorRelation,
    guarantorYearsKnown,
    internalNotes,
    vehicleNumber,
    vehicleType,
    vehicleModelYear,
    idProofUrl,
  } = userData;

  // Process files
  let processedDocuments = [];
  if (files && files.length > 0) {
    processedDocuments = files.map((file) => ({
      name: file.originalname,
      type: file.fieldname === 'idProof' ? 'ID_PROOF' : 'DOCUMENT',
      url: `/uploads/${file.filename}`,
    }));
  }

  const documentUrlsJson = JSON.stringify(processedDocuments);

  const normalizedRole = String(role || 'BORROWER').toUpperCase();
  const startsPendingApproval = normalizedRole === 'BORROWER' || normalizedRole === 'AGENT';

  const agreement = (agreementNumber && String(agreementNumber).trim()) || null;

  let finalEmail = email && String(email).trim() ? String(email).trim() : '';
  if (!finalEmail && normalizedRole === 'BORROWER') {
    finalEmail = await uniqueBorrowerEmail(phone, agreement);
  }
  if (!finalEmail) {
    throw new Error('Email is required for this account type');
  }

  const orConditions = [{ email: finalEmail }, { phone }];
  if (nrc && String(nrc).trim()) orConditions.push({ nrc: String(nrc).trim() });
  if (agreement) orConditions.push({ agreementNumber: agreement });

  const existingUser = await prisma.user.findFirst({
    where: { OR: orConditions },
  });

  if (existingUser) {
    throw new Error('User with this email, phone, agreement number, or NRC already exists');
  }

  const hashedPassword = await hashPassword(password);

  const dobParsed = parseDobForPrisma(dob);
  const dobValue =
    dobParsed.mode === 'set' ? dobParsed.date : dobParsed.mode === 'null' ? null : null;

  return await prisma.user.create({
    data: {
      name,
      email: finalEmail,
      phone,
      password: hashedPassword,
      role: normalizedRole,
      isVerified: !startsPendingApproval,
      isApproved: !startsPendingApproval,
      status: startsPendingApproval ? 'pending_approval' : 'active',
      risk: risk || 'GREEN',
      businessName,
      nrc: nrc && String(nrc).trim() ? String(nrc).trim() : null,
      agreementNumber: agreement,
      dob: dobValue,
      address,
      documentUrl,
      guarantorName,
      guarantorContact,
      guarantorRelation,
      guarantorYearsKnown: guarantorYearsKnown != null && String(guarantorYearsKnown).trim()
        ? String(guarantorYearsKnown).trim()
        : null,
      internalNotes,
      vehicleNumber,
      vehicleType,
      vehicleModelYear,
      idProofUrl,
      documentUrls: documentUrlsJson,
    },
  });
};

const updateUser = async (id, rawData, files = []) => {
  const data = rawData && typeof rawData === 'object' ? rawData : {};
  const updateData = {};

  for (const key of USER_UPDATE_WHITELIST) {
    if (!(key in data)) continue;
    let v = data[key];
    if (v === undefined) continue;
    if (typeof v === 'string') v = v.trim();
    if (v === '') {
      if (['agreementNumber', 'nrc', 'address', 'businessName', 'guarantorName', 'guarantorContact', 'guarantorRelation', 'guarantorYearsKnown', 'internalNotes', 'vehicleNumber', 'vehicleType', 'vehicleModelYear'].includes(key)) {
        updateData[key] = null;
      }
      continue;
    }
    updateData[key] = v;
  }

  if (files && files.length > 0) {
    const newDocs = files.map((file) => ({
      name: file.originalname,
      type: file.fieldname === 'idProof' ? 'ID_PROOF' : 'DOCUMENT',
      url: `/uploads/${file.filename}`,
    }));
    updateData.documentUrls = JSON.stringify(newDocs);
  }

  if (updateData.password) {
    updateData.password = await hashPassword(updateData.password);
  }

  if ('dob' in data) {
    const parsed = parseDobForPrisma(data.dob);
    if (parsed.mode === 'null') updateData.dob = null;
    else if (parsed.mode === 'set') updateData.dob = parsed.date;
  }

  return await prisma.user.update({
    where: { id: parseInt(id, 10) },
    data: updateData,
  });
};

const verifyUser = async (id, isVerified = true) => {
  return await prisma.user.update({
    where: { id: parseInt(id, 10) },
    data: { isVerified },
  });
};

const approveUser = async (id, isApproved) => {
  return await prisma.user.update({
    where: { id: Number(id) },
    data: {
      isApproved: isApproved,
      status: isApproved ? 'active' : 'pending_approval',
    },
  });
};

const deleteUser = async (id) => {
  const userId = parseInt(id, 10);
  console.log(`[DEBUG] DELETING USER WITH ID: ${userId}. Cascading through related records...`);

  const loans = await prisma.loan.findMany({
    where: { OR: [{ userId: userId }, { agentId: userId }] },
    select: { id: true },
  });
  const loanIds = loans.map((l) => l.id);

  return await prisma.$transaction(async (tx) => {
    if (loanIds.length > 0) {
      await tx.payment.deleteMany({ where: { loanId: { in: loanIds } } });
      await tx.eMISchedule.deleteMany({ where: { loanId: { in: loanIds } } });
      await tx.commission.deleteMany({ where: { loanId: { in: loanIds } } });
    }

    await tx.loan.deleteMany({ where: { OR: [{ userId: userId }, { agentId: userId }] } });

    await tx.collateral.deleteMany({ where: { userId: userId } });
    await tx.notification.deleteMany({ where: { userId: userId } });
    await tx.payout.deleteMany({ where: { agentId: userId } });
    await tx.commission.deleteMany({ where: { OR: [{ agentId: userId }, { borrowerId: userId }] } });
    await tx.referral.deleteMany({ where: { OR: [{ referrerId: userId }, { referredId: userId }] } });

    await tx.user.updateMany({
      where: { agentId: userId },
      data: { agentId: null },
    });

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
        where: { agentId: parseInt(agentId, 10) },
        select: {
          id: true,
          principalAmount: true,
          status: true,
          interestRate: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });
};

module.exports = {
  getUsers,
  createUser,
  updateUser,
  verifyUser,
  approveUser,
  deleteUser,
  getAgentClients,
};
