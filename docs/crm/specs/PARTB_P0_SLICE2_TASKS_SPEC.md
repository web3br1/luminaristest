# Parte B / P0 — Slice 2: Tarefas reais (#4)

> SDD spec. Tornar tarefas "reais" no CRM: criar follow-ups ligados a um lead, com vencimento, dono, prioridade e status, listá-los e concluí-los a partir do Lead360. Reusa o `PresetSyncService` (evolução aditiva de schema) + engine tx-aware já prontos (Slice 1).

## Restrições verificadas
- Tabela `tasks` (core, auto-instalada via `CoreSystemPreset`) — campos: `name`(req), `description`, `status`(req: To Do/In Progress/In Review/Done, default To Do), `priority`(Low/Medium/High/Urgent), `assigneeId`(→employees = dono), `date`(req, type date), `order`(req, hidden). Categoria `kanban` (genérica).
- `leadActivities` é log imutável (não serve para CRUD de tarefa).
- **Core-safety:** `tasks` é core; relações novas só podem apontar para tabelas **também core**. `leads` é core (OK). `crmAccounts`/`crmContacts` são CRM-only (selecionáveis) → marcador `@@PRESET_TABLE_KEY::crmAccounts` NÃO resolve num tenant core-only. **Portanto: só `leadId` (+ `reminderAt`).** accountId/contactId em tasks = follow-up (exigiria tornar a relação condicional ao CRM).
- Reusar o `date` (já required) como **vencimento**; reusar `status` ("Done" = concluída). Sem novo `dueDate` (duplicaria `date`).

## Componente A — Preset (core-safe, aditivo)
- `TasksModule.ts`: adicionar
  - `leadId` — relation → `@@PRESET_TABLE_KEY::leads`, required:false, searchable:false (leads é core → marcador resolve no install).
  - `reminderAt` — datetime, required:false, searchable:false (campo para lembrete; a ENTREGA da notificação é follow-up — precisa de job/scheduler, fora deste slice).
  - NÃO adicionar accountId/contactId (não-core). NÃO remover/reordenar campos existentes.
- **Aplicar na instância viva:** `sync-preset { internalName: 'tasks' }` (admin) — aditivo, idempotente, com a rede de segurança do Slice 1.

## Componente B — Backend CRUD
- Nenhum serviço de orquestração novo: tarefas usam o `DynamicTableService` genérico (createRecord/updateRecord/deleteRecord). Sem efeitos colaterais.
- (Follow-up opcional: auto-logar `leadActivities type='task'` na criação via um `CrmTaskService` com `runInTransaction` — fora deste slice.)

## Componente C — Frontend
- `my-app/features/crm/hooks/useLeadTasks.ts` — `useLeadTasks(leadId)`: resolve a tabela `tasks` por `internalName`, `fetchAllRows`, filtra por `leadId == lead.id` (useMemo), retorna `{ loading, error, tasks, tasksTableId, reload }`.
- `my-app/features/crm/components/LeadTasksPanel.tsx` — seção dentro do Lead360:
  - Lista compacta: nome, prioridade (badge), vencimento (`date`), dono (resolve employee), checkbox de concluir (status → 'Done'/'To Do' via `updateRecord`).
  - Criar: form inline/modal (nome [req], `date` [req = vencimento], prioridade, dono `assigneeId`) → `createRecord(tasksTableId, { data: { name, status:'To Do', date, priority, assigneeId, leadId } })`.
  - Estados loading/error/empty; `useMemo`; i18n (`crm` namespace); design system (`neutral`/`rounded-2xl`/dark); service layer only.
- `Lead360Modal.tsx`: adicionar `<SectionCard title={t('detail.tasks','Tarefas')}><LeadTasksPanel leadId={lead.id} onChanged={onChanged} /></SectionCard>` após a seção de contato.
- (Opcional follow-up: página `/crm/tasks` com board/lista das tarefas em aberto por dono — fora deste slice.)

## Aceite (gates)
- [ ] `cd server && npx tsc --noEmit`; `cd my-app && npx tsc --noEmit`; jest verde.
- [ ] `sync-preset tasks` aplicado na instância viva (leadId + reminderAt presentes; linhas intactas).
- [ ] Criar tarefa ligada a um lead, listá-la no Lead360, concluí-la (status Done) — validado ponta a ponta na instância viva.
- [ ] i18n paridade en/pt; sem `zinc-`; modal-não-rota; reuse de canônicos.

## Verificação
- Revisão adversarial multi-agente (core-safety da relação, CRUD, UI). Rollout live só após review + tsc/jest verdes.
