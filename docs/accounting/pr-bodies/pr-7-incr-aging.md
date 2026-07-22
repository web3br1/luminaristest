## Título
`feat(accounting): INCR-AGING — aging/posição por contraparte (AP+AR), read-only`

## Corpo

### Resumo
Relatório de **aging** (posição por contraparte × faixa de vencimento) para as subrazões AP e AR — o follow-on que o INCR-COUNTERPARTY (A1) foi construído para habilitar (`dueDate // aging is a later increment — F3`). **Read-only, ZERO migração.** Ratificado em `ADR-INCR-AP-AR-AGING` (F-AG0 por sinal humano; F-AG1..4 por delegação → defaults do par).

Empilhado sobre `claude/incr-counterparty-a1` (backend A1). `81093dc` → `claude/incr-aging` (`083ad5c`) — **15 arquivos, +544/−1**.

### O que muda
- `AgingReportService` (read-time, AP e AR via `kind`): outstanding por contraparte + **faixas fixas** (`A vencer · 1–30 · 31–60 · 61–90 · >90` dias de atraso), totais por faixa + total geral + **drill por documento**. `as_of` overridável (default hoje, `isValidDateOnly`).
- `findOutstanding` scoped nos repos AP/AR + consts `*_OUTSTANDING_STATUSES` (`OPEN`+`PAYING`/`RECEIVING`).
- Rota 3-toques `GET /accounting/reports/aging?unitId&kind&asOf` + controller fino + DTO `.strict()` + policy por kind + factory. OpenAPI 134→135.

### Conformidade com o ADR (verificada no review)
- **F-AG1→a** read-time; **F-AG2→a** buckets fixos; **F-AG3→a** OPEN+em-trânsito (exclui PAID/RECEIVED/CANCELLED/soft-deleted; outstanding = `amountCents`, full-only); **F-AG4→a** só-aging (tie-out = follow-on).
- Cálculo de faixa **component-based em UTC** → **imune ao UTC-shift** (`date-only-rendering-utc-shift-class-bug`); fronteiras testadas (dueDate==as_of→A vencer; 1→1–30; 91→>90).
- Agrupa por `counterpartyId` (NULL → "(Sem contraparte)"); invariante **total === Σ faixas === Σ grupos** (inteiro exato, sem float).

### Gates
`tsc` limpo; **13 testes novos** (11 unit + 2 integração SQLite real com dado escrito pelo app); suítes irmãs sem regressão. **Zero migração ⇒ sem smoke-migration-gate.**

### Review
Review independente = **PASS** — sem bloqueadores. As duas áreas de risco (matemática das faixas; filtro de em-aberto) corretas e cobertas por teste que falharia se quebrasse. Nits cosméticos apenas (`daysOverdue` negativo exposto no drill = intencional).

### Merge / residual
- **Base = `claude/incr-counterparty-a1`** (empilhado); re-aponta p/ `main` quando A1 mergear. Mergear **depois** de A1.
- Residual: FE (`FE-INCR-AGING`, clona os outros reports). Sem smoke-gate (read-only).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
