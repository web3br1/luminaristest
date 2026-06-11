'use client';

import { useCallback } from 'react';
import { getCookie } from 'cookies-next';
import { DynamicTableService } from '../../../../../lib/services/dynamic-table.service';

export function useLeadActions(
    leadsTableId: string | undefined,
    proposalsTableId: string | undefined,
    activitiesTableId: string | undefined,
    refetch: () => Promise<void>,
    fetchActivities: (leadId: string) => Promise<void>
) {
    /**
     * Advance a lead to the next stage and perform side effects (like creating a proposal record)
     */
    const advanceToNextStage = useCallback(async (
        leadId: string,
        stage: any,
        payload?: { meetingAt?: string; amount?: number; currency?: string; winProbability?: number }
    ) => {
        if (!stage || !leadsTableId || !leadId) return;

        try {
            const token = getCookie('auth_token');
            const headers: HeadersInit = {
                'Content-Type': 'application/json',
                ...(token ? { 'Authorization': `Bearer ${token}` } : {})
            };

            const nextType = String((stage.data || {}).type || '').toLowerCase();

            // 1. If next stage is proposal, create the proposal record first
            if (nextType === 'proposal' && proposalsTableId && payload?.amount != null) {
                try {
                    await DynamicTableService.createRecord(proposalsTableId, {
                        data: {
                            leadId: String(leadId),
                            amount: payload.amount,
                            currency: payload.currency || 'BRL',
                            winProbability: payload.winProbability ?? undefined,
                            status: 'Sent'
                        }
                    });
                } catch (err: any) {
                    throw new Error(err?.error || err?.message || 'Falha ao criar proposta');
                }
            }

            // 2. Update the Lead record
            const bodyData: any = { stageId: String(stage.id) };
            if (payload?.meetingAt) bodyData.nextActionAt = payload.meetingAt;
            if (payload?.amount != null) {
                bodyData.latestProposalAmount = payload.amount;
                bodyData.latestProposalCurrency = payload.currency || 'BRL';
                if (payload.winProbability != null) bodyData.latestProposalWinProbability = payload.winProbability;
            }

            try {
                await DynamicTableService.updateRecord(leadsTableId, leadId, { data: bodyData });
            } catch (err: any) {
                throw new Error(err?.error || err?.message || 'Falha ao avançar estágio');
            }

            // 3. Refresh data
            await refetch();
            await fetchActivities(String(leadId));

        } catch (error: any) {
            console.error('[useLeadActions] Error advancing stage:', error);
            throw error;
        }
    }, [leadsTableId, proposalsTableId, refetch, fetchActivities]);

    /**
     * Delete a lead completely, including its related proposals and activities
     */
    const deleteLeadCompletely = useCallback(async (leadId: string) => {
        if (!leadsTableId || !leadId) return;

        try {
            const token = getCookie('auth_token');
            const headers: HeadersInit = {
                'Content-Type': 'application/json',
                ...(token ? { 'Authorization': `Bearer ${token}` } : {})
            };

            // 1. Delete associated proposals
            if (proposalsTableId) {
                const body = await DynamicTableService.getTableData(proposalsTableId).catch(() => ({}));
                const rows = Array.isArray(body?.data) ? body.data : [];
                const toDelete = rows.filter((r: any) => String(r.data?.leadId) === String(leadId));

                for (const row of toDelete) {
                    await DynamicTableService.deleteRecord(proposalsTableId, row.id).catch(console.error);
                }
            }

            // 2. Delete associated activities
            if (activitiesTableId) {
                const body = await DynamicTableService.getTableData(activitiesTableId).catch(() => ({}));
                const rows = Array.isArray(body?.data) ? body.data : [];
                const toDelete = rows.filter((r: any) => String(r.data?.leadId) === String(leadId));

                for (const row of toDelete) {
                    await DynamicTableService.deleteRecord(activitiesTableId, row.id).catch(console.error);
                }
            }

            // 3. Finally, delete the lead
            try {
                await DynamicTableService.deleteRecord(leadsTableId, leadId);
            } catch (err: any) {
                throw new Error(err?.message || 'Falha ao excluir o lead definitivo');
            }

            await refetch();

        } catch (error: any) {
            console.error('[useLeadActions] Error deleting lead:', error);
            throw error;
        }
    }, [leadsTableId, proposalsTableId, activitiesTableId, refetch]);

    return {
        advanceToNextStage,
        deleteLeadCompletely
    };
}
