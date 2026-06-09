const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function debug() {
  console.log("--- LOANS ---");
  const loans = await prisma.loan.findMany({
    select: { id: true, status: true, principalAmount: true, monthlyPaymentCurrent: true }
  });
  console.log(JSON.stringify(loans, null, 2));

  console.log("\n--- PAYMENTS ---");
  const payments = await prisma.payment.findMany({
    include: { loan: true }
  });
  console.log(JSON.stringify(payments, null, 2));
}

debug().catch(console.error).finally(() => prisma.$disconnect());
