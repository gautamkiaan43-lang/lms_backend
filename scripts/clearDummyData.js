const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log("[CLEANUP] Starting dummy data removal...");
    
    // Ordered deletion to handle foreign keys
    await prisma.notification.deleteMany({});
    await prisma.commission.deleteMany({});
    await prisma.payout.deleteMany({});
    await prisma.payment.deleteMany({});
    await prisma.collateral.deleteMany({});
    await prisma.referral.deleteMany({});
    await prisma.loan.deleteMany({});
    
    // Delete all users EXCEPT the primary admin
    // We keep everyone with @lendanet.com temporarily for easy testing, 
    // or just keep id 1 (assuming it is the main admin)
    const deletedUsers = await prisma.user.deleteMany({
        where: {
            NOT: {
                email: 'admin@lendanet.com'
            }
        }
    });

    console.log(`[CLEANUP] Deleted ${deletedUsers.count} users.`);
    console.log("[CLEANUP] Success. Database is now clean and ready for testing.");
}

main()
  .catch((e) => {
    console.error("[CLEANUP ERR]", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
