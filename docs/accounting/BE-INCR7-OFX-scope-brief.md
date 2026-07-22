# BE-INCR7-OFX — Ingestão de extrato bancário OFX (escopo)

- **Data:** 2026-07-09 · **ADR:** `docs/adr/ADR-INCR7-OFX-bank-statement.md` · **Roadmap:** `ACCOUNTING-MASTER-MAP.md` §5
- **Base:** BE-INCR-7 (conciliação, `main`). **Migration-free** — nenhum model/migração tocado.

## Objetivo

Aceitar **OFX** como segundo parser de extrato, normalizando para o **mesmo shape de linha** que o pipeline de conciliação já consome (`{date, amountCents, description, externalRef}`), reusando **toda** a validação (`parseLines`) e persistência (`BankStatement/Line`) existentes.

## Escopo — IN

| Item | Onde |
|---|---|
| Parser OFX puro `parseOfx(buffer): InTable` | `server/src/lib/ofx.ts` (NEW) — 0 dependência nova; OFX 1.x SGML + 2.x XML por regex |
| Ramificação de formato no import | `ReconciliationService.importStatement` — `format === 'ofx' ? parseOfx(buffer) : parseTable(...)` |
| Sniff de formato + allowlist | `reconciliationController.ts` — `sniffFormat` ramo OFX (antes do CSV) + mimes `application/x-ofx`/`ofx` |
| Contrato OpenAPI | `routes/docs.paths.ts` (endpoint agora cita OFX) + `public/openapi.json` regenerado |
| Testes | `server/src/lib/__tests__/ofx.test.ts` (NEW) — parser + import e2e all-or-nothing |

**Mapeamento `<STMTTRN>` → linha:** `<DTPOSTED>`→`date` (slice YYYY-MM-DD, offset ignorado), `<TRNAMT>`→`amountCents` (decimal→centavos exato por string), `<NAME>`/`<MEMO>`→`description` (join), `<FITID>`→`externalRef`.

## Escopo — OUT (ADR/incremento próprio)

| Item | Motivo |
|---|---|
| **CNAB 240/400** | Posicional/leiaute-por-banco — subprojeto próprio |
| **NF-e** | Domínio fiscal — não é extrato bancário |
| **Multi-conta por arquivo** | **REJEITADO alto** (não "pega a primeira") — evita atribuir transações de outra conta ao `glAccount` ancorado (D4) |
| **Dedup por FITID entre arquivos** | Idempotência é `sha256(arquivo)` (T7/D1); FITID não deduz por-linha (herda comportamento CSV) |
| **Separador decimal `,`** | Spec OFX usa `.`; `,` cai como linha inválida (YAGNI) |

## Gates

- `tsc --noEmit` limpo; `jest` OFX + accounting verdes; sem `Number(decimal)*100`, sem `new Date(DTPOSTED)` formatado, parser não importa `isValidDateOnly`/`MAX_CENTS`; nenhum arquivo `prisma/`/`migrations/`.
- Review independente (T12, worktree separado). smoke-migration-gate **não se aplica**.
