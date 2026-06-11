import prisma from '../src/lib/prisma';

async function backfill() {
    console.log('Starting backfill of internalName field...');
    const tables = await (prisma as any).dynamicTable.findMany();

    for (const table of tables) {
        if (table.internalName) {
            console.log(`Table "${table.name}" (ID: ${table.id}) already has internalName: ${table.internalName}`);
            continue;
        }

        let internalName: string | null = null;
        const name = table.name;

        // Mapping leads module
        if (name === 'Leads') internalName = 'leads';
        else if (name === 'Lead Pipelines' || name === 'Pipelines de Lead') internalName = 'leadPipelines';
        else if (name === 'Lead Stages' || name === 'Etapas de Lead') internalName = 'leadStages';
        else if (name === 'Lead Proposals') internalName = 'leadProposals';
        else if (name === 'Lead Activities') internalName = 'leadActivities';

        // Mapping other core tables
        else if (name === 'Units') internalName = 'units';
        else if (name === 'Employees') internalName = 'employees';
        else if (name === 'Appointments') internalName = 'appointments';
        else if (name === 'Services' || name === 'services') internalName = 'services';

        if (internalName) {
            await (prisma as any).dynamicTable.update({
                where: { id: table.id },
                data: { internalName }
            });
            console.log(`Updated "${table.name}" (ID: ${table.id}) -> internalName: "${internalName}"`);
        } else {
            console.warn(`Could not determine internalName for table: "${table.name}"`);
        }
    }
    console.log('Backfill completed.');
}

backfill()
    .then(() => process.exit(0))
    .catch((e) => {
        console.error('Error during backfill:', e);
        process.exit(1);
    });
