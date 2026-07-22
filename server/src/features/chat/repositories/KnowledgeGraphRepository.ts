import prisma from '../../../lib/prisma';
import { Prisma, KnowledgeGraph } from 'generated/prisma';
import { KnowledgeGraphData } from '../services/KnowledgeGraphService';
import { IKnowledgeGraphRepository } from './IKnowledgeGraphRepository';

export class KnowledgeGraphRepository implements IKnowledgeGraphRepository {
    async findByUserId(userId: string): Promise<KnowledgeGraph | null> {
        return prisma.knowledgeGraph.findUnique({
            where: { userId }
        });
    }

    async upsert(userId: string, data: KnowledgeGraphData): Promise<void> {
        const payload = data as unknown as Prisma.InputJsonValue;
        await prisma.knowledgeGraph.upsert({
            where: { userId },
            update: { data: payload },
            create: { userId, data: payload }
        });
    }
}
