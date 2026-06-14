---
name: crud-resource-generator
description: Gera CRUD completo com soft-delete em todas as camadas backend + frontend service para recursos simples
argument-hint: "[nome-do-recurso] [dynamic-table|prisma]"
allowed-tools: Read, Grep, Glob, Write, Edit, Bash
---

# CRUD Resource Generator

## Purpose

Atalho para o padrão mais comum do Luminaris: CRUD completo com soft-delete, paginação, auth guard e frontend service. Mais rápido que `fullstack-feature-generator` para recursos sem lógica de negócio complexa.

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
- Registros soft-deleted devem ser limpos pelo job `PurgeDeletedRecords` após 90 dias
