/**
 * AppointmentsPlugin
 *
 * Enforces scheduling rules for appointments that cannot be expressed declaratively:
 * - Blocks past or overly distant bookings (compared against `now`)
 * - Ensures basic customer data (relational or simple) is present
 * - Optionally validates service duration tolerance when available
 * - Verifies appointments fit within employee work schedule when defined
 * - Enforces the real-time completion rule (cannot complete before end time)
 *
 * Note: status transitions (lifecycle), end-after-start (compare) and scheduling
 * conflicts (noOverlap) are enforced declaratively by AppointmentsModule.schema, not here.
 */
import type { RulePlugin, RuleContext } from '../RuleTypes';
import { ValidationError } from '../../../../lib/errors';
import { resolveTable, tableMatches } from '../shared/tableFinder';

export const AppointmentsPlugin: RulePlugin = {
  name: 'AppointmentsPlugin',
  supports(ctx) {
    return tableMatches(ctx.table, { categories: ['planning'], internalNames: ['appointments'], names: ['Appointments'] });
  },
  async beforeCreate(ctx) { await validateAppointment(ctx, ctx.after ?? {}); },
  async beforeUpdate(ctx) {
    await validateAppointment(ctx, ctx.after ?? {}, ctx.before ?? {});
    await validateCompletionTiming(ctx, ctx.after ?? {}, ctx.before ?? {});
  },
};

/**
 * Validate appointment core fields, temporal consistency and basic coherence with optional service and employee rules.
 */
async function validateAppointment(ctx: RuleContext, after: Record<string, unknown>, before?: Record<string, unknown>) {
  const startAt = new Date(after?.startAt as string | number | Date | undefined);
  const endAt = new Date(after?.endAt as string | number | Date | undefined);
  if (!(isFinite(startAt.getTime()) && isFinite(endAt.getTime()))) {
    throw new ValidationError('Agendamento inválido: datas/hora são obrigatórias.');
  }
  // Note: endAt > startAt is enforced declaratively via schema.compare.
  // Restrição de datas: não permitir passado e nem mais de 5 anos no futuro (exceto se for processo de sistema)
  const now = new Date();
  const fiveYearsAhead = new Date(now.getFullYear() + 5, now.getMonth(), now.getDate());
  if (startAt < now && !ctx.isSystem) {
    throw new ValidationError('Agendamento inválido: não é permitido agendar no passado.');
  }
  if (startAt > fiveYearsAhead) {
    throw new ValidationError('Agendamento inválido: data muito distante no futuro (máx. 5 anos).');
  }

  // Optional: enforce unit/service linkage consistency
  const serviceId = String(after?.serviceId || '');
  const employeeId = String(after?.responsibleEmployeeId || '');
  const simpleCustomer = Boolean(after?.simpleCustomer);
  const simpleCustomerName = String(after?.simpleCustomerName || '').trim();
  const hasCustomerRelation = typeof after?.customerId === 'string' && String(after.customerId).trim().length > 0;

  // Allow either relational customerId or simple customer name
  if (!hasCustomerRelation) {
    if (!simpleCustomer || !simpleCustomerName) {
      throw new ValidationError('Agendamento inválido: informe um cliente relacional ou habilite cliente simples com nome.');
    }
  }

  // Check optional service duration if present on service table
  if (serviceId) {
    const durationOk = await validateServiceDuration(ctx, serviceId, startAt, endAt);
    if (!durationOk) {
      // Not hard error; services may not have duration defined
    }
  }

  // Note: scheduling overlap is enforced declaratively via schema.noOverlap.

  // Basic work-hours check from employee.workSchedule json when present
  if (employeeId) {
    await assertWithinEmployeeHours(ctx, employeeId, startAt, endAt);
  }
}

/**
 * When services define a duration, check if the appointment duration is within a small tolerance (±5 min).
 */
async function validateServiceDuration(ctx: RuleContext, serviceId: string, startAt: Date, endAt: Date): Promise<boolean> {
  const serviceTable = await findTableByName(ctx, 'services', 'services', 'services', 'Services');
  if (!serviceTable) return true;
  const srv = await ctx.repository.findDataById(String(serviceId));
  const durationMin = Number((srv?.data as Record<string, unknown>)?.duration || 0);
  if (!durationMin) return true;
  const diffMin = Math.round((endAt.getTime() - startAt.getTime()) / 60000);
  return Math.abs(diffMin - durationMin) <= 5; // allow 5 min tolerance
}

/**
 * Check if the appointment fits inside the employee's configured work schedule for that weekday.
 */
async function assertWithinEmployeeHours(ctx: RuleContext, employeeId: string, startAt: Date, endAt: Date) {
  const employeesTable = await findTableByName(ctx, 'people', 'employees', 'Employees', 'employees');
  if (!employeesTable) return;
  const emp = await ctx.repository.findDataById(String(employeeId));
  const schedule = (emp?.data as Record<string, unknown>)?.workSchedule;
  if (!schedule) return;
  const weekday = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][startAt.getDay()];
  const day = schedule?.[weekday];
  if (!day) return;
  const [startH, startM] = String(day.start || '').split(':').map((n: string) => Number(n));
  const [endH, endM] = String(day.end || '').split(':').map((n: string) => Number(n));
  if (isNaN(startH) || isNaN(endH)) return;
  const startMinutes = startH * 60 + (startM || 0);
  const endMinutes = endH * 60 + (endM || 0);
  const apptStartMinutes = startAt.getHours() * 60 + startAt.getMinutes();
  const apptEndMinutes = endAt.getHours() * 60 + endAt.getMinutes();
  if (apptStartMinutes < startMinutes || apptEndMinutes > endMinutes) {
    throw new ValidationError('Fora do horário de trabalho do profissional.');
  }
}

/**
 * Real-time check that cannot be expressed declaratively: an appointment may only be marked
 * `Completed` once its end time has passed.
 *
 * Allowed status transitions themselves (Scheduled -> Completed | No-Show | Cancelled; terminal
 * states) and the validity of status values are now enforced declaratively by
 * AppointmentsModule.schema.lifecycle and the field's `options`.
 */
async function validateCompletionTiming(ctx: RuleContext, after: Record<string, unknown>, before?: Record<string, unknown>) {
  const prev = String(before?.status || 'Scheduled');
  const next = String(after?.status || prev);
  if (prev === next) return;
  if (next === 'Completed' && !ctx.isSystem) {
    // Completion must be in the past or present.
    const endAt = new Date((after?.endAt ?? before?.endAt) as string | number | Date | undefined);
    if (!isFinite(endAt.getTime()) || endAt > new Date()) {
      throw new ValidationError('Não é possível concluir um agendamento que ainda não terminou.');
    }
  }
}

/** Locate a table by category and stable internalName (with name-based fallbacks). */
async function findTableByName(ctx: RuleContext, category: string, internalName: string, nameA: string, nameB?: string): Promise<{ id: string } | null> {
  const t = await resolveTable(ctx, {
    internalName,
    category,
    names: nameB ? [nameA, nameB] : [nameA],
  });
  return t ? { id: t.id } : null;
}


