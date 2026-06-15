import prisma from '../../../lib/prisma';
import { KnowledgeGraphData } from '../services/KnowledgeGraphService';
import { IKnowledgeGraphRepository } from './IKnowledgeGraphRepository';

export class KnowledgeGraphRepository implements IKnowledgeGraphRepository {
    async findByUserId(userId: string): Promise<{ userId: string; data: unknown } | null> {
        return prisma.knowledgeGraph.findUnique({
            where: { userId }
        });
    }

    async upsert(userId: string, data: KnowledgeGraphData): Promise<void> {
        await prisma.knowledgeGraph.upsert({
            where: { userId },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- prisma InputJsonValue: JSON fields require any cast at persistence boundary
            update: { data: data as any },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- prisma InputJsonValue: JSON fields require any cast at persistence boundary
            create: { userId, data: data as any }
        });
    }
}
