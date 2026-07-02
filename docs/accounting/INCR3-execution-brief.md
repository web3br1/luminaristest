# INCR-3 — Execution Brief: Numeração Sequencial do Livro Diário

- **Status:** AUTHORIZED (2026-06-27, após SMOKE-MIGRATION-GATE-001 PASS)
- **ADR:** `docs/adr/ADR-INCR3-entry-numbering.md` (ratificado com 8 emendas — PREVALECEM)
- **Depende de:** INCR-1 (`ea562e0`) + INCR-2 (`306f790`) em `main`

---

## Premissas invioláveis (emendas do ADR)

1. **"Conservador gapless"** — não "legal gapless"; sem citação normativa exata ainda.
2. **Número nasce na postagem definitiva** — `createPostedEntry`/`assignEntryNumberForPost`, nunca em `create` genérico. Draft não existe; se voltar, INCR-3 é revisado.
3. **fiscalYear = year(postingDate)** em America/Sao_Paulo — nunca `createdAt` nem campo ambíguo.
4. **Idempotência ANTES de `nextNumber`** — duplicado (mesmo `sourceType+sourceId`) retorna existente sem consumir número.
5. **Rollback após `nextNumber` não consome número** — atomicidade transacional.
6. **Lançamento numerado nunca é hard-deleted** — apenas estorno corrige.
7. **Backfill ordenado por `postingDate, createdAt, id`** por partição `(userId, unitId, fiscalYear)`.
8. **Teste de concorrência SQLite real** na mesma partição `(userId, unitId, fiscalYear)`.

---

## Schema (modelo ratificado)

```prisma
model JournalEntry {
  // campos atuais mantidos
  fiscalYear  Int
  entryNumber Int
  @@unique([userId, unitId, fiscalYear, entryNumber])
  @@index([userId, unitId, fiscalYear])
}

model JournalEntrySequence {
  userId     String
  unitId     String
  fiscalYear Int
  last       Int      @default(0)
  updatedAt  DateTime @updatedAt
  @@id([userId, unitId, fiscalYear])
  @@map("journal_entry_sequences")
}
```

`displayEntryNumber` (ex.: `"2026-000014"`) é derivado na API/UI — nunca fonte de verdade.

---

## Fluxo de atribuição (na tx do post definitivo)

```
runTransaction(tx):
  1. resolver idempotência (sourceType, sourceId)  → se duplicado, retorna existente
  2. fiscalYear = year(postingDate, 'America/Sao_Paulo')
  3. number = nextJournalEntryNumber(tx, scope, fiscalYear)  // upsert contador
  4. create JournalEntry { ...input, fiscalYear, entryNumber: number, status: 'Posted' }
  5. create Postings
  // rollback total → incremento do contador também desfaz
```

---

## Backfill (dentro da migration)

1. Adicionar `fiscalYear Int` e `entryNumber Int` nullable
2. Calcular `fiscalYear = CAST(strftime('%Y', date) AS INTEGER)` por linha
3. Por partição `(userId, unitId, fiscalYear)` ordenar `postingDate (date), createdAt, id` → `row_number()`
4. Seed `JournalEntrySequence.last = max(entryNumber)` por partição
5. Validar: `count = max(entryNumber)`, `min = 1`, sem dup, sem null
6. Tornar `NOT NULL` + adicionar unique constraint

---

## Ordem de implementação

```
1. Migration: fiscalYear/entryNumber nullable + backfill + NOT NULL + unique
2. Model JournalEntrySequence no schema.prisma
3. IPostingRepository: createPostedEntry (assinatura inclui entryNumber/fiscalYear)
4. PostingRepository: implementação com nextJournalEntryNumber (upsert+increment)
5. PostingService: integrar assignEntryNumberForPost no fluxo de post definitivo
   - idempotência ANTES do número
   - fiscalYear derivado de postingDate
6. PostingService: reverseEntry consome número próprio (mesma sequência)
7. Bloquear hard-delete de lançamentos numerados (guard no repository ou policy)
8. Testes unitários (mock do contador)
9. Integration test SQLite real concorrente (mesma partição)
10. tsc server + tsc my-app
11. full jest suite
12. Reviewer independente (worktree isolado)
```

---

## Testes obrigatórios

| Cenário | Critério |
|---|---|
| Concorrência: 50 posts simultâneos mesma partição | `1..50` sem buraco/dup; `last=50`; `count=50` |
| Rollback pós-`nextNumber` | create falha → rollback → próximo post recebe mesmo número |
| Idempotência | 2º post do mesmo `sourceId` → existente retornado; `last` inalterado |
| Estorno | original=10 → estorno=11; `reversedById`/`reversalOfId` ligados |
| fiscalYear/data | `postingDate='2026-12-31'`→2026; fronteira `23:00 -03:00`→2026 |
| Hard-delete numerado | proibido — erro claro retornado |

---

## Checklist de aceite (mínimo)

- [ ] `entryNumber`/`fiscalYear` preenchidos em todos lançamentos existentes via backfill
- [ ] Backfill ordenado por `postingDate, createdAt, id`
- [ ] `JournalEntrySequence.last = max(entryNumber)` por partição após backfill
- [ ] `@@unique([userId, unitId, fiscalYear, entryNumber])`
- [ ] `@@id([userId, unitId, fiscalYear])` em `JournalEntrySequence`
- [ ] Idempotência antes de `nextNumber`
- [ ] Rollback após `nextNumber` não consome número
- [ ] Estorno recebe próximo número
- [ ] `fiscalYear` derivado de `postingDate` em America/Sao_Paulo
- [ ] Teste concorrente SQLite real na mesma partição
- [ ] Lançamento numerado não é hard-deleted
- [ ] `tsc server` limpo
- [ ] `tsc my-app` limpo
- [ ] `jest` verde (suite completa)
- [ ] Reviewer independente PASS
