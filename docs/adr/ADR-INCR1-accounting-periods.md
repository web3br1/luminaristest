# ADR-INCR1 — Períodos Contábeis + Gate de Fechamento

- **Status:** Accepted with amendments (ratificado 2026-06-27) — as emendas §"Emendas obrigatórias" PREVALECEM
- **Date:** 2026-06-27
- **Decision class:** PRISMA_FIRST_CLASS (entidade com invariante regulatório)
- **Depends on:** módulo accounting first-class (Account/JournalEntry/Posting) em `main`
- **Plano:** `docs/accounting/PLANEJAMENTO-buildout-contabil.md` §3 INCR-1
- **Related:** ADR-INCR2 (auditoria de período), ADR-INCR3 (fiscalYear/postingDate)

## Context

Não existe noção de período contábil hoje (zero `AccountingPeriod`/`periodId`). Sem isso não
há como barrar lançamento retroativo nem fechar mês. O gate vive em `PostingService` (único
caminho de mutação do ledger — cobre manual + sync + bridges). Direção aprovada;
**ratificação condicionada às 8 emendas obrigatórias abaixo.**

## Decisão ratificada (com emendas)

| # | Questão | Decisão |
|---|---|---|
| Q1 | Período ausente | **Bloqueia** como `ACCOUNTING_PERIOD_NOT_OPEN`. O post **não semeia** período (sem side-effect). Seed de períodos `FUTURE` só em setup/onboarding/admin. |
| Q2 | SOFT vs HARD_CLOSED | Diferem **só em reabertura**. **No INCR-1, `SOFT_CLOSED` NÃO permite posting de ajuste** — ambos bloqueiam post igualmente (documentado para não confundir). |
| Q3 | Estorno | Gated pelo **período da data do estorno**. `reverseEntry` **recebe `reversalPostingDate` explícito** (UI defaulta para hoje no tz do scope; service nunca usa `original.postingDate`). |
| Q4 | Reconcile/bridge | Skip+log **apenas para `ACCOUNTING_PERIOD_NOT_OPEN`** (erro específico, não `ValidationError` genérico). Demais erros contábeis continuam fatais. Skip registrado no relatório de reconcile. |
| Q5 | Granularidade | `year + month (1..12)` civil, sem 13º período nem offset no MVP. |
| Q6 | Gate | **Dois níveis no `PostingService`**: preflight fora da tx (erro rápido) + **gate autoritativo DENTRO da tx**, imediatamente antes de marcar `Posted`/alocar entryNumber. Gate em controller proibido. |
| Q7 | Histórico de transição | **`AccountingPeriodTransition` entra no INCR-1** (histórico funcional do domínio, distinto do `AuditEvent` do INCR-2). |
| Q8 | status | **Enum Prisma `AccountingPeriodStatus`** (não String). |

## Emendas obrigatórias (bloqueantes)

1. **Gate autoritativo dentro da transação.** A `@@unique([userId,unitId,year,month])` fecha
   duplicidade de período, **não** o TOCTOU "valido OPEN → admin fecha → posto mesmo assim".
   O check definitivo roda na MESMA tx que grava postings/status/entryNumber, antes do `Posted`.
2. **Erro específico `ACCOUNTING_PERIOD_NOT_OPEN`** (subclasse/`code`), nunca `ValidationError`
   genérico. Bridge/job só dá skip quando `error.code === 'ACCOUNTING_PERIOD_NOT_OPEN'`.
3. **Bridge não captura `ValidationError` genérico** — conta inexistente, desbalanceado,
   conta sintética, dimensão ausente etc. continuam falha real do job.
4. **Período ausente bloqueia, não é semeado pelo post.** Seed só em setup/onboarding/admin/tela de períodos.
5. **`AccountingPeriodTransition` no INCR-1** — histórico de múltiplas transições não cabe em
   `openedAt/closedAt` na própria linha.
6. **`SOFT_CLOSED` sem ajuste no INCR-1** — explicitar no ADR para futuros devs.
7. **`reverseEntry` recebe `reversalPostingDate`** — nunca derivar do original.
8. **`status` como enum Prisma** + validação `month 1..12` em service/schema + testes (`month=0`, `month=13`).

## Modelo ratificado

```prisma
enum AccountingPeriodStatus { FUTURE OPEN SOFT_CLOSED HARD_CLOSED }

model AccountingPeriod {
  id        String @id @default(cuid())
  userId    String
  unitId    String
  year      Int
  month     Int
  status    AccountingPeriodStatus @default(FUTURE)
  openedAt    DateTime?
  openedById  String?
  closedAt    DateTime?
  closedById  String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  transitions AccountingPeriodTransition[]
  @@unique([userId, unitId, year, month])
  @@index([userId, unitId, status])
  @@index([userId, unitId, year])
  @@map("accounting_periods")
}

model AccountingPeriodTransition {
  id         String  @id @default(cuid())
  userId     String
  unitId     String
  periodId   String
  fromStatus AccountingPeriodStatus?   // nullable só na criação inicial
  toStatus   AccountingPeriodStatus
  actorUserId String
  reason     String?
  occurredAt DateTime @default(now())
  period AccountingPeriod @relation(fields: [periodId], references: [id], onDelete: Cascade)
  @@index([userId, unitId, periodId])
  @@index([actorUserId, occurredAt])
  @@map("accounting_period_transitions")
}
```

Período **derivado da data** em `scope.timeZone`; **sem** FK `periodId` em JournalEntry.
Datas contábeis tratadas como date-only (`YYYY-MM-DD`) sempre que possível.

## Máquina de estados + gate

```
FUTURE → OPEN (open) · OPEN → SOFT_CLOSED (softClose) · SOFT_CLOSED → OPEN (reopen)
OPEN → HARD_CLOSED (hardClose) · SOFT_CLOSED → HARD_CLOSED (hardClose) · HARD_CLOSED = terminal
canPost(status) === (status === 'OPEN')
```

API: `GET /accounting/:unitId/periods?year=` · `POST .../periods/seed-year` (cria `FUTURE`) ·
`POST .../periods/:id/open|soft-close|hard-close|reopen` (cada um com `reason`).

## Testes obrigatórios

- Gate: `MISSING/FUTURE/SOFT_CLOSED/HARD_CLOSED` → bloqueia; `OPEN` → permite.
- Transições legais/ilegais (HARD reopen bloqueado).
- Estorno: original HARD_CLOSED + estorno OPEN → permitido; estorno em SOFT/HARD/FUTURE → bloqueado; `reverseEntry` não usa `postingDate` original.
- Bridge: `ACCOUNTING_PERIOD_NOT_OPEN` → skip+log (no relatório); `ACCOUNT_NOT_FOUND`/`UNBALANCED_ENTRY` → falha real; HARD_CLOSED não entra em retry-loop.
- Data/tz: `2026-12-31` → 2026/12; mês nunca 0/13; fronteira `2026-12-31T23:00-03:00` → 2026/12.
- TOCTOU (nível de serviço): período fecha antes do commit → post falha.

## Checklist de ratificação (revisado)

- [ ] Q1 Período ausente bloqueia; seed só em setup/admin, não no post
- [ ] Q2 SOFT/HARD só diferem em reabertura; SOFT sem ajuste no MVP
- [ ] Q3 Estorno gated no período do estorno; `reverseEntry` recebe `reversalPostingDate`
- [ ] Q4 Reconcile skip+log só para `ACCOUNTING_PERIOD_NOT_OPEN`, com registro no relatório
- [ ] Q5 Granularidade year+month civil, sem 13º período
- [ ] Q6 Gate: preflight + autoritativo dentro da transação
- [ ] Q7 `AccountingPeriodTransition` no INCR-1
- [ ] Q8 `status` enum Prisma
- [ ] Q9 Validação month 1..12 em service/schema + teste
- [ ] Q10 Onboarding abre explicitamente o mês corrente como OPEN
