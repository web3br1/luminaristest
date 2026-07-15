# ADR-INCR-APPROVAL — Torre de aprovação (maker-checker / SoD)

- **Data:** 2026-07-14
- **Status:** **Accepted — ratificado por sinal humano ("consuma esse prompt e aplique até o fim", 2026-07-14).** Os defaults recomendados pelo par orquestrador + arquiteto-contábil foram adotados; os forks com escolha real aberta (F3/F4/F6) resolvidos na opção MVP abaixo. IMPLEMENTADO nesta branch (`claude/approval-tower-maker-checker-940fdd`).
- **Autores:** par `luminaris-orchestrator` (plano, ORCH-001) + `luminaris-accounting-architect` (parecer de domínio, ACC-002).
- **Nó do master map:** §5 "Torre de aprovação (maker-checker, SoD, `submittedById`/`approvedById`/`version`/`contentHash`)" — ⚫ diferido com ADR próprio; este ADR o abre. Não colide com §1 (T1–T12) nem §4 (rejeitadas) — verificação em §2. É o 1º gap nomeado do Núcleo 2 (§7, ~60%).

## TLDR (2 linhas)

A torre entra como **estágio intermediário no ciclo de vida do `JournalEntry`** (`Draft → PendingApproval → Posted`, com `Rejected`→`Draft`), reusando integralmente `PostingService`/numeração/período/audit — **zero motor novo, zero tabela nova**. O controle de SoD é dinâmico no servidor (aprovador ≠ criador) e a integridade da aprovação é um **CAS in-tx sobre `(status, version, contentHash)`** — o `contentHash` cobre o **conteúdo econômico** (partidas + data + descrição), fechando o risco #1 (aprovar cabeçalho e trocar o valor depois).

---

## 1. Contexto e objetivo

Hoje todo lançamento nasce **já postado** (`PostingService.postEntry` vai direto a `Posted` com
número). Não há como uma pessoa **propor** um lançamento e outra **autorizar** antes de ele bater no
ledger. Sem isso, operação multi-pessoa séria é impossível: quem digita também consuma, sem
segregação de funções. Este incremento insere o gate maker-checker **antes** do POST.

**Classificação (STOP block do CLAUDE.md):** entidade com invariante legal/financeiro ⇒ **Prisma
first-class** (T3). Aqui nem sequer há entidade nova — é **extensão do `JournalEntry` existente**.

**Escopo MVP:**
- Ciclo por comandos: `createDraft`, `updateDraft`, `submit`, `approve`, `reject` (ACC-016 — nunca `PATCH status`).
- SoD **dinâmica hard**: aprovador ≠ criador, no servidor.
- **Não** substitui `postEntry` direto — o caminho "postar direto" segue vivo para integrações
  (bridges, AP, salon, import) e para quem tem alçada de postar sem aprovação. A torre é o caminho
  **controlado e opt-in** para lançamentos manuais.

**FORA de escopo (nomeado como dívida):** RBAC granular por papéis / alçada por valor (nó ⚫ próprio —
o "quem aprova" fica em "qualquer usuário-do-escopo ≠ criador"); aprovação em N-níveis; FE
(`FE-INCR-APPROVAL`, padrão FE-INCR-1).

## 2. Evidência de código (CBM-001 — confirmado por leitura)

| Claim | Grau | Evidência |
|---|---|---|
| `postEntry` cria a entrada já `Posted` com `entryNumber`/`fiscalYear` nascendo no POST dentro da tx (ACC-015); gate de período preflight + autoritativo in-tx | verificado | `services/PostingService.ts:161-319` (numeração :211-212, gate in-tx :208-209) |
| `entryNumber`/`fiscalYear` são lidos **só em contexto Posted** (recibo, SPED, Livro Diário) — nenhuma leitura em Draft | verificado | grep `.entryNumber`/`.fiscalYear`: `ReceiptService.ts:56-57`, `SpedGenerationService.ts:264`, `DailyJournalReportService.ts:109` (todos sobre entradas em `LEDGER_STATUSES`) |
| `LEDGER_STATUSES = ['Posted','Reconciled','Reversed']` — Draft já é invisível em BP/DRE/SPED; `PendingApproval` herda essa invisibilidade sem tocar em relatório | verificado | `models/ledgerStatus.ts:18` |
| `createdById`/`postedById` já existem como trilha de autoria/SoD | verificado | `schema.prisma:487-488` |
| Numeração gapless por sequência transacional (`nextEntryNumber` upsert in-tx) | verificado | `repositories/PostingRepository.ts:74-87` |
| `AuditService.append(tx, scope, event)` exige tx; P2002 nunca engolido; allowlist fechada (eventType novo entra na allowlist) | verificado | `services/AuditService.ts:51-107`; `audit/auditCanonical.ts` |
| Padrão CAS-antes-do-post (updateMany com filtro de estado retornando count) | verificado | `PayableService.ts:195-243` + `repositories/JournalEntryRepository.ts:65-80` |

**Colisões com decisões commitadas:** nenhuma. SQLite (T1) — o "lock de aprovação" é **CAS
transacional em app + coluna `version`**, não exclusion-constraint PG. AccountingScope 2-níveis (T2)
intocado. Prisma first-class (T3). Estorno = lançamento novo (T5) intocado (aprovação é ANTES do
post, não mexe em estorno). Gate in-tx (T6). Audit hash-chain in-tx (T8).

## 3. Onde a aprovação entra no ciclo de vida (a ordem)

```
createDraft        submit            approve (checker)          reverse (T5, já existe)
   │                 │                  │                          │
 Draft ──────▶ PendingApproval ──────▶ Posted ─────────────────▶ Reversed
   ▲                 │            (nº nasce AQUI, in-tx)
   └──── reject ─────┘
   updateDraft (só em Draft)
```

- **A aprovação é gate ANTES do POST — o `approve` É o que posta.** Um `PendingApproval` **não tem
  `entryNumber`/`fiscalYear`** (ambos `null`) e **não entra em relatório** (fora de `LEDGER_STATUSES`,
  igual a `Draft`). Isso preserva ACC-015: o número gapless só nasce quando o lançamento é autorizado
  a existir no ledger — um rascunho rejeitado **nunca** consome número.
- **O que cada transição toca:**
  - `createDraft`: cria header `Draft` + partidas balanceadas (`version=1`, `contentHash=null`, sem número).
  - `updateDraft`: só em `Draft` — substitui data/descrição/partidas, `version++`, `contentHash` volta a `null`.
  - `submit`: `Draft→PendingApproval`; congela `contentHash` do conteúdo econômico, grava `submittedById`, `version++`.
  - `approve`: `PendingApproval→Posted`, **um tx**: CAS `(status, version, contentHash)` + gate SoD (`actor≠createdById`) + gate de período in-tx + `nextEntryNumber` + grava `approvedById`+`postedById` + audit `entry.approved`.
  - `reject`: `PendingApproval→Draft`; limpa `submittedById`/`contentHash`, `version++`, audit `entry.rejected`.

## 4. Mudança de schema (aditiva, JournalEntry)

- `submittedById String?` — ator que submeteu (trilha do maker).
- `approvedById String?` — ator que aprovou (trilha do checker).
- `version Int @default(1)` — contador de optimistic lock.
- `contentHash String?` — hash do conteúdo econômico, congelado no `submit`.
- `fiscalYear Int?` / `entryNumber Int?` — **passam a nullable** (nascem no POST — ACC-015; um Draft não tem número). Linhas Posted existentes mantêm seus valores; `@@unique([userId,unitId,fiscalYear,entryNumber])` tolera múltiplos `(null,null)` (SQLite trata NULL como distinto). Status ganha o valor de string `PendingApproval` (sem enum novo).

## 5. Forks — decisão (defaults do parecer)

| Fork | Decisão | Justificativa |
|---|---|---|
| **F1** status-string vs estado-separado | **(a)** novo valor `PendingApproval` na string existente | T3 mínimo; `LEDGER_STATUSES` já exclui não-Posted. Máquina-de-estado em tabela nova = over-engineering. |
| **F2** escopo do `contentHash` | **partidas (accountId+débito+crédito) + data + descrição**; exclui derivados (número/versão/status/timestamps); anexos = Fase 2 | Cobrir as partidas é o núcleo do controle (risco #1). |
| **F3** SoD hard vs configurável | **(a) hard** (`actor≠createdById`) | Configurável exige papéis = RBAC ⚫. Não construir config p/ valor de 1 estado. |
| **F4** rejeição→Draft vs terminal | **(a) →Draft** (reeditável via `updateDraft`) | Terminal perde o fluxo de correção; contábil corrige-e-ressubmete. Audit registra a rejeição. |
| **F5** approve+post 1 vs 2 comandos | **(a) 1 comando** — `approve` posta atomicamente (`approvedById=postedById`) | POST numera in-tx (ACC-015). Estado "aprovado aguardando janela" = YAGNI. |
| **F6** quem aprova | **(a) qualquer usuário-do-escopo ≠ criador** | Aprovador-por-papel/alçada = RBAC ⚫ (Fase 2). |

## 6. Invariantes (novos + tocados)

- **[ACC-016]** ciclo por comandos, nunca `PATCH status`. Falha: um `PATCH {status:'Posted'}` pula o gate SoD inteiro.
- **[ACC-017]** aprovação congela `contentHash`+`version`; editar depois invalida; criador ≠ aprovador.
- **[ACC-022 — NOVO]** `contentHash` cobre o **conteúdo econômico** (partidas + data + descrição). Falha: torre-teatro (risco #1).
- **[ACC-023 — NOVO]** transição de aprovação = **CAS in-tx** sobre `(status ∧ version ∧ contentHash recomputado == armazenado)`; SoD re-checada dentro/imediatamente antes da tx. Falha: dois `approve` concorrentes, ou aprovação com `version` obsoleta, passam.
- **[ACC-015]** número nasce no POST (=approve), nunca no rascunho. **[T8/ACC-019]** um evento de audit por comando, na mesma tx.

## 7. Gates de fechamento (review contábil independente)

1. **Concorrência:** dois `approve` paralelos → exatamente um posta (CAS em `version`), o outro falha (0 linhas → 409).
2. **SoD:** criador aprovando o próprio → `ForbiddenError` (in-service, não só UI).
3. **Tamper:** `updateDraft` após `submit` é barrado (só em Draft); `contentHash` recomputado no approve diverge se as partidas mudarem → rejeita; `approve` com `expectedVersion` obsoleta → 409.
4. **ACC-015 intacto:** Draft/PendingApproval sem número e ausentes de BP/DRE/SPED; approve numera gapless in-tx.
5. **Migração aditiva:** colunas novas nullable; Draft/Posted existentes seguem válidos; `postEntry` direto intocado. smoke-migration-gate sobre dev.db real antes de deploy.
6. **Neutralidade de relatório:** `LEDGER_STATUSES` inalterado.

## 8. Risco #1

`contentHash` que não vincula as partidas. Se a aprovação congela só o cabeçalho, o maker altera
débito/crédito/conta depois do checker aprovar → mudança unilateral no ledger com a assinatura do
checker. Mitigação: ACC-022 (hash cobre partidas) + ACC-023 (CAS recomputa e compara o hash in-tx).
