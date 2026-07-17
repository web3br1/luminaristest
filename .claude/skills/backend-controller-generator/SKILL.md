---
name: backend-controller-generator
description: Gera funções de controller HTTP async para um recurso backend — validação Zod inline com safeParse, getFactory para obter o service, getUserContextFromRequest para o actor, resposta { success, data } e handleApiError no catch. Use ao criar controllers de um novo CRUD, ao adicionar actions não-CRUD (approve/publish), ou ao corrigir a estrutura de um controller existente. Domínio/arquivos: server/src/controllers/<resource>Controller.ts.
argument-hint: "[NomeDoRecurso]"
allowed-tools: Read, Grep, Glob, Write, Edit
compatibility: Claude Code; requer o monorepo Luminaris (server/ com zod + tsc). Sem efeitos externos — apenas gera/edita arquivos no repositório.
metadata:
  governance-skill-id: "SKL-BACKEND-CTRL"
  governance-version: "1.0.1"
  governance-status: "validated"
  governance-owner: "engineering"
  governance-last-evaluated: "2026-07-16"
  governance-eval-score: "1.00"
---

# Backend Controller Generator

## Purpose

Gera `server/src/controllers/<Resource>Controller.ts` com funções async nomeadas seguindo o padrão do Luminaris: validação Zod inline, `getFactory()`, `getUserContextFromRequest`, e `handleApiError`.

## Contrato obrigatório

Antes de gerar, leia `.claude/skills/_ARCHITECTURE-CONTRACT.md` — as regras cross-cutting (camadas, DI, soft-delete, policy-first, erros tipados, no-`any`, registro de rota, money, testes) são **gate** e não se repetem aqui. Esta skill adiciona apenas o checklist específico da camada **Controller**.

## Checklist obrigatório — Controller

Cada item abaixo é uma REGRA DE GERAÇÃO (o `luminaris-reviewer` cobra exatamente isto na camada Controller). Gere já em conformidade.

- [ ] **[CTL-001] `Schema.safeParse(req.body)` ANTES de qualquer lógica:** `const parse = Schema.safeParse(req.body); if (!parse.success) return res.status(400).json({ success: false, error: parse.error.flatten() });`
- [ ] **[CTL-002] `getUserContextFromRequest(req)`** para extrair o actor antes de chamar o service (`UserContext | null`; faça guard `if (!actor) throw new UnauthorizedError()` se o service exige actor não-nulo).
- [ ] **[CTL-003] `getFactory().get<Resource>Service()`** — nunca instancia o service direto.
- [ ] **[CTL-004] Resposta de sucesso `{ success: true, data }`** (`res.json` em 200, `res.status(201).json(...)` em criação).
- [ ] **[CTL-005] `handleApiError(error, res)`** no `catch` (ordem: `error` primeiro), importado de `../lib/apiUtils` — nunca `res.status(500).json()` manual.
- [ ] **ZERO `prisma.*`** no controller.
- [ ] **ZERO regra de negócio** — sem hashing, sem checagem de permissão, sem cálculo de domínio; delega ao service imediatamente.
- [ ] **[CTL-006]** `return` antes de cada `res.json` (evita "headers already sent").

## When to use

- Novo recurso CRUD precisa de controllers
- Adicionando actions não-CRUD (ex: `approve`, `publish`)
- Corrigindo estrutura de controller existente

## Inputs

- `$ARGUMENTS[0]`: nome do recurso em PascalCase (ex: `Appointment`)

## Repository patterns to inspect first

```
server/src/controllers/chatInstancesController.ts
server/src/lib/apiUtils.ts
server/src/lib/authUtils.ts
server/src/lib/factory.ts
```

## ⭐ Exemplo de referência canônico (espelhe este arquivo)

`server/src/controllers/chatInstancesController.ts` — Controller perfeito da camada: `Schema.safeParse(req.body)` com `return res.status(400)` em create/update ANTES de qualquer lógica, `getUserContextFromRequest(req)` + guard `if (!ctx) return res.status(401)`, `getFactory().getChatInstanceService()` (nunca `new`), resposta `{ success: true, data }` (`res.status(201)` em criação), `handleApiError(error, res)` em todo `catch`, ZERO `prisma.*`, ZERO regra de negócio (delega ao service). Leia-o ANTES de gerar e siga a mesma estrutura/ordem. ⚠️ **NÃO espelhe `userController.ts`**: ele importa e usa `prisma` direto (`getUsers`/`updateMyPreferences`) e tem um handler que retorna shape ad-hoc (`res.json(updated)` sem `{ success, data }`) — ambos violam o contrato desta camada.

## Generation contract

1. Arquivo: `server/src/controllers/<resource>Controller.ts`
2. Imports obrigatórios:
   - `import { Request, Response } from 'express'`
   - `import { handleApiError } from '../lib/apiUtils'`
   - `import { getFactory } from '@/lib/factory'`
   - `import { getUserContextFromRequest } from '@/lib/authUtils'`
   - `import { z } from 'zod'`
3. Schemas Zod inline: `const Create<Resource>Schema = z.object({ ... })`
4. Cada função: `export const listX = async (req: Request, res: Response) => { try { ... } catch (error) { return handleApiError(error, res) } }`
5. Validação: `const parse = Schema.safeParse(req.body); if (!parse.success) return res.status(400).json({ success: false, error: parse.error.flatten() })`
6. Actor: `const actor = getUserContextFromRequest(req)` — **retorna `UserContext | null`**. Se o service espera um actor não-nulo, faça o guard: `if (!actor) throw new UnauthorizedError()` (importe `UnauthorizedError` de `../lib/errors`). Nota: o user context vem populado automaticamente — `middleware/auth.ts` é deny-by-default e injeta os headers de identidade a partir do token verificado em toda rota sob `/api`; não há allowlist a registrar. O guard continua **obrigatório** mesmo em rota protegida: `getUserContextFromRequest` exige `userId && username && role` (`lib/authUtils.ts`) e o middleware só injeta `username` se o token o trouxer — logo `null` é alcançável. Em rota **pública** (`publicApiRoutes`) é `null` por definição.
7. Service: `const service = getFactory().get<Resource>Service()`
8. Resposta de sucesso: `return res.json({ success: true, data: result })`
9. Criação: `return res.status(201).json({ success: true, data: created })`
10. Nenhuma lógica de negócio — apenas delegar ao service

## Files usually created or changed

```
server/src/controllers/<resource>Controller.ts    ← NEW
```

## Required checks

```bash
cd server && npx tsc --noEmit
```

## Anti-patterns

- Não acesse `prisma` diretamente no controller
- Não escreva lógica de negócio (hashing, permissões) — pertence ao service
- Não use `res.send` — sempre `res.json`
- Não omita o `try/catch` com `handleApiError`
- Não esqueça `return` antes de cada `res.json` para evitar "headers already sent"
- Não chame o service antes de `Schema.safeParse(req.body)` — validação é a primeira coisa do handler
- Não instancie o service direto (`new <Resource>Service()`) — sempre `getFactory().get<Resource>Service()`
- Não extraia o actor manualmente do token — use `getUserContextFromRequest(req)`
- Não retorne shapes ad-hoc — sucesso é sempre `{ success: true, data }`; erro é sempre via `handleApiError(error, res)`
