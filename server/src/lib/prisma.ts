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

prisma.$connect().then(() => {
  return Promise.all([
    prisma.$queryRawUnsafe('PRAGMA journal_mode = WAL'),
    prisma.$queryRawUnsafe('PRAGMA busy_timeout = 5000'),
    prisma.$queryRawUnsafe('PRAGMA foreign_keys = ON'),
  ]);
}).catch((err) => {
  console.error('[prisma] Failed to apply SQLite pragmas:', err);
});

export default prisma; 