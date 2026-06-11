/**
 * LeadsPlugin
 *
 * Golden-standard rule plugin responsible for:
 * - Guaranteeing coherent creation of Leads (unit → default pipeline → first stage)
 * - Enforcing safe, sequential stage transitions with stage-specific requirements
 * - Calculating and preserving BANT-based score (only when BANT changes)
 * - Maintaining proposal snapshots on the Lead when proposals change
 * - Logging lead activities for auditability (stage changes, meetings, proposals, notes)
 * - Applying minor side effects like updating lastContactAt on relevant activities
 */
import type { RulePlugin, RuleContext } from '../RuleTypes';
import { ValidationError } from '../../../../lib/errors';
import { resolveTable, tableMatches } from '../shared/tableFinder';

/** Clamp numeric value to a closed interval [min, max]. */
function clamp(num: number, min: number, max: number) {
  return Math.max(min, Math.min(max, num));
}

/** Stable internal names for the Leads module tables. */
const SCHEMA_KEYS = {
  LEADS: 'leads',
  PIPELINES: 'leadPipelines',
  STAGES: 'leadStages',
  PROPOSALS: 'leadProposals',
  ACTIVITIES: 'leadActivities',
};

// Indexed-first table resolvers for the Leads module (replace repeated load-all + match).
const findLeadsTable = (ctx: RuleContext) => resolveTable(ctx, { internalName: SCHEMA_KEYS.LEADS, category: 'leads', names: ['Leads'] });
const findPipelinesTable = (ctx: RuleContext) => resolveTable(ctx, { internalName: SCHEMA_KEYS.PIPELINES, category: 'leads', names: ['Lead Pipelines', 'Pipelines de Lead'] });
const findStagesTable = (ctx: RuleContext) => resolveTable(ctx, { internalName: SCHEMA_KEYS.STAGES, category: 'leads', names: ['Lead Stages', 'Etapas de Lead'] });
const findProposalsTable = (ctx: RuleContext) => resolveTable(ctx, { internalName: SCHEMA_KEYS.PROPOSALS, category: 'leads', names: ['Lead Proposals'] });
const findActivitiesTable = (ctx: RuleContext) => resolveTable(ctx, { internalName: SCHEMA_KEYS.ACTIVITIES, category: 'leads', names: ['Lead Activities'] });

/**
 * Calculate Lead score based on BANT fields.
 * - Budget/Authority/Need: Low/Medium/High mapped to 30/60/100
 * - Timing: Long/Medium/Short/Urgent mapped to 20/40/70/100
 * Returns an integer in [0, 100].
 */
function calcScore(after: any): number {
  let score = 0;
  const weights = { budget: 0.25, authority: 0.25, need: 0.25, timing: 0.25 };
  // Budget pode chegar como number (1..n) ou string ('Low'|'Medium'|'High')
  let budgetScore = 0;
  if (typeof after?.bantBudget === 'string') {
    const b = String(after.bantBudget).toLowerCase();
    budgetScore = b === 'high' ? 100 : b === 'medium' ? 60 : b === 'low' ? 30 : 0;
  } else {
    const budgetNum = Number(after?.bantBudget || 0);
    if (!Number.isNaN(budgetNum) && budgetNum > 0) {
      // mapeia ordinal 1/2/3 ~ 30/60/100
      if (budgetNum <= 1) budgetScore = 30; else if (budgetNum === 2) budgetScore = 60; else budgetScore = 100;
    }
  }
  score += weights.budget * budgetScore;
  const auth = String(after?.bantAuthority || '').toLowerCase();
  if (auth === 'high') score += weights.authority * 100;
  else if (auth === 'medium') score += weights.authority * 60;
  else if (auth === 'low') score += weights.authority * 30;
  const need = String(after?.bantNeed || '').toLowerCase();
  if (need === 'high') score += weights.need * 100;
  else if (need === 'medium') score += weights.need * 60;
  else if (need === 'low') score += weights.need * 30;
  const timing = String(after?.bantTiming || '').toLowerCase();
  if (timing === 'urgent') score += weights.timing * 100;
  else if (timing === 'short') score += weights.timing * 70;
  else if (timing === 'medium') score += weights.timing * 40;
  else if (timing === 'long') score += weights.timing * 20;
  return Math.round(clamp(score, 0, 100));
}

/**
 * Rule hooks for Leads, Lead Proposals and Lead Activities
 */
export const LeadsPlugin: RulePlugin = {
  name: 'LeadsPlugin',
  supports(ctx) {
    return tableMatches(ctx.table, {
      categories: ['leads'],
      internalNames: [SCHEMA_KEYS.LEADS, SCHEMA_KEYS.PROPOSALS, SCHEMA_KEYS.ACTIVITIES],
      names: ['Leads', 'Lead Proposals', 'Lead Activities'],
    });
  },
  async beforeCreate(ctx) {
    const tableName = ctx.table.internalName || ctx.table.name;
    if (tableName === SCHEMA_KEYS.LEADS || tableName === 'Leads') {
      await validateLead(ctx, ctx.after as any);
      // Não recalcula score se nenhum campo BANT mudou; preserva o score anterior
      const bantKeys = ['bantBudget', 'bantAuthority', 'bantNeed', 'bantTiming'];
      const touchedBant = bantKeys.some(k => (ctx.after as any)[k] !== undefined);
      if (touchedBant) {
        const merged = { ...(ctx.before as any), ...(ctx.after as any) } as any;
        (ctx.after as any).score = calcScore(merged);
      } else if ((ctx.before as any)?.score != null) {
        (ctx.after as any).score = (ctx.before as any).score;
      }
      // Forçar estágio inicial se não vier preenchido
      if (!ctx.after?.stageId && ctx.after?.pipelineId) {
        const firstStageId = await findFirstStageForPipeline(ctx, String(ctx.after.pipelineId));
        if (firstStageId) (ctx.after as any).stageId = firstStageId;
      } else if (!ctx.after?.stageId && !ctx.after?.pipelineId) {
        // Se pipeline não vier, escolher pipeline default da unidade e seu primeiro estágio
        const pipe = await findDefaultPipelineForUnit(ctx, String(ctx.after?.unitId || ''));
        if (pipe) {
          (ctx.after as any).pipelineId = pipe.id;
          const firstStageId = await findFirstStageForPipeline(ctx, String(pipe.id));
          if (firstStageId) (ctx.after as any).stageId = firstStageId;
        }
      }
      if (!(ctx.after as any)?.pipelineId || !(ctx.after as any)?.stageId) {
        throw new ValidationError('Não foi possível determinar Pipeline/Stage padrão para a unidade.', { pipelineId: ['Obrigatório'], stageId: ['Obrigatório'] });
      }
    }
    if (tableName === SCHEMA_KEYS.PROPOSALS || tableName === 'Lead Proposals') {
      await validateProposal(ctx, ctx.after as any);
    }
  },
  async beforeUpdate(ctx) {
    const tableName = ctx.table.internalName || ctx.table.name;
    if (tableName === SCHEMA_KEYS.LEADS || tableName === 'Leads') {
      await validateLead(ctx, ctx.after as any);
      // Só recalcula score se algum campo BANT foi tocado; caso contrário preserva
      const bantKeys = ['bantBudget', 'bantAuthority', 'bantNeed', 'bantTiming'];
      const touchedBant = bantKeys.some(k => (ctx.after as any)[k] !== undefined);
      if (touchedBant) {
        const merged = { ...(ctx.before as any), ...(ctx.after as any) } as any;
        (ctx.after as any).score = calcScore(merged);
      } else if ((ctx.before as any)?.score != null) {
        (ctx.after as any).score = (ctx.before as any).score;
      }

      // Enforce sequential stage transitions and stage-specific requirements
      const prevStageId = String((ctx.before as any)?.stageId || '');
      const nextStageId = String((ctx.after as any)?.stageId || '');
      if (prevStageId && nextStageId && prevStageId !== nextStageId) {
        // Determine pipeline to read stages
        const effectivePipelineId = String((ctx.after as any)?.pipelineId || (ctx.before as any)?.pipelineId || '');
        if (effectivePipelineId) {
          const stagesTable = await findStagesTable(ctx);
          if (stagesTable) {
            const stages = await ctx.repository.findRowsByFieldValue(stagesTable.id, 'pipelineId', effectivePipelineId);
            const list = stages
              .sort((a: any, b: any) => Number((a.data || {}).order || 0) - Number((b.data || {}).order || 0));
            const idxPrev = list.findIndex((s: any) => String(s.id) === prevStageId);
            const idxNext = list.findIndex((s: any) => String(s.id) === nextStageId);
            if (idxPrev >= 0 && idxNext >= 0) {
              const prevType = String(((list[idxPrev].data as any) || {}).type || '').toLowerCase();
              const movingForward = idxNext === idxPrev + 1;
              const movingBackwardFromMeeting = (idxNext === idxPrev - 1) && prevType === 'meeting';
              if (!movingForward && !movingBackwardFromMeeting) {
                throw new ValidationError('Transição de estágio inválida. Só é permitido avançar uma etapa por vez.', { stageId: ['Só pode avançar para a próxima etapa'] });
              }
              const nextType = String(((list[idxNext].data as any) || {}).type || '').toLowerCase();
              // Stage-specific data requirements
              if (movingForward && nextType === 'meeting') {
                const nextAt = (ctx.after as any)?.nextActionAt;
                if (!nextAt) {
                  throw new ValidationError('Agende a data/horário da reunião antes de avançar para "Reunião Agendada".', { nextActionAt: ['Obrigatório para Reunião Agendada'] });
                }
                const d = new Date(nextAt);
                if (!isFinite(d.getTime())) {
                  throw new ValidationError('Data/Horário inválidos para a reunião.', { nextActionAt: ['Data inválida'] });
                }
                if (d.getTime() <= Date.now()) {
                  throw new ValidationError('A data/horário da reunião deve ser no futuro.', { nextActionAt: ['Deve ser futura'] });
                }
              }
              if (nextType === 'proposal') {
                const amt = (ctx.after as any)?.latestProposalAmount;
                const cur = (ctx.after as any)?.latestProposalCurrency;
                const prob = (ctx.after as any)?.latestProposalWinProbability;
                if (amt == null || Number(amt) < 0) {
                  throw new ValidationError('Informe o valor negociado para avançar para "Proposta Enviada".', { latestProposalAmount: ['Obrigatório e >= 0'] });
                }
                if (!cur) {
                  throw new ValidationError('Informe a moeda da proposta para avançar.', { latestProposalCurrency: ['Obrigatório'] });
                }
                if (prob == null || Number(prob) < 0 || Number(prob) > 100) {
                  throw new ValidationError('Informe a probabilidade (0-100%) para avançar.', { latestProposalWinProbability: ['0 a 100'] });
                }
              }
            }
          }
        }
      }
    }
    if (tableName === SCHEMA_KEYS.PROPOSALS || tableName === 'Lead Proposals') {
      await validateProposal(ctx, ctx.after as any);
    }
  },
  async afterCreate(ctx) {
    const tableName = ctx.table.internalName || ctx.table.name;
    if (tableName === SCHEMA_KEYS.PROPOSALS || tableName === 'Lead Proposals') {
      await upsertLatestProposalSnapshot(ctx, (ctx.after as any).leadId);
      await addActivity(ctx, (ctx.after as any).leadId, 'proposal', 'Proposta criada', { proposalId: (ctx.after as any).id });
    }
    if (tableName === SCHEMA_KEYS.LEADS || tableName === 'Leads') {
      await addActivity(ctx, (ctx.after as any).id, 'field_update', 'Lead criado', {});
    }
    if (tableName === SCHEMA_KEYS.ACTIVITIES || tableName === 'Lead Activities') {
      await reflectActivitySideEffects(ctx, ctx.after as any);
    }
  },
  async afterUpdate(ctx) {
    const tableName = ctx.table.internalName || ctx.table.name;
    if (tableName === SCHEMA_KEYS.PROPOSALS || tableName === 'Lead Proposals') {
      await upsertLatestProposalSnapshot(ctx, (ctx.after as any).leadId);
      await addActivity(ctx, (ctx.after as any).leadId, 'proposal', 'Proposta atualizada', { proposalId: (ctx.after as any).id });
    }
    if (tableName === SCHEMA_KEYS.LEADS || tableName === 'Leads') {
      // Detectar mudanças de stage
      const prevStage = String((ctx.before as any)?.stageId || '');
      const nextStage = String((ctx.after as any)?.stageId || '');
      if (prevStage && nextStage && prevStage !== nextStage) {
        await addActivity(ctx, (ctx.after as any).id, 'stage_change', 'Mudança de estágio', { prevStage, nextStage });
        // If moving into meeting stage, also log meeting scheduling if present
        const stagesTable = await findStagesTable(ctx);
        if (stagesTable) {
          const stPrev = await ctx.repository.findDataById(prevStage);
          const stNext = await ctx.repository.findDataById(nextStage);
          const prevType = String((((stPrev?.data) as any) || {}).type || '').toLowerCase();
          const nextType = String((((stNext?.data) as any) || {}).type || '').toLowerCase();
          if (nextType === 'meeting' && (ctx.after as any)?.nextActionAt) {
            await addActivity(ctx, (ctx.after as any).id, 'meeting', 'Reunião agendada', { when: (ctx.after as any).nextActionAt });
          }
          // If moving one step back from a meeting stage, log no-show.
          // Index is computed within the lead's pipeline (equivalent to the prior global order
          // for stages of the same pipeline, since prev/next always share it).
          const effectivePipelineId = String((ctx.after as any)?.pipelineId || (ctx.before as any)?.pipelineId || '');
          const list = (await ctx.repository.findRowsByFieldValue(stagesTable.id, 'pipelineId', effectivePipelineId))
            .sort((a: any, b: any) => Number((a.data || {}).order || 0) - Number((b.data || {}).order || 0));
          const idxPrev = list.findIndex((s: any) => String(s.id) === prevStage);
          const idxNext = list.findIndex((s: any) => String(s.id) === nextStage);
          if (prevType === 'meeting' && idxNext === idxPrev - 1) {
            // Padrão ouro: limpar agendamento anterior para evitar resíduos
            (ctx.after as any).nextActionAt = null;
            const scheduledAt = (ctx.before as any)?.nextActionAt;
            await addActivity(ctx, (ctx.after as any).id, 'meeting_no_show', 'Não compareceu à reunião', { prevStage, nextStage, scheduledAt });
            if (scheduledAt) {
              await addActivity(ctx, (ctx.after as any).id, 'meeting_cancelled', 'Reunião cancelada', { scheduledAt });
            }
          }
        }
      }
    }
    if (tableName === SCHEMA_KEYS.ACTIVITIES || tableName === 'Lead Activities') {
      await reflectActivitySideEffects(ctx, ctx.after as any);
    }
  },
};

/**
 * Validates lead coherence:
 * - unitId required
 * - pipeline belongs to unit; stage belongs to pipeline
 * - numeric ranges for probabilities
 * - BANT options strictly validated when provided
 * Note: pipeline/stage can be empty on create; plugin fills defaults.
 */
async function validateLead(ctx: RuleContext, after: any) {
  const unitId = String(after?.unitId || '').trim();
  const pipelineId = String(after?.pipelineId || '').trim();
  const stageId = String(after?.stageId || '').trim();
  if (!unitId) throw new ValidationError('Unidade é obrigatória para o lead.', { unitId: ['Obrigatório'] });
  // pipeline/stage podem vir vazios; plugin completa com defaults

  // Coerência: pipeline pertence à mesma unidade e stage pertence ao pipeline
  const [pipelinesTable, stagesTable] = await Promise.all([findPipelinesTable(ctx), findStagesTable(ctx)]);
  if (!pipelinesTable || !stagesTable) return;
  if (!pipelineId) return; // será preenchido por quem chama ou por etapa posterior
  const pipeline = await ctx.repository.findDataById(pipelineId);
  if (!pipeline) throw new ValidationError('Pipeline não encontrado.', { pipelineId: ['Inexistente'] });
  const pipelineUnitId = String(((pipeline.data as any) || {}).unitId || '');
  if (pipelineUnitId && pipelineUnitId !== unitId) {
    throw new ValidationError('O pipeline selecionado não pertence à unidade informada.', { pipelineId: ['Pipeline deve pertencer à unidade'], unitId: ['Unidade incompatível com o pipeline'] });
  }
  if (!stageId) return; // será preenchido como primeiro estágio na criação
  const stage = await ctx.repository.findDataById(stageId);
  if (!stage) throw new ValidationError('Estágio não encontrado.', { stageId: ['Inexistente'] });
  const stagePipelineId = String(((stage.data as any) || {}).pipelineId || '');
  if (stagePipelineId && stagePipelineId !== pipelineId) {
    throw new ValidationError('O estágio selecionado não pertence ao pipeline informado.', { stageId: ['Estágio deve pertencer ao pipeline'], pipelineId: ['Pipeline incompatível com o estágio'] });
  }

  // Campos numéricos dentro de faixa
  if (after?.latestProposalWinProbability != null) {
    const prob = Number(after.latestProposalWinProbability);
    if (prob < 0 || prob > 100) throw new ValidationError('Probabilidade da última proposta deve estar entre 0 e 100.', { latestProposalWinProbability: ['0 a 100'] });
  }

  // BANT option validation (when provided)
  const opt3 = ['low', 'medium', 'high'];
  if (after?.bantBudget != null && typeof after.bantBudget === 'string') {
    const v = String(after.bantBudget).toLowerCase();
    if (!opt3.includes(v)) throw new ValidationError('BANT: Budget inválido.', { bantBudget: ['Low, Medium ou High'] });
  }
  if (after?.bantAuthority != null) {
    const v = String(after.bantAuthority).toLowerCase();
    if (!opt3.includes(v)) throw new ValidationError('BANT: Authority inválido.', { bantAuthority: ['Low, Medium ou High'] });
  }
  if (after?.bantNeed != null) {
    const v = String(after.bantNeed).toLowerCase();
    if (!opt3.includes(v)) throw new ValidationError('BANT: Need inválido.', { bantNeed: ['Low, Medium ou High'] });
  }
  if (after?.bantTiming != null) {
    const vt = String(after.bantTiming).toLowerCase();
    const allowed = ['urgent', 'short', 'medium', 'long'];
    if (!allowed.includes(vt)) throw new ValidationError('BANT: Timing inválido.', { bantTiming: ['Urgent, Short, Medium, Long'] });
  }
}

/**
 * Validates proposal record data ranges and dates.
 */
async function validateProposal(ctx: RuleContext, after: any) {
  const amount = Number(after?.amount);
  if (Number.isNaN(amount) || amount < 0) throw new ValidationError('Valor da proposta inválido.', { amount: ['Deve ser >= 0'] });
  const prob = Number(after?.winProbability ?? 0);
  if (prob < 0 || prob > 100) throw new ValidationError('Probabilidade deve estar entre 0 e 100.', { winProbability: ['0 a 100'] });
  if (after?.estimatedCloseDate) {
    const d = new Date(after.estimatedCloseDate);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    if (isFinite(d.getTime()) && d < today) {
      throw new ValidationError('Data estimada de fechamento não pode ser no passado.', { estimatedCloseDate: ['Deve ser futura'] });
    }
  }
}

/**
 * Sync latest proposal snapshot fields into the Lead record for quick access.
 */
async function upsertLatestProposalSnapshot(ctx: RuleContext, leadId: string) {
  const proposalsTable = await findProposalsTable(ctx);
  if (!proposalsTable) return;
  const list = await ctx.repository.findRowsByFieldValue(proposalsTable.id, 'leadId', String(leadId));
  if (list.length === 0) return;
  // pega a mais recente por updatedAt|createdAt
  const latest = list.sort((a: any, b: any) => new Date((b as any).updatedAt || (b as any).createdAt).getTime() - new Date((a as any).updatedAt || (a as any).createdAt).getTime())[0];
  const patch = {
    latestProposalAmount: (latest.data as any)?.amount,
    latestProposalCurrency: (latest.data as any)?.currency,
    latestProposalEtaClose: (latest.data as any)?.estimatedCloseDate,
    latestProposalWinProbability: (latest.data as any)?.winProbability,
  } as any;
  // merge no lead
  const lead = await ctx.repository.findDataById(String(leadId));
  if (!lead) return;
  await ctx.repository.updateData(leadId, { ...((lead.data as any) || {}), ...patch } as any);
}

/**
 * Append a Lead Activity in the activities table.
 */
async function addActivity(ctx: RuleContext, leadId: string, type: string, message: string, payload: any) {
  const activitiesTable = await findActivitiesTable(ctx);
  if (!activitiesTable) return;
  await ctx.repository.createData(activitiesTable.id, {
    leadId,
    type,
    message,
    payload,
  } as any);
}

/**
 * Side effects triggered by certain activity types.
 * - call/email/meeting: update lastContactAt on the Lead.
 */
async function reflectActivitySideEffects(ctx: RuleContext, after: any) {
  const type = String(after?.type || '');
  const leadId = String(after?.leadId || '');
  if (!leadId) return;
  if (!['call', 'email', 'meeting'].includes(type)) return;
  const leadsTable = await findLeadsTable(ctx);
  if (!leadsTable) return;
  const lead = await ctx.repository.findDataById(leadId);
  if (!lead) return;
  await ctx.repository.updateData(leadId, { ...((lead.data as any) || {}), lastContactAt: new Date().toISOString() } as any);
}

/**
 * Resolve the first stage id of a pipeline using stage order.
 */
async function findFirstStageForPipeline(ctx: RuleContext, pipelineId: string): Promise<string | null> {
  const stagesTable = await findStagesTable(ctx);
  if (!stagesTable) return null;
  const list = await ctx.repository.findRowsByFieldValue(stagesTable.id, 'pipelineId', String(pipelineId));
  if (list.length === 0) return null;
  list.sort((a: any, b: any) => Number((a.data || {}).order || 0) - Number((b.data || {}).order || 0));
  return String(list[0].id);
}

/**
 * Resolve default pipeline id for a given unit (where isDefault=true).
 */
async function findDefaultPipelineForUnit(ctx: RuleContext, unitId: string): Promise<{ id: string } | null> {
  const pipelinesTable = await findPipelinesTable(ctx);
  if (!pipelinesTable) return null;
  const rows = await ctx.repository.findRowsByFieldValue(pipelinesTable.id, 'unitId', String(unitId));
  const def = rows.find((r: any) => Boolean((r.data || {}).isDefault));
  return def ? { id: String(def.id) } : null;
}


