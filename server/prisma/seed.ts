import { PrismaClient } from '../generated/prisma';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient({
    datasources: {
        db: {
            url: 'file:./dev.db'
        }
    }
});

async function main() {
    const adminEmail = process.env.SEED_ADMIN_EMAIL ?? 'admin@example.com';
    const adminPassword = process.env.SEED_ADMIN_PASSWORD;
    if (!adminPassword) {
        console.error('SEED_ADMIN_PASSWORD environment variable is required for seeding');
        process.exit(1);
    }
    const hashedPassword = await bcrypt.hash(adminPassword, 10);

    console.log('🌱 Seeding database...');

    const admin = await prisma.user.upsert({
        where: { email: adminEmail },
        update: {
            password: hashedPassword,
            role: 'ADMIN',
        },
        create: {
            email: adminEmail,
            username: 'admin',
            name: 'System Admin',
            password: hashedPassword,
            role: 'ADMIN',
        },
    });

    console.log(`✅ Admin user created/updated: ${admin.email}`);
    console.log('🚀 Seed completed successfully!');
}

main()
    .catch((e) => {
        console.error('❌ Error during seeding:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
