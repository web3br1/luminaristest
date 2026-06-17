# Parte B / P0 — Slice 1: Schema-Evolution + Lead Conversion + Owner filter

> SDD spec. Slice escolhido: **Owner/"meus registros" (#3)** + **Conversão de Lead "correta" (#1)**, viabilizada por um **mecanismo de evolução de schema** para tabelas já instaladas (gate de toda a Parte B com campos novos). Decisão do usuário: "construir evolução de schema agora".
>
> Implementadores: leiam `.claude/skills/_ARCHITECTURE-CONTRACT.md` + a(s) skill(s) da camada antes de gerar. Achados verificados (2026-06-16) abaixo são contrato.

## Restrições da engine (verificadas — NÃO contornar)
- **Chaves desconhecidas são descartadas** no write (Zod sem `.strict()`/`.passthrough()` → strip). Gravar um campo que não está no schema instalado **não persiste**.
- **`select` é estrito** (`z.enum(options)`): valor fora de `options` → `ValidationError`. (Ex.: `status:'Converted'` é rejeitado enquanto as opções instaladas forem `Open/Won/Lost/Disqualified`.)
- **Editar preset NÃO atualiza tabelas já instaladas** (schema em JSON no banco; instala 1× via `installPresetAsSystem`). Re-instalar é bloqueado (403) se já há tabelas.
- **`DynamicTableService.updateTableSchemaAsSystem(tableId, data: UpdateDynamicTableSchemaDtoType)`** (existe, `DynamicTableService.ts:206`) atualiza o schema de uma tabela instalada: valida nomes únicos, `buildZodSchema`, ownership de relações, e **revalida TODOS os dados existentes contra o novo schema — aborta se invalidaria** (linha 230-238). **Rejeita marcadores `@@PRESET_TABLE_KEY::`** (linha 224) → relações novas precisam apontar para o **ID real** da tabela do usuário. **Sem endpoint público hoje.**
- Owner já modelado: `leads.assigneeId`, `crmAccounts.ownerId`, `crmContacts.ownerId` → relação a `employees` (DynamicTable). Frontend já resolve nomes (`useLeadsView` ownerMap; KanbanTaskCard badge).
- `crmContacts` tem `accountId` (→crmAccounts) e `leadId` (→leads). `leads` **não** tem `accountId`/`contactId`/`convertedAt` nem company-name.

---

## Componente A — Mecanismo de evolução de schema (backend, foundational)

**Objetivo:** evoluir aditivamente o schema de uma tabela **já instalada** a partir do seu preset module, com segurança. Aditivo-only (nunca remove/renomeia/estreita).

- **Service** (em `DynamicTableService` ou um `PresetSyncService` no padrão orquestração): `async syncInstalledTableFromPreset(user: UserContext, internalName: string): Promise<{ added: string[]; optionsAdded: Record<string,string[]> }>`:
  1. Resolve a tabela instalada por `internalName` (`findTableByInternalName(user.userId, …)` → `NotFoundError` se ausente).
  2. Carrega o schema do **preset module** correspondente (via `PresetManager`/registry — descobrir o caminho real).
  3. Computa o **delta aditivo**: campos do preset ausentes no schema instalado; e, para `select`, opções do preset ausentes (união). **Nunca** remove campos/opções nem muda tipo/required de campo existente.
  4. **Resolve marcadores** `@@PRESET_TABLE_KEY::x` dos campos-relação NOVOS para o **ID real** da tabela `x` do usuário (`findTableByInternalName`) — espelhar a pass-2 de `installPresetAsSystem`. (updateTableSchemaAsSystem rejeita marcadores.)
  5. Merge: schema instalado + delta → `updateTableSchemaAsSystem(tableId, { schema: merged })` (a revalidação embutida é a rede de segurança).
  6. `logger.info` com o delta.
- **Controller + Rota (3-toques):** endpoint protegido **admin-only** `POST /api/dynamic-tables/sync-preset` body `{ internalName: string }` (ou `{ internalNames: string[] }`). Policy: só `Role.ADMIN` (é operação destrutiva-de-schema). `safeParse` + `getUserContextFromRequest` + `handleApiError`. Registrar no `routes/index.ts` + `protectedApiPaths` + `docs.paths.ts`.
- **Teste:** delta aditivo correto (campo novo + opção nova); idempotente (rodar 2× = no-op na 2ª); marcador resolvido para ID real; aborta se o merge invalidaria dados (propaga o `ValidationError` da engine); cross-tenant `NotFoundError`.

**Gate:** aditivo-only comprovado por teste (nenhum campo/opção removido); idempotente; relações novas com ID real (sem marcador).

---

## Componente B — Evolução do modelo Lead (preset + aplicar na instância viva)

- **`LeadsModule.ts`** (preset, afeta novos installs): adicionar
  - `accountId` — `relation` → `@@PRESET_TABLE_KEY::crmAccounts`, optional.
  - `contactId` — `relation` → `@@PRESET_TABLE_KEY::crmContacts`, optional.
  - `convertedAt` — `datetime`, optional, `readOnly: true`.
  - `status` — adicionar `'Converted'` ao `options` (mantendo Open/Won/Lost/Disqualified) → `['Open','Won','Lost','Disqualified','Converted']`.
- **Aplicar na instância viva:** via Componente A (`sync-preset` em `leads`) — testado antes em build/local; backup do schema atual da tabela `leads` antes de aplicar (registrar o JSON anterior). É aditivo → a revalidação passa (campos optional, opção nova não invalida linhas existentes).

**Gate:** após sync, a tabela `leads` instalada aceita `status:'Converted'` + `accountId`/`contactId`/`convertedAt`; linhas existentes intactas.

---

## Componente C — Serviço de conversão (backend)

Método em `CrmPipelineService` (mesma classe das transições — orquestração):
- **DTO** `ConvertLeadSchema` (em `CrmPipelineDto.ts`): `{ leadId: string; account: { name: string; segment?; size?; website?; taxId?; city?; state? }; contact?: { name?; email?; phone?; jobTitle?; role? } }`. `@openapi`, type guard, zero `z.any()`.
- **`async convertLead(user, input: ConvertLeadInput)`** dentro de `runInTransaction(async tx => {...})`:
  1. `resolveTableId` para `leads`, `crmAccounts`, `crmContacts` (NotFoundError se faltar).
  2. Lê o lead (para herdar `assigneeId`→owner, `leadName`/`email`/`phone`).
  3. `createTableData(user, accountsTableId, { data: { name: input.account.name, unitId: lead.unitId, ownerId: lead.assigneeId, ...input.account } }, { tx })`.
  4. `createTableData(user, contactsTableId, { data: { name: input.contact?.name ?? lead.leadName, email: lead.email, phone: lead.phone, accountId: account.id, leadId: lead.id, ownerId: lead.assigneeId, role: input.contact?.role } }, { tx })`.
  5. `updateTableData(user, lead.id, { data: { status: 'Converted', accountId: account.id, contactId: contact.id, convertedAt: <ISO> } }, { tx })`.
  6. retorna `{ account, contact, lead }`. `logger.info`.
  - **Guard:** se `lead.status === 'Converted'` já → `ValidationError` ("lead já convertido").
- **Controller** `convertLead` (crmController): `safeParse` + actor + `getCrmPipelineService().convertLead` + 201 + `handleApiError`.
- **Rota** `POST /api/crm/pipeline/convert-lead` (3-toques — `/api/crm` já está em protectedApiPaths; só adicionar handler + OpenAPI).
- **Factory:** sem mudança (`getCrmPipelineService` já existe).
- **Teste** (no test do CrmPipelineService): atomicidade (`runInTransaction` 1×; account+contact+lead com o mesmo `{tx}`); owner herdado; guard de já-convertido; cross-tenant `NotFoundError`.

**Gate:** conversão atômica; rollback se qualquer passo falha; owner propagado; idempotência via guard.

---

## Componente D — Filtro de Owner / "meus registros" (frontend)

- Nas telas de tabela (`CrmTableScreen`/`GenericTabbedView`) e no pipeline: adicionar um seletor de **Owner** (popular do `employees` via o campo relation `assigneeId`/`ownerId` — auto-detect como `useLeadsView` faz) + toggle "Meus registros". Filtra a lista/board client-side por `ownerId`/`assigneeId`.
- Atribuição já funciona pelo `EditRecordButton`/`DynamicForm` (renderiza o campo relation como dropdown) — não recriar; apenas garantir que o owner aparece na coluna/badge.
- `useMemo` no filtro; i18n (`crm` namespace) nas labels do seletor.

**Gate:** filtrar por vendedor funciona em tabelas + pipeline; validar com **>1 owner**.

---

## Componente E — Conversão no frontend

- **`CrmService.convertLead(payload): Promise<ApiResult>`** (`lib/services/crm.service.ts`) → `POST /crm/pipeline/convert-lead`, com `ConvertLeadPayload` tipado.
- **Lead360Modal**: botão **"Converter Lead"** (ao lado de "Avançar etapa"), oculto se `status==='Converted'`. Abre um **modal de captura** (skill `frontend-modal-generator`, tipo `capture`) coletando `account.name` (obrigatório) + opcionais → chama `CrmService.convertLead` → `onChanged()` (reload). Mostra estado convertido depois.
- Não usar `router.push`; toasts via service.

**Gate:** converter um lead cria Account+Contact (visíveis nas tabelas), marca o lead `Converted`, e o modal reflete; erro faz rollback (transação) e mostra mensagem.

---

## Aplicação na instância viva (rollout seguro)
1. `tsc` (server+my-app) + testes da feature verdes; `next build` ok.
2. Rodar `sync-preset` **em ambiente local/dev primeiro** contra a tabela `leads` e confirmar delta + dados intactos.
3. **Backup** do schema atual de `leads` (salvar o JSON) antes de aplicar em produção.
4. Aplicar `sync-preset { internalName: 'leads' }` na instância viva (admin). Verificar: linhas existentes intactas, novas opções/campos presentes.
5. Testar conversão end-to-end na instância viva.

## Verificação (contrato §6)
- `cd server && npx tsc --noEmit` + `npx jest features/crm features/dynamicTables`; `cd my-app && npx tsc --noEmit` + `next build`.
- Revisão adversarial multi-agente — foco em segurança do schema-sync (aditivo-only, revalidação, marcadores resolvidos) e atomicidade do convertLead.
- Aplicação na instância viva só após review PASS.
