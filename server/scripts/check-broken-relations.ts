/**
 * Diagnostic Script: check-broken-relations
 *
 * Scans all dynamic tables in the database and reports every relation column
 * whose `targetTable` ID no longer exists (deleted table) or whose targetTable
 * is owned by a different user than the source table.
 *
 * Usage:
 *   npx ts-node -r tsconfig-paths/register scripts/check-broken-relations.ts
 *
 * Exit code:
 *   0 – no broken relations found
 *   1 – one or more broken relations detected (or script error)
 */

import { PrismaClient } from '../generated/prisma/index';

const prisma = new PrismaClient();

interface BrokenRelation {
  tableId: string;
  tableName: string;
  tableOwner: string;
  fieldName: string;
  fieldLabel: string;
  targetTableId: string;
  reason: 'TARGET_NOT_FOUND' | 'TARGET_WRONG_OWNER' | 'ALREADY_FLAGGED';
}

async function main(): Promise<void> {
  console.log('=== check-broken-relations ===\n');

  const allTables = await prisma.dynamicTable.findMany({
    select: { id: true, name: true, userId: true, schema: true },
  });

  // Build a lookup map for fast existence + ownership checks
  const tableMap = new Map<string, { name: string; userId: string }>(
    allTables.map(t => [t.id, { name: t.name, userId: t.userId }])
  );

  const broken: BrokenRelation[] = [];

  for (const table of allTables) {
    const schema = table.schema as any;
    const fields: any[] = Array.isArray(schema?.fields) ? schema.fields : [];

    for (const field of fields) {
      if (field.type !== 'relation' || !field.relation?.targetTable) continue;

      const targetId: string = field.relation.targetTable;

      // Skip preset markers — they are resolved at install time and should not appear here
      if (typeof targetId === 'string' && targetId.startsWith('@@PRESET_TABLE_KEY::')) continue;

      if (field.relation.broken === true) {
        broken.push({
          tableId: table.id,
          tableName: table.name,
          tableOwner: table.userId,
          fieldName: field.name,
          fieldLabel: field.label || field.name,
          targetTableId: targetId,
          reason: 'ALREADY_FLAGGED',
        });
        continue;
      }

      const target = tableMap.get(targetId);
      if (!target) {
        broken.push({
          tableId: table.id,
          tableName: table.name,
          tableOwner: table.userId,
          fieldName: field.name,
          fieldLabel: field.label || field.name,
          targetTableId: targetId,
          reason: 'TARGET_NOT_FOUND',
        });
        continue;
      }

      if (target.userId !== table.userId) {
        broken.push({
          tableId: table.id,
          tableName: table.name,
          tableOwner: table.userId,
          fieldName: field.name,
          fieldLabel: field.label || field.name,
          targetTableId: targetId,
          reason: 'TARGET_WRONG_OWNER',
        });
      }
    }
  }

  if (broken.length === 0) {
    console.log('No broken relation columns found.');
    await prisma.$disconnect();
    process.exit(0);
  }

  console.log(`Found ${broken.length} broken relation column(s):\n`);
  console.log(
    [
      'Table ID'.padEnd(30),
      'Table Name'.padEnd(25),
      'Field'.padEnd(25),
      'Target ID'.padEnd(30),
      'Reason',
    ].join(' | ')
  );
  console.log('-'.repeat(130));

  for (const b of broken) {
    console.log(
      [
        b.tableId.padEnd(30),
        b.tableName.padEnd(25),
        b.fieldLabel.padEnd(25),
        b.targetTableId.padEnd(30),
        b.reason,
      ].join(' | ')
    );
  }

  // Group by owner for a summary
  const byOwner = new Map<string, number>();
  for (const b of broken) {
    byOwner.set(b.tableOwner, (byOwner.get(b.tableOwner) ?? 0) + 1);
  }
  console.log('\nSummary by owner:');
  for (const [owner, count] of byOwner.entries()) {
    console.log(`  userId=${owner}: ${count} broken relation(s)`);
  }

  await prisma.$disconnect();
  process.exit(1);
}

main().catch(async (err) => {
  console.error('Script error:', err);
  await prisma.$disconnect();
  process.exit(1);
});
