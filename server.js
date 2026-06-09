require('dotenv').config();
const app = require('./app');
const cronJobs = require('./src/jobs/cron.jobs');
const prisma = require('./src/config/db');
const bcrypt = require('bcryptjs');
const { DEMO_USERS } = require('./src/config/demoUsers');

const PORT = process.env.PORT || 5000;

/**
 * Ensures one demo user per role (ADMIN, STAFF, AGENT, BORROWER) always exists.
 * Replaces old "only if DB empty" logic — that skipped seeding when any user existed,
 * so Quick Access had "No X user found" for missing roles.
 */
async function ensureDemoUsers() {
  try {
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
      console.log(`[DEMO-USERS] OK ${user.role} -> ${user.email}`);
    }

    console.log('[DEMO-USERS] All 4 dashboard roles linked. Admin/Staff: password123 | Borrower & Agent: 123456');
  } catch (err) {
    console.error('[DEMO-USERS] Error:', err.message);
    if (err.code === 'P2002') {
      console.error('[DEMO-USERS] Hint: fix phone/email uniqueness in DB or change DEMO_USERS phones in server.js');
    }
  }
}

const PORT_START = process.env.PORT || 5000;

async function startServer() {
  const net = require('net');
  
  const findAvailablePort = (start) => {
    return new Promise((resolve) => {
      const server = net.createServer();
      server.unref();
      server.on('error', () => resolve(findAvailablePort(start + 1)));
      server.listen(start, () => {
        server.close(() => resolve(start));
      });
    });
  };

  const finalPort = await findAvailablePort(parseInt(PORT_START));

  app.listen(finalPort, async () => {
    console.log(`Server initialized on port ${finalPort}`);
    if (finalPort !== parseInt(PORT_START)) {
      console.log(`[Port Fallback] Port ${PORT_START} was busy, switched to ${finalPort}`);
    }
    await ensureDemoUsers();
    cronJobs.start();
  });
}

startServer().catch(err => {
  console.error('[Startup Error]', err);
  process.exit(1);
});
