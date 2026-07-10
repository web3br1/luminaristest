# PLAN / Scope-brief — Geração do arquivo ECF (SPED Fiscal · IRPJ/CSLL · Lucro Presumido)

> **Estado: FASE 1 (parecer + PLAN + ADR) — ENTREGUE. FASE 2 (impl) — TRAVADA em sinal humano.**
> Nó ⚫ **DIFERIDO** no master map §5 ("ECF readiness"). A regra de uso do §1 proíbe rotear skill de
> geração contra um nó ⚫ sem **ADR em disco + sinal humano**. Este PLAN + o ADR normativo
> (`docs/adr/ADR-INCR-SPED-ECF-file-generation.md`) são a metade "ADR em disco"; falta o sinal humano
> (ADR §8) para destravar a FASE 2. Governança T12: `PLAN → ADR → BRIEF → impl → test → review
> independente (worktree separado) → PR → closeout → memória`.
> **ADR normativo (ler inteiro antes de qualquer código):** `docs/adr/ADR-INCR-SPED-ECF-file-generation.md`.

---

## 0. Estado atual (VERIFICADO nesta FASE 1 — não refazer)

- **Parecer de domínio fiscal:** produzido (persona `luminaris-accounting-architect`) e destilado no ADR §2 (ECD × ECF-Presumido) e §3 (decisões D1–D10).
- **Pré-requisitos de dado (master map §5):** proveniência (INCR-8 ✅), mapeamento referencial (INCR-9 ✅), **split de receita serviço×revenda (PR #66 ✅)** — todos em `main`. Confirmado por leitura de código:
  - `ChartOfAccountsFixture.ts:44,48` — `3.1 Receita de Serviços` + `3.3 Receita de Revenda` = folhas `Revenue` distintas.
  - `AccountingReportService.getAccountBalances(scope, from?, to?, excludeSourceTypes?)` (`:159-168`) — janela de datas + exclusão por `sourceType` já existem ⇒ **apuração trimestral é leitura da primitiva existente**.
  - `AccountingDataExchangeJob.kind/direction/status` = String puros ⇒ novo `kind` **sem migração**.
  - `ReferentialMappingService.coverage/listMappings` — fonte do Bloco J/K + coverage-gate.
  - **Lacuna ativa:** `CrmOpportunityWonMapper.ts:17` credita tudo em `3.1` (só salão faz o split) — ADR §5.2.
- **NENHUM código de ECF escrito.** `lib/ecf.ts`, DTO, service, rota — não existem (correto: FASE 2).
- **Leiaute oficial da ECF:** **NÃO baixado/transcrito** — é o **primeiro passo da FASE 2** (§2 abaixo).

---

## 1. Decisões travadas (do ADR — aplicar na FASE 2, não re-decidir)

- **D1** Regime único = **Presumido**; Real (L/M/N + LALUR) / Arbitrado (T) / Imune (U) FORA.
- **D2** Base = **receita bruta × presunção-por-atividade** (`3.1`→32%; `3.3`→8%/12%), lida do ledger. Percentuais/alíquotas = **constantes de domínio** (`models/presumption.ts`), nunca input. NÃO é lucro-líquido-driven.
- **D3** Apuração **TRIMESTRAL** (`P030` = 4/ano); IRPJ 15% + adicional 10% sobre excedente de R$ 60.000/tri; CSLL 9%.
- **D4** Regime/declarante/signatários = **DTO transiente**. **NUNCA** `TaxRegime`/`LegalEntity` persistido (colide §4/T2 — se tender a isso, PARE).
- **D5** **[FORK HUMANO]** Recuperação da ECD (Blocos C/E): rota (a) standalone vs (b) recover-from-ECD — **não decidida** nesta FASE 1.
- **D6** Bloco J/K referencial reusa `ReferentialMapping` (INCR-9) + **coverage-gate**; **`3.3` sem código RFB BLOQUEIA a geração** (`ValidationError` + `unmappedAccounts`).
- **D7** Serializer = lib pura `server/src/lib/ecf.ts`; job em `AccountingDataExchangeJob` (`kind='EXPORT_SPED_ECF'`); **zero migração**; download = rota de job INCR-6.
- **D8** Read-only ⇒ **sem gate de período in-tx**; único bloqueio = cobertura (D6).
- **D9** Datas por slice literal; centavos→decimal por divmod (sem float); determinismo byte-a-byte. **Encoding/terminador/formato de valor a confirmar** contra o Manual (não assumir paridade com a ECD).
- **D10** INCR-8 = pré-req satisfeito, consumo indireto (sem registro 1:1).

### Reuso obrigatório (confirmado por código — não recriar na FASE 2)
`AccountingReportService` (`getAccountBalances` com janela+exclusão, `balanceSheet`=P100, `incomeStatement`=P150, `LEDGER_STATUSES`) · `ReferentialMappingService.coverage`/`listMappings` · `AccountingDataExchangeJob` + `storage` + rota de download (INCR-6) · `AuditService.append(tx,scope,event)` · `IAccountingPolicy.canRead` · `AccountingScope`/`accountingScopeWhere` · `models/dates.ts::isValidDateOnly` · `money.ts::MAX_CENTS`. Precedente de serializer posicional puro: `lib/sped.ts` (ECD) — **espelhar a estrutura, reconfirmar o formato de campo**.

---

## 2. Passos da FASE 2 (executar SÓ após o sinal humano do ADR §8; `tsc` verde é gate entre passos)

> A rota do MVP (conjunto de blocos) **depende da resposta do FORK D5**. Os passos abaixo assumem o núcleo comum (Blocos 0/P/J/K/9 + Y-mínimo); C/E entram se rota (b).

### Passo A — Leiaute oficial da ECF (fundação campo-a-campo)
Baixar o **Manual de Orientação da ECF** do ano-calendário-alvo (gov.br/sped), `pdftotext -layout -enc UTF-8`, isolar a **matriz de obrigatoriedade por regime** (coluna Presumido) + a seção de leiaute. Resolver **ECF-1..ECF-7** (ADR §6) **antes** de codar qualquer builder. **Não inventar** ordem/tamanho/obrigatoriedade — citar a página do Manual em cada builder (disciplina da ECD/Passo 2b; lição I052).

### Passo B — Constantes de domínio fiscal (`models/presumption.ts`)
Percentuais de presunção por atividade (serviço 32%/32%, revenda 8%/12%), alíquotas (IRPJ 15%, adicional 10%, limite R$ 60.000/tri, CSLL 9%). Puro, testável. Fonte: ECF-5.

### Passo C — Serializer puro `server/src/lib/ecf.ts` (+ testes)
Register builders por bloco, na ordem exata do leiaute (Passo A). Primitivas de valor/data/contagem: **reconfirmar formato** vs. a ECD (D9/ECF-6) — reusar de `lib/sped.ts` só o que for byte-idêntico. Determinismo byte-a-byte no teste.

### Passo D — DTO `SpedEcfRequestDto` (`.strict()`)
`year`/período, `regime` (Presumido), `declarant` (NOME/CNPJ/UF/COD_MUN/…), `signers[]`, `mappingVersion` (referencial ECF), e — **se rota (b)** — `ecdRecibo`/`ecdHash`. Guardas de shape. Espelhar DTOs de `features/accounting/dtos`.

### Passo E — `SpedEcfGenerationService`
Policy-first (`canRead`). Fluxo: **coverage-gate (D6)** → apuração trimestral (4 janelas via `getAccountBalances`) + presunção (Passo B) → P100/P150 via INCR-4 → J/K via `ReferentialMapping` → `lib/ecf` monta o arquivo → `createJob` + `storage.saveFile` + `audit.append('sped.ecf_generated')` **na mesma tx** (espelhar `DataExchangeExportService`). Factory em `lib/factory.ts`.

### Passo F — Controller + Rota (3-toques)
`POST /api/accounting/sped/ecf/generate`. Registrar em `routes/index.ts` + `protectedApiPaths` + `@openapi` em `routes/docs.paths.ts`. **Atenção ao bug de classe `: ` não-quotado** em descrição @openapi (derrubou 17-18 paths em PR #59/#62 — quotar descrições com dois-pontos). Download = rota de job existente.

### Passo G — Suíte de testes de domínio
Gates: **cobertura bloqueia** (`3.3` sem mapeamento ⇒ falha + `unmappedAccounts`, nenhum arquivo) · **presunção correta** (base = Σreceita×%; IRPJ/adicional/CSLL por trimestre) · **trimestralidade** (4 apurações; adicional só sobre excedente de R$60k/tri) · **determinismo** (2 gerações → sha256 idêntico) · **data sem shift** · **valor sem float** · contagens de bloco · **tenancy** (NotFoundError cross-scope) · **invariante de fechamento** (nenhuma escrita em Posting/JournalEntry).

### Passo H — `api-contract-sync-generator` → `npm run docs:generate` (rota nova no openapi.json; conferir path-count guard).

### Passo I — Closeout
Master map §5: promover o nó ECF ⚫→✅ (com PR/merge) — ORCH-007. `learning-log`. Atualizar memórias `accounting-*` (nova: `accounting-sped-ecf-generation`). Linha no `docs/adr/INDEX.md`.

### Fechamento — Review independente (T12)
`luminaris-reviewer` em **worktree SEPARADO**, from-scratch. Caça-à-classe dirigida: todo consumidor que casa conta por **prefixo de código** e faz `if(!rule) continue` (lição do FAIL-1 do PR #66 — drop silencioso, verde por falta de fixture na conta nova). **Residual honesto:** PVA-pass = sign-off humano no PVA-ECF.

---

## 3. Gate de sinal humano (ADR §8) — PRECISA ser respondido antes da FASE 2
1. **[ROTA, bloqueador]** Recuperação da ECD: **(a) standalone** ou **(b) recover-from-ECD** (Blocos C/E)?
2. **[ESCOPO]** TaxRegime transiente basta (sem persistir cadastro)?
3. **[ESCOPO]** Bar de aceite = "importado sem erro no PVA-ECF"?
4. **[DADO]** Contador provê o **código referencial RFB de `3.3`** (senão o coverage-gate bloqueia por construção).
