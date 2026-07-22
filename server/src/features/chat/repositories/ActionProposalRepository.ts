import prisma from '../../../lib/prisma';
import { ActionProposal, Prisma } from 'generated/prisma';
import { IActionProposalRepository } from './IActionProposalRepository';

export class ActionProposalRepository implements IActionProposalRepository {
    async create(data: Omit<ActionProposal, 'id' | 'createdAt' | 'updatedAt'>): Promise<ActionProposal> {
        return prisma.actionProposal.create({
            data: {
                userId: data.userId,
                action: data.action,
                tableId: data.tableId,
                tableName: data.tableName,
                tableLabel: data.tableLabel,
                data: (data.data ?? {}) as Prisma.InputJsonValue,
                status: data.status || 'PENDING',
            },
        });
    }

    async findById(id: string): Promise<ActionProposal | null> {
        return prisma.actionProposal.findUnique({
            where: { id },
        });
    }

    async delete(id: string): Promise<void> {
        await prisma.actionProposal.delete({
            where: { id },
        });
    }

    async findByUserId(userId: string): Promise<ActionProposal[]> {
        return prisma.actionProposal.findMany({
            where: { userId, status: 'PENDING' },
            orderBy: { createdAt: 'desc' },
        });
    }

    async deleteOldProposals(hours: number): Promise<void> {
        const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);
        await prisma.actionProposal.deleteMany({
            where: {
                createdAt: { lt: cutoff },
                status: 'PENDING',
            },
        });
    }
}
