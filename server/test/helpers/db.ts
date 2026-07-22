/**
 * Database helpers for integration tests.
 *
 * All integration tests share one isolated SQLite file (test-integration.db, pointed at by
 * test/jest.setupEnv.ts). The integration Jest project runs --runInBand, so files never race on it.
 *  - pushTestSchema(): create the file fresh from schema.prisma (call once, in beforeAll).
 *  - resetDb():        wipe all rows between tests (call in afterEach) — FK-safe order.
 *  - disconnectDb():   close the Prisma connection (call in afterAll).
 */
import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import prisma from '@/lib/prisma';

const SERVER_DIR = path.resolve(__dirname, '../..'); // test/helpers -> server
const DB_FILE = path.join(SERVER_DIR, 'prisma', 'test-integration.db');

/** Drops any existing test DB and recreates the schema via `prisma db push`. */
export function pushTestSchema(): void {
  for (const f of [DB_FILE, `${DB_FILE}-journal`]) {
    if (fs.existsSync(f)) fs.rmSync(f);
  }
  execSync('npx prisma db push --skip-generate --accept-data-loss', {
    cwd: SERVER_DIR,
    env: { ...process.env, DATABASE_URL: 'file:./test-integration.db' },
    stdio: 'inherit',
  });
}

/** Deletes every row, children before parents, so tests start from a clean slate. */
export async function resetDb(): Promise<void> {
  await prisma.dynamicTableData.deleteMany();
  await prisma.dynamicTable.deleteMany();
  await prisma.dashboardLayout.deleteMany();
  await prisma.chatMessage.deleteMany();
  await prisma.chatInstance.deleteMany();
  await prisma.structuredData.deleteMany();
  await prisma.chunk.deleteMany();
  await prisma.document.deleteMany();
  await prisma.actionProposal.deleteMany();
  await prisma.knowledgeGraph.deleteMany();
  await prisma.user.deleteMany();
}

export async function disconnectDb(): Promise<void> {
  await prisma.$disconnect();
}
