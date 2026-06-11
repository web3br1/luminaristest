import type { RuleContext } from '../../RuleTypes';
import { ValidationError } from '../../../../../lib/errors';
import { resolveTable } from '../../shared/tableFinder';

/** Resolve Appointments table id if present (indexed-first). */
async function findAppointmentsTable(ctx: RuleContext): Promise<string | null> {
  const t = await resolveTable(ctx, {
    internalName: 'appointments',
    category: 'planning',
    names: ['Appointments', 'Agendamentos'],
  });
  return t?.id || null;
}

/**
 * For service items, require that linked appointments are Completed or No-Show when finalizing a sale.
 */
export async function assertServiceAppointmentsReady(ctx: RuleContext, items: Array<{ id: string; data: any }>) {
  const apptTable = await findAppointmentsTable(ctx);
  if (!apptTable) return; // no scheduling in system
  for (const it of items) {
    const isService = (it.data?.type ? String(it.data.type) === 'Service' : !!it.data?.serviceId);
    if (!isService) continue;
    const apptId = String(it.data?.appointmentId || '');
    const requires = Boolean(it.data?.requiresAppointment);
    if (!apptId) {
      if (requires) {
        throw new ValidationError('Serviço com agendamento obrigatório deve conter appointmentId.');
      }
      continue; // Optional appointment: if absent and not required, skip validation
    }
    const appt = await ctx.repository.findDataById(apptId);
    const status = String((appt?.data as any)?.status || '');
    if (!(status === 'Completed' || status === 'No-Show')) {
      throw new ValidationError('Agendamento do serviço deve estar "Completed" ou "No-Show" para finalizar a venda.');
    }
  }
}

/** Ensure the linked appointment matches service/employee/unit when required by item. */
export async function validateServiceAppointmentCoherence(ctx: RuleContext, itemData: any, saleUnitId: string) {
  const apptTableId = await findAppointmentsTable(ctx);
  if (!apptTableId) return;
  const apptId = String(itemData?.appointmentId || '');
  if (!apptId) throw new ValidationError('Serviço requer um agendamento válido (appointmentId).');
  const appt = await ctx.repository.findDataById(apptId);
  if (!appt) throw new ValidationError('Agendamento não encontrado para o appointmentId informado.');
  const a = (appt.data || {}) as any;
  const svcOk = !itemData?.serviceId || String(a.serviceId || '') === String(itemData.serviceId || '');
  const empOk = !itemData?.responsibleEmployeeId || String(a.responsibleEmployeeId || '') === String(itemData.responsibleEmployeeId || '');
  const unitOk = !saleUnitId || String(a.unitId || '') === String(saleUnitId || '');
  if (!svcOk) throw new ValidationError('Agendamento não corresponde ao serviço informado.');
  if (!empOk) throw new ValidationError('Agendamento não corresponde ao responsável informado.');
  if (!unitOk) throw new ValidationError('Agendamento pertence a outra unidade da venda.');
}

export async function cancelLinkedAppointmentsIfScheduled(ctx: RuleContext, items: Array<{ id: string; data: any }>) {
  const apptTableId = await findAppointmentsTable(ctx);
  if (!apptTableId) return;
  for (const it of items) {
    const isService = (it.data?.type ? String(it.data.type) === 'Service' : !!it.data?.serviceId);
    if (!isService) continue;
    const apptId = String(it.data?.appointmentId || '');
    if (!apptId) continue;
    const appt = await ctx.repository.findDataById(apptId);
    if (!appt) continue;
    const status = String((appt?.data as any)?.status || '');
    if (status === 'Scheduled') {
      const currentData = (appt?.data as any) || {};
      await ctx.repository.updateData(apptId, Object.assign({}, currentData, { status: 'Cancelled' }));
    }
  }
}

/**
 * Cria automaticamente um agendamento para um item de serviço que exige agendamento.
 * - Usa unidade e cliente da venda
 * - Agenda em futuro próximo (para respeitar AppointmentsPlugin: sem passado, máx. 5 anos)
 * - Mantém status 'Scheduled' para que o fluxo real possa concluir depois
 */
export async function autoCreateAppointmentForServiceItem(
  ctx: RuleContext,
  itemData: any,
  saleUnitId: string,
  sale: { id: string; data: any } | null
): Promise<string> {
  const apptTableId = await findAppointmentsTable(ctx);
  if (!apptTableId) {
    throw new ValidationError('Tabela de agendamentos (Appointments) não encontrada para criação automática.');
  }

  const saleData = (sale?.data as any) || {};
  const unitId = saleUnitId || String(saleData.unitId || '');
  if (!unitId) {
    throw new ValidationError('Não foi possível determinar a unidade da venda para criar o agendamento.');
  }

  // Cliente: aproveita o cliente simples da venda, se existir; caso contrário, cria um nome genérico
  const hasCustomerRelation = typeof saleData.customerId === 'string' && String(saleData.customerId).trim().length > 0;
  const customerId = hasCustomerRelation ? String(saleData.customerId).trim() : undefined;
  const simpleCustomer = hasCustomerRelation ? false : true;
  const simpleCustomerName = String(
    saleData.simpleCustomerName ||
    (simpleCustomer ? `Cliente Venda ${String(sale?.id || '')}` : '')
  ).trim();

  const serviceId = String(itemData?.serviceId || '');
  if (!serviceId) {
    throw new ValidationError('Item de serviço requer um serviceId para criação automática de agendamento.');
  }

  const responsibleEmployeeId = itemData?.responsibleEmployeeId
    ? String(itemData.responsibleEmployeeId)
    : undefined;

  // Agenda 1 hora à frente com duração padrão de 60 minutos
  const now = new Date();
  const start = new Date(now.getTime() + 60 * 60 * 1000);
  const end = new Date(start.getTime() + 60 * 60 * 1000);

  const payload: any = {
    unitId,
    serviceId,
    responsibleEmployeeId,
    customerId,
    simpleCustomer,
    simpleCustomerName,
    startAt: start.toISOString(),
    endAt: end.toISOString(),
    status: 'Scheduled',
  };

  const created = await ctx.repository.createData(apptTableId, payload);
  const id = (created as any)?.id || created;
  if (!id) {
    throw new ValidationError('Falha ao criar agendamento automático para o serviço.');
  }
  return String(id);
}
