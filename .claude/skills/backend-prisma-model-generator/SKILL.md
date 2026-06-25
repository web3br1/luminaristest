---
name: backend-prisma-model-generator
description: Adiciona um novo modelo ao server/prisma/schema.prisma seguindo as convenções do Luminaris (id cuid, createdAt/updatedAt, soft-delete deletedAt, relação User com onDelete Cascade, @@index, @@map snake_case) e executa `prisma migrate dev`. Use ao criar uma nova entidade de banco, adicionar campo/enum que exige migration, ou modelar um recurso multi-tenant com soft-delete. ATENÇÃO: roda migration que altera o banco real — operação destrutiva, confirme antes. Domínio/arquivos: server/prisma/schema.prisma + server/prisma/migrations/.
argument-hint: "[NomeDoModelo]"
allowed-tools: Read, Grep, Glob, Write, Edit, Bash
disable-model-invocation: true
compatibility: Claude Code; requer o monorepo Luminaris (server/ com Prisma CLI + SQLite). EFEITO DESTRUTIVO — executa `prisma migrate dev` (altera o banco real) e `prisma generate`. Requer confirmação manual antes de migrar; não invocável automaticamente pelo modelo (SG-013).
metadata:
  governance-skill-id: "SKL-BACKEND-PRISMA"
  governance-version: "1.0.0"
  governance-status: "validated"
  governance-owner: "engineering"
  governance-last-evaluated: "2026-06-25"
  governance-eval-score: "1.00"
---

# Backend Prisma Model Generator

## Purpose

Adiciona um novo modelo ao `server/prisma/schema.prisma` seguindo as convenções do Luminaris (cuid, timestamps, soft-delete, índices) e executa `prisma migrate dev`.

## Contrato obrigatório

Antes de gerar, leia `.claude/skills/_ARCHITECTURE-CONTRACT.md` — as regras cross-cutting (camadas, DI, soft-delete, policy-first, erros tipados, no-`any`, registro de rota, money, testes) são **gate** e não se repetem aqui. Esta skill adiciona apenas o checklist específico da camada **Prisma Model**.

> ⚠️ **Risco HIGH / passo manual:** esta operação modifica o banco real (`migrate dev`). Confirme com o usuário antes de migrar. Os campos abaixo são o que sustenta soft-delete, multi-tenancy e performance no resto da stack — um modelo sem eles vaza para todas as camadas acima.

## Checklist obrigatório — Prisma Model

Cada item abaixo é uma REGRA DE GERAÇÃO (o `luminaris-reviewer` cobra exatamente isto na camada Prisma Model). Gere já em conformidade.

- [ ] **[PRISMA-001]** **`id String @id @default(cuid())`** — nunca `Int @id @default(autoincrement())`.
- [ ] **[PRISMA-002]** **`createdAt DateTime @default(now())`** + **`updatedAt DateTime @updatedAt`** (o atributo `@updatedAt` é o que faz o Prisma atualizar o timestamp).
- [ ] **[PRISMA-003]** **`deletedAt DateTime?`** presente (soft-delete universal — toda camada acima depende dele).
- [ ] **[PRISMA-004]** **`userId String`** + relação `user User @relation(fields: [userId], references: [id], onDelete: Cascade)` se for recurso multi-tenant (a relação com `User` SEMPRE usa `onDelete: Cascade`).
- [ ] **[PRISMA-005]** **`@@index([userId])`** quando o modelo pertence a um usuário **e** **`@@index([deletedAt])`** (soft-delete é filtrado em todo find — sem índice, full-scan).
- [ ] **[PRISMA-006]** **`@@map("table_name")`** em snake_case **plural**.
- [ ] Relação inversa adicionada no modelo `User` quando aplicável.

## When to use

- Nova entidade de banco de dados precisa ser criada
- Adicionando campo a modelo existente (nova migration)
- Adicionando enum ao schema

## Inputs

- `$ARGUMENTS[0]`: nome do modelo em PascalCase (ex: `Appointment`)

## Repository patterns to inspect first

```
server/prisma/schema.prisma   ← models DynamicTableData (soft-delete) e DynamicTable (multi-tenant)
```

## ⭐ Exemplo de referência canônico (espelhe este model)

`server/prisma/schema.prisma` → **model `DynamicTableData`** — único model do schema que exemplifica o **soft-delete** completo: `id String @id @default(cuid())`, `createdAt DateTime @default(now())`, `updatedAt DateTime @updatedAt`, **`deletedAt DateTime?`**, `@@index([...])` e `@@map("dynamic_table_data")` (snake_case plural). Para o padrão **multi-tenant** (recurso que pertence a um usuário), espelhe o model **`DynamicTable`** no mesmo arquivo: `userId String` + `user User @relation(fields: [userId], references: [id], onDelete: Cascade)` + `@@index([userId])` + `@@map("dynamic_tables")`. Um recurso novo de usuário com soft-delete combina os dois: campos cuid/timestamps/`deletedAt` de `DynamicTableData` + a relação `User` (com `onDelete: Cascade`) e `@@index([userId])`/`@@index([deletedAt])` de `DynamicTable`. Leia ambos ANTES de editar o schema.

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
- Não omita `deletedAt DateTime?` em recurso com soft-delete — sem ele Repository/Service não conseguem filtrar `deletedAt: null` e o delete vira hard-delete
- Não esqueça `@@index([deletedAt])` — todo find filtra por `deletedAt`, sem índice é full-scan
- Não esqueça `@updatedAt` no campo `updatedAt` — sem o atributo o Prisma não atualiza o timestamp
- Não esqueça `@@map("table_name")` em snake_case — a convenção de nome físico de tabela é snake_case plural
