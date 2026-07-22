// Runs as a Jest `setupFiles` entry — BEFORE the module graph (and thus `lib/prisma`) loads.
// Points the Prisma singleton at an isolated SQLite test database so integration tests never
// touch the dev DB. The relative `file:` URL resolves against the schema.prisma directory
// (server/prisma) for both the Prisma CLI and the generated client, so they always agree.
process.env.DATABASE_URL = 'file:./test-integration.db';
process.env.NODE_ENV = 'test';
// lib/jwt fail-closes on secrets shorter than 32 chars — keep this dummy long enough.
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-0123456789abcdef0123456789';
