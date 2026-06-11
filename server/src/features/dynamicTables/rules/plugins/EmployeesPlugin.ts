/**
 * EmployeesPlugin
 *
 * Validates employee records for operational readiness:
 * - Requires either an assigned unit or at least one valid work day in schedule
 * - Ensures e-mail presence (format/unique are covered by schema/service)
 * - Checks work schedule coherence per day (start/end pairs and ordering)
 */
import type { RulePlugin, RuleContext } from '../RuleTypes';
import { ValidationError } from '../../../../lib/errors';
import { tableMatches } from '../shared/tableFinder';

/** Returns true when the schedule contains at least one day with start and end. */
function hasAtLeastOneWorkDay(schedule: any): boolean {
  if (!schedule || typeof schedule !== 'object') return false;
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  for (const d of days) {
    const entry = schedule[d];
    if (!entry) continue;
    const start = String(entry.start || '').trim();
    const end = String(entry.end || '').trim();
    if (start && end) return true;
  }
  return false;
}

/**
 * Core employee validation combining unit assignment vs. schedule availability,
 * mandatory e-mail, and per-day schedule consistency checks.
 */
async function validateEmployee(ctx: RuleContext, after: any) {
  const unitId = String(after?.unitId || '').trim();
  const schedule = after?.workSchedule;
  const ok = Boolean(unitId) || hasAtLeastOneWorkDay(schedule);
  if (!ok) {
    throw new ValidationError('Selecione a unidade ou defina ao menos um dia de trabalho.', {
      unitId: ['Obrigatório se não houver jornada definida'],
      workSchedule: ['Defina ao menos um dia com início e fim'],
    });
  }

  // Email obrigatório, formato validado pelo schema, e unicidade já checada no serviço.
  const email = String(after?.email || '').trim();
  if (!email) {
    throw new ValidationError('E-mail é obrigatório.', { email: ['E-mail é obrigatório.'] });
  }

  // Se workSchedule existir, validar coerência simples por dia
  if (schedule && typeof schedule === 'object') {
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    for (const d of days) {
      const entry = schedule[d];
      if (!entry) continue;
      const start = String(entry.start || '').trim();
      const end = String(entry.end || '').trim();
      if ((start && !end) || (!start && end)) {
        throw new ValidationError('Horário de trabalho incompleto em um dos dias.', { workSchedule: [`Dia ${d}: informe início e fim ou deixe ambos vazios.`] });
      }
      if (start && end) {
        const [sh, sm] = start.split(':').map(Number);
        const [eh, em] = end.split(':').map(Number);
        const sMin = (sh || 0) * 60 + (sm || 0);
        const eMin = (eh || 0) * 60 + (em || 0);
        if (eMin <= sMin) {
          throw new ValidationError('Horário inválido: fim deve ser após o início.', { workSchedule: [`Dia ${d}: fim deve ser após início.`] });
        }
      }
    }
  }
}

const SCHEMA_KEYS = {
  EMPLOYEES: 'employees',
};

export const EmployeesPlugin: RulePlugin = {
  name: 'EmployeesPlugin',
  supports(ctx) {
    return tableMatches(ctx.table, { categories: ['people'], internalNames: [SCHEMA_KEYS.EMPLOYEES], names: ['Employees', 'employees', 'Funcionários'] });
  },
  async beforeCreate(ctx) { await validateEmployee(ctx, ctx.after as any); },
  async beforeUpdate(ctx) { await validateEmployee(ctx, ctx.after as any); },
};


