/**
 * Dev-only seed: creates a "units" DynamicTable + one row for the acc_tester user.
 * Run: npx ts-node -r tsconfig-paths/register seed-units.ts
 */
import { PrismaClient } from 'generated/prisma';

const prisma = new PrismaClient();

async function main() {
  const USER_ID = 'cmqsfth7j0000cipksn7sylfn';

  // Idempotent: skip if already exists
  const existing = await prisma.dynamicTable.findFirst({
    where: { userId: USER_ID, internalName: 'units' },
  });

  if (existing) {
    console.log('units table already exists:', existing.id);
    const rows = await prisma.dynamicTableData.findMany({ where: { dynamicTableId: existing.id } });
    console.log('rows:', rows.length);
    return;
  }

  const table = await prisma.dynamicTable.create({
    data: {
      userId: USER_ID,
      name: 'Unidades de Negócio',
      internalName: 'units',
      category: 'company',
      schema: {
        fields: [
          { name: 'name', type: 'text', label: 'Nome', required: true },
          { name: 'cnpj', type: 'text', label: 'CNPJ', required: false },
        ],
      },
    },
  });

  console.log('Created table:', table.id);

  const row = await prisma.dynamicTableData.create({
    data: {
      dynamicTableId: table.id,
      data: { name: 'Filial Principal', cnpj: '00.000.000/0001-00' },
    },
  });

  console.log('Created row:', row.id, '→', row.data);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
