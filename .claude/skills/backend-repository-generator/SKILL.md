---
name: backend-repository-generator
description: Gera classe Repository + interface IRepository com acesso Prisma para um modelo de dados
argument-hint: "[NomeDoRecurso]"
allowed-tools: Read, Grep, Glob, Write, Edit
---

# Backend Repository Generator

## Purpose

Gera `server/src/features/<resource>/repositories/<Resource>Repository.ts` e sua interface com operações Prisma padronizadas incluindo paginação e soft-delete.

## When to use

- Novo modelo Prisma precisa de camada de acesso de dados
- Adicionando query especializada a um repository existente
- Implementando soft-delete em um recurso

## Inputs

- `$ARGUMENTS[0]`: nome do recurso em PascalCase (ex: `Appointment`)

## Repository patterns to inspect first

```
server/src/features/users/repositories/UserRepository.ts
server/src/features/users/repositories/IUserRepository.ts
server/src/features/dynamicTables/repositories/DynamicTableRepository.ts
server/prisma/schema.prisma
```

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
