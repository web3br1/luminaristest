import type { KnowledgeGraph } from 'generated/prisma';
import { KnowledgeGraphData } from '../services/KnowledgeGraphService';

export interface IKnowledgeGraphRepository {
    findByUserId(userId: string): Promise<KnowledgeGraph | null>;
    upsert(userId: string, data: KnowledgeGraphData): Promise<void>;
}
