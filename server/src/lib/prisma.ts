import { PrismaClient } from '../../generated/prisma';

declare global {
  // allow global `var` declarations
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

const prisma = global.prisma || new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  global.prisma = prisma;
}

// ponytail: skip the fire-and-forget pragma setup under Jest. It resolves/rejects
// after a worker's teardown → "Cannot log after tests are done" flips the process
// exit to 1 (TECH-DEBT-TEST-001). Prisma's SQLite connector already sets
// foreign_keys=ON per connection; WAL/busy_timeout are concurrency tuning a
// single-worker test run doesn't need. Add an awaited init() if a test ever does.
if (process.env.NODE_ENV !== 'test') {
  prisma.$connect().then(() => {
    return Promise.all([
      prisma.$queryRawUnsafe('PRAGMA journal_mode = WAL'),
      prisma.$queryRawUnsafe('PRAGMA busy_timeout = 5000'),
      prisma.$queryRawUnsafe('PRAGMA foreign_keys = ON'),
    ]);
  }).catch((err) => {
    console.error('[prisma] Failed to apply SQLite pragmas:', err);
  });
}

export default prisma; 