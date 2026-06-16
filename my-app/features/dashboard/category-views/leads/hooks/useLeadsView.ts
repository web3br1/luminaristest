'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import { DynamicTableService } from '../../../../../lib/services/dynamic-table.service';
import { useTableData, IDynamicTable, IDynamicTableData, isTableSchema } from '../../../components/shared/dynamic-tables.client';
import { useLeadActions } from './useLeadActions';

export type LeadTab = 'kanban' | 'manage' | 'meetings';

export function useLeadsView(tables: IDynamicTable[]) {
    const leadsTable = useMemo(() => tables.find(t => t.internalName === 'leads' || t.name === 'Leads'), [tables]);
    const pipelinesTable = useMemo(() => tables.find(t => t.internalName === 'leadPipelines' || t.name === 'Lead Pipelines'), [tables]);
    const stagesTable = useMemo(() => tables.find(t => t.internalName === 'leadStages' || t.name === 'Lead Stages'), [tables]);
    const proposalsTable = useMemo(() => tables.find(t => t.internalName === 'leadProposals' || t.name === 'Lead Proposals'), [tables]);
    const activitiesTable = useMemo(() => tables.find(t => t.internalName === 'leadActivities' || t.name === 'Lead Activities'), [tables]);

    const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<LeadTab>('kanban');
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);

    // Filters
    const [filterName, setFilterName] = useState('');
    const [filterSource, setFilterSource] = useState('');
    const [filterScoreMin, setFilterScoreMin] = useState<string>('');
    const [filterScoreMax, setFilterScoreMax] = useState<string>('');
    const [filterBudget, setFilterBudget] = useState('');
    const [filterAuthority, setFilterAuthority] = useState('');
    const [filterNeed, setFilterNeed] = useState('');
    const [filterTiming, setFilterTiming] = useState('');
    const [showFilters, setShowFilters] = useState(false);

    const { table: leadsTableData, records: leads, refetch } = useTableData(leadsTable?.id || '');

    const unitField = isTableSchema(leadsTableData?.schema) ? leadsTableData!.schema.fields.find(f => f.name === 'unitId') : null;
    const unitTableId = unitField?.relation?.targetTable;
    const fallbackUnitTableId = useMemo(() => (tables.find(t => t.internalName === 'units' || t.name === 'Units')?.id) || null, [tables]);

    const [unitOptions, setUnitOptions] = useState<Array<{ id: string; name: string }>>([]);
    const [pipelines, setPipelines] = useState<IDynamicTableData[]>([]);
    const [stages, setStages] = useState<IDynamicTableData[]>([]);
    const [activePipelineId, setActivePipelineId] = useState<string | null>(null);
    const [ownerMap, setOwnerMap] = useState<Record<string, string>>({});
    const [unitMap, setUnitMap] = useState<Record<string, string>>({});
    type ActivityRow = IDynamicTableData & { updatedAt?: string; createdAt?: string };
    const [activities, setActivities] = useState<ActivityRow[]>([]);

    // Stage transition states
    const [showStageModal, setShowStageModal] = useState<null | 'meeting' | 'proposal'>(null);
    const [meetingAt, setMeetingAt] = useState<string>('');
    const [propAmountInput, setPropAmountInput] = useState<string>('');
    const [propAmountValue, setPropAmountValue] = useState<number | null>(null);
    const [propCurrency, setPropCurrency] = useState<string>('BRL');
    const [propWinProb, setPropWinProb] = useState<string>('');
    const [savingStage, setSavingStage] = useState(false);
    const [pendingNextStage, setPendingNextStage] = useState<IDynamicTableData | null>(null);

    // Activity states
    const [activityFilter, setActivityFilter] = useState<'all' | 'note' | 'meeting' | 'proposal' | 'stage_change' | 'call' | 'email'>('all');
    const [showNoShowModal, setShowNoShowModal] = useState(false);
    const [noShowOption, setNoShowOption] = useState<'reschedule' | 'back'>('reschedule');
    const [noShowNewAt, setNoShowNewAt] = useState('');

    // Delete states
    const [showDeleteStep, setShowDeleteStep] = useState<0 | 1 | 2>(0);
    const [deleteConfirmText, setDeleteConfirmText] = useState('');

    const fetchActivities = useCallback(async (leadId: string) => {
        if (!activitiesTable?.id) return;
        try {
            const body = await DynamicTableService.getTableData(activitiesTable.id).catch(() => ({ data: undefined }));
            type ActivityRow = IDynamicTableData & { updatedAt?: string; createdAt?: string };
            const rows = (Array.isArray(body?.data) ? body.data : []) as ActivityRow[];
            const filtered = rows.filter((row) => String((row.data || {}).leadId || '') === String(leadId))
                .sort((a, b) => new Date(b.updatedAt || b.createdAt || '').getTime() - new Date(a.updatedAt || a.createdAt || '').getTime());
            setActivities(filtered);
        } catch { setActivities([]); }
    }, [activitiesTable?.id]);

    const {
        advanceToNextStage: coreAdvance,
        deleteLeadCompletely: coreDelete
    } = useLeadActions(
        leadsTable?.id,
        proposalsTable?.id,
        activitiesTable?.id,
        refetch,
        fetchActivities
    );

    const advanceToNextStage = useCallback(async (leadId: string, stage: IDynamicTableData, payload?: Record<string, unknown> | { meetingAt?: string; amount?: number; currency?: string; winProbability?: number }) => {
        setSavingStage(true);
        try {
            await coreAdvance(leadId, stage, payload);
            setShowStageModal(null);
            setPendingNextStage(null);
            setMeetingAt(''); setPropAmountInput(''); setPropAmountValue(null); setPropCurrency('BRL'); setPropWinProb('');
        } catch (_e) {
            // Erro já notificado automaticamente pelo apiClient.
        } finally {
            setSavingStage(false);
        }
    }, [coreAdvance]);

    const deleteLeadCompletely = useCallback(async (leadId: string) => {
        try {
            await coreDelete(leadId);
            setSelectedLeadId(null);
            setActiveTab('kanban');
        } catch (e) {
            // Erro já notificado automaticamente pelo apiClient.
        }
    }, [coreDelete]);

    // Carregar unidades
    useEffect(() => {
        (async () => {
            const targetId = unitTableId || fallbackUnitTableId;
            if (!targetId) return;
            const body = await DynamicTableService.getTableData(targetId).catch(() => ({ data: undefined }));
            const rows = (Array.isArray(body?.data) ? body.data : []) as IDynamicTableData[];
            setUnitOptions(rows.map((r) => ({ id: String(r.id), name: String((r.data || {}).name || r.id) })));
            // Auto selecionar última unidade usada
            const last = typeof window !== 'undefined' ? window.localStorage.getItem('leads:lastUnitId') : null;
            if (last && rows.some((r) => String(r.id) === last)) setSelectedUnitId(last);
        })();
    }, [unitTableId, fallbackUnitTableId]);

    const filteredLeads = useMemo(() => {
        if (!selectedUnitId) return [];
        return (leads || []).filter((r) => String((r.data || {}).unitId || '') === String(selectedUnitId));
    }, [leads, selectedUnitId]);

    // Carregar pipelines e estágios ao selecionar unidade
    useEffect(() => {
        (async () => {
            if (!selectedUnitId) { setPipelines([]); setStages([]); setActivePipelineId(null); return; }
            if (pipelinesTable?.id) {
                const pb = await DynamicTableService.getTableData(pipelinesTable.id).catch(() => ({ data: undefined }));
                const allPipes = (Array.isArray(pb?.data) ? pb.data : []) as IDynamicTableData[];
                const unitPipes = allPipes.filter((r) => String((r.data || {}).unitId || '') === String(selectedUnitId));
                setPipelines(unitPipes);
                const def = unitPipes.find((r) => (r.data || {}).isDefault) || unitPipes[0] || null;
                setActivePipelineId(def ? String(def.id) : null);
            }
            if (stagesTable?.id) {
                const sb = await DynamicTableService.getTableData(stagesTable.id).catch(() => ({ data: undefined }));
                const allStages = (Array.isArray(sb?.data) ? sb.data : []) as IDynamicTableData[];
                setStages(allStages);
            }
        })();
    }, [selectedUnitId, pipelinesTable?.id, stagesTable?.id]);

    // Preload maps
    useEffect(() => {
        (async () => {
            try {
                if (!leadsTableData || !isTableSchema(leadsTableData.schema)) return;
                const fields = leadsTableData.schema.fields || [];
                const ownerField = fields.find(f => (f.name === 'assigneeId' || f.name === 'ownerId') && f.type === 'relation');
                const unitFieldLocal = fields.find(f => f.name === 'unitId' && f.type === 'relation');
                if (ownerField?.relation?.targetTable) {
                    const b = await DynamicTableService.getTableData(ownerField.relation.targetTable).catch(() => ({ data: undefined }));
                    const rows = (Array.isArray(b?.data) ? b.data : []) as IDynamicTableData[];
                    const m: Record<string, string> = {};
                    rows.forEach((row) => {
                        const d = row?.data || {};
                        const first = String(d.firstName || '').trim();
                        const last = String(d.lastName || '').trim();
                        const full = String(d.fullName || '').trim();
                        const nm = full || [first, last].filter(Boolean).join(' ').trim() || String(d.name || '').trim() || String(d.username || '').trim() || String(d.email || '').trim() || String(row.id);
                        m[String(row.id)] = nm;
                    });
                    setOwnerMap(m);
                }
                if (unitFieldLocal?.relation?.targetTable) {
                    const b = await DynamicTableService.getTableData(unitFieldLocal.relation.targetTable).catch(() => ({ data: undefined }));
                    const rows = (Array.isArray(b?.data) ? b.data : []) as IDynamicTableData[];
                    const m: Record<string, string> = {};
                    rows.forEach((row) => { const d = row?.data || {}; m[String(row.id)] = String(d.name || row.id); });
                    setUnitMap(m);
                }
            } catch { }
        })();
    }, [leadsTableData]);

    // Load activities for selected lead
    useEffect(() => { if (selectedLeadId) fetchActivities(String(selectedLeadId)); }, [selectedLeadId, fetchActivities]);

    return {
        tables: {
            leads: leadsTable,
            pipelines: pipelinesTable,
            stages: stagesTable,
            proposals: proposalsTable,
            activities: activitiesTable,
        },
        state: {
            selectedUnitId, setSelectedUnitId,
            activeTab, setActiveTab,
            isCreateOpen, setIsCreateOpen,
            selectedLeadId, setSelectedLeadId,
            filters: {
                filterName, setFilterName,
                filterSource, setFilterSource,
                filterScoreMin, setFilterScoreMin,
                filterScoreMax, setFilterScoreMax,
                filterBudget, setFilterBudget,
                filterAuthority, setFilterAuthority,
                filterNeed, setFilterNeed,
                filterTiming, setFilterTiming,
                showFilters, setShowFilters,
            },
            leadsTableData, leads, refetch,
            filteredLeads,
            unitField, unitTableId, fallbackUnitTableId,
            unitOptions, setUnitOptions,
            pipelines, setPipelines,
            stages, setStages,
            activePipelineId, setActivePipelineId,
            ownerMap, setOwnerMap,
            unitMap, setUnitMap,
            activities, setActivities,
            stageModal: {
                showStageModal, setShowStageModal,
                meetingAt, setMeetingAt,
                propAmountInput, setPropAmountInput,
                propAmountValue, setPropAmountValue,
                propCurrency, setPropCurrency,
                propWinProb, setPropWinProb,
                savingStage, setSavingStage,
                pendingNextStage, setPendingNextStage,
            },
            activity: {
                activityFilter, setActivityFilter,
                showNoShowModal, setShowNoShowModal,
                noShowOption, setNoShowOption,
                noShowNewAt, setNoShowNewAt,
            },
            delete: {
                showDeleteStep, setShowDeleteStep,
                deleteConfirmText, setDeleteConfirmText,
            }
        },
        actions: {
            fetchActivities,
            advanceToNextStage,
            deleteLeadCompletely,
        }
    };
}
