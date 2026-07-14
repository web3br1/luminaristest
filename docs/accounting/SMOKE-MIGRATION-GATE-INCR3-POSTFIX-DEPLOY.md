# SMOKE-MIGRATION-GATE-INCR3-POSTFIX — Relatório de Execução (dev.db real, pós-fix RISK-INCR3-MIGRATION-001)

- **Data:** 2026-07-14
- **Executado por:** Agente (gate solicitado após merge do PR #98 / commit `3adc0d7`)
- **Migration alvo:** `20260627150000_add_entry_numbering` — versão **corrigida** (dual-format + retry-safe + TZ UTC)
- **Base de dados:** cópia fiel do `dev.db` **real** + **replay** da migration corrigida sobre os **dados reais do Prisma** (datas INTEGER ms-epoch)
- **Resultado:** **PASS — DEPLOY-CLEARED.** A migration editada não afeta o banco vivo (`migrate deploy` no-op) e o backfill corrigido aplica limpo sobre dados reais do Prisma (o P3018 não reproduz mais).

Este gate re-executa o smoke sobre o dev.db real **depois** que o fix de `RISK-INCR3-MIGRATION-001`
foi editado na migration histórica (PR #98). A pergunta nova, específica deste fix: **editar uma
migration já aplicada (checksum mudou) quebra o banco vivo que gravou o checksum antigo?**

## Isolamento (regra dura: nunca tocar o dev.db real)

| Passo | Evidência |
|---|---|
| Localização | `server/prisma/prisma/dev.db` (resolvido pelo Prisma relativo a `schema.prisma`) |
| Fingerprint original | size=815.104, mtime=`2026-07-14 01:13:47.851812400 -0300`, md5=`4381e1daebbd6f8ad98efdbb7caa21fd` |
| Cópia | copiada para scratchpad isolado (`.../smoke-incr3-postfix/`); sem `-wal`/`-shm` pendentes |
| Verificação da cópia | md5 idêntico ao original (`4381e1da…`) |
| Toda migração/validação | rodou **só** em cópias (`DATABASE_URL=file:C:/…` Windows-style) |
| Prova de não-toque | md5+size+mtime do original **idênticos** antes e depois de todas as operações |

## Track A — deploy-readiness do banco vivo com a migration editada

O ponto crítico deste gate: a migration `20260627150000_add_entry_numbering` teve seu conteúdo
alterado pelo PR #98, mas já está finalizada em `_prisma_migrations` do banco vivo (aplicada no
recreate de 2026-07-01, com 0 linhas à época).

| Check | Resultado |
|---|---|
| `prisma migrate deploy` na cópia (com a migration corrigida na árvore) → **"No pending migrations to apply"** | **PASS** — `migrate deploy` NÃO re-verifica checksum de migration finalizada; bancos existentes são inertes ao edit |
| `PRAGMA integrity_check` | **PASS** (`ok`) |
| `PRAGMA foreign_key_check` | **PASS** (0 violações) |
| Contagens (User=2, accounts=41, journal_entries=15, postings=30, accounting_periods=36, audit_events=92, journal_entry_sequences=4, document_attachments=0) | conferidas |
| Invariantes INCR-3 no banco vivo: 0 `fiscalYear`/`entryNumber` NULL, 0 grupos duplicados `(escopo,fy,entryNumber)`, 0 sequences com `last < MAX(entryNumber)` | **PASS** |

## Track B — replay da migration CORRIGIDA sobre os dados REAIS do Prisma

O cenário que originalmente falhou com P3018 (backfill sobre dados escritos pelo Prisma), agora com
o fix: schema pré-INCR-3 fresh (13 migrations anteriores) + os **15 `journal_entries` reais**
extraídos do banco vivo (todas as datas confirmadas `typeof='integer'`, ms-epoch) + a migration
corrigida via `prisma db execute`.

| Check | Resultado |
|---|---|
| Backfill aplica sem P3018 (a classe original) | **PASS** — "Script executed successfully" |
| `integrity_check` / `foreign_key_check` do replay | **PASS** (`ok` / 0) |
| Numeração interna: 3 partições, todas **gapless 1..N**, 0 NULL, 0 duplicata | **PASS** |

### Cross-check replay × banco vivo: 8/15 iguais, 7/15 divergentes — **explicado, não escondido**

Todas as 7 divergências derivam de **um único registro legado**, `cmr2p8hn`
(data `2026-01-01T00:00:00Z`):

- **Banco vivo:** `fiscalYear=2025`, `#1` — valor gravado pela versão **pré-Emenda-3** do app
  (semântica `America/Sao_Paulo`: `2026-01-01T00:00:00Z` = 31/12/2025 21:00 BRT → ano 2025).
- **Replay (backfill corrigido, UTC):** `fiscalYear=2026`, `#1` — casa com
  `PostingService.fiscalYearFrom` atual (`getUTCFullYear`, ADR-INCR3 Emenda 3). Por ser a data
  mais antiga de 2026 no escopo `cmr2jf/cmr2jyirc…`, entra como `#1`, deslocando os outros 6
  entries do partição em +1 (`#1→#2` … `#6→#7`).

→ **1 mudança de `fiscalYear` + 6 cascatas de `entryNumber` = 7 divergências.** Não é defeito:
o backfill aplica a semântica UTC **canônica vigente**; num replay genuíno de dados pré-INCR-3
esses registros nunca tiveram `fiscalYear`/`entryNumber` — o backfill é a autoridade, e reproduzir
a semântica São Paulo já revertida é que estaria errado. O resultado do replay é internamente
consistente (gapless, sem NULL, sem duplicata).

## Veredicto

| Item | Veredicto |
|---|---|
| Editar migration histórica quebra o banco vivo? | **NÃO — PASS.** `migrate deploy` no-op comprovado na cópia fiel; integridade/FK verdes. |
| Backfill corrigido aplica sobre dados reais do Prisma? | **SIM — PASS.** P3018 não reproduz; numeração interna consistente. |
| `RISK-INCR3-MIGRATION-001` | **FECHADO e verificado no dev.db real.** |
| Deploy | **DEPLOY-CLEARED.** |

## Caso adversarial tentado

O replay Track B **é** o caso adversarial — a mesma classe (backfill sobre datas INTEGER ms-epoch
do Prisma) que reprovou o SQL original com P3018. Checagem que teria falhado se o fix estivesse
errado: se o dual-format não cobrisse INTEGER ms-epoch, o replay morreria no `NOT NULL fiscalYear`;
se a decisão de TZ fosse frouxa, o cross-check não teria uma explicação de causa única (o registro
legado pré-Emenda-3), e sim divergências espalhadas sem raiz. A divergência 7/15 está **documentada
e atribuída**, não suprimida.

## Viés próprio nomeado

- A fidelidade de `prisma db execute` como proxy de `migrate deploy` no Track B: ambos rodam SQLite
  com o mesmo SQL; a diferença (FK pragma / wrapping transacional) não afeta esta migration, que
  reconstrói a tabela pai — o próprio banco vivo foi historicamente reconstruído por `migrate deploy`.
- Não re-rodei a suíte Jest completa aqui (coberta pelo CI do PR #98: 980/980, tsc limpo); este gate
  é sobre o **dev.db real**, complementar aos testes.
