# BE-INCR-7 — Conciliação Bancária — **BRIEF DE ESCOPO (PRE-ADR)**

> 🟠 **STATUS: DRAFT DE ESCOPO — PRE-ADR. NÃO IMPLEMENTÁVEL.**
> Este documento **detalha o escopo** do próximo incremento contábil candidato (conciliação
> bancária) para uma futura sessão. Ele **não é um plano ratificado**: as decisões marcadas
> `DECISÃO ARQUITETURAL` exigem **ADR em disco + sinal humano** antes de qualquer código
> (regra do `luminaris-accounting-architect` / `_ARCHITECTURE-CONTRACT.md`). Nenhuma skill de
> geração deve ser roteada contra este doc até o ADR existir.
>
> **Precedência:** onde este brief divergir de um futuro `ADR-INCR7-*`, o **ADR vence**.

---

## 0. Por que este é o "próximo passo documentado"

O trilho INCR-6 (Data Exchange) está fechado: 6A export + 6B import mergeados, blocos de
validação funcional **A/B/C/D/F/G/H/I/J todos PASS**, `ACC-INCR6-J-001` e o guard do `/post`
resolvidos, e os cosméticos J2/W1 fechados (PR #30, merge `9db2d44`). Conciliação foi
**explicitamente empurrada para "seu próprio incremento"** em vários docs:

- `BE-INCR6-data-exchange-brief.md` §out-of-scope: *"Not conciliação … bank reconciliation …
  ECD/ECF"*.
- `BE-INCR5-attachments-evidence-brief.md`: *"Other entities depend on period/reconciliation
  workflows that are not yet defined"* + `Reconciliation attachments (future)`.
- `FE-INCR1-VALIDATION-STATUS.md`: `❌ Reconciliation workflows`.

É o item de operação/controle mais citado como próximo. **ECD/ECF (compliance) e ingestão
fiscal (OFX/CNAB/NF-e)** vêm depois — fora deste brief.

## 1. ⚠️ Desambiguação obrigatória — dois "reconcile" no repo

| Nome | O que é | NÃO confundir |
|---|---|---|
| **AccountingSync "reconcile"** (JÁ EXISTE) | Job/CLI `accounting:reconcile` (`accountingSyncReconcileCli`) que re-dirige oportunidades **CRM Won** sem lançamento contábil → cria o journal entry faltante. Ponte CRM→ledger. | **NÃO é conciliação bancária.** É backfill de integração. Ver `server/src/features/accounting/sync/`. |
| **Conciliação bancária** (ESTE BRIEF) | Casar linhas de um **extrato bancário** com lançamentos/postings do razão, marcar o que bate, e listar o que não bate. Não cria ledger; **liga**. | — |

O `JournalEntry.status` já tem o valor **`Reconciled`** no enum (`Draft | Posted | Reconciled |
Reversed`), mas é **placeholder — nunca é setado em nenhum lugar do código** (confirmado por
grep). É um gancho de reuso, não uma feature pronta.

## 2. Objetivo & não-objetivos

**Objetivo (MVP):** dado um extrato bancário importado, permitir **casar (match)** cada linha do
extrato com um ou mais postings/lançamentos existentes do razão, revisar/ajustar manualmente,
**marcar como conciliado**, e produzir um **relatório de pendências** (linhas de extrato sem
match + postings sem match) para uma conta/período. **A conciliação nunca muda o ledger — ela
cria vínculos.** Ajustes reais (tarifa não lançada, diferença) continuam sendo **novos
lançamentos via `PostingService.postEntry`**, nunca edição do original.

**Não-objetivos (fora do MVP):**
- Parsing OFX/CNAB/NF-e (MVP = CSV/XLSX reusando o Data Exchange; formatos bancários = ADR próprio).
- Regras de auto-match "inteligentes"/ML — MVP usa heurística determinística simples.
- Criação automática de lançamento de ajuste — o usuário posta o ajuste explicitamente.
- ECD/ECF, pacote de evidências zip, multi-moeda.

## 3. PARECER DE DOMÍNIO CONTÁBIL (lente accounting-architect)

**Bloco do roadmap:** 4 operação / 6 controle (pós-núcleo). Depende de INCR-1 (períodos),
INCR-3 (numeração), INCR-4 (relatórios) já mergeados.

**Já existe no projeto?** Não como feature; existem os **blocos de reuso** (§4). O status
`Reconciled` é placeholder.

**Colisão com decisão commitada?** **NÃO**, desde que respeite as decisões já fixadas:
- Fica em **SQLite** (WAL + busy_timeout) — nada de constraint de exclusão PG (`stay-on-sqlite-no-postgres`).
- Tenancy = **`AccountingScope`** (`ownerUserId`+`unitId`) — sem torre multiempresa (`accounting-scope-foundation-no-multicompany`).
- É **Prisma first-class** — models/service/repo/policy próprios, **nunca** DynamicTable (`dynamictable-vs-prisma-boundary`).

**Invariantes que o plano DEVE garantir** (os inegociáveis aplicáveis):
- **[ACC-011] gate in-tx:** marcar linha/posting como conciliado dentro de `runTransaction` com
  re-check do estado (não conciliar contra um posting já estornado/re-conciliado — TOCTOU).
- **[ACC-013] idempotência:** re-importar o mesmo extrato **não duplica** linhas; re-rodar
  auto-match **não duplica** vínculos — `@@unique` no par (statementLineId, postingId) e no
  hash do extrato. Idempotência liga em identidade do extrato/linha, **não** em `userId`.
- **[ACC-014] centavos inteiros:** valores do extrato em `*Cents` `Int`, com o **mesmo teto
  Int32** que o ledger — reusar `MAX_CENTS` de `accounting/models/money.ts` (fechado em
  `ACC-HARDEN-POST-CENTS-001`). Match por igualdade exata de centavos, sem epsilon/float.
- **[ACC-018] estorno-nunca-delete:** desfazer um match é **soft** (marca `unmatched`,
  preserva a linha do vínculo com auditoria) — nunca hard-delete que apaga a trilha.
- **[ACC-019/020] auditoria in-tx, sem cascade:** todo `reconciliation.*` (matched/unmatched/
  statement_imported) grava `AuditEvent` na **mesma tx** (reusa `AuditService`, allowlist de
  payload); a trilha é exceção ao `onDelete:Cascade`.
- **[ACC-021] semântica de relatório:** o relatório de conciliação é **as-of/por-período** e
  só considera `Posted`/`Reconciled` — regra de sinal centralizada, não espalhada em React.

**Tradução aspiracional → realidade:** qualquer "exclusion constraint" de doc antigo → **gate
transacional em app + `@@unique`**. Nada de LegalEntity/Ledger tower.

## 4. Mapa de reuso (reuse-antes-de-recriar — Contrato §0)

Antes de gerar qualquer "novo", a sessão deve responder `_REUSE-CRITERION.md` (shape+posse) e
localizar via cbm. Candidatos confirmados neste repo (grep):

| Reuso | O quê | Onde |
|---|---|---|
| **AccountingScope** | tenancy owner+unit, `accountingScopeWhere` | `features/accounting/scope/AccountingScope.ts` |
| **PostingService** | `postEntry` para lançar ajustes; `Reconciled` status | `features/accounting/services/PostingService.ts` |
| **AuditService** | `append(tx, scope, event)` hash-chain in-tx | INCR-2 |
| **MAX_CENTS / money.ts** | teto Int32 compartilhado (valor do extrato) | `features/accounting/models/money.ts` |
| **DocumentAttachment** | anexar o arquivo do extrato ao statement (`listByTarget`) | `features/accounting/services/DocumentAttachmentService.ts` (INCR-5) |
| **Data Exchange (import)** | staging→validate→preview→commit p/ **ingerir o extrato CSV/XLSX** | `features/accounting/services/DataExchangeImportService.ts` (INCR-6) — avaliar **novo `ImportKind` `IMPORT_BANK_STATEMENT`** vs. models próprios (DECISÃO ARQUITETURAL) |
| **AccountingReportService** | padrão de relatório `as_of` + `groupByAccount` | INCR-4 |
| **AccountingPeriod gate** | conciliar dentro de período aberto | INCR-1 |
| **Factory / rota-3-toques / DTO Zod `.strict()` / Policy** | scaffolding de camada | Contrato §2/§3 |

## 5. Modelo proposto (Prisma first-class — SUJEITO A ADR)

> Forma para discussão no ADR, não decisão final.

- **`BankStatement`** — cabeçalho do extrato importado: `userId`, `unitId`, `glAccountCode`
  (a conta contábil "banco" que este extrato representa), `periodFrom/To`, `sha256` (idempotência
  de re-import), `sourceJobId?` (link ao DataExchange job se reusar a ingestão), `attachmentId?`
  (arquivo bruto via DocumentAttachment), timestamps. `@@unique([userId,unitId,sha256])`.
- **`BankStatementLine`** — linha do extrato: `statementId`, `date`, `amountCents Int`
  (sinalizado ou `+kind`), `description`, `externalRef?`, `status` (`UNMATCHED|MATCHED|IGNORED`),
  `rawJson`. Índices por `(statementId,status)` e `(userId,unitId,date)`.
- **`ReconciliationMatch`** — vínculo **não-destrutivo** N:M entre linha e posting:
  `statementLineId`, `postingId` (ou `journalEntryId` — DECISÃO), `matchedById`, `matchType`
  (`AUTO|MANUAL`), `createdAt`, soft-undo (`unmatchedAt/By?`).
  `@@unique([statementLineId, postingId])` fecha o double-apply do re-drive de auto-match.

**Regra dura:** conciliar **não** escreve em `Posting`/`JournalEntry` além de (opcionalmente)
flipar `JournalEntry.status → Reconciled` quando todos os seus postings estão casados — e mesmo
isso é reversível e auditado. Nenhum valor de ledger muda.

## 6. Fluxo (MVP)

1. **Importar extrato** → staging de linhas (reusa Data Exchange ou models próprios — DECISÃO §8).
2. **Auto-match** determinístico: casa linha↔posting por **(mesma conta banco) + centavos exatos
   + data dentro de janela ±N dias + (opcional) externalRef**. Idempotente; nunca casa 2×.
3. **Revisão manual:** aceitar/rejeitar sugestões, casar N:M, marcar `IGNORED` (tarifa a lançar),
   **desfazer match** (soft).
4. **Postar ajuste** (quando falta lançamento): via `PostingService.postEntry` — fluxo já
   existente, fora do motor de conciliação.
5. **Relatório de pendências** as-of: linhas `UNMATCHED` + postings da conta banco sem match →
   base para o fechamento. Exportável reusando o padrão INCR-6.

## 7. Fases de execução (esqueleto — contingente ao ADR)

Espelha o formato do `PLANEJAMENTO-buildout-contabil-v2.md`. **Não executar sem ADR.**

1. **cbm** — provar ausência de model de conciliação; mapear call-sites de `groupByAccount`/`postEntry`.
2. **prisma-model** — `BankStatement` + `BankStatementLine` + `ReconciliationMatch` + migração (+ smoke-migration-gate, `accounting-incr1-db-risk`).
3. **repository** — repos + `IReconciliationRepository`; `runTransaction` propagado a todo write (`tx-nao-propagado-ao-repo`).
4. **policy** — `canReconcile(scope)` em `AccountingPolicy`.
5. **service `ReconciliationService`** — import/auto-match/manual-match/unmatch/report; audit in-tx; idempotência por `@@unique`.
6. **service editar `PostingService`?** — só se `JournalEntry.status → Reconciled` entrar no MVP (reversível+audit).
7. **dto** — Zod `.strict()`; valores em centavos com `MAX_CENTS`.
8. **controller + route (3 toques)** — sob `/api/accounting/reconciliation/*`.
9. **factory** — wiring N-toques.
10. **test-suite** — auto-match idempotente (re-run = 0 novos vínculos); match exato de centavos; unmatch soft preserva trilha; TOCTOU (posting estornado entre sugestão e commit); tenancy cross-unit 404; re-import mesmo extrato não duplica; período fechado bloqueia ajuste.
11. **api-contract-sync** — `docs:generate` + i18n.
12. **luminaris-reviewer** — worktree isolado, do zero.
13. **FE** — aba/tela de conciliação (só depois do backend fechar, padrão do projeto).

## 8. Decisões ABERTAS — exigem ADR + sinal humano (`DECISÃO ARQUITETURAL`)

1. **Ingestão do extrato:** novo `ImportKind IMPORT_BANK_STATEMENT` no Data Exchange **vs.** pipeline/models próprios de statement? (Reuso vs. acoplar formato bancário ao motor de import genérico.)
2. **Formatos:** CSV/XLSX-only no MVP, OFX/CNAB depois — ou já entra OFX? (dep + parser.)
3. **Granularidade do match:** vínculo linha↔**posting** ou linha↔**journalEntry**? N:M nos dois lados?
4. **Conceito de "conta banco":** usar o `Account` (código folha) existente como âncora, ou introduzir metadado de "bank account"? (Impacta o auto-match por conta.)
5. **`JournalEntry.status = Reconciled`** entra no MVP (e como reverte) ou fica só nos vínculos?
6. **Janela de match** (±N dias) e política de tie-break quando várias linhas/postings batem no mesmo valor.
7. **Unmatch/estorno:** semântica de desfazer + o que auditar.

## 9. Definition of Done (quando houver ADR)

Por incremento: ADR ratificado · camadas completas · `tsc` limpo (2 pacotes) · Jest verde (sem
regredir) · skill-audit `wiring` · `docs:generate` · **smoke-migration-gate** (dados vivos) ·
review por agente independente PASS. Invariantes financeiros intactos; conciliação não muda
valor de ledger; idempotência provada por teste.

## 10. Riscos
- Acoplar formato bancário ao motor de import genérico (§8.1) pode furar a fronteira §2.1 — decidir no ADR.
- Auto-match ambíguo (mesmo valor/data) → sem tie-break determinístico vira não-idempotente.
- Migração com colunas novas → smoke-gate obrigatório antes de dados reais (`accounting-incr1-db-risk`).
- Confundir com o AccountingSync "reconcile" existente (§1) — nomear tudo `bank`/`reconciliation` explicitamente.

---

## 11. PROMPT PARA A PRÓXIMA SESSÃO (copiar/colar)

```text
Atue no módulo de contabilidade do Luminaris (monorepo server/ + my-app/). O trilho INCR-6
(Data Exchange) está 100% fechado em main (último merge 9db2d44). O PRÓXIMO incremento candidato
é CONCILIAÇÃO BANCÁRIA (BE-INCR-7). Leia primeiro, INTEIRO:
  docs/accounting/BE-INCR7-reconciliation-scope-brief.md   ← escopo PRE-ADR (fonte desta tarefa)
  .claude/skills/_ARCHITECTURE-CONTRACT.md §2.1            ← fronteira Prisma×DynamicTable
  CLAUDE.md (STOP block)

REGRA DURA: este é um brief PRE-ADR. NÃO gere código/skills ainda. A tarefa desta sessão é
PRODUZIR O ADR e travar as decisões abertas — não implementar.

Passos:
1. Rode a persona luminaris-accounting-architect sobre conciliação bancária e produza o PARECER
   DE DOMÍNIO (reconciliando com as memórias accounting-*: SQLite-only, AccountingScope sem torre
   multiempresa, Prisma first-class, estorno-nunca-delete, gate in-tx, idempotência não-por-userId).
2. Desambigue do "reconcile" que JÁ existe (AccountingSync CRM Won→lançamento em
   server/src/features/accounting/sync/) — conciliação bancária é OUTRA coisa.
3. Confirme o mapa de reuso lendo o código (cbm para localizar, Read para confirmar — CBM-001):
   AccountingScope, PostingService, AuditService, DocumentAttachmentService, DataExchangeImportService,
   AccountingReportService, models/money.ts (MAX_CENTS), períodos. Nota: JournalEntry.status já
   tem 'Reconciled' mas é placeholder (nunca setado).
4. RESOLVA as 7 DECISÕES ABERTAS do §8 do brief com o usuário (elas mudam o modelo/rota/risco):
   ingestão via ImportKind novo vs models próprios; formatos (CSV-only MVP?); match linha↔posting
   vs entry; conceito de conta-banco; JournalEntry.status=Reconciled no MVP?; janela/tie-break de
   match; semântica de unmatch. Use AskUserQuestion para as que forem genuinamente do usuário.
5. Escreva docs/adr/ADR-INCR7-bank-reconciliation.md com as decisões ratificadas + o modelo Prisma
   final (BankStatement / BankStatementLine / ReconciliationMatch, ajustado às decisões) e os
   descartados (histórico "por quê / vencedor", estilo dos ADRs INCR-1..4).
6. Depois do ADR ratificado + sinal humano: acione o luminaris-orchestrator para montar o plano de
   skills (Prisma first-class, camadas completas, rota 3 toques, teste com auto-match idempotente +
   TOCTOU + tenancy + re-import sem duplicar), e delegue ao luminaris-implementer. Cada PR pequeno,
   worktree isolado (verify-write-context-before-writing), review por agente independente
   (reviewer-independence-separate-agent), smoke-migration-gate antes de dados reais.

FORA DE ESCOPO: OFX/CNAB/NF-e (ADR próprio), ECD/ECF, pacote-zip de evidências, multi-moeda, novo
domínio não-contábil. Nada de conciliação vira DynamicTable (fronteira §2.1). Nada de Postgres/torre
multiempresa (decisões já rejeitadas).
```

## 12. Backlog paralelo (menor, documentado — não conciliação)

Podem ser fechados a qualquer momento, independem do INCR-7:
- **Sign-off humano no browser** do FE-INCR-6 (warning declarado; único aberto do trilho A–J).
- **Trip-wire pré-deploy** de double-post + reset do `dev.db` antes de dados reais (`SMOKE-MIGRATION-GATE-BE-INCR6.md`).
- **`EXPORT_IMPORT_ERRORS`** (download formatado do relatório de erros) e **chart-of-accounts safe-field update** (`updateAccount`) — follow-ups pequenos do INCR-6 (`BE-INCR6B-import-closeout.md` §Deferred).
- **`/package-balances` fora do `openapi.json`** — saldar no próximo `docs:generate` (v2 §5).
- **`attachment.downloaded`** audit event (INCR-5) — capturado, feature-flag, deferido.
