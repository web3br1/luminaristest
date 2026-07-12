# BE-INCR7-CNAB — Ingestão de extrato bancário CNAB 240 (escopo)

- **Data:** 2026-07-09 · **ADR:** `docs/adr/ADR-INCR7-CNAB-bank-statement.md` · **Roadmap:** `ACCOUNTING-MASTER-MAP.md` §5
- **Base:** BE-INCR-7 (conciliação, `main`) + BE-INCR7-OFX (`main`, PR #59 — padrão espelhado). **Migration-free** — nenhum model/migração tocado.

## Objetivo

Aceitar **CNAB 240** (extrato, Segmento E) como terceiro parser de extrato, normalizando para o **mesmo shape de linha** que o pipeline de conciliação já consome (`{date, amountCents, description, externalRef}`), reusando **toda** a validação (`parseLines`) e persistência (`BankStatement/Line`) existentes.

## Escopo — IN

| Item | Onde |
|---|---|
| Parser CNAB puro `parseCnab(buffer): InTable` | `server/src/lib/cnab.ts` (NEW) — 0 dependência nova; largura fixa por `slice` |
| Widening do tipo de formato (`+ 'cnab'`) | `server/src/lib/ofx.ts` (`StatementFormat`) |
| Ramificação de formato no import | `ReconciliationService.importStatement` — `format === 'cnab' ? parseCnab(buffer) : …` |
| Sniff de formato | `reconciliationController.ts` — `sniffFormat` ramo CNAB (antes do CSV) por extensão `.ret`/`.cnab` ou linha de 240 chars com pos 8 = `'0'` |
| Contrato OpenAPI | `routes/docs.paths.ts` (endpoint agora cita CNAB) + `public/openapi.json` regenerado |
| Testes | `server/src/lib/__tests__/cnab.test.ts` (NEW) — parser + import e2e all-or-nothing |

**Mapeamento Segmento E → linha:** data DDMMAAAA→`date` (slice reordenado, sem `new Date`), valor 18-díg 2-dec-implícitas→`amountCents` (leitura inteira direta, sem float), indicador D/C→sinal (`C`=+/`D`=−), histórico→`description` (fallback nº documento), nº documento→`externalRef`.

## Escopo — OUT (ADR/incremento próprio)

| Item | Motivo |
|---|---|
| **CNAB 400** | Leiaute legado distinto — `parseCnab` rejeita alto (1ª linha ≥400 chars) |
| **CNAB remessa** | Escrita (pagamento/cobrança), não extrato |
| **Multi-conta por arquivo** | **REJEITADO alto** (não "pega a primeira") — D4 |
| **Calibração de posições por banco** | MVP mira posições FEBRABAN 240 padrão; desvio por banco = tuning diferido (constantes em `cnab.ts` = knob `ponytail:`) |
| **Saldo com D/C válido e valor ≠ 0 sem marcador padrão** | Filtro do MVP descarta natureza não-`C`/`D` + zero-reject; saldo não-zero indistinguível = calibração por banco |
| **NF-e** | Domínio fiscal |

## Gates

- `tsc --noEmit` limpo; `jest` CNAB + accounting/lib verdes; sem `Number()` no caminho do valor antes do `parseLines`, sem `new Date(dataCNAB)` formatado; parser não importa `isValidDateOnly`/`MAX_CENTS`; nenhum arquivo `prisma/`/`migrations/`.
- Review independente (T12, worktree separado). smoke-migration-gate **não se aplica**.
