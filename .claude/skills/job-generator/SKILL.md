---
name: job-generator
description: Gera job de background (scheduled task) ou seed fixture de desenvolvimento seguindo os padrões do Luminaris
argument-hint: "[NomeDoJob] [schedule|seed]"
allowed-tools: Read, Grep, Glob, Write, Edit
---

# Job Generator

## Purpose

Gera jobs de background em `server/src/jobs/` ou fixtures de seed em `my-app/features/dev/seed/modules/`. Jobs usam Prisma diretamente (sem factory) para operações de manutenção.

## Contrato obrigatório

Antes de gerar, leia `.claude/skills/_ARCHITECTURE-CONTRACT.md` — as regras cross-cutting (camadas, no-`any`, soft-delete, money math, testes, verificação) são **gate** e não se repetem aqui. Esta skill adiciona apenas o checklist específico de **Job / Seed**.

## Checklist obrigatório — Job / Seed

- [ ] **Idempotência:** re-rodar o job/seed **não duplica** nem corrompe. Operações de manutenção são reentrantes; seeds marcam e limpam antes de reinserir.
- [ ] **Seeds tagueiam os registros** — cada registro semeado leva `data.__demo = true`; no início, o seed apaga os `__demo` anteriores (`findMany` → filtra → `deleteMany`) antes de reinserir. Sem tag + cleanup, duplica a cada execução.
- [ ] **Cron/agendamento explícito** — se o job roda periodicamente, registrar a chamada/agendamento no boot (`server.ts`) com o intervalo documentado. Se é one-shot, declarar isso.
- [ ] **Logs de início e fim com métricas** — `logger.info('Job started', { job })` + `logger.info('Job completed', { affected: N })`; `try/catch` com `logger.error(msg, { context })` (string primeiro, contexto depois).
- [ ] **Prisma direto é aceitável em script de seed/job — mas documentar** que bypassa factory, schema-validation, rules/plugins e policy. Anotar no topo do arquivo o que está sendo contornado.
- [ ] **Guard de produção em seed:** `if (process.env.NODE_ENV === 'production') throw/return` no topo. Seed de volume é dev-only, standalone (nunca endpoint), escopado a um `userId` resolvido por `--email`.
- [ ] **Resolver tabelas/pais por `internalName`/`id`, nunca por `[0]`** — a API ordena `createdAt desc` e o `prisma.findMany` default difere; posição não é estável.
- [ ] **Cobrir a variabilidade que a view ramifica** (seed): múltiplos status/scores, **>1 registro-pai** (ex.: 2 pipelines) e datas passadas/futuras — é assim que se pega bug de view (colunas duplicadas de Kanban) escondido por dados happy-path.

## When to use

- Novo job de limpeza/manutenção periódico (ex: purge de registros deletados)
- Adicionando fixture de dados de desenvolvimento para novo módulo
- Agendando processamento em background

## Inputs

- `$ARGUMENTS[0]`: nome em PascalCase (ex: `PurgeExpiredProposals`)
- `$ARGUMENTS[1]`: `schedule` para background job, `seed` para fixture de dev

## Repository patterns to inspect first

```
server/src/jobs/PurgeDeletedRecords.ts                  ← background job (Prisma direto)
server/scripts/seed-crm-demo.js                         ← seed de VOLUME idempotente (Prisma direto)
my-app/features/dev/seed/                               ← seed fixtures via API (SeedService + módulos Seed*.ts)
server/src/lib/logger.ts
```

## ⭐ Exemplo de referência canônico (espelhe este arquivo)

`server/scripts/seed-crm-demo.js` — seed de volume perfeito em idempotência: cada registro leva `data.__demo = true`; no início, `clearDemo(tableId)` faz `findMany` → filtra `r.data.__demo === true` → `deleteMany` ANTES de reinserir (re-rodar nunca duplica). Cria a `DynamicTable` sob demanda quando o preset selecionável não está instalado (`ensureTable` com `internalName`/`category`/`schema`), resolve tabelas/pais por `internalName` (`getTable`), usa `createMany` para volume e `createRow` individual só quando precisa do `id` para FKs, e cobre a variabilidade que a view ramifica (leads espalhados por todas as etapas do pipeline, múltiplos status/scores, datas passadas/futuras). Cabeçalho documenta o bypass do rule engine. (Para background job periódico, espelhe `server/src/jobs/PurgeDeletedRecords.ts`.) Leia-o ANTES de gerar.

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
- **⚠️ Bypassa validação/policy — guard de produção OBRIGATÓRIO:** Prisma direto pula schema-validation, rules/plugins e policy checks. No **topo** do script, aborte fora de dev: `if (process.env.NODE_ENV === 'production') throw new Error('seed de volume é dev-only');`. Logue cada operação (tabela criada, N inserts) para auditoria. Mantenha-o como **script standalone** (nunca como endpoint) e escopado a um `userId` resolvido por `--email`, para não criar relações cross-user.

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
- Não deixe um job periódico sem agendamento registrado no boot — declarar o cron/intervalo, senão o job nunca roda
- Não use Prisma direto sem documentar o bypass — anote no topo que pula factory/validação/rules/policy (aceitável em seed/job, mas explícito)
- Não escreva seed de volume idempotente sem cleanup dos `__demo` anteriores — re-rodar tem que ser seguro; sem isso, duplica
