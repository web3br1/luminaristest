# ADR-INCR7-UNMATCH — Read shape to make UNMATCH actionable

- **Status:** Accepted — plano aprovado por delegação do usuário (web3br1) em **2026-07-09** via sign-off do plano (governança §5). Amendment ao **ADR-INCR7** (não o supersede).
- **Date:** 2026-07-09
- **Decision class:** PRISMA_FIRST_CLASS (conciliação bancária; leitura de projeção sobre models próprios)
- **Depends on:** BE-INCR-7 (mergeado em `main`) + FE-INCR-7 (branch `claude/fe-incr-7-reconciliation-94e9ba`, não mergeada)
- **Related:** ADR-INCR7 D3 (linha↔posting, agregação), D5 (flip derivado), D7/ACC-018 (unmatch soft)
- **Parecer de domínio:** `luminaris-accounting-architect` (2026-07-09) — opção (a), unmatch por-match, FE refetch-driven.

---

## 1. Contexto (o gap)

O BE-INCR-7 entregou o write path completo do unmatch (`ReconciliationService.unmatch` → `softUnmatch` +
`recomputeEntryFlip` + audit in-tx) e o client FE (`accountingService.unmatch(matchId, unitId, reason)`). Mas
o unmatch ficou **inacionável**: o endpoint `POST /reconciliation/matches/:id/unmatch` exige um `matchId`, e
**nenhuma leitura serializava o matchId ativo de uma linha**. `findLinesByStatement` é um `findMany` cru de
`bankStatementLine` (sem `include` de matches) e não existe `GET /matches`. Por isso o FE-INCR-7 corretamente
**não** colocou botão de unmatch (seria dead code, Contrato §1).

## 2. Decisão

**Expor os matches ativos por linha na leitura existente (opção a), via método de repo de leitura dedicado.**

- **Repo:** novo `findLinesWithActiveMatches(scope, statementId, status?, tx?)` — mesmo `where`/ordenação de
  `findLinesByStatement`, mas com `include: { matches: { where: { unmatchedAt: null }, select: { id, postingId,
  matchType, posting: { select: { entry: { select: { id, date, description } } } } } } }`, mapeado para
  `activeMatches: ActiveMatchSummary[]` por linha. **`findLinesByStatement` fica intocado** (hot path de
  auto-match/import mantém a query enxuta).
- **Service:** `listLines` passa a chamar o método novo; `GET /statements/:id/lines` já devolve o resultado
  do service — **sem novo endpoint, sem mudança de controller/route/DTO de entrada**.
- **FE:** na `StatementRow` (sub-view "Extratos", linhas expandidas), coluna "Ações" com **um controle
  "Desfazer" por match ativo** da linha MATCHED → confirm → `accountingService.unmatch` → **refetch**
  (`loadLines` + `onLedgerChange`). Nada de mutação otimista.

### Rejeitado — opção (b): endpoint dedicado `GET /reconciliation/matches?lineId|entryId`
Exigiria DTO+Service+Controller+Route+wiring-3-toques+i18n + fetch(N+1) no FE. Maior blast-radius e uma 2ª
porta de leitura para um estado que a porta existente já deveria carregar — contra o princípio de
menor-superfície do ADR-INCR7 D1.

## 3. Invariantes & riscos (parecer de domínio)

- **Zero invariante de ledger tocado.** É projeção de leitura pura; D5/D7 seguem 100% no service.
- **Tenancy (OK):** o `where` da linha carrega `accountingScopeWhere(scope)`; os matches incluídos filtram
  `unmatchedAt: null` e herdam `userId/unitId` da linha — sem reabrir escopo. Provado por teste de integração
  em SQLite real (`ReconciliationRepository.activeMatches.integration.test.ts`): outro `unitId` → `[]`.
- **As-of (ACC-021):** `activeMatches` é fotografia. Entre o read e o clique, o match pode já ter sido desfeito
  por outra sessão. **O backend fecha o TOCTOU** (`softUnmatch` condicional + `unmatch` rejeita match já
  desfeito, ACC-011). Por isso o **FE trata erro de corrida como benigno → refetch**, nunca mutação otimista
  nem falha dura.
- **Granularidade por-match, na linha MATCHED (não no JournalEntriesPanel):** o vínculo é linha↔posting (D3);
  "desfazer a linha inteira" seria comando composto que o backend não oferece atomicamente. Caso comum = 1
  match → 1 botão; agregação (N postings↔1 linha) → N controles rotulados pela entry. A linha volta a
  UNMATCHED só quando o último match cai (já implementado no service). O flip-back Reconciled→Posted aparece
  **passivamente** no badge do JournalEntriesPanel no próximo fetch.

## 4. Consequências

- Sem migração/schema (`include`/`select`) → **não** dispara smoke-migration-gate.
- BE aditivo/backward-compatible: pode ir a `main` independentemente do merge do FE-INCR-7.
- Fora de escopo: split 1 posting↔N linhas (herdado do ADR-INCR7); unmatch no painel de lançamentos.
