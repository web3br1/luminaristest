# ADR-INCR3 — Numeração sequencial gapless (Livro Diário)

- **Status:** Accepted with amendments (ratificado 2026-06-27) — as emendas §"Emendas obrigatórias" PREVALECEM
- **Date:** 2026-06-27
- **Decision class:** PRISMA_FIRST_CLASS — numeração **conservadora** gapless (ver Emenda 1)
- **Depends on:** módulo accounting em `main`; não toca PostingService para post/reverse
- **Plano:** `docs/accounting/PLANEJAMENTO-buildout-contabil.md` §3 INCR-3
- **Related:** ADR-INCR1 (fiscalYear futuro pode vir do período; `reversalPostingDate`)

## Context

`JournalEntry` não tem `entryNumber` hoje. Numeração sequencial gapless é a expectativa do
Livro Diário. Direção aprovada; **ratificação condicionada às 8 emendas.**

> **Fundamento (Emenda 1).** A obrigatoriedade *gapless* entra como **decisão conservadora de
> produto** para o Livro Diário, **não** como fundamento legal — até o ADR citar o item/campo
> normativo exato (manual ECD / CFC). A importância da numeração do Diário é sustentada pelas
> fontes; a exigência específica de "sem buracos" precisa de referência antes de virar
> fundamento legal.

## Decisão ratificada (com emendas)

| # | Questão | Decisão |
|---|---|---|
| Q1 | Gapless | **Tabela contadora transacional `JournalEntrySequence`** (upsert+increment na tx do post). `max()+1` rejeitado por **concorrência/custo**, não por definição. Fundamento = conservador (Emenda 1). |
| Q2 | Estorno | Consome número próprio da mesma sequência; descrição referencia `original.entryNumber/fiscalYear/id`. |
| Q3 | fiscalYear | Ano-civil BR no MVP, **derivado exclusivamente de `postingDate`** (data contábil), nunca `createdAt`/`documentClassDate`/`competenceDate`. Estorno: `fiscalYear = year(reversalPostingDate)`. |
| Q4 | Grão | `(userId, unitId, fiscalYear)`; ledger `DEFAULT` fora da chave. **Dívida registrada:** multi-diário/ledger exigirá nova partição. |
| Q5 | NOT NULL | `entryNumber/fiscalYear NOT NULL` **somente porque não existe Draft persistido** (Emenda 3). + backfill determinístico. |
| Q6 | Ordem do backfill | `ORDER BY userId, unitId, fiscalYear, **postingDate**, createdAt, id` (ordem contábil, não só técnica). |
| Q7 | Idempotência | **Resolução de idempotência (`sourceType,sourceId`) ANTES de `nextNumber`** — requisição duplicada **não** consome número. |
| Q8 | Atribuição | Número nasce **no fluxo transacional de postagem definitiva** (`Posted`), via método explícito (`createPostedEntry`/`assignEntryNumberForPost`), **não** num `create` genérico. |

## Emendas obrigatórias (bloqueantes)

1. Fundamento "legal gapless" → **"conservador gapless"** até citar a norma exata.
2. Número nasce na **postagem definitiva**, não em qualquer `create` (evita rascunho/staging/preview consumir número).
3. `NOT NULL` só vale se **Draft persistido realmente não existe** — declarar no ADR; se Draft voltar, INCR-3 é revisado (colunas nullable + invariante por status).
4. `fiscalYear` derivado de **`postingDate`** (data contábil), não `createdAt`/data ambígua.
5. Backfill ordenado por **`postingDate, createdAt, id`**.
6. **Idempotência antes de `nextNumber`** (duplicado não consome número → senão cria buraco).
7. **Lançamento numerado nunca é hard-deleted** (só estorno corrige; evitar `void` no MVP).
8. **Teste de concorrência real no SQLite na MESMA partição** `(userId,unitId,fiscalYear)`.

## Modelo ratificado

```prisma
model JournalEntry {
  // ... campos atuais
  fiscalYear  Int   // derivado de postingDate em scope.timeZone, no ato do post
  entryNumber Int
  // postingDate: campo de data contábil atual (hoje `date`); ver Emenda 4
  @@unique([userId, unitId, fiscalYear, entryNumber])
  @@index([userId, unitId, fiscalYear])
}

model JournalEntrySequence {
  userId     String
  unitId     String
  fiscalYear Int
  last       Int @default(0)
  updatedAt  DateTime @updatedAt
  @@id([userId, unitId, fiscalYear])   // identidade natural (não só @@unique)
  @@map("journal_entry_sequences")
}
```

`displayEntryNumber` (ex.: `"2026-000014"`) é **derivado** na API/UI, nunca fonte de verdade.
DTO de saída: `{ fiscalYear:number, entryNumber:number, displayEntryNumber:string }`.
`entryNumber` **nunca aceito do cliente**.

## Fluxo de atribuição (na tx do post definitivo)

```
runTransaction(tx):
  resolver idempotência (sourceType,sourceId)  // se duplicado → retorna existente, NÃO numera
  number = nextJournalEntryNumber(tx, scope, postingDate)  // upsert contador
  create JournalEntry { ...input, fiscalYear, entryNumber, status:'Posted' }
  create postings
// rollback → increment do contador também volta (gapless transacional)
```

## Backfill (migração)

1. Add `fiscalYear`/`entryNumber` nullable. 2. Calcular `fiscalYear` por `postingDate`.
3. Por partição `(userId,unitId,fiscalYear)` ordenar `postingDate,createdAt,id` → `entryNumber = row_number()`.
4. Seed `JournalEntrySequence.last = max(entryNumber)`. 5. Validar `count = max`, `min = 1`, sem dup/null.
6. `NOT NULL` + unique. **Validador pré-migração** + testar em cópia real (SQLite pode reconstruir tabela).

## Testes obrigatórios

- Concorrência: 50 posts simultâneos mesma partição → `1..50` sem buraco/dup; `last=50`; `count=50`.
- Rollback: `nextNumber` chamado → create falha → rollback → próximo post recebe o mesmo número.
- Idempotência: 2º post de `sourceA` → retorna existente, `last` inalterado (sem buraco).
- Estorno: original=10 → estorno=11; `reversedById`/`reversalOfId` ligados; descrição cita número original.
- Data/tz: `2026-01-01`→2026/1; `2026-12-31`→2026/12; mês nunca 0/13; fronteira `2026-12-31T23:00-03:00`→2026/12.
- Hard-delete de lançamento numerado → proibido.

## Checklist de ratificação (revisado)

- [ ] Q1 Gapless via contador transacional + referência normativa OU wording conservador
- [ ] Q2 Estorno consome número próprio
- [ ] Q3 fiscalYear ano-civil BR, derivado de `postingDate`
- [ ] Q4 Grão (userId,unitId,fiscalYear); dívida multi-diário registrada
- [ ] Q5 NOT NULL só se Draft persistido não existe
- [ ] Q6 Backfill ordenado por postingDate, createdAt, id
- [ ] Q7 Idempotência antes de `nextNumber`
- [ ] Q8 `nextNumber` na tx da postagem definitiva
- [ ] Q9 Rollback após `nextNumber` não consome número
- [ ] Q10 Posted numerado nunca hard-deleted
- [ ] Q11 Teste de concorrência SQLite real, mesma partição
- [ ] Q12 `JournalEntrySequence` usa `@@id([userId,unitId,fiscalYear])`
- [ ] Q13 `entryNumber` nunca aceito do cliente
- [ ] Q14 `displayEntryNumber` derivado, não fonte de verdade
