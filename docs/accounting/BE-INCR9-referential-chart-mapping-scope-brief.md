# BE-INCR-9 — Plano de Contas Referencial versionado · Scope Brief

- **Increment:** BE-INCR-9 (backend only; FE diferido — `frontend-deferred-strategy`)
- **ADR:** `docs/adr/ADR-INCR9-referential-chart-mapping.md`
- **Roadmap:** `docs/accounting/ACCOUNTING-MASTER-MAP.md` §5 — nó "ECD/ECF readiness"; este incremento entrega o pré-requisito **mapeamento referencial versionado** (o outro, proveniência, é INCR-8).
- **Date:** 2026-07-09 · **Branch/worktree:** `claude/referential-mapping-model-c8514d`
- **Governança (T12):** PLAN ✅ → ADR ✅ → BRIEF ✅ → impl → test → review independente → PR → smoke-migration-gate → closeout → memória.

---

## Objetivo (uma frase)

Mapear cada **conta-folha ativa** (`Account.acceptsEntries=true`) a um **código referencial da RFB**,
de forma **versionada** por ano-calendário, e expor um **diagnóstico de cobertura** (contas-folha sem
mapeamento numa versão) — o gate de prontidão ECD. **NÃO** gera o arquivo SPED (diferido a ADR próprio).

## In-scope

- Model `ReferentialMapping` first-class + migração aditiva (tabela nova vazia).
- Cadeia Prisma completa: Repository (+interface) → Policy (`canReadReferential`/`canManageReferential`)
  → DTO Zod `.strict()` → Service → Controller → Route (3-toques) + Factory wiring.
- **Write** (set/unset): `runTransaction` com **gate in-tx** (Account ativo+folha+scope), `tx`
  propagado ao repo, `AuditService.append` na mesma tx.
- **Read de cobertura:** read-only, **chart-driven** (`findManyByUnit` − mapeados na versão), shape
  espelhando `DiagnosticsShape` do INCR-4 (`mappingVersion` + `unmappedAccounts[]`).
- Test-suite (gates de domínio abaixo) · OpenAPI/`docs:generate` · closeout do master map.

## Out-of-scope (ADR próprio depois)

- Geração do arquivo SPED ECD/ECF (blocos/registros/assinatura digital).
- Importação/validação do leiaute referencial **oficial** da RFB (catálogo). No MVP `referentialCode`/
  `label` são strings denormalizadas, sem tabela-catálogo/FK.
- Frontend (aba própria, quando o backend estiver 100%).

## Decisões-chave (detalhe no ADR §2)

| # | Decisão |
|---|---|
| D1 | `mappingVersion` = **string livre**, não enum (leiaute RFB é dado, não schema) |
| D2 | `@@unique([userId,unitId,accountId,mappingVersion])` — versões coexistem |
| D3 | Cobertura **chart-driven**, nunca balance-driven (conta-folha sem posting ainda falta) |
| D4 | Só conta-folha (`acceptsEntries=true`) mapeia; agrupamento excluído, não herda |
| D5 | **SEM `deletedAt`** — hard-delete + trilha no AuditEvent (foge do class-bug soft-delete×@@unique) |
| D6 | `referentialCode`/`label` strings denormalizadas, sem catálogo/FK |
| D7 | Tenancy `AccountingScope`; `userId` com cascade (a trilha é o AuditEvent, não o mapeamento) |
| D8 | Write com gate in-tx + tx-ao-repo + audit-in-tx (ACC-011/012/019) |

## Reuse obrigatório (Contrato §0 / master map §6)

`AccountingScope`/`accountingScopeWhere` · `Account`/`IAccountRepository.findManyByUnit` ·
`AuditService.append(tx,scope,event)` · padrão `mappingVersion`+`unmappedAccounts` (INCR-4, forma) ·
factory / rota-3-toques / DTO `.strict()` / Policy (Contrato §2/§3).

## Gates de domínio (o reviewer independente deve cobrar)

1. Versionar: mesma conta em v2025 e v2026 coexiste.
2. Cobertura chart-driven: conta-folha saldo-zero sem posting APARECE; agrupamento NÃO.
3. Gate in-tx: mapear conta soft-deletada falha dentro da tx.
4. Audit-in-tx: set/unset gera AuditEvent na mesma tx; rollback reverte.
5. Tenancy isolation cross-unit.
6. Concorrência @@unique; hard-delete → re-set sem P2002.
7. Invariante de fechamento: zero escrita em Posting/JournalEntry.

## Gates de envio

`cd server && npx tsc --noEmit` · `cd my-app && npx tsc --noEmit` · `jest features/accounting` verde ·
`npm run docs:generate` sem diff pendente · smoke-migration-gate em `dev.db` real (após review).

## Paralelismo

HÁ migração → **não** paralelizar com a Torre de Aprovação (também migra `JournalEntry`). **Pode**
paralelizar com OFX (migration-free); se ambos, coordenar número da migração + appends em
`routes/accounting.ts` / `factory.ts` / `openapi.json` / i18n.
