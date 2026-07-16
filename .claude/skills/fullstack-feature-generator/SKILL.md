---
name: fullstack-feature-generator
description: Gera vertical slice completa — Prisma, DTO, Repository, Policy, Service, Controller, Route, OpenAPI, Frontend service e Page
argument-hint: "[nome-do-recurso] [--com-prisma] [--sem-frontend]"
allowed-tools: Read, Grep, Glob, Write, Edit, Bash
disable-model-invocation: true
metadata:
  governance-skill-id: "SKL-FULLSTACK-FEATURE"
  governance-version: "1.0.0"
  governance-status: "validated"
  governance-owner: "engineering"
  governance-last-evaluated: "2026-06-25"
  governance-eval-score: "1.00"
---

> **[FULL-008] Invocação só explícita** (`disable-model-invocation: true`): com `--com-prisma` esta skill
> **executa `prisma migrate`** (efeito externo: altera o schema do banco). Por isso nunca é auto-invocada pelo
> router — o usuário a chama de propósito, em branch separada, e revisa o diff antes do commit.

# Fullstack Feature Generator

## Purpose

Orquestra a geração de TODOS os átomos de um novo recurso, do Prisma ao frontend. É a skill de maior impacto e deve ser usada quando um domínio inteiramente novo precisa existir do zero.

## Contrato obrigatório

Esta skill gera múltiplas camadas — TODO arquivo gerado deve cumprir `.claude/skills/_ARCHITECTURE-CONTRACT.md` (camadas, DI, soft-delete, policy-first, registro de rota = 2 toques, no-`any`, frontend service layer, reuse de canônicos, design system, testes). O contrato é o gate final; as sub-skills herdam-no.

## Regras de composição (gated) — esta skill COMPÕE, não duplica os contratos-filhos

São as regras próprias da camada de orquestração. O **texto** de cada contrato-filho (DTO/Repo/Policy/…) é
canônico nas sub-skills — aqui só garantimos a **costura** e as **fronteiras** da fatia inteira:

- **[FULL-001] Compor a cadeia canônica na ordem** — contrato (DTO + `@openapi`) → backend (repo → policy → service → factory → controller → route) → frontend (service → page). Nunca pular elos nem inverter a ordem (Service depende de Repo+Policy).
- **[FULL-002] Delegar, não copiar** — aplicar os **contratos das sub-skills** (`backend-*-generator`, `frontend-api-service-generator`, `frontend-page-generator`) por referência; não reescrever as instruções delas aqui, e reusar os canônicos (`GenericTable`/`Modal`/`StandardPagination`) em vez de recriar (anti "módulo ilha").
- **[FULL-003] UI livre de Prisma/DB** — page e frontend service nunca importam `prisma`/`@/lib/prisma` nem acessam o banco; falam **só** com a service layer via `apiClient`.
- **[FULL-004] Domínio/serviço livre de React e transporte** — `Service`/`Repository` nunca importam React/JSX nem usam `Request`/`Response`/`res.json`; o transporte (HTTP) fica no controller.
- **[FULL-005] Rota = 2 toques** — mount em `routes/index.ts` + bloco `@openapi` em `routes/docs.paths.ts`. Auth é deny-by-default: a rota nasce protegida, não se edita `middleware/auth.ts` (fonte única: `docs/claude-skills/GENERATION_CONTRACTS.md` § Backend Route Contract).
- **[FULL-006] Contrato compatível ponta-a-ponta** — o **envelope** e os **nomes de campo** que o backend retorna (`res.json({ data, pagination })`, ex. `amountCents`) são **idênticos** aos que o frontend service tipa/consome. Cada lado válido isolado mas discordando = bug de runtime que o `tsc` não pega.
- **[FULL-007] Testes dos dois lados** — backend (`jest` no Service: policy-first + not-found) **e** frontend, incluindo a compatibilidade de contrato (tipo do service espelha o envelope do backend).

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
9. **Route** — criar `routes/<resource>.ts` + registrar em `routes/index.ts` **+ bloco `@openapi` em `routes/docs.paths.ts`** (2º toque OBRIGATÓRIO, tsc-cego — sem ele o endpoint some da doc). Não toque em `middleware/auth.ts`: a rota nasce protegida
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
- **Route** — registro = **2 toques**: mount em `routes/index.ts` + bloco `@openapi` em `routes/docs.paths.ts`.
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
- **Não reintroduza o toque morto em `middleware/auth.ts`:** o array `protectedApiPaths` não existe mais (auth é deny-by-default desde o `RISK-SEC-AUTH-001`) — a rota nasce protegida ao ser montada. O toque tsc-cego que sobrou é o `@openapi` em `docs.paths.ts`.
- **"Módulo ilha":** não recrie tabela/modal/analytics próprios (`RecordTable`/`CrmKpiCard`/`CrmBarChart` foram o erro do CRM) — reuse os canônicos (`GenericTable`, `Modal`, `AnalyticsDashboard`/`ChartRenderer`/`DashboardKpiCard`).
- Esta é a skill de maior risco — use em branch separada e revise diff antes de commit
