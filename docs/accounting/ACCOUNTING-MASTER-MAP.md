# Grafo-Mestre REAL — Módulo Contábil Luminaris

> **Fonte de verdade do roadmap contábil.** Este documento é o grafo-mestre **reconciliado com as
> decisões commitadas** do projeto — não a visão aspiracional de "sistema contábil universal".
> Onde um grafo aspiracional (o de 35 seções) diverge deste, **este vence** até que um ADR mude a
> decisão. Todo nó aqui tem um **estado** (legenda §7) e, quando relevante, o ADR/memória que o fixou.
>
> **Regra de uso (arquiteto/orquestrador):** nenhuma skill de geração roteia contra um nó marcado
> 🔴/⚫ sem **ADR em disco + sinal humano**. Nós ✅ estão fechados; nós ⏳ são o incremento corrente.
>
> Última reconciliação: **2026-07-03** · HEAD de referência: `761b358` (INCR-6 fechado, brief INCR-7 mergeado).

---

## 1. Decisões TRAVADAS — os trilhos que moldam todo o resto

Estas não são "preferências": são decisões commitadas. Reabrir qualquer uma é `DECISÃO ARQUITETURAL`
(ADR + sinal humano), **não** feature comum.

| # | Decisão travada | Por quê / evidência |
|---|---|---|
| T1 | **SQLite** (WAL + busy_timeout). Sem Postgres. | `stay-on-sqlite-no-postgres`. Todo "exclusion constraint" aspiracional → **gate transacional em app + `@@unique`**. |
| T2 | **Tenancy = `AccountingScope`** (`ownerUserId` + `unitId` + ledger `DEFAULT` implícito). **Sem** torre `LegalEntity/Ledger/Establishment`. | `accounting-scope-foundation-no-multicompany`; `AccountingScope.ts:12-25`. |
| T3 | **Contabilidade é Prisma first-class.** Model + Service + Repository + Policy próprios. **Nunca** DynamicTable, **nunca** serviço Prisma injetado no motor de plugins. | Contrato §2.1 (`AC-2.1-B1..B5`); `accounting-is-first-class-prisma`. |
| T4 | **Dinheiro = centavo inteiro `Int`**, teto Int32 compartilhado (`MAX_CENTS`). Igualdade exata, sem epsilon. | `money.ts:14`; `dynamictable-money-and-uniqueness-limits`. Upgrade a `BigInt` só quando um leg real passar de ~R$ 21,47M. |
| T5 | **Estorno é lançamento novo**, nunca edição/delete destrutivo do original. Post é imutável. | `JournalEntry` `reversedById`; `accounting-increment-d1-settlement`. |
| T6 | **Gate de invariante mutável re-checado DENTRO da `runTransaction`** (TOCTOU). Todo `tx` propaga a todo write do bloco. | `authoritative-gate-inside-tx`; `tx-nao-propagado-ao-repo`. |
| T7 | **Idempotência liga em identidade do evento** (`sourceType+sourceId`, sha256 do arquivo), **nunca em `userId`**. Guarda pré-tx via repo injetado. | `JournalEntry @@unique([userId,unitId,sourceType,sourceId])`; `orchestration-service-tx-repo-smell`; `idempotency-class-fix-discipline`. |
| T8 | **Auditoria append-only hash-chain, in-tx, exceção ao `onDelete:Cascade`.** | `AuditEvent` (INCR-2); `audit-log-no-fk-cascade`. |
| T9 | **BRL-only.** Sem multi-moeda — `Posting`/`JournalEntry` não têm campo de moeda. | `AccountingScope.baseCurrencyCode:'BRL'`; grep no schema. |
| T10 | **Integração origem→ledger = bridge pós-commit explícita** por origem (fora do motor). **Não** existe rule engine dirigido por template. | `accounting-increment-c-salon-bridge` (ADR-C01); AccountingSync. |
| T11 | **Deploy single-process, SQLite local.** Scheduler in-process. Sem fila/outbox/DLQ. | `accounting-sync-b1-merged`. |
| T12 | **Governança:** `PLAN → ADR → BRIEF → impl → test → review independente → PR → merge → smoke-gate → closeout → memória`. Review por **agente separado**; smoke-migration-gate antes de dados reais. | `reviewer-independence-separate-agent`; `accounting-incr1-db-risk`; `verify-write-context-before-writing`. |

---

## 2. Estado atual — a fundação que está de pé

Cadeia de dependência **real** (só nós construídos + o corrente). Cada `INCR-N` está mergeado em `main`.

```mermaid
flowchart TD
    classDef done fill:#064e3b,stroke:#10b981,color:#d1fae5;
    classDef wip fill:#78350f,stroke:#f59e0b,color:#fef3c7;

    A["✅ AccountingScope<br/>(owner+unit+DEFAULT)"]:::done
    B["✅ Plano de Contas<br/>Account · code hierárquico"]:::done
    C["✅ Períodos INCR-1<br/>FUTURE/OPEN/SOFT/HARD · gate in-tx"]:::done
    D["✅ JournalEntry + Posting<br/>Σdébito=Σcrédito"]:::done
    F["✅ Estorno<br/>reversedById · original intacto"]:::done
    G["✅ Auditoria INCR-2<br/>hash-chain in-tx"]:::done
    H["✅ Numeração INCR-3<br/>fiscalYear+entryNumber gapless"]:::done
    I["✅ Anexos INCR-5<br/>DocumentAttachment · sha256"]:::done
    R["✅ Reports INCR-4<br/>Balancete·Razão·BP·DRE + drill"]:::done
    X["✅ Data Exchange INCR-6<br/>import/export CSV/XLSX · staging"]:::done
    FE["✅ Frontend FE-INCR-1<br/>7 abas contábeis"]:::done
    BR["✅ Bridges pós-commit<br/>salon (C) · AccountingSync"]:::done
    T["✅ Conciliação Bancária<br/>BE-INCR-7 · backend completo · FE deferido"]:::done

    A --> B --> D
    A --> C --> D
    D --> F
    D --> G
    D --> H
    D --> I
    D --> R
    R --> X
    D --> FE
    BR --> D
    R --> T
    D --> T
```

**Núcleo 1 (ledger confiável) — fechado.** Núcleo de operação/relatório/evidência/troca de dados — fechado.
Único resíduo do trilho anterior (A–J do INCR-6): **sign-off humano no browser**.

---

## 3. Incremento corrente — Conciliação Bancária (BE-INCR-7)

**Estado:** ✅ **Backend implementado** (2026-07-03, PRs #32–#37 + rotas): models+migração (smoke-gate PASS,
`SMOKE-MIGRATION-GATE-BE-INCR7.md`), repository, policy+DTOs, emenda INCR4-A (class-fix `LEDGER_STATUSES` +
`getLiabilityCents` do job), `ReconciliationService` (import sha256-idempotente, auto-match D6, manual N↔1,
unmatch soft + flip-back, pendências §4.5), emenda INCR4-B, rotas `/api/accounting/reconciliation/*` + OpenAPI.
Cada PR com review independente (worktree isolado) — 2 FAILs corrigidos e re-aprovados no processo.
Smoke-gate de deploy sobre backup do `dev.db` **real** também PASS (2026-07-03,
`SMOKE-MIGRATION-GATE-BE-INCR7-DEPLOY.md`) — migração aplicada limpa sobre dados vivos, dev.db original
comprovadamente intocado (md5+mtime), 408/408 testes accounting verdes, `tsc` limpo.
**Pendente:** FE (frontend-deferred, aba própria) · sign-off humano em browser.
Emendas pós-ratificação no ADR §3: sha256 liberado no soft-delete (`deleted:<id>`) · nota derivação D5
stale-on-new-bank-account (aceito no MVP).

**Escopo travado (MVP enxuto — 3 entidades):**

```
BankStatement          cabeçalho · glAccountId (âncora na conta-banco, D4) · sha256 (idempotência re-import)
BankStatementLine      linha · amountCents Int SINALIZADO (MAX_CENTS) · status UNMATCHED|MATCHED|IGNORED
ReconciliationMatch    vínculo linha↔posting (D3) · unmatch soft (D7) · @@unique(statementLineId,postingId)
```

**7 decisões ratificadas:** D1 models próprios + reusa só `parseTable` (não novo ImportKind) · D2 CSV/XLSX only ·
D3 linha↔posting, N:M estrutural mas **1 match ativo por posting** no MVP (fecha double-link in-tx) · D4 âncora
no `Account` existente · **D5 `JournalEntry.status=Reconciled` NO MVP** (opção B): flip derivado/reversível/
auditado `Posted↔Reconciled` quando todos os postings de conta-banco casam — **exige emenda INCR4-A**
(`LEDGER_STATUSES` passa a incluir `Reconciled`, senão some do BP/DRE) + INCR4-B (estorno exige unmatch antes) ·
D6 janela ±3d, auto-match só no candidato único (abstém no empate = idempotente) · D7 unmatch soft, flipa
`Reconciled→Posted`, auditado.

**Regra-dura:** conciliar **não muda valor de ledger** — motor escreve nos vínculos + flipa `JournalEntry.status`
(marcador reversível); nenhum `Posting`/débito/crédito muda. Ajuste real = novo lançamento via
`PostingService.postEntry` (gated por período).

**Desambiguação:** ≠ `AccountingSync "reconcile"` (job CRM Won→lançamento, já existe em `features/accounting/sync/`).

---

## 4. Decisões REJEITADAS — não reabrir sem ADR

O grafo aspiracional propõe estes; o projeto **decidiu contra** (registrado). Se algum voltar, é `DECISÃO ARQUITETURAL`.

| Proposta aspiracional | Estado | Por quê rejeitada / vencedor |
|---|---|---|
| Torre `Workspace→LegalEntity→Establishment→Ledger` (multiempresa) | 🔴 **Rejeitada** | Vencedor: `AccountingScope` de 2 níveis. `accounting-scope-foundation-no-multicompany`. |
| PostgreSQL / exclusion constraints | 🔴 **Rejeitada** | Vencedor: SQLite tunado + gate transacional + `@@unique`. `stay-on-sqlite-no-postgres`. |
| Contabilidade como preset DynamicTable | 🔴 **Rejeitada** | Vencedor: Prisma first-class. Contrato §2.1. |
| **Motor de Regras Contábeis** (`conditionsJson`/`templateJson` gera lançamento) | 🔴 **Rejeitada (recomendação de domínio)** | Vencedor: **bridge pós-commit explícita por origem**. Um engine dirigido por template no caminho do ledger reintroduz o "motor de plugins" no ponto mais crítico (quem valida que o template balanceia? versionamento?). ADR-C01 fixou o padrão de bridge. |
| Multi-moeda (`transactionCurrencyCode`/`exchangeRate`) | 🔴 **Fora / ADR próprio** | BRL-only. Campo reservado no `AccountingScope` como slot futuro, sem implementação. |

---

## 5. Domínios DIFERIDOS — reais, mas cada um é seu próprio ADR/incremento

Ordenados por proximidade da fundação. **Nenhum** é "o próximo passo" antes do INCR-7 fechar.

| Domínio | Estado | Gate para começar |
|---|---|---|
| **SourceDocument + JournalEntrySource** (proveniência formal) | ✅ **Mergeado em `main`** (BE-INCR-8, PR #43, 2026-07-08; review independente PASS; commit de feature `a18886c`) | **ADR-INCR8** (altitude **A1 seam fino**). First-class Prisma: `SourceDocument`+`JournalEntrySource` (migração additiva, 0 ALTER), `SourceProvenanceRepository`, DTO `sourceDocument?` `.strict()`, seam na tx do `postEntry` (origem+link+audit `entry.source_recorded` átomos), import desdobra `externalReference`→`externalRef` com `sourceId` **byte-idêntico** (T7 intocada), no-cascade (sem FK User, D7). Consumidor (ECD/ECF) segue diferido. Gates: tsc×2 limpo, jest 752/752, **smoke-migration-gate PASS** (dev.db real: 15→15 entries, fingerprint de idempotência byte-idêntico, tabelas novas vazias). Brief + ADR em `docs/`. |
| **OFX** (ingestão bancária) | ✅ **Mergeado em `main`** (BE-INCR7-OFX, PR #59 `bb2f27a`, 2026-07-09; `ADR-INCR7-OFX-bank-statement.md`; review independente PASS ×2 + CI verde) | `lib/ofx.ts` normaliza `<STMTTRN>`→shape de linha; reusa `parseLines` integral; migration-free; multi-conta rejeitada; fallback de descrição para `TRNTYPE` quando falta NAME/MEMO. Supersedes ADR-INCR7 §D2 (parte OFX). Residual: sign-off humano no browser; FE aceita `.ofx` no upload (FE-OFX). |
| **Plano de Contas Referencial versionado** (mapeamento Account→código RFB + diagnóstico de cobertura) | ✅ **Mergeado em `main`** (BE-INCR-9, PR #58, 2026-07-09; review independente PASS + smoke-gate PASS) | **ADR-INCR9** (`docs/adr/ADR-INCR9-referential-chart-mapping.md`). First-class Prisma: `ReferentialMapping` (migração aditiva, tabela nova vazia), `@@unique([userId,unitId,accountId,mappingVersion])` (versões coexistem — D2), SEM `deletedAt` (hard-delete + trilha no AuditEvent — D5), `mappingVersion` string livre (D1). Write com gate in-tx (Account ativo+folha, ACC-011) + `AuditService.append` na mesma tx; read de cobertura **chart-driven** (não balance-driven — D3), espelha a shape `mappingVersion`+`unmappedAccounts` do INCR-4. `referentialCode`/`label` denormalizados, sem catálogo/FK (D6 — import do leiaute oficial diferido com o SPED). Gates: tsc×2 limpo, 441/441 accounting jest verdes (17 novos). Geração do arquivo SPED segue diferida (⚫, ADR próprio). |
| **CNAB 240** (extrato, Segmento E) | ⏳ **Implementado + review independente PASS (worktree isolado, T12) — pendente PR/merge** (BE-INCR7-CNAB, commit `53d05c0`, 2026-07-09; `ADR-INCR7-CNAB-bank-statement.md`) | 3º parser espelhando o OFX: `lib/cnab.ts::parseCnab`→shape de linha; reusa `parseLines` integral; migration-free. Valor 18-díg 2-dec-implícitas lido como centavos direto (string, sem float); sinal via indicador D/C (C=+/D=−); data DDMMAAAA→ISO por slice literal; nº documento→externalRef; multi-conta e CNAB 400 rejeitados; saldo/não-movimento descartados. 487/487 accounting+lib jest verdes (17 novos), tsc limpo. Supersedes parcial ADR-INCR7 §D2 (parte CNAB 240). Fix colateral: `STMTTRN: `/`extrato: ` colon quebrava o YAML do swagger-jsdoc e derrubava 17 paths do `openapi.json` desde o PR #59 — restaurado (80→97 paths). |
| **CNAB 400 / remessa · NF-e** (ingestão bancária/fiscal rica) | ⚫ Diferido | ADR próprio. CNAB 400 = leiaute legado distinto; remessa = escrita (pagamento/cobrança); NF-e = domínio fiscal. |
| **ECD / ECF readiness** (arquivo SPED: blocos/registros/assinatura) | ⚫ Diferido | Depende de proveniência (✅ INCR-8) **+ mapeamento referencial versionado (✅ INCR-9)**. Com os dois pré-requisitos de pé, o gate passa a ser só a geração do arquivo — ADR próprio. |
| **Torre de aprovação** (maker-checker, SoD, `submittedById`/`approvedById`/`version`/`contentHash`) | ⚫ Diferido | Model atual só tem `Draft\|Posted\|Reconciled\|Reversed`. ADR + invariantes ACC-016/017. |
| **Dimensões** (centro de custo/projeto — DimensionDefinition/Value/PostingDimension) | ⚫ Diferido | Sem precedente; YAGNI até demanda real. |
| **Subrazões** (AR, AP, estoque, imobilizado, **folha**, **fiscal/tributos**) | ⚫ Diferido | Cada um é módulo ERP first-class próprio. Folha/fiscal = domínios pesados isolados. |
| **Integração inbox/outbox/DLQ** | ⚫ Diferido | Só faz sentido quando sair de single-process (T11). Bridges cobrem a escala atual. |
| **IA/analytics** (sugestão de conta/conciliação, anomalias) | ⚫ Diferido | Sobre um ledger já confiável; IA sugere, humano contabiliza. |
| **LGPD/RBAC granular** | ⚫ Parcial | Autorização no servidor já vale; mascaramento/retenção/papéis finos = incremento próprio. |

---

## 6. Mapa de reuso canônico — os blocos reais a reaproveitar

Antes de gerar "novo", reuse (Contrato §0). Confirmado por código:

| Bloco | Onde |
|---|---|
| `AccountingScope` / `accountingScopeWhere` | `features/accounting/scope/AccountingScope.ts` |
| `PostingService.postEntry` (lançar ajustes) | `features/accounting/services/PostingService.ts` |
| `AuditService.append(tx, scope, event)` | `features/accounting/services/AuditService.ts` |
| `MAX_CENTS` | `features/accounting/models/money.ts` |
| `DocumentAttachment` (anexar extrato) | `features/accounting/services/DocumentAttachmentService.ts` |
| Parser puro `parseTable` | `lib/spreadsheet` (desacoplado do model INCR-6) |
| `AccountingReportService` (as_of + groupByAccount) | INCR-4 |
| Gate de período | INCR-1 |
| Factory / rota-3-toques / DTO Zod `.strict()` / Policy | Contrato §2/§3 |

---

## 7. Régua de progresso — os 5 núcleos (do grafo aspiracional §32), % real

| Núcleo | Estado | % | Falta |
|---|---|---|---|
| **1 — Ledger confiável** | ✅ | ~95% | (nada estrutural; "permissões/aprovação" que o grafo mistura aqui são torre nova, não gap) |
| **2 — Operação real** | 🟡 | ~60% | aprovação, dimensões, busca/filtros ricos |
| **3 — Integração** | 🟡 | ~40% | ~~SourceDocument formal~~ (✅ BE-INCR-8, mergeado PR #43); inbox, outbox (só se sair de single-process) |
| **4 — Gestão** | 🟡 | ~50% | fluxo de caixa, análise por dimensão, variação mensal |
| **5 — Compliance** | 🟡 | ~15% | ~~mapeamento referencial~~ (✅ BE-INCR-9, PR #58); falta geração do arquivo ECD/ECF (SPED), pacotes, recibos |

**Posição:** fundação (Núcleo 1) completa, Núcleo 2 mais da metade; ramos de expansão à frente. Último nó fechado = **Plano de Contas Referencial versionado (BE-INCR-9, PR #58)**. Com proveniência (INCR-8) **e** mapeamento referencial (INCR-9) mergeados, os **dois** pré-requisitos do §5 ECD/ECF estão de pé — o gate remanescente passa a ser só a geração do arquivo SPED (ADR próprio). Demais candidatos seguem ⚫ diferidos (§5).

---

## 8. Legenda de estados

| Marca | Significado |
|---|---|
| ✅ | Construído e mergeado em `main` |
| ⏳ | Incremento corrente (PRE-ADR ou em execução) |
| 🔴 | Decisão **rejeitada** — reabrir exige ADR + sinal humano |
| ⚫ | Diferido — real, mas fora do escopo atual; ADR/incremento próprio |
| 🟡 | Parcial |

> **Como manter este doc:** a cada incremento fechado, promova o nó ⏳→✅ e registre o ADR/merge. Ao
> avaliar qualquer proposta nova, cheque primeiro se ela colide com §1 (travadas) ou §4 (rejeitadas) —
> se colidir, é ADR, não tarefa.
