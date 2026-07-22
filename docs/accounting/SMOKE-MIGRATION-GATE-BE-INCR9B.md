# SMOKE-MIGRATION-GATE — BE-INCR-9B (Track B: catálogo referencial RFB)

**Resultado: PASS.** Data: 2026-07-11. Contra o `main` pós-merge do #74 (`3c5a33d`).

Valida que aplicar as migrações pendentes sobre o `dev.db` **real populado** não corrompe o ledger e cria a
tabela nova `referential_accounts` vazia — sem tocar o arquivo original.

## Alvo

- **DB real:** `server/prisma/prisma/dev.db` (667 KB, populado). NB: `DATABASE_URL=file:./prisma/dev.db`
  resolve **relativo ao schema** (`server/prisma/`), logo o ledger vive em `server/prisma/prisma/dev.db`
  (duplo `prisma/`). O `server/prisma/dev.db` de 0 byte é decoy — não é o alvo.
- **Migração roda numa CÓPIA** no scratchpad, nunca no original (disciplina do projeto).
- **Estado inicial da cópia:** 4 migrações **atrás** do schema (última aplicada
  `20260701053452_add_accounting_data_exchange`). O `migrate deploy` aplicou a cadeia pendente inteira —
  INCR-7 (bank recon), INCR-8 (source-doc provenance), INCR-9 (referential mapping) **e o Track B**
  (`20260710120000_add_referential_account_catalog`). Ou seja: smoke mais forte que só o Track B.

## Prova de original intocado

| | md5 |
|---|---|
| REAL antes | `ca004c746587b398c764783392b35e5e` |
| REAL depois | `ca004c746587b398c764783392b35e5e` **(idêntico)** |
| Cópia antes | `ca004c746587b398c764783392b35e5e` |
| Cópia depois | `31c626acaee14240a4d44947b0821c40` **(mudou — migração escreveu só aqui)** |

## Fingerprint do ledger — PRÉ == PÓS (todas idênticas)

`accounts 41 · journal_entries 15 · postings 30 · audit_events 92 · audit_chain_heads 3 ·
accounting_periods 36 · accounting_period_transitions 9 · accounting_data_exchange_jobs 41 ·
accounting_data_exchange_rows 67 · journal_entry_sequences 4 · User 2 · dynamic_tables 13 ·
dynamic_table_data 6 · DashboardLayout 1` — nenhuma linha existente alterada.

## Tabelas novas — presentes e VAZIAS

- **`referential_accounts` = 0** (alvo do Track B) ✓
- `referential_mappings` 0 (INCR-9); `source_documents` 0, `journal_entry_sources` 0 (INCR-8);
  `bank_statements` 0, `bank_statement_lines` 0, `reconciliation_matches` 0 (INCR-7).

## Deltas

- Tabelas: 27 → 34 (+7). Migrações aplicadas: 16 → 20 (+4, incl. `20260710120000_add_referential_account_catalog`).
- A migração do Track B é `CREATE TABLE` + índices puro (zero ALTER em tabela existente) — consistente com D4.

## Método (reprodutível)

1. `md5sum` do real (baseline) + `cp` para o scratchpad.
2. Snapshot PRÉ via `node --experimental-sqlite` (node:sqlite nativo, read-only) — tabelas + counts + migrações.
3. `DATABASE_URL="file:<abs-cópia>" npx prisma migrate deploy` (do worktree com as migrations; **não** usa o
   client gerado).
4. Snapshot PÓS + `md5sum` do real (prova imutável) e da cópia (prova que mudou).

## Veredicto

**DEPLOY-CLEARED.** A cadeia pendente (incl. Track B) aplica limpa sobre dados reais, preserva o ledger
byte-a-byte e cria `referential_accounts` vazia. Residual não-migratório: Fork 2 (validação analytic-only só
fica viva quando o contador importar o arquivo oficial "PJ em Geral").
