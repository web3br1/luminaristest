---
name: job-generator
description: Gera job de background (scheduled task) ou seed fixture de desenvolvimento seguindo os padrões do Luminaris
argument-hint: "[NomeDoJob] [schedule|seed]"
allowed-tools: Read, Grep, Glob, Write, Edit
---

# Job Generator

## Purpose

Gera jobs de background em `server/src/jobs/` ou fixtures de seed em `my-app/features/dev/seed/modules/`. Jobs usam Prisma diretamente (sem factory) para operações de manutenção.

## When to use

- Novo job de limpeza/manutenção periódico (ex: purge de registros deletados)
- Adicionando fixture de dados de desenvolvimento para novo módulo
- Agendando processamento em background

## Inputs

- `$ARGUMENTS[0]`: nome em PascalCase (ex: `PurgeExpiredProposals`)
- `$ARGUMENTS[1]`: `schedule` para background job, `seed` para fixture de dev

## Repository patterns to inspect first

```
server/src/jobs/PurgeDeletedRecords.ts
my-app/features/dev/seed/
server/src/lib/logger.ts
```

## Generation contract

### Background Job

1. Arquivo: `server/src/jobs/<JobName>.ts`
2. Exportar named async function: `export async function run<JobName>(): Promise<void>`
3. Usar `prisma` diretamente — jobs não passam pelo factory
4. Logging: `logger.info('Job started', { job: '<JobName>' })` + `logger.info('Job completed', { affected: N })`
5. Error handling: `try/catch` com `logger.error`
6. Registrar chamada em `server.ts` se agendado no boot

### Seed Fixture (frontend, via API — dados pequenos/realistas)

1. Arquivo: `my-app/features/dev/seed/modules/<name>Seed.ts`
2. Exportar: `export async function seed<Name>(userId: string): Promise<void>`
3. Chamar endpoints via `apiClient` do frontend (passa pela validação/rules)
4. Registrar em `my-app/features/dev/seed/index.ts`

### Dev Seed de VOLUME (script Node + Prisma direto — para testar a UI com muitos dados)

Quando o objetivo é estressar as telas (centenas de registros), use um script Node em `server/scripts/seed-<dominio>-demo.js` com Prisma direto (bypassa o rule engine — aceitável só em dev). Referência: `server/scripts/seed-crm-demo.js`.

- **Idempotência obrigatória:** marque cada registro com `data.__demo = true` e, no início, apague os `__demo` anteriores (`findMany` → filtra `r.data.__demo === true` → `deleteMany`). Assim re-rodar nunca duplica.
- **Volume:** use `prisma.dynamicTableData.createMany` para inserts em massa; crie individualmente só quando precisar do `id` para FKs (ex: leads que serão referenciados por proposals/activities).
- **Módulo selecionável:** se a tabela não existe para o usuário (preset não instalado), crie a `DynamicTable` sob demanda (`prisma.dynamicTable.create` com `internalName`, `category` válida e `schema`).
- **Cubra a variabilidade que a view ramifica:** múltiplos status, scores, **múltiplos registros-pai** (ex: 2 pipelines, várias units) e datas futuras/passadas — é assim que se pega bug de view (ex: colunas duplicadas de Kanban) que dados happy-path escondem.
- **Gotcha de ordenação:** a API de dynamic-tables retorna `orderBy: { createdAt: 'desc' }`; o `prisma.findMany` default difere. NÃO assuma que `[0]` é o mesmo registro nos dois — resolva por `id`/`internalName`, não por posição.

## Files usually created or changed

```
server/src/jobs/<JobName>.ts                            ← NEW (background job)
my-app/features/dev/seed/modules/<name>Seed.ts          ← NEW (seed fixture via API)
my-app/features/dev/seed/index.ts                       ← EDIT (register seed)
server/scripts/seed-<dominio>-demo.js                   ← NEW (seed de volume, Prisma direto)
```

## Required checks

```bash
cd server && npx tsc --noEmit
```

## Anti-patterns

- Não use `getFactory()` em jobs — crie acesso Prisma direto
- Não esqueça logging de início e fim com métricas
- Seeds de dev não devem rodar em produção — guard com `if (process.env.NODE_ENV === 'production') return`
- Seed de volume sem marca `__demo` + cleanup = duplica a cada execução; sempre torne idempotente
- Não resolva tabelas/pais por posição de array (`[0]`) — a ordenação da API (`createdAt desc`) difere do `findMany`; resolva por `internalName`/`id`
