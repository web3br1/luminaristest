# SMOKE-MIGRATION-GATE — BE-INCR-9 (ReferentialMapping)

**Data:** 2026-07-09 · **Migração:** `20260709135422_add_referential_mapping` · **Resultado: PASS**

## Objetivo
Provar que a migração aditiva do INCR-9 (nova tabela `referential_mappings`) aplica limpa sobre o
`dev.db` **real populado** sem tocar em nenhum dado de ledger, e sem alterar o banco original (o gate
roda sobre um **backup**, nunca sobre o arquivo vivo — `accounting-incr1-db-risk`).

## Banco alvo
`server/prisma/prisma/dev.db` (667.648 bytes, 15 lançamentos) — o caminho-**chamariz** populado, não o
`server/prisma/dev.db` de 0 bytes (mesma classe do gotcha do INCR-8; escolhido pelo de maior tamanho).

## Método
1. md5 + mtime do db real ANTES.
2. `cp` para backup no scratchpad.
3. Fingerprint do backup ANTES: `SELECT userId,unitId,sourceType,sourceId,fiscalYear,entryNumber,status
   FROM journal_entries ORDER BY id`, canonicalizado e sha256.
4. `prisma migrate deploy` (migrations do worktree, incl. INCR-9) contra o backup.
5. Fingerprint do backup DEPOIS + contagem de `referential_mappings`.
6. md5 + mtime do db real DEPOIS (deve ser idêntico — prova de não-toque).

## Evidência
| Momento | entries | fingerprint (sha256) | referential_mappings |
|---|---|---|---|
| BEFORE (backup) | 15 | `78119c9bc42c5123e58ee73c94a3c00d51a87a66fb9f1fcc51941c2a81f7b0a6` | TABLE_ABSENT |
| AFTER (backup) | 15 | `78119c9bc42c5123e58ee73c94a3c00d51a87a66fb9f1fcc51941c2a81f7b0a6` | 0 (criada, vazia) |

- **Ledger intocado:** fingerprint BEFORE == AFTER (byte-idêntico), 15 → 15 lançamentos.
- **Tabela nova vazia:** `referential_mappings` = 0 linhas após a migração.
- **DB real intocado:** md5 `ca004c746587b398c764783392b35e5e` idêntico antes/depois; mtime
  `2026-07-02 09:55:02` inalterado; size 667.648 constante.
- Backup apagado no fim.

## Veredicto
**PASS — deploy-cleared** para a migração aditiva. Migração aplica limpa sobre dados reais, tabela nova
nasce vazia, nenhum lançamento alterado, `dev.db` original comprovadamente intocado.
