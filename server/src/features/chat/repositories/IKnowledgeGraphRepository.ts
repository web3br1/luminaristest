import { KnowledgeGraphData } from '../services/KnowledgeGraphService';

export interface IKnowledgeGraphRepository {
    findByUserId(userId: string): Promise<any | null>;
    upsert(userId: string, data: KnowledgeGraphData): Promise<void>;
}
