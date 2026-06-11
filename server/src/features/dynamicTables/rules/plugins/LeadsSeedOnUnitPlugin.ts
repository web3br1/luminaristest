/**
 * LeadsSeedOnUnitPlugin
 *
 * Automatically seeds a default lead pipeline and its stages whenever a new Unit is created.
 * This ensures every unit has a usable pipeline without manual setup.
 */
import type { RulePlugin, RuleContext } from '../RuleTypes';
import { resolveTable, tableMatches } from '../shared/tableFinder';

/** Find a table by category and stable internalName (with fallback to name) in the current user's workspace. */
async function getTable(ctx: RuleContext, category: string, internalName: string, fallbackName: string) {
  return resolveTable(ctx, { internalName, category, names: [fallbackName] });
}

/**
 * Ensure the given unit has a default pipeline and standard stages.
 * If already present, it is left untouched.
 */
async function ensureDefaultPipelineAndStages(ctx: RuleContext, unitId: string) {
  const pipelinesTable = await getTable(ctx, 'leads', 'leadPipelines', 'Pipelines de Lead');
  const stagesTable = await getTable(ctx, 'leads', 'leadStages', 'Etapas de Lead');
  if (!pipelinesTable || !stagesTable) return;
  const existingPipes = await ctx.repository.findRowsByFieldValue(pipelinesTable.id, 'unitId', String(unitId));
  if (existingPipes.length > 0) return; // pipeline já existente para a unidade

  // Cria pipeline padrão
  const pipeline = await ctx.repository.createData(pipelinesTable.id, {
    unitId,
    name: 'Pipeline Padrão',
    isDefault: true,
  } as any);

  // Cria estágios
  const stages = [
    { name: 'Sem Contato', order: 1, defaultWinProbability: 10, type: 'init' },
    { name: 'Reunião Agendada', order: 2, defaultWinProbability: 30, type: 'meeting' },
    { name: 'Proposta Enviada', order: 3, defaultWinProbability: 60, type: 'proposal' },
    { name: 'Fechamento', order: 4, defaultWinProbability: 80, type: 'negotiation' },
  ];
  for (const s of stages) {
    await ctx.repository.createData(stagesTable.id, {
      pipelineId: pipeline.id,
      name: s.name,
      order: s.order,
      type: (s as any).type,
      defaultWinProbability: s.defaultWinProbability,
    } as any);
  }
}

/** Rule hooks to seed pipelines on Unit creation. */
export const LeadsSeedOnUnitPlugin: RulePlugin = {
  name: 'LeadsSeedOnUnitPlugin',
  supports(ctx) {
    return tableMatches(ctx.table, { categories: ['business'], internalNames: ['units'], names: ['Units'] });
  },
  async afterCreate(ctx) {
    const unitId = String((ctx.after as any)?.id || '');
    if (!unitId) return;
    await ensureDefaultPipelineAndStages(ctx, unitId);
  },
};



