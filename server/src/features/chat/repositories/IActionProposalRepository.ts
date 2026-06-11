import { ActionProposal } from 'generated/prisma';

export interface IActionProposalRepository {
    create(data: any): Promise<ActionProposal>;
    findById(id: string): Promise<ActionProposal | null>;
    delete(id: string): Promise<void>;
    findByUserId(userId: string): Promise<ActionProposal[]>;
    deleteOldProposals(hours: number): Promise<void>;
}
