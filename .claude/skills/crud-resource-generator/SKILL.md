---
name: crud-resource-generator
description: Gera CRUD completo com soft-delete em todas as camadas backend + frontend service para recursos simples
argument-hint: "[nome-do-recurso] [dynamic-table|prisma]"
allowed-tools: Read, Grep, Glob, Write, Edit, Bash
---

# CRUD Resource Generator

## Purpose

Atalho para o padrão mais comum do Luminaris: CRUD completo com soft-delete, paginação, auth guard e frontend service. Mais rápido que `fullstack-feature-generator` para recursos sem lógica de negócio complexa.

## Contrato obrigatório

Esta skill gera múltiplas camadas — TODO arquivo gerado deve cumprir `.claude/skills/_ARCHITECTURE-CONTRACT.md` (camadas, DI, soft-delete, policy-first, registro de rota = 3 toques, no-`any`, frontend service layer, reuse de canônicos, design system, testes). O contrato é o gate final; as sub-skills herdam-no.

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
- `$ARGUMENTS[1]`: `dynamic-table` | `prisma`

## Execution steps (mesma ordem que fullstack-feature-generator)

1. Ler feature `users/` como referência de pattern
2. Repository: soft-delete em todos os finds (`where: { deletedAt: null }`) e delete (`data: { deletedAt: new Date() }`)
3. Policy: ADMIN pode tudo, USER só o que é seu (ownership por `userId`)
4. Service: métodos simples delegando para repository sem lógica complexa
5. Controller + Route: GET list (paginado), GET by ID, POST create, PUT update, DELETE (soft) — **e registrar `'/api/<resource>'` no `protectedApiPaths` de `middleware/auth.ts`** (senão dá 401 com token válido)
6. Frontend service: wrapper tipado com todos os métodos

## Soft-delete pattern obrigatório

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
- **Route** — registro = **3 toques**: mount em `routes/index.ts` + `'/api/<resource>'` no `protectedApiPaths` de `middleware/auth.ts` + bloco `@openapi` em `routes/docs.paths.ts`.
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

- Não use `prisma.model.delete()` — sempre soft-delete com `deletedAt`
- Não esqueça `where: { deletedAt: null }` em TODOS os finds
- **Bug silencioso do `protectedApiPaths`:** esquecer o 3º toque (`'/api/<resource>'` no array de `middleware/auth.ts`) faz a rota retornar **401 mesmo com token válido** — `getUserContextFromRequest` devolve `null`. O `tsc` NÃO pega; só aparece em runtime.
- **"Módulo ilha":** não recrie tabela/modal/analytics próprios (`RecordTable`/`CrmKpiCard`/`CrmBarChart` foram o erro do CRM) — reuse os canônicos (`GenericTable`, `Modal`, `AnalyticsDashboard`/`ChartRenderer`/`DashboardKpiCard`).
- Registros soft-deleted devem ser limpos pelo job `PurgeDeletedRecords` após 90 dias
