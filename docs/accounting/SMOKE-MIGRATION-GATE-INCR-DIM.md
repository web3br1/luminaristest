# Smoke-migration-gate — INCR-DIM (Dimensões) · DEPLOY-CLEARED

**Data:** 2026-07-15 · **Migração:** `20260715050056_add_dimensions_cost_center_project` (aditiva:
3 `CREATE TABLE` + índices, **zero `ALTER`/`DROP`** — confirmado por inspeção do `migration.sql`; a
única referência a `postings` é a FK de `posting_dimensions`, não um `ALTER`). **Gate:** T12 — "aditiva
não dispensa o gate", sobre base populada por **dados escritos pelo app** (memória
`sintetico-nao-cobre-formato-de-dado-real`).

## Procedimento

Como a migração **não toca `journal_entries`/`postings`** (nó quente), o risco de dado é estruturalmente
nulo; o gate prova isso empiricamente:

1. DB temporário deployado à **estado PRE-DIM** (migração DIM movida para fora → `migrate deploy` aplica
   toda a cadeia ATÉ AR/aprovação, exclusivo da DIM).
2. **Seed via o cliente Prisma gerado** (formato real do app — datas `INTEGER` ms-epoch, não SQL-TEXT):
   1 user, 2 contas, **3 `JournalEntry` `Posted` + 6 `Posting`** com `sourceId` de idempotência.
3. Captura do estado BEFORE (contagens, fingerprint de idempotência `userId|unitId|sourceType|sourceId`,
   DDL de `postings` e `journal_entries` de `sqlite_master`).
4. Migração DIM restaurada → `migrate deploy` aplica **só a DIM**.
5. Captura AFTER + asserções.

## Resultado — PASS ✅ DEPLOY-CLEARED

| Checagem | Resultado |
|---|---|
| `migrate deploy` da DIM sobre base populada | **PASS** — "Applying migration …add_dimensions…", "All migrations successfully applied", exit 0 |
| `journal_entries` preservados | **3 → 3** (inalterado) |
| `postings` preservados | **6 → 6** (inalterado) |
| Fingerprint de idempotência (`sourceType+sourceId`) | **byte-idêntico** antes/depois (3 chaves) |
| DDL de `postings` | **UNCHANGED** (byte-idêntico — prova do zero-`ALTER`: a relação `dimensions` é virtual, a FK vive em `posting_dimensions`) |
| DDL de `journal_entries` | **UNCHANGED** |
| `dimension_definitions` / `dimension_values` / `posting_dimensions` (tabelas novas) | **criadas, 0 linhas cada** (aditivas, vazias) |

## Notas

- **Zero semeadura na migração:** nenhum eixo/valor de dimensão é semeado — o catálogo é 100% criado em
  runtime pelo usuário via `DimensionService` (não há fixture de dimensão). Diferente de contas de
  controle (AP `2.1.2`/AR `1.1.5`), uma dimensão não tem código canônico a garantir.
- **Ortogonalidade (ACC-024) provada em teste de DB real** (`PostingDimension.integration.test.ts`):
  etiquetar uma partida NÃO altera `groupByAccount` (o balancete agregado é byte-idêntico com/sem
  etiqueta) — a etiqueta nunca entra na soma de dinheiro.
- **ACC-025 backstop provado no DB:** `@@unique([postingId, definitionId])` rejeita um 2º valor do mesmo
  eixo na mesma partida com `P2002` (mesmo teste de integração).
- Bancos existentes são **inertes** à adição de 3 tabelas vazias; o reflexo de re-rodar o gate para
  migrações que tocam `journal_entries` (§5.1) **não se aplica** aqui (nenhum toque), mas o gate foi
  rodado mesmo assim por disciplina T12.
