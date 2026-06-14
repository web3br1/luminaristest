---
name: fullstack-feature-generator
description: Gera vertical slice completa — Prisma, DTO, Repository, Policy, Service, Controller, Route, OpenAPI, Frontend service e Page
argument-hint: "[nome-do-recurso] [--com-prisma] [--sem-frontend]"
allowed-tools: Read, Grep, Glob, Write, Edit, Bash
---

# Fullstack Feature Generator

## Purpose

Orquestra a geração de TODOS os átomos de um novo recurso, do Prisma ao frontend. É a skill de maior impacto e deve ser usada quando um domínio inteiramente novo precisa existir do zero.

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
- Esta é a skill de maior risco — use em branch separada e revise diff antes de commit
