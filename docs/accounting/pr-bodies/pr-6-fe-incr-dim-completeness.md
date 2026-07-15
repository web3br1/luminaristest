## Título
`feat(accounting): FE-INCR-DIM-COMPLETENESS — toggle "exige dimensão" por conta-folha`

## Corpo

### Resumo
UI da completude dimensional (backend em `#120` / `INCR-DIM-COMPLETENESS`). Adiciona o toggle **"exige dimensão"** por conta-folha no Plano de Contas e confirma o bucket **"(Não alocado)"** na DRE por dimensão. **FE only.**

Empilhado sobre `claude/incr-dim-completeness-b1` (backend B1). `f3313b6` → `claude/fe-incr-dim-completeness` (`759d4eb`) — **5 arquivos, +144**.

### O que muda
- `ChartOfAccountsPanel.tsx` — coluna "Exige dimensão": conta-folha (`acceptsEntries===true`) + `canManage` → checkbox com **atualização otimista** (flip local + rollback + mensagem do backend em erro; desabilita durante o request); não-gestor → badge read-only; conta sintética → "—" (leaf-only respeitado).
- `accounting.service.ts` — `Account.requiresDimension?: boolean` no read + `setAccountRequiresDimension(id, unitId, flag)` sobre `PATCH /accounting/accounts/:id/requires-dimension`.
- i18n pt/en (paridade 685=685).

### Confirmações (sem reparo de backend)
- Bucket "(Não alocado)" já é emitido pelo backend (`DimensionReportService`) e renderizado pelo `DimensionReports.tsx`.
- `requiresDimension` já chega no read do Plano de Contas (`findManyByUnit` retorna o Account completo).
- Rejeição de lançamento por falta de dimensão já é surfada no `JournalEntryModal` (fix `2e1a97f`).

### Gates
`tsc` limpo; `npm run build` (produção) OK; vitest 5/5 (3 novos); i18n **685=685**; sem `zinc-*`, `rounded-2xl`, zero `any` evitável.

### Review
Review independente = **PASS-com-ressalvas não-bloqueantes**. Wiring bate byte-a-byte com o DTO/rota do backend; leaf-only respeitado no FE; otimista com rollback seguro. Notas: lacunas de teste (rollback/otimista, badge read-only). **Informativo:** o backend `setAccountRequiresDimension` não tem guarda leaf-only — **inócuo** (conta sintética nunca recebe lançamento, o gate não dispara nela); o FE já previne. Hardening opcional futuro.

### Merge / residual
- **Base = `claude/incr-dim-completeness-b1`** (empilhado). Re-aponta p/ `main` quando o backend B1 mergear. Mergear **depois** do backend B1.
- Residual: browser sign-off humano.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
