# Parte B / P0 — Slice 6: Opportunity de 1ª classe (#2, MVP)

> SDD spec. Opportunity como objeto de 1ª classe (estilo Salesforce), **em paralelo** ao pipeline de leads (não quebra a qualificação). `crmOpportunities` é dona do negócio (valor/etapa/fechamento/status); reusa `leadPipelines`/`leadStages`. Lead = pré-qualificação; "Criar Oportunidade" a partir do Lead360. **Analytics de oportunidade = follow-up** (as de lead seguem inalteradas). Decisão do usuário: separação completa.

## Verificado (ground-truth)
- NÃO há caminho para instalar UMA tabela nova num tenant já instalado (install é one-shot, `dashboardController` bloqueia 403 se já há tabelas; `installPresetAsSystem` não é idempotente). → precisamos de infra nova.
- `PresetSyncService` já resolve marcadores `@@PRESET_TABLE_KEY::` (resolveRelationMarker) e lê o registry (CoreSystemPreset + tablePresetSuites). `installPresetAsSystem` tem a pass-2 de resolução de relações a espelhar. `repository.createTable(userId, dto)` cria tabela; `findTableByInternalName` checa existência.
- Pipeline/board hoje são lead-centric mas os primitivos (PipelineColumnView/SortableCard/ProposalCaptureModal/useCrmPipelineBoard) são genéricos; `leadPipelines`/`leadStages` não são entity-specific (reusáveis por opps).
- `CrmPipelineService` é o orquestrador (advanceStage/convertLead/...); `crm.service.ts` o client.

## Componente A — Infra: instalar tabela nova em tenant existente
- `PresetSyncService.installTableFromPreset(user: UserContext, internalName: string): Promise<{ tableId: string; created: boolean }>`:
  - Idempotente: `findTableByInternalName(user.userId, internalName)` → se existe, retorna `{ tableId, created:false }`.
  - Carrega a definição do preset (registry: CoreSystemPreset.tables + tablePresetSuites por internalName).
  - **Resolve marcadores** `@@PRESET_TABLE_KEY::x` nas relações para os IDs reais das tabelas do user (reusar `resolveRelationMarker`/pass-2; `NotFoundError` se uma dependência não está instalada).
  - `repository.createTable(user.userId, { name, schema: resolvedSchema, ... })` (espelhar como installPresetAsSystem monta o CreateDynamicTableDto + category/internalName/ui). Retorna `{ tableId, created:true }`. `logger.info`.
- **Endpoint admin** `POST /api/dynamic-tables/install-table` body `{ internalName }` (ADMIN-only, como sync-preset). 3-toques já cobertos (/api/dynamic-tables protegido); + `@openapi`. Factory: já tem getPresetSyncService.
- Teste: idempotente (2ª chamada created:false), marcadores resolvidos, dependência ausente → NotFoundError, cross-tenant ok.

## Componente B — Preset `crmOpportunities`
- `server/src/features/dynamicTables/presets/modules/crm/OpportunitiesModule.ts` (internalName `crmOpportunities`, category 'crm', defaultDisplayField 'name'):
  - `unitId`(req→units), `leadId`(opt→leads), `accountId`(opt→crmAccounts), `contactId`(opt→crmContacts), `pipelineId`(req→leadPipelines), `stageId`(req→leadStages), `ownerId`(opt→employees), `name`(string req), `amount`(number currency), `currency`(select BRL/USD/EUR default BRL), `winProbability`(number percentage 0-100), `estimatedCloseDate`(date), `status`(select Open/Won/Lost default Open req), `closedAt`(datetime readOnly), `notes`(textarea). compositeUnique (unitId,name) opcional.
- Registrar em `CrmModulePreset.ts` (e onde o registry do PresetSyncService lê) para `installTableFromPreset('crmOpportunities')` achar. (Novos installs do módulo CRM passam a incluir; tenants existentes recebem via install-table.)

## Componente C — Transições backend (CrmPipelineService)
- DTO `CrmOpportunityDto.ts`: `AdvanceOpportunitySchema` { opportunityId, stageId, stageType?, amount?, currency?, winProbability?, status? } + `ConvertLeadToOpportunitySchema` { leadId, name (req), pipelineId (req), stageId?, amount?, currency?, accountId? }. @openapi, type guards, sem z.any.
- `advanceOpportunity(user, input)`: resolve `crmOpportunities`; patch stageId (+ amount/currency/winProbability se fornecidos); se a etapa-destino é `closed_won`/`closed_lost` (stageType), set status Won/Lost + `closedAt`. `updateTableData` (isSystem p/ closedAt readOnly). Guard de já-fechada opcional.
- `convertLeadToOpportunity(user, input)`: lê o lead (tenant-scoped: `dynamicTableId===leadsTableId` senão NotFound — padrão convertLead); valida unitId; `runInTransaction` → cria opp { leadId, accountId (input ou lead.accountId), unitId, pipelineId, stageId (input ou 1ª etapa do pipeline), name, amount, currency, status:'Open', ownerId: lead.assigneeId }. Retorna a opp. (Lead permanece — não vira terminal.)
- Controller (crmController): `advanceOpportunity`, `convertLeadToOpportunity` (safeParse + actor + getCrmPipelineService + handleApiError). Rotas `POST /api/crm/pipeline/advance-opportunity` + `/convert-lead-to-opportunity` (/api/crm já protegido) + @openapi. Testes (atomicidade, owner herdado, cross-tenant NotFound, fechamento set status+closedAt).

## Componente D — Frontend
- `crm.service.ts`: `advanceOpportunity(payload)`, `convertLeadToOpportunity(payload)` (POST nos endpoints; notify).
- `useOppPipelineBoard.ts`: espelha `useCrmPipelineBoard` mas sobre `crmOpportunities` (carrega opps por internalName via fetchAllRows; colunas = leadStages do pipeline ativo; drag→`advanceOpportunity` optimistic+rollback; reusa owner filter; proposal capture quando aplicável). Se a tabela `crmOpportunities` não está instalada → estado vazio gracioso ("instale/migre").
- `pages/crm/opportunities.tsx`: `<CrmLayout><OppPipelineBoard/></CrmLayout>` (auth+i18n). `CrmNav`: aba "Oportunidades".
- `OppPipelineBoard.tsx`: reusa os primitivos dnd-kit/coluna/card; card mostra name/amount/win%/stage; clique → `Opp360Modal`.
- `Opp360Modal.tsx`: detalhe da opp (nome, valor, etapa, fechamento, dono, conta) + "Avançar etapa" → advanceOpportunity. Reusa Modal/patterns.
- `Lead360Modal.tsx`: botão "Criar Oportunidade" → `OpportunityCreateModal` (nome req, pipeline, valor?, conta) → `convertLeadToOpportunity` → onChanged. (Lead segue Open.)
- i18n en+pt: nav.opportunities, opportunities.* , opp.* (campos/ações). Sem hardcoded.

## Aceite (gates)
- server tsc + jest verdes; my-app tsc + parity. `installTableFromPreset` testado.
- Live: `install-table { internalName:'crmOpportunities' }` cria a tabela no tenant (idempotente; relações resolvidas); criar oportunidade a partir de um lead; arrastar a opp entre etapas (advanceOpportunity persiste); fechar (Won) seta status+closedAt — tudo validado E2E.
- Pipeline de leads e analytics de lead inalterados (opt-in/paralelo).

## Verificação
- Revisão adversarial (segurança do install-table: tenant-scope, marcadores, idempotência; atomicidade do convert/advance; tenant-scope). Rollout live (install + E2E) após review + tsc/jest verdes. Opportunity analytics = follow-up documentado.
