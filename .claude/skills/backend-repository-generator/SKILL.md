---
name: backend-repository-generator
description: Gera classe Repository + interface IRepository com acesso Prisma para um modelo de dados
argument-hint: "[NomeDoRecurso]"
allowed-tools: Read, Grep, Glob, Write, Edit
---

# Backend Repository Generator

## Purpose

Gera `server/src/features/<resource>/repositories/<Resource>Repository.ts` e sua interface com operações Prisma padronizadas incluindo paginação e soft-delete.

## Contrato obrigatório

Antes de gerar, leia `.claude/skills/_ARCHITECTURE-CONTRACT.md` — as regras cross-cutting (camadas, DI, soft-delete, policy-first, erros tipados, no-`any`, registro de rota, money, testes) são **gate** e não se repetem aqui. Esta skill adiciona apenas o checklist específico da camada **Repository**.

## Checklist obrigatório — Repository

Cada item abaixo é uma REGRA DE GERAÇÃO (o `luminaris-reviewer` cobra exatamente isto na camada Repository). Gere já em conformidade.

- [ ] **`where: { ..., deletedAt: null }` em TODOS os `findMany`/`findFirst`/`findUnique`-equivalentes** — sem exceção. Um find sem o filtro vaza registros soft-deletados.
- [ ] **Soft-delete via `update`, NUNCA `.delete()`**: `delete` faz `prisma.<model>.update({ where: { id }, data: { deletedAt: new Date() } })`. Zero `prisma.<model>.delete()` no arquivo.
- [ ] **`findAll` usa `prisma.$transaction([findMany, count])`** — uma transação, não duas queries sequenciais. Paginação: `skip = (page-1)*limit`, default `findAll(page = 1, limit = 10)`.
- [ ] **`implements I<Resource>Repository`** — a classe implementa a interface declarada no mesmo diretório; toda assinatura pública está na interface.
- [ ] **Zero regra de negócio** — sem policy check, sem validação de negócio, sem cálculo de domínio. Só acesso a dados.
- [ ] **`select` explícito excluindo campos sensíveis** (password, tokens) em queries públicas.
- [ ] **Tipos Prisma de `'generated/prisma'`** (`import { Prisma } from 'generated/prisma'`) — NUNCA `@prisma/client` (output path customizado).
- [ ] Ordenação padrão `orderBy: { createdAt: 'desc' }`.
- [ ] Métodos obrigatórios: `create`, `findById`, `findAll`, `update`, `delete`.

## When to use

- Novo modelo Prisma precisa de camada de acesso de dados
- Adicionando query especializada a um repository existente
- Implementando soft-delete em um recurso

## Inputs

- `$ARGUMENTS[0]`: nome do recurso em PascalCase (ex: `Appointment`)

## Repository patterns to inspect first

```
server/src/features/dynamicTables/repositories/DynamicTableRepository.ts
server/src/features/dynamicTables/repositories/IDynamicTableRepository.ts
server/src/features/users/repositories/UserRepository.ts
server/src/features/users/repositories/IUserRepository.ts
server/prisma/schema.prisma
```

## ⭐ Exemplo de referência canônico (espelhe este arquivo)

`server/src/features/dynamicTables/repositories/DynamicTableRepository.ts` — único repository do repo que exemplifica o contrato de **soft-delete**: `where: { ..., deletedAt: null }` em TODOS os finds (`findDataById`/`findDataByIds`/`findDataByTableId`/`findAllDataByTableId`/etc.), **soft-delete via `update({ data: { deletedAt: new Date() } })`** em `deleteData` (não `.delete()`), `implements IDynamicTableRepository`, tipos de `'generated/prisma'`, `orderBy: { createdAt: 'desc' }`. Leia-o ANTES de gerar e siga a mesma estrutura. ⚠️ **NÃO espelhe `UserRepository.ts` para soft-delete**: o model `User` não tem `deletedAt`, então aquele repo usa `prisma.user.delete()` (hard delete) e não filtra `deletedAt: null` — é referência boa só para o padrão `getAllUsers` com `prisma.$transaction([findMany, count])` (que `DynamicTableRepository` faz com `Promise.all`); para o `findAll` paginado prefira o `$transaction([...])` do `UserRepository.getAllUsers`.

## Generation contract

1. Interface: `I<Resource>Repository.ts` com assinaturas de métodos tipados
2. Classe: `export class <Resource>Repository implements I<Resource>Repository`
3. Imports: `import prisma from '../../../lib/prisma'` + `import { Prisma } from 'generated/prisma'`
4. Métodos obrigatórios: `create`, `findById`, `findAll`, `update`, `delete`
5. Paginação: `findAll(page = 1, limit = 10)` com `skip = (page-1)*limit` + `prisma.$transaction([findMany, count])`
6. Select explícito: nunca retornar campos sensíveis sem necessidade
7. Soft delete: se o modelo tiver `deletedAt`, usar `where: { deletedAt: null }` em finds e `data: { deletedAt: new Date() }` em deletes
8. Ordenação padrão: `orderBy: { createdAt: 'desc' }`

## Files usually created or changed

```
server/src/features/<resource>/repositories/I<Resource>Repository.ts    ← NEW
server/src/features/<resource>/repositories/<Resource>Repository.ts     ← NEW
```

## Required checks

```bash
cd server && npx tsc --noEmit
```

## Anti-patterns

- Não coloque lógica de negócio no repository — apenas operações de dados
- Não use `prisma.model.findMany()` sem `select` explícito em queries públicas
- Não esqueça `where: { deletedAt: null }` se o modelo usa soft-delete
- Não use `prisma.$queryRaw` a menos que não haja alternativa via ORM
- Nunca chame `prisma.<model>.delete()` — soft-delete é via `update({ data: { deletedAt: new Date() } })`; um hard-delete quebra o contrato de soft-delete universal
- Não faça `findMany` + `count` em duas queries sequenciais no `findAll` — envolva em `prisma.$transaction([findMany, count])`
- Não importe tipos Prisma de `@prisma/client` — use `'generated/prisma'` (output path customizado); o import errado compila localmente mas diverge do gerado
- Não deixe a classe sem `implements I<Resource>Repository` — a interface é o contrato que o service injeta
