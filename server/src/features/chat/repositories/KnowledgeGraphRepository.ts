import prisma from '../../../lib/prisma';
import { KnowledgeGraphData } from '../services/KnowledgeGraphService';
import { IKnowledgeGraphRepository } from './IKnowledgeGraphRepository';

export class KnowledgeGraphRepository implements IKnowledgeGraphRepository {
    async findByUserId(userId: string): Promise<any | null> {
        return prisma.knowledgeGraph.findUnique({
            where: { userId }
        });
    }

    async upsert(userId: string, data: KnowledgeGraphData): Promise<void> {
        await prisma.knowledgeGraph.upsert({
            where: { userId },
            update: { data: data as any },
            create: { userId, data: data as any }
        });
    }
}
