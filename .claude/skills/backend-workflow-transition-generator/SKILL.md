---
name: backend-workflow-transition-generator
description: Gera serviço de transição de etapa/estado com efeitos colaterais (máquina de estados) que orquestra DynamicTable atomicamente — padrão CrmPipelineService.advanceStage + controller + rota + factory + teste
argument-hint: "[NomeDoDominio] (ex: Pipeline, Order, Ticket)"
allowed-tools: Read, Grep, Glob, Write, Edit
metadata:
  governance-skill-id: SKL-WORKFLOW-TRANS
  governance-version: "1.0.0"
  governance-status: validated
  governance-owner: engineering
  governance-last-evaluated: "2026-06-25"
  governance-eval-score: "1.00"
  governance-doc: ./governance.md
---

# Backend Workflow Transition Generator

## Purpose

Gera o **serviço de orquestração de transições** de um fluxo de trabalho: mover um registro de etapa/estado com **efeitos colaterais** (criar registro relacionado, atualizar snapshot, logar atividade, guardar a transição) de forma **atômica**. É o backend que o board do `frontend-kanban-workflow-generator` chama no drag-end quando a transição é mais que um update de campo. Segue o padrão `CrmPipelineService` (service orquestra `DynamicTableService`, não tem Repository/Policy próprios).

## Contrato obrigatório

Antes de gerar, leia `.claude/skills/_ARCHITECTURE-CONTRACT.md` — as regras cross-cutting (§2 backend: camadas, erros tipados, registro de rota = 2 toques, no-`any`; variante orquestração; §5 testes) são **gate** e não se repetem aqui. Esta skill adiciona apenas o checklist específico de **Workflow Transition Service**.

## When to use

- Mudança de etapa precisa de lógica server-side além de um update de campo (efeito colateral, guard, snapshot)
- Existe um board Kanban de workflow que precisa de uma transição atômica
- Máquina de estados sobre uma entidade DynamicTable (leads/pedidos/tickets/aprovações)

## Inputs

- `$ARGUMENTS[0]`: nome do domínio em PascalCase (ex: `Pipeline`, `Order`, `Ticket`)

## Repository patterns to inspect first

```
server/src/features/crm/services/CrmPipelineService.ts             ← serviço de transição canônico (REUSE o padrão)
server/src/features/crm/dtos/CrmPipelineDto.ts                     ← schemas Zod de transição (AdvanceStage/CreateProposal/RecordNoShow)
server/src/controllers/crmController.ts                            ← controller fino (safeParse + factory + handleApiError)
server/src/routes/crm.ts                                           ← rota (verbos + handlers)
server/src/lib/factory.ts                                          ← registro do serviço (getCrmPipelineService)
server/src/features/crm/services/__tests__/CrmPipelineService.test.ts ← teste (buildService + runInTransaction mock + cross-tenant)
server/src/features/dynamicTables/services/DynamicTableService.ts  ← runInTransaction / createTableData / updateTableData
server/src/features/dynamicTables/repositories/IDynamicTableRepository.ts ← findTableByInternalName
```

## ⭐ Exemplo de referência canônico (espelhe este arquivo)

`server/src/features/crm/services/CrmPipelineService.ts` — exemplo perfeito de serviço de transição: construtor injeta `DynamicTableService` + `IDynamicTableRepository`, resolve tabelas por `internalName` (`findTableByInternalName` → `NotFoundError` se ausente), todas as escritas dentro de `runInTransaction(async (tx) => {...})` com `{ tx }` (proposta + lead commitam/rollback juntos), efeitos colaterais por tipo de etapa, sem policy própria (a policy é aplicada pelo `DynamicTableService`). Leia `advanceStage` ANTES de gerar.

## Generation contract

1. **Service** `server/src/features/<domain>/services/<Domain>WorkflowService.ts` (ou `<Domain>PipelineService`):
   - Construtor injeta `private readonly dynamicTableService: DynamicTableService` + `private readonly repository: IDynamicTableRepository`. **Sem** Repository/Policy CRUD próprios (variante orquestração — policy aplicada pela camada delegada).
   - `private async resolveTableId(user, internalName)` via `repository.findTableByInternalName(user.userId, internalName)` → `throw new NotFoundError(...)` se a tabela não está instalada.
2. **Método de transição** (`advanceStage`/`transition`):
   - Recebe `(user: UserContext, input: <Transition>Input)` validado por Zod (DTO).
   - Todas as escritas dentro de `this.dynamicTableService.runInTransaction(async (tx) => { ... })` usando `createTableData(user, tableId, { data }, { tx })` / `updateTableData(user, recordId, { data }, { tx })` — **atômico** (efeitos + transição commitam/rollback juntos).
   - Efeitos colaterais condicionais ao tipo de etapa de destino (ex.: criar proposta se `stageType === 'proposal'`); guards de transição quando aplicável.
   - `logger.info('...', { context })` ao final.
3. **DTO** `dtos/<Domain>Transition.dto.ts`: `@openapi`, `<Transition>Schema` (Zod), `z.infer` type, type guard. Datas com `z.coerce.date()`. Zero `z.any()`.
4. **Controller** `controllers/<domain>Controller.ts`: `Schema.safeParse(req.body)` antes de tudo → `getUserContextFromRequest` → `getFactory().get<Domain>Service().transition(...)` → `{ success: true, data }` → `handleApiError(error, res)`. Zero `prisma.*`, zero regra.
5. **Rota** `routes/<domain>.ts`: verbos + handlers; **registro = 2 toques** (`routes/index.ts` + bloco `@openapi` em `routes/docs.paths.ts`) — auth é deny-by-default, não se edita `middleware/auth.ts`.
6. **Factory** `lib/factory.ts`: instanciar o serviço **após** `DynamicTableService` + repository; getter `get<Domain>Service()`.
7. **Teste** `__tests__/<Domain>WorkflowService.test.ts`: `buildService(overrides?)`, mock de `runInTransaction` (invoca o callback com tx fake) e `findTableByInternalName`; assert atomicidade (`runInTransaction` chamado 1x), efeito colateral disparado só na etapa certa, e **cross-tenant `NotFoundError`** quando a tabela não está instalada.

## Checklist obrigatório — Workflow Transition Service

- [ ] Construtor injeta `DynamicTableService` + `IDynamicTableRepository` — **sem** `new`, sem Repository/Policy CRUD próprios
- [ ] Resolve tabelas por `internalName` (`findTableByInternalName`), nunca por índice; `NotFoundError` se ausente
- [ ] **Todas** as escritas dentro de `runInTransaction` com `{ tx }` — efeito + transição atômicos
- [ ] Efeitos colaterais condicionais ao tipo de etapa; guards quando aplicável
- [ ] Sem policy redundante (delegada ao `DynamicTableService`); sem `prisma.*` direto; sem Express/`res.json` no service
- [ ] Controller: `safeParse` + `getUserContextFromRequest` + `getFactory()` + `handleApiError`
- [ ] Rota: 2 toques (index + OpenAPI); `middleware/auth.ts` intocado
- [ ] Factory: serviço registrado após deps; getter exposto
- [ ] Teste: `buildService`, atomicidade (`runInTransaction` 1x), cross-tenant `NotFoundError`

## Files usually created or changed

```
server/src/features/<domain>/services/<Domain>WorkflowService.ts            ← NEW
server/src/features/<domain>/dtos/<Domain>Transition.dto.ts                 ← NEW
server/src/features/<domain>/services/__tests__/<Domain>WorkflowService.test.ts ← NEW
server/src/controllers/<domain>Controller.ts                                ← NEW/EDIT
server/src/routes/<domain>.ts                                               ← NEW/EDIT
server/src/routes/index.ts                                                  ← EDIT (mount)
server/src/routes/docs.paths.ts                                            ← EDIT (OpenAPI)
server/src/lib/factory.ts                                                  ← EDIT (registro + getter)
```

## Required checks

```bash
cd server && npx tsc --noEmit
cd server && npx jest features/<domain> --passWithNoTests
```

## Anti-patterns

- **Não escreva no DynamicTable fora de `runInTransaction`** quando há efeito colateral — escrita parcial não-atômica deixa o registro inconsistente no erro.
- **Não adicione policy própria** — a policy é aplicada pelo `DynamicTableService` (variante orquestração).
- **Não resolva tabelas por índice `[0]`** — use `findTableByInternalName`.
- **Não coloque HTTP/Express no service** — controller formata a resposta.
- **Não edite `middleware/auth.ts`** — a rota nasce protegida (deny-by-default); o `protectedApiPaths` não existe mais. O toque tsc-cego que sobrou é o `@openapi` em `docs.paths.ts`.
- **Não duplique o engine** — leituras/escritas vão por `DynamicTableService`, não `prisma.*` direto.
- **Não injete serviço Prisma first-class na transição** (`PostingService`, `PayrollService`…) — uma transição que precisa "também lançar na contabilidade" NÃO resolve isso dentro do `runInTransaction` do motor DynamicTable. A integração cross-módulo sobe a controller/serviço de integração; o módulo Prisma expõe a própria API. Ver `_ARCHITECTURE-CONTRACT.md §2.1`.
