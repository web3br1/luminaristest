---
name: crud-resource-generator
description: Gera o slice CRUD completo de um recurso simples — DTO → Repository → Policy → Service → Controller → Route + frontend service — com soft-delete em todas as camadas e reuso dos canônicos. Use quando o pedido for "criar CRUD", "novo recurso com listar/criar/editar/excluir", "API própria para uma tabela ERP" sem regra de negócio especial. Decide entre Prisma first-class e DynamicTable pelo teste §2.1 (invariante financeiro/legal → Prisma). Domínio/arquivos: server/src/features/<resource>/ + my-app/lib/services/.
argument-hint: "[nome-do-recurso] [dynamic-table|prisma]"
allowed-tools: Read, Grep, Glob, Write, Edit, Bash
compatibility: Claude Code; requer o monorepo Luminaris (server/ com Prisma + zod + tsc e my-app/ com tsc). Sem efeitos externos nem migration por padrão — apenas gera/edita arquivos no repositório.
metadata:
  governance-skill-id: "SKL-CRUD"
  governance-version: "1.1.0"
  governance-status: "validated"
  governance-owner: "engineering"
  governance-last-evaluated: "2026-06-25"
  governance-eval-score: "1.00"
---

# CRUD Resource Generator

## Purpose

Atalho para o padrão mais comum do Luminaris: CRUD completo com soft-delete, paginação, auth guard e frontend service. Mais rápido que `fullstack-feature-generator` para recursos sem lógica de negócio complexa.

## Contrato obrigatório

Esta skill gera múltiplas camadas — TODO arquivo gerado deve cumprir `.claude/skills/_ARCHITECTURE-CONTRACT.md` (camadas, DI, soft-delete, policy-first, registro de rota = 2 toques, no-`any`, frontend service layer, reuse de canônicos, design system, testes). O contrato é o gate final; as sub-skills herdam-no.

## ⭐ Exemplo de referência canônico (espelhe este slice)

A feature **`users`** é o vertical-slice de referência de camadas — leia-a inteira antes de gerar e espelhe a estrutura:

```
server/src/features/users/dtos/UserDto.ts                    ← DTO (Zod Create/Update + type guards)
server/src/features/users/repositories/UserRepository.ts     ← acesso Prisma ($transaction em getAllUsers)
server/src/features/users/policies/UserPolicy.ts             ← métodos can* booleanos (ownership por actor.id/ADMIN)
server/src/features/users/services/UserService.ts            ← policy-first, DI por construtor, erros tipados
server/src/controllers/userController.ts                     ← safeParse + getUserContextFromRequest + handleApiError
server/src/routes/users.ts                                   ← rota fina
my-app/lib/services/user.service.ts                          ← frontend service (apiClient, tipos locais)
```

Por que é o par perfeito: camadas estritas + DI + policy-first + erros tipados, o padrão exato que um CRUD novo deve replicar. **⚠️ Ressalva crítica para CRUD:** o `users` é exceção LGPD ao soft-delete — `UserRepository.deleteUser` faz `prisma.user.delete()` HARD e `getAllUsers` NÃO filtra `deletedAt`. Um CRUD comum é o oposto: siga o "Soft-delete pattern obrigatório" abaixo (`deletedAt: null` em todo find + delete via `update({ data: { deletedAt } })`), NÃO copie o delete do `users`.

## When to use

- Recurso simples que só precisa de CRUD padrão
- Tabela ERP que precisa de API própria com soft-delete
- Prototipagem rápida de CRUD sem regras de negócio especiais

## Inputs

- `$ARGUMENTS[0]`: nome do recurso (ex: `comments`)
- `$ARGUMENTS[1]`: `dynamic-table` | `prisma` — **[CRUD-005]** decidido pelo teste do `_ARCHITECTURE-CONTRACT.md §2.1`, não por gosto: `prisma` quando há invariante financeiro/legal/regulatório ou integridade que o banco deve garantir (`@@unique`/FK/tipos reais); `dynamic-table` só quando o usuário configura o schema em runtime. **Em dúvida → `prisma`.** Recurso com campo de dinheiro que entra em saldo/fechamento é **sempre** `prisma` (money em `data: Json` é float em SQLite e `unique()` de preset é scan TOCTOU, não constraint).

## Execution steps (mesma ordem que fullstack-feature-generator)

1. Ler feature `users/` como referência de pattern
2. **[CRUD-002]** Gerar TODAS as camadas do slice na ordem `DTO → Repository → Policy → Service → Controller → Route` + o frontend service — nenhuma pode faltar nem ser inlinada (sem service sem repo, sem controller chamando Prisma direto, sem policy embutida no service)
3. **[CRUD-001]** Repository: soft-delete em todos os finds (`where: { deletedAt: null }`) e no delete (`update({ data: { deletedAt: new Date() } })`) — nunca `prisma.<model>.delete()`
4. Policy: ADMIN pode tudo, USER só o que é seu (ownership por `userId`)
5. Service: métodos simples delegando para repository sem lógica complexa
6. Controller + Route: GET list (paginado), GET by ID, POST create, PUT update, DELETE (soft) — **[CRUD-006]** registro em 2 toques: mount em `routes/index.ts` + bloco `@openapi` em `routes/docs.paths.ts`. **Não** edite `middleware/auth.ts`: a rota nasce protegida (deny-by-default)
7. **[CRUD-003]** Frontend: wrapper tipado em `lib/services/` e, na tela, reuso dos canônicos (`GenericTable`/`StandardPagination`, `Modal`, `AnalyticsDashboard`/`ChartRenderer`/`DashboardKpiCard`) — não recriar tabela/modal/analytics bespoke

## Soft-delete pattern obrigatório — [CRUD-001]

```ts
// Repository: delete
async softDelete(id: string): Promise<void> {
  await prisma.<model>.update({
    where: { id },
    data: { deletedAt: new Date() }
  })
}

// Repository: findAll
async findAll(page = 1, limit = 10) {
  return prisma.<model>.findMany({
    where: { deletedAt: null },
    skip: (page - 1) * limit,
    take: limit,
    orderBy: { createdAt: 'desc' }
  })
}
```

## Gates por camada (resumo)

Um item-chave por camada que NÃO pode faltar na geração ponta-a-ponta. Detalhe completo no `_ARCHITECTURE-CONTRACT.md` — aqui é só o lembrete de fechamento:

- **DTO** — `@openapi` JSDoc + `Create/Update<X>Schema` (Update = `.partial()`) + type guard `isCreate<X>Input` com `safeParse`; zero `z.any()`.
- **Repository** — soft-delete em TODO find (`where: { …, deletedAt: null }`) e no delete (`update({ data: { deletedAt } })`); `findAll` via `prisma.$transaction([findMany, count])`.
- **Policy** — métodos `can*` retornam `boolean` (zero `throw`, zero acesso a dados); ownership por `actor.id === ownerId || ADMIN`.
- **Service** — policy-first (`if (!this.policy.canX(actor)) throw new ForbiddenError()` antes de tocar dados); DI por construtor (sem `new Repository()`); `NotFoundError` (incl. cross-tenant); zero `prisma.*`/Express.
- **Controller** — `Schema.safeParse(req.body)` + `getUserContextFromRequest(req)` + `getFactory().get<X>Service()` + `handleApiError(error, res)`.
- **Route** — registro = **2 toques**: mount em `routes/index.ts` + bloco `@openapi` em `routes/docs.paths.ts`. Auth é deny-by-default e não entra no registro (fonte única: `docs/claude-skills/GENERATION_CONTRACTS.md` § Backend Route Contract).
- **Frontend service** — `apiClient`, tipos de retorno explícitos e **locais** (não importar do backend); zero `any`.
- **Page** — auth guard (`withAuth`/`useAuth`) + `serverSideTranslations` (i18n); detalhe de registro = **modal, não rota**.
- **Reuse de canônicos** — `GenericTable`/`StandardPagination` (tabela+paginação), `Modal` (detalhe), `AnalyticsDashboard`/`ChartRenderer`/`DashboardKpiCard` (analytics). Não recriar.

## Files usually created or changed

```
(mesmos que fullstack-feature-generator, mas sem migration Prisma por padrão)
```

## Required checks

```bash
cd server && npx tsc --noEmit
cd my-app && npx tsc --noEmit
```

## Anti-patterns

- **[CRUD-001]** Não use `prisma.model.delete()` — sempre soft-delete com `deletedAt`; não esqueça `where: { deletedAt: null }` em TODOS os finds.
- **[CRUD-006] Não reintroduza o toque morto em `middleware/auth.ts`:** a rota nasce protegida (deny-by-default) e o array `protectedApiPaths` não existe mais — instruções antigas mandando registrar o prefixo lá são anteriores ao `RISK-SEC-AUTH-001`. O toque tsc-cego que ainda importa é o `@openapi` em `docs.paths.ts`: pular = endpoint some da doc, com `tsc` verde.
- **[CRUD-003] "Módulo ilha":** não recrie tabela/modal/analytics próprios (`RecordTable`/`CrmKpiCard`/`CrmBarChart` foram o erro do CRM) — reuse os canônicos (`GenericTable`, `Modal`, `AnalyticsDashboard`/`ChartRenderer`/`DashboardKpiCard`).
- Registros soft-deleted devem ser limpos pelo job `PurgeDeletedRecords` após 90 dias.
- **[CRUD-005] Nunca gere um recurso com invariante financeiro/legal como `dynamic-table`** — money em `data: Json` é float em SQLite e `unique()` de preset é scan TOCTOU (não constraint). Isso é Prisma first-class; ver `_ARCHITECTURE-CONTRACT.md §2.1`.
- **[CRUD-004] Fronteira dura DynamicTable × Prisma:** NUNCA injete um serviço Prisma first-class (`PostingService`, `PayrollService`…) em `DynamicTableService`, `RuleContext` ou `RulePlugin`, e NUNCA modifique `DynamicTableService.ts` para integrar dois módulos. Integração cross-módulo sobe ao nível de controller/route/serviço de integração — nunca dentro do motor de plugins. Ver `_ARCHITECTURE-CONTRACT.md §2.1`.
