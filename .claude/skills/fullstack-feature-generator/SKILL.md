---
name: fullstack-feature-generator
description: Gera vertical slice completa — Prisma, DTO, Repository, Policy, Service, Controller, Route, OpenAPI, Frontend service e Page
argument-hint: "[nome-do-recurso] [--com-prisma] [--sem-frontend]"
allowed-tools: Read, Grep, Glob, Write, Edit, Bash
---

# Fullstack Feature Generator

## Purpose

Orquestra a geração de TODOS os átomos de um novo recurso, do Prisma ao frontend. É a skill de maior impacto e deve ser usada quando um domínio inteiramente novo precisa existir do zero.

## Contrato obrigatório

Esta skill gera múltiplas camadas — TODO arquivo gerado deve cumprir `.claude/skills/_ARCHITECTURE-CONTRACT.md` (camadas, DI, soft-delete, policy-first, registro de rota = 3 toques, no-`any`, frontend service layer, reuse de canônicos, design system, testes). O contrato é o gate final; as sub-skills herdam-no.

## ⭐ Exemplo de referência canônico (espelhe este slice)

A feature **`users`** é o vertical-slice de referência — leia-a inteira ANTES de gerar qualquer arquivo e espelhe a estrutura/separação de camadas:

```
server/src/features/users/dtos/UserDto.ts                    ← DTO (Zod Create/Update + type guards)
server/src/features/users/repositories/IUserRepository.ts    ← interface de repo
server/src/features/users/repositories/UserRepository.ts     ← acesso Prisma ($transaction em getAllUsers)
server/src/features/users/policies/IUserPolicy.ts            ← interface de policy
server/src/features/users/policies/UserPolicy.ts             ← métodos can* booleanos, ownership por actor.id/ADMIN
server/src/features/users/services/UserService.ts            ← policy-first, DI por construtor, erros tipados, zero prisma.*
server/src/controllers/userController.ts                     ← safeParse + getUserContextFromRequest + getFactory + handleApiError
server/src/routes/users.ts                                   ← rota fina (router.<verbo> + handler)
my-app/lib/services/user.service.ts                          ← frontend service (apiClient, tipos locais)
```

Por que é o par perfeito: é a feature mais limpa do repositório — camadas estritas, DI por construtor, policy-first e erros tipados de `lib/errors`. **Ressalva única:** `UserRepository.deleteUser` faz `prisma.user.delete()` HARD (exceção LGPD art.18 — direito ao esquecimento) e `getAllUsers` não filtra `deletedAt`. Para o padrão de **soft-delete** (que a maioria dos recursos novos usa), siga o contrato em vez de copiar essas duas funções do `users`.

## When to use

- Novo domínio de negócio do zero (ex: "sistema de agendamentos")
- Prototipagem rápida de feature completa
- Aprovação de implementação de spec

## Inputs

- `$ARGUMENTS[0]`: nome do recurso em snake_case (ex: `appointments`)
- `--com-prisma`: incluir model Prisma + migration
- `--sem-frontend`: gerar apenas backend

## Execution order — SEGUIR ESTA ORDEM EXATA

1. **Ler** — ler feature `users/` completa como referência antes de gerar qualquer coisa
2. **Prisma** (se `--com-prisma`) — adicionar model + migrate + generate
3. **DTO + model** — criar `dtos/<Resource>Dto.ts` + `models/<Resource>.model.ts`
4. **IRepository + Repository** — interface + implementação Prisma
5. **IPolicy + Policy** — interface + implementação de autorização
6. **Service** — criar `<Resource>Service.ts` com injeção de deps
7. **Factory** — registrar repo, policy e service em `lib/factory.ts`
8. **Controller** — criar `controllers/<resource>Controller.ts`
9. **Route** — criar `routes/<resource>.ts` + registrar em `routes/index.ts` **+ adicionar `'/api/<resource>'` ao `protectedApiPaths` em `middleware/auth.ts`** (3º toque OBRIGATÓRIO — sem ele a rota dá 401 com token válido; `tsc` não pega)
10. **OpenAPI** — adicionar bloco em `routes/docs.paths.ts`
11. **Frontend service** — criar `my-app/lib/services/<resource>.service.ts`
12. **Frontend page** — criar `my-app/pages/<resource>/index.tsx`
13. **Typecheck** — `npx tsc --noEmit` em server/ e my-app/

## Sub-skills invocadas

Esta skill aplica os contratos de:
- `backend-prisma-model-generator`
- `backend-dto-generator`
- `backend-repository-generator`
- `backend-policy-generator`
- `backend-service-generator`
- `backend-controller-generator`
- `backend-route-generator`
- `frontend-api-service-generator`
- `frontend-page-generator`

## Files usually created or changed

```
server/prisma/schema.prisma                                             ← EDIT (opcional)
server/src/features/<resource>/models/<Resource>.model.ts               ← NEW
server/src/features/<resource>/dtos/<Resource>Dto.ts                    ← NEW
server/src/features/<resource>/repositories/I<Resource>Repository.ts    ← NEW
server/src/features/<resource>/repositories/<Resource>Repository.ts     ← NEW
server/src/features/<resource>/policies/I<Resource>Policy.ts            ← NEW
server/src/features/<resource>/policies/<Resource>Policy.ts             ← NEW
server/src/features/<resource>/services/<Resource>Service.ts            ← NEW
server/src/lib/factory.ts                                                ← EDIT
server/src/controllers/<resource>Controller.ts                          ← NEW
server/src/routes/<resource>.ts                                         ← NEW
server/src/routes/index.ts                                              ← EDIT
server/src/middleware/auth.ts                                           ← EDIT (add '/api/<resource>' a protectedApiPaths)
server/src/routes/docs.paths.ts                                         ← EDIT
my-app/lib/services/<resource>.service.ts                               ← NEW
my-app/pages/<resource>/index.tsx                                       ← NEW
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

## Required checks

```bash
cd server && npx tsc --noEmit
cd my-app && npx tsc --noEmit
```

## Anti-patterns

- Não gere tudo sem primeiro ler um exemplo completo (users/ feature)
- Não pule o registro no factory — o controller não funciona sem isso
- Não altere a ordem — Service depende de Repository e Policy existirem
- Não misture lógica de negócio entre camadas
- **Bug silencioso do `protectedApiPaths`:** esquecer o 3º toque (`'/api/<resource>'` no array de `middleware/auth.ts`) faz a rota retornar **401 mesmo com token válido** — `getUserContextFromRequest` devolve `null`. O `tsc` NÃO pega; só aparece em runtime.
- **"Módulo ilha":** não recrie tabela/modal/analytics próprios (`RecordTable`/`CrmKpiCard`/`CrmBarChart` foram o erro do CRM) — reuse os canônicos (`GenericTable`, `Modal`, `AnalyticsDashboard`/`ChartRenderer`/`DashboardKpiCard`).
- Esta é a skill de maior risco — use em branch separada e revise diff antes de commit
