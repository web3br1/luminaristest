# FE-INCR7 — Plano de Frontend: Conciliação Bancária

> **Proveniência.** Autorado 2026-07-08 a partir do **contrato de backend já mergeado na main**
> (fonte de verdade), não de um rascunho verbatim. A sessão de planejamento original
> (*"Bank reconciliation frontend planning"*, 2026-07-03) nunca commitou artefato — este doc a
> substitui e a torna arquivável. Se divergir do contrato, o contrato vence.
>
> **Fontes de verdade (todas na main):**
> - `docs/adr/ADR-INCR7-bank-reconciliation.md` (decisões D1–D7)
> - `docs/accounting/BE-INCR7-reconciliation-scope-brief.md` (objetivo/não-metas + reuse map)
> - Contrato HTTP: `server/public/openapi.json` → `/api/accounting/reconciliation/*`
> - Domínio: `ReconciliationService.ts`, `ReconciliationDto.ts`, `Reconciliation.model.ts`

## Status

- **Backend:** 100% mergeado + deploy-cleared (smoke-migration-gate PASS). Ver [[accounting-next-increment-reconciliation]].
- **Frontend:** **DEFERIDO por estratégia** (FE segura até backend 100% — ver [[frontend-deferred-strategy]]).
  Este é o plano para quando o FE retomar; **não é trabalho ativo**.
- **i18n:** o namespace `accounting` já está na main (PR #40). Toda string nova segue a convenção
  inline-fallback `t('reconciliation.key','texto pt')` no mesmo namespace — **não** criar namespace novo.

## Contrato HTTP a consumir (9 endpoints, `/api/accounting/reconciliation`)

| Ação | Método + rota |
|---|---|
| Listar/enviar extratos | `GET` / `POST /statements` |
| Detalhe de um extrato | `GET /statements/{id}` |
| Linhas de um extrato | `GET /statements/{id}/lines` |
| Auto-match de um extrato | `POST /statements/{id}/auto-match` |
| Fila pendente (linhas sem match) | `GET /pending` |
| Sugestões de match p/ uma linha | `GET /lines/{id}/suggestions` |
| Ignorar uma linha | `POST /lines/{id}/ignore` |
| Criar match (manual/confirmar) | `POST /matches` |
| Desfazer match | `POST /matches/{id}/unmatch` |

## Telas / componentes (MVP)

Segue o padrão do módulo contábil: **aba própria** no dashboard de contabilidade (não KPIs do analytics),
reusando `GenericTable`, `Modal`, `StandardPagination` canônicos.

1. **Aba "Conciliação"** (`my-app/features/accounting/components/ReconciliationPanel.tsx`)
   - Sub-view **Extratos**: upload CSV/XLSX (**D2**) → lista de extratos (`GET /statements`), status por extrato,
     botão **Auto-match** (`POST /statements/{id}/auto-match`).
   - Sub-view **Fila pendente** (`GET /pending`): linhas ainda não conciliadas; ação por linha → **Sugestões** ou **Ignorar**.
2. **Drawer/Modal de match** (`ReconciliationMatchModal.tsx`)
   - Abre de uma linha pendente → `GET /lines/{id}/suggestions` (ranking Δdias então postingId — **D6**).
   - Confirmar sugestão → `POST /matches`. **Ambiguidade não faz auto-commit** (D6): o usuário escolhe.
3. **Indicador de status conciliado** nos lançamentos
   - **D5**: entry pode estar `Reconciled` (flip derivado, reversível). O `JournalEntriesPanel` já lida com
     `status.Reconciled` no i18n (verificado no review do #40) — a UI só precisa **exibir** o estado e
     oferecer **unmatch** (`POST /matches/{id}/unmatch`, **D7**) que reverte `Reconciled→Posted`.

## Constraints de UI vindas do ADR (não violar)

- **D5** — `Reconciled` é marcador de estado reversível, **sem** mudança de valor monetário. UI nunca "edita" valor ao conciliar.
- **D6** — janela **±3 dias** + centavos+direção exatos; auto-match só comita o **candidato único**. Para ambíguo, mostrar
  sugestões ranqueadas e exigir escolha manual — nunca auto-selecionar.
- **D7** — unmatch é **soft** (linha recomputa, auditado); a UI deve refletir o flip-back e o histórico, não "apagar".
- **D3** — MVP: **1 match ativo por posting**. UI de match deve impedir vincular um posting já casado (o backend
  também barra in-tx, mas a UI deve dar feedback claro em vez de deixar o 4xx surpreender).

## Reuse (Etapa 1 do critério de reuso — confirmar no cbm antes de codar)

- Tabela/paginação: `GenericTable` + `StandardPagination` (canônicos §0).
- Upload CSV/XLSX: reusar o padrão já usado em Import/Export (INCR-6) — **não** reimplementar sniff/parse.
- Formatação de data: **cuidado** com o class-bug de UTC-shift — usar o helper date-only-safe do accounting,
  não `new Date(iso).toLocaleDateString()` (ver [[date-only-rendering-utc-shift-class-bug]]).
- Dinheiro: centavos inteiros, nunca float.

## Gates de saída (quando implementar)

- `cd my-app && npx tsc --noEmit` limpo; zero `zinc-*`; cards `rounded-2xl/3xl`.
- Paridade i18n en/pt no namespace `accounting`; dynamic-keys (status) com casing batendo o json.
- `wiring` (skill-audit) verde: aba registrada, sem órfão.
- Review independente (agente em worktree separado) + verificação contra **build de produção** (telas atrás de `withAuth`).
- Sign-off humano em browser (consistente com FE increments anteriores).
