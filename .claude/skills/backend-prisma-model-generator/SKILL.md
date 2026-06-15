---
name: backend-prisma-model-generator
description: Adiciona novo modelo Prisma ao schema.prisma e executa migration — operação destrutiva que exige confirmação manual
argument-hint: "[NomeDoModelo]"
allowed-tools: Read, Grep, Glob, Write, Edit, Bash
---

# Backend Prisma Model Generator

## Purpose

Adiciona um novo modelo ao `server/prisma/schema.prisma` seguindo as convenções do Luminaris (cuid, timestamps, soft-delete, índices) e executa `prisma migrate dev`.

## When to use

- Nova entidade de banco de dados precisa ser criada
- Adicionando campo a modelo existente (nova migration)
- Adicionando enum ao schema

## Inputs

- `$ARGUMENTS[0]`: nome do modelo em PascalCase (ex: `Appointment`)

## Repository patterns to inspect first

```
server/prisma/schema.prisma
```

## Generation contract

1. Leia `schema.prisma` inteiro antes de editar
2. ID: `id String @id @default(cuid())`
3. User relation obrigatória (se for recurso de usuário): `userId String` + `user User @relation(fields: [userId], references: [id], onDelete: Cascade)`
4. Timestamps: `createdAt DateTime @default(now())` + `updatedAt DateTime @updatedAt`
5. Soft delete (se aplicável): `deletedAt DateTime?`
6. Índices: `@@index([userId])` + outros campos de busca frequente
7. Map (se plural): `@@map("table_name")` em snake_case plural
8. Adicionar relação inversa no modelo User se necessário
9. Confirmar com usuário antes de executar migrate
10. Executar: `cd server && npx prisma migrate dev --name add_<model_name>`
11. Executar: `cd server && npx prisma generate`

## Files usually created or changed

```
server/prisma/schema.prisma                      ← EDIT
server/prisma/migrations/<timestamp>_add_<name>/ ← NEW (gerado pelo migrate)
server/generated/prisma/                         ← REGENERATED
```

## Required checks

```bash
cd server && npx prisma validate
cd server && npx prisma migrate dev --name add_<model_name>
cd server && npx prisma generate
cd server && npx tsc --noEmit
```

## Anti-patterns

- NUNCA edite arquivos de migration gerados manualmente
- Não adicione modelos sem relação com User (se for recurso multi-tenant)
- Não esqueça `onDelete: Cascade` na relação com User
- Não use `Int @id @default(autoincrement())` — use cuid
- Não esqueça `@@index` em campos de foreign key
- Esta operação modifica o banco de dados real — confirme com o usuário antes de executar migrate em produção
