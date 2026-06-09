const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const { DEMO_USERS } = require('../src/config/demoUsers');

const prisma = new PrismaClient();

async function main() {
  for (const user of DEMO_USERS) {
    const plain = user.demoPlainPassword || 'password123';
    const hashed = await bcrypt.hash(plain, 10);

    await prisma.user.upsert({
      where: { email: user.email },
      update: {
        name: user.name,
        phone: user.phone,
        role: user.role,
        password: hashed,
        isVerified: true,
        isApproved: true,
        status: 'active',
      },
      create: {
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        password: hashed,
        isVerified: true,
        isApproved: true,
        status: 'active',
      },
    });
    console.log(`[SEED] ${user.role} -> ${user.email} (phone ${user.phone})`);
  }

  console.log('\nDone! Dummy emails + phones are in the database.');
  console.log('Passwords: admin/staff password123 | borrower & agent 123456');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
