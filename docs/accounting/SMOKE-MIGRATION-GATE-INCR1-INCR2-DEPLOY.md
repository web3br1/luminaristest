# SMOKE-MIGRATION-GATE-INCR1-INCR2-DEPLOY — Relatório de Execução (dev.db real + replay populado)

- **Data:** 2026-07-14
- **Executado por:** Agente (Task 7 — smoke-migration-gate + deploy-readiness sweep)
- **Migrations alvo:** `20260627132450_add_accounting_periods` (INCR-1) e `20260627140124_add_audit_events` (INCR-2) — os dois increments **HELD** (`RISK-INCR1-DB-001`, `SMOKE-MIGRATION-GATE-001`)
- **Base de dados:** cópia do `dev.db` **real** (815.104 bytes) + **replay** sobre banco pré-INCR-1 populado com os **dados reais**
- **Resultado:** **PASS para INCR-1 e INCR-2** (os dois riscos nomeados fecham) — com **1 achado real em outra migration** (INCR-3, ver §Achados)

O gate original `SMOKE-MIGRATION-GATE-001.md` (2026-06-27) validou INCR-1/INCR-2 sobre banco
**sintético** (dados inseridos via SQL). O que faltava — e é o que este gate executa — é a
migração sobre **dados reais escritos pelo Prisma**. A diferença não é cosmética: foi exatamente
ela que expôs o achado do §Achados (datas TEXT no sintético × INTEGER ms-epoch no real).

## Isolamento (regra dura: nunca tocar o dev.db real)

| Passo | Evidência |
|---|---|
| Localização do banco real | `server/.env` → `DATABASE_URL=file:./prisma/dev.db`, resolvido pelo Prisma (relativo a `prisma/schema.prisma`) para `server/prisma/prisma/dev.db` |
| Cópia | `dev.db` (815.104 bytes; sem `-wal`/`-shm` pendentes) copiado para scratchpad isolado (`.../scratchpad/smoke-task7/`) |
| Verificação da cópia | `md5sum` idêntico entre original e cópia (`4381e1daebbd6f8ad98efdbb7caa21fd`) |
| Toda migração/validação | rodou **só** em cópias (`DATABASE_URL=file:C:/...` Windows-style, nunca `file:/c/...`) |
| Prova de não-toque no original | `md5sum` (`4381e1da...`) + size (815.104) + mtime (`2026-07-14 01:13:47`) **idênticos** antes e depois de toda a operação |

## Track A — deploy-readiness do banco vivo (cópia fiel, 20/20 migrations)

O `dev.db` real já contém as 20 migrations da `main` (`_prisma_migrations`: 20 finalizadas).
Histórico real decodificado (`finished_at` ms-epoch): migrations **1–16 aplicadas em lote no
recreate de 2026-07-01** (banco fresh à época) e **17–20 aplicadas em 2026-07-13 sobre o banco
já populado** (`migrate deploy` incremental real).

| Check | Resultado |
|---|---|
| `prisma migrate deploy` na cópia → **"No pending migrations to apply"** (deploy da `main` atual é no-op no banco vivo) | PASS |
| `PRAGMA integrity_check` | PASS (`ok`) |
| `PRAGMA foreign_key_check` | PASS (0 violações) |
| Contagens (User=2, accounts=41, journal_entries=15, postings=30, accounting_periods=36, audit_events=92, jobs=41/rows=67) | conferidas, inalteradas |
| **Re-verificação do hash-chain de AuditEvent** — algoritmo de `audit/auditCanonical.ts` (tupla `audit.v1`, sha256, genesis `0`×64) re-implementado externamente sobre a cópia: 3 escopos × (seq sem gap + continuidade prevHash + hash recomputado == armazenado + head `headHash`/`nextSeq`) | **PASS — 92/92 eventos, 3/3 chains OK, 0 eventos órfãos de head** |
| **BP com A=P** (Posted/Reconciled; naturezas assinadas): 3 escopos, `Ativo == Passivo + PL + Resultado` | **PASS — 3/3 escopos** (ex.: 821300 == 821300) |
| ΣDébito == ΣCrédito global por escopo e por lançamento (0 entries desbalanceados) | PASS |

## Track B — replay: migrations 12–20 sobre banco pré-INCR-1 **populado com dados reais**

Cenário que o `RISK-INCR1-DB-001` pede e que nunca tinha rodado: um banco no schema pré-INCR-1
(migrations 1–11 via `migrate deploy`) **carregado com os dados reais** do dev.db (interseção de
colunas por tabela: User=2, accounts=41, journal_entries=15 — shape 11-colunas da época —,
postings=30, dynamic_tables=13, dynamic_table_data=6; 108 linhas; `foreign_key_check`=0), e então
`migrate deploy` das 9 migrations restantes.

| Migration | Resultado sobre banco populado |
|---|---|
| `20260627132450_add_accounting_periods` (**INCR-1**) | **PASS** — aplicou limpa |
| `20260627140124_add_audit_events` (**INCR-2**) | **PASS** — aplicou limpa |
| `20260627150000_add_entry_numbering` (INCR-3) | **FAIL — P3018** (ver §Achados; recuperada via `migrate resolve` + SQL corrigido) |
| `20260701014733` … `20260710120000` (INCR-5, 6, 7, 8, 9, 9B — 6 migrations) | **PASS** — todas aplicaram limpas após a recuperação |

Pós-estado do replay: `integrity_check=ok`, `foreign_key_check=0`, contagens **preservadas**
(2/41/15/30/13/6/1), 20/20 migrations finalizadas, 13/13 tabelas novas presentes
(`accounting_periods`, `audit_events`, `audit_chain_heads`, `journal_entry_sequences`,
`document_attachments`, data-exchange, bank-reconciliation ×3, source-provenance ×2,
referential ×2).

## Achados

### RISK-INCR3-MIGRATION-001 — backfill de `20260627150000_add_entry_numbering` quebra em banco populado (NOVO, latente, não bloqueia este deploy)

1. **Crash (grau: verificado por execução).** O backfill computa
   `CAST(strftime('%Y', "date") AS INTEGER)`, mas o Prisma grava `DateTime` no SQLite como
   **INTEGER ms-epoch** (verificado: `typeof(date)='integer'`, ex. `1780272000000`). `strftime`
   sobre número cru interpreta **Julian Day** → fora de faixa → `NULL` →
   `NOT NULL constraint failed: journal_entries_new.fiscalYear` (**P3018**). O gate sintético de
   2026-06-27 passou porque inseriu os dados via SQL com datas TEXT — a classe só aparece com
   dados escritos pelo Prisma.
2. **Não re-executável após falha (grau: verificado).** A falha deixa `journal_entries_new` e
   `journal_entry_sequences` para trás; o retry morre em `CREATE TABLE` (sem `IF NOT EXISTS`
   na Phase 2), contrariando o próprio comentário de recuperação da migration.
3. **Semântica de TZ divergente do app (grau: verificado por cross-check).** Mesmo corrigido o
   crash, o backfill (UTC) diverge do app (`America/Sao_Paulo`): no cross-check replay×real,
   1 entry real tem `fiscalYear=2025` (atribuído pelo app em SP) que o backfill UTC marcaria
   `2026`, cascateando off-by-one no `entryNumber` da partição (7/15 divergentes no total).
4. **Severidade / por que não bloqueia:** a migration já está aplicada no único banco vivo
   (aplicada no recreate de 2026-07-01, com 0 linhas) e em qualquer fresh-install ela roda sobre
   tabela vazia — o cenário de falha exige um banco populado **pré-INCR-3**, que hoje não existe.
   É risco **latente de classe** (qualquer banco futuro de cliente que precise replay do
   histórico), não um bloqueio do deploy atual.
5. **Correção validada (scratchpad, não commitada):** expressão dual-format
   `CASE WHEN typeof("date")='integer' THEN strftime('%Y', datetime("date"/1000.0,'unixepoch')) ELSE strftime('%Y',"date") END`
   — aplicada manualmente via caminho documentado de produção (`migrate resolve --rolled-back` →
   SQL corrigido → `migrate resolve --applied`); as 6 migrations seguintes aplicaram limpas.
   Fix no repo fica como follow-up próprio (mexer em migration histórica pede review).

## Veredicto por increment

| Increment / risco | Veredicto |
|---|---|
| **INCR-1** (períodos) — `RISK-INCR1-DB-001` | **FECHADO — PASS.** Migration aplicada limpa sobre banco populado com dados reais (Track B) + banco vivo íntegro com a migration a bordo (Track A). |
| **INCR-2** (audit hash-chain) — `SMOKE-MIGRATION-GATE-001` (pendência "existing DB") | **FECHADO — PASS.** Migration aplicada limpa sobre banco populado (Track B) + hash-chain re-verificado 92/92 no banco vivo (Track A). |
| Deploy-readiness sweep (main → banco vivo) | **DEPLOY-CLEARED.** `migrate deploy` é no-op comprovado; integridade, chain e A=P verdes. |
| INCR-3 (entry numbering) | Já aplicada no banco vivo (sem re-execução possível); **novo risco latente nomeado** `RISK-INCR3-MIGRATION-001` (backfill não é replay-safe) — follow-up próprio. |

## Caso adversarial tentado

O replay Track B **é** o caso adversarial (migração DDL table-rebuild sobre dados reais que o
gate sintético não cobria) — e ele **falhou de verdade** numa migration fora dos dois alvos,
provando que a checagem tinha poder de reprovação. Checagem que teria falhado se eu estivesse
errado: o cross-check por-id `fiscalYear/entryNumber` replay×real (8/15 — a divergência está
explicada e documentada acima, não escondida).
