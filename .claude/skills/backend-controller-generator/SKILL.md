---
name: backend-controller-generator
description: Gera funções de controller async com validação Zod inline, getFactory, getUserContextFromRequest e handleApiError
argument-hint: "[NomeDoRecurso]"
allowed-tools: Read, Grep, Glob, Write, Edit
---

# Backend Controller Generator

## Purpose

Gera `server/src/controllers/<Resource>Controller.ts` com funções async nomeadas seguindo o padrão do Luminaris: validação Zod inline, `getFactory()`, `getUserContextFromRequest`, e `handleApiError`.

## When to use

- Novo recurso CRUD precisa de controllers
- Adicionando actions não-CRUD (ex: `approve`, `publish`)
- Corrigindo estrutura de controller existente

## Inputs

- `$ARGUMENTS[0]`: nome do recurso em PascalCase (ex: `Appointment`)

## Repository patterns to inspect first

```
server/src/controllers/userController.ts
server/src/lib/apiUtils.ts
server/src/lib/authUtils.ts
server/src/lib/factory.ts
```

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
6. Actor: `const actor = getUserContextFromRequest(req)` — **retorna `UserContext | null`**. Se o service espera um actor não-nulo, faça o guard: `if (!actor) throw new UnauthorizedError()` (importe `UnauthorizedError` de `../lib/errors`). Nota: o user context só é populado se o prefixo da rota estiver no `protectedApiPaths` de `middleware/auth.ts` — se a rota dá 401 com token válido, o registro do allowlist está faltando (ver `backend-route-generator`).
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
