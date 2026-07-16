# Smoke-migration-gate — runbook para INCR-COUNTERPARTY (#119) e INCR-DIM-COMPLETENESS (#120)

Gate obrigatório (T12) antes de mergear/deployar as duas migrações. Ambos os scripts trabalham numa
**cópia** do seu `dev.db` **populado** — nunca tocam o original — e bypassam o `prisma migrate` (e o drift
pré-existente do `add_entry_numbering`) aplicando o `migration.sql` direto via `node:sqlite`.

Scripts: [`server/scripts/smoke-gate-incr-counterparty.mjs`](../../server/scripts/smoke-gate-incr-counterparty.mjs)
· [`server/scripts/smoke-gate-incr-dim-completeness.mjs`](../../server/scripts/smoke-gate-incr-dim-completeness.mjs)

## Pré-requisitos
- **Node ≥ 22.5** (usa `node:sqlite`, flag `--experimental-sqlite`). Confirmado em `v22.14`.
- As branches `claude/incr-counterparty-a1` e `claude/incr-dim-completeness-b1` **presentes localmente**
  (`git fetch origin`) — o script lê o `migration.sql` via `git show <branch>:...`, então **não** precisa
  estar com elas em checkout.
- Um **`dev.db` populado** com dados de AP/AR e plano de contas reais (escritos pelo app — fixtures via SQL
  não valem, memória `sintetico-nao-cobre-formato-de-dado-real`). ⚠ O `server/prisma/dev.db` deste repo está
  com **0 bytes**; aponte para o seu banco real.

## Como rodar (a partir da raiz do repo)
```bash
node --experimental-sqlite server/scripts/smoke-gate-incr-counterparty.mjs <caminho/do/dev.db>
node --experimental-sqlite server/scripts/smoke-gate-incr-dim-completeness.mjs <caminho/do/dev.db>
```
Cada script imprime PASS/FAIL por asserção, termina com **DEPLOY-CLEARED ✅** (exit 0) ou **FAIL ❌**
(exit 1), e deixa a cópia (`<dev.db>.smoke-*.db`) para inspeção. Rode os dois; ambos precisam passar.

## O que cada gate prova
**INCR-COUNTERPARTY (A1):** counterparties ausente antes → aplica → (A) payables/receivables preservados;
(B, SEC-A1-2) `#counterparties` por tipo == `#(userId,unitId,name)` distintos — dois tenants de mesmo nome
**não** colapsam; (C, SEC-A1-3) **zero FK cross-scope**; (D) cobertura total do backfill (zero
`counterpartyId` NULL — pré-requisito do futuro NOT NULL); (E) backfill **idempotente** (2ª execução = no-op,
sem P2002); (F) `PRAGMA foreign_key_check` limpo.

**INCR-DIM-COMPLETENESS (B1):** coluna ausente antes → aplica → (A) accounts preservados; (B) coluna
`requiresDimension` criada e **zero mudança de dado** (todo account nasce `false`); (C) grafo de FK intacto
(sem novas violações vs baseline — o ponto do `ALTER TABLE` vs table-rebuild); (C2) a FK RESTRICT
`referential_mappings.accountId → accounts` (a que o rebuild default quebrava, P2003) **preservada**.

## Nota sobre o drift do `dev.db`
Os scripts **não** disparam o drift porque aplicam o SQL na cópia via `node:sqlite`, fora do histórico do
Prisma. Mas para você **aplicar de verdade** as migrações no seu ambiente (fora do gate), resolva antes o
drift da migração `20260627150000_add_entry_numbering` — provavelmente `prisma migrate resolve --applied
20260627150000_add_entry_numbering` (se ela já está refletida no schema do banco) ou investigar a divergência.

## Validação dos próprios scripts
Rodados contra um `dev.db` sintético fiel ao schema (2 tenants "ACME", 1 linha cancelada, plano de contas +
`referential_mappings`): ambos **DEPLOY-CLEARED ✅**, com o dedupe por escopo e a idempotência exercidos de
verdade. Contra a sua base real, um FAIL aqui é um bloqueio de deploy legítimo — não ajuste o script para
passar; investigue o dado.
