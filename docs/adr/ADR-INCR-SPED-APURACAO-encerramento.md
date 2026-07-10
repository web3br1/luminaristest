# ADR-INCR-SPED-APURACAO — Apuração/encerramento do resultado (I350/I355) + ECD PVA-value-clean

- **Status:** **Proposed — planejamento fechado.** Decisões tomadas com base no parecer `luminaris-accounting-architect` (Fase 1–3, ACC-001..021) + leitura de código (CBM-001) + Manual de Orientação do Leiaute 9 da ECD (ADE Cofis nº 01/2026, janeiro/2026). Duas decisões de superfície ratificadas por sinal humano (D3 semântica de relatório, D5 liberação de chave na reversão).
- **Date:** 2026-07-10
- **Decision class:** PRISMA_FIRST_CLASS · **WRITE no ledger** (comando de encerramento cria `JournalEntry` real) + **mudança de semântica em relatório compartilhado** (INCR-4 `incomeStatement`). Contrato §2.1, T3.
- **Depends on (tudo em `main`):** INCR-1 (períodos — gate de `postEntry`), INCR-4 (`AccountingReportService` BP/DRE), **BE-INCR-SPED-ECD (PR #62, mergeado)** — este incremento entrega o que a ADR-SPED-ECD §5 declarou como residual (reconciliação de VALOR do bloco J).
- **Supersedes:** none · **Emenda a:** **ADR-INCR-SPED-ECD** — reclassifica `I350`/`I355` de **DIFERIDO (§4)** para **MVP**; resolve o **residual honesto (§5)** da reconciliação de valor do bloco J; muda `sped.ts` `buildI200` para derivar `IND_LCTO` (era hardcoded `'N'`).
- **Related:** ADR-INCR4 (BP/DRE — alterado aqui), ADR-INCR1 (períodos), memórias `authoritative-gate-inside-tx`, `unique-de-idempotencia-x-soft-delete`, `idempotency-class-fix-discipline`, `accounting-is-first-class-prisma`.

> **Nota de processo (T12).** `PLAN → ADR → BRIEF → impl → test → review independente (worktree separado) → PR → closeout → memória`. **Sem migração** (D2) ⇒ smoke-migration-gate **não se aplica**; **mas** há mudança de **dado seed** (conta canônica nova) — ver D2 e o gate de seed-backfill.

---

## 1. Contexto

**O problema.** A ECD gerada pelo BE-INCR-SPED-ECD é **estruturalmente** válida (ordem/contagem/campo-a-campo, `REGRA_OBRIGATORIO_I052`), mas **não reconcilia em VALOR** no bloco J: o resultado do exercício fica **não-encerrado**. As contas de resultado (Revenue/Expense) ainda carregam saldo em 31/12, então:
- o detalhe (linhas D) do J100 lado Passivo+PL **soma a menos** exatamente pelo resultado (`REGRA_SOMA_DAS_PARCELAS` falha);
- não há lançamento de encerramento (`I200.IND_LCTO='E'`) nem os registros `I350`/`I355`.

**O que o manual exige (grounded, Leiaute 9, não de memória):**
- **I350** (`REG, DT_RES`, nível 3, 0:N — facultativo, mas condicionalmente obrigatório): `DT_RES` = data da apuração do resultado, tem de `== I030.DT_EX_SOCIAL` e estar em `[0000.DT_INI, DT_FIN]` (`REGRA_ENCERRAMENTO_EXERCICIO`, `REGRA_DATA_INTERVALO_DO_ARQUIVO`, pp. 155-156).
- **I355** (`REG, COD_CTA, COD_CCUS, VL_CTA, IND_DC`, nível 4, filho de I350; +`VL_CTA_MF`/`IND_DC_MF` só com moeda funcional — fora do MVP): `VL_CTA` = saldo final da conta de resultado **antes** do encerramento (pp. 157-158).
- **I200.IND_LCTO** ∈ `["N","E"]` (Leiaute 9 fecha os válidos em N/E, p. 142): `E` = **lançamento de encerramento das contas de resultado**.
- **Regras rígidas do PGE** (erro se violadas):
  - `REGRA_VALIDACAO_CONTA_RESULTADO`: na data de encerramento, a soma do `VL_SLD_FIN` (I155) de **cada** conta de resultado tem de ser **0**.
  - `REGRA_VALIDACAO_SALDO_CONTA`: para cada conta de resultado, Σ das partidas de encerramento (`IND_LCTO='E'`) `== VL_CTA` do I355 (com D/C **invertido**).
  - `REGRA_REGISTRO_OBRIGATORIO_I350`: se existe I350, existe I200 `IND_LCTO='E'`.

**Achados de código que moldam o design (CBM-001):**
- `PostingService.postEntry(scope, {lines:[{accountCode,debitCents,creditCents}]})` — balanceado (Σdéb==Σcréd inteiro, `> 0`), `status='Posted'`, tx atômica, **gate de período autoritativo `assertPeriodOpenTx` DENTRO da tx**, idempotência `@@unique([userId,unitId,sourceType,sourceId])`; `sourceType` default `'manual'` é **string livre** (`PostingService.ts:160-176`).
- `JournalEntry` **não tem marcador de encerramento** — só `sourceType` (string) + `status` (`schema.prisma:439-469`). ⇒ `sourceType='closing'` **não gera migração**.
- `CANONICAL_ACCOUNTS` **não tem nenhuma conta Equity** (`ChartOfAccountsFixture.ts:20-39`); `ensureChartOfAccounts` é **create-if-missing por code, idempotente e aditivo** (`PostingService.ts:109-139`). ⇒ adicionar a conta de PL **não gera migração**.
- `STATEMENT_MAPPING_RULES` mapeia **qualquer** `nature:'Equity'` → seção `equity` (sinal `credit_positive`) (`StatementMappingFixture.ts:18`). ⇒ a conta nova flui para o BP sem tocar o mapeamento.
- `balanceSheet(asOf)` calcula `balanced = A === L + E + netResultLine` com `E` (equity de `allRows`, closing-**inclusive**) e `netResultLine` (DRE YTD, closing-**inclusive**) (`AccountingReportService.ts:410-464`).
- `incomeStatement(asOf)` computa a DRE da janela YTD closing-**inclusive** (`:470-514`).
- `reverseEntry` (estorno) idempotência via `original.reversedById` + `findBySource(scope,'reversal',original.id)`; move original→`Reversed` (`PostingService.ts:324-360`).

---

## 2. As decisões

### D1 — Encerramento é **lançamento real via `postEntry`**, NUNCA sintetizado no export
**Decisão:** o encerramento é um `JournalEntry` **postado** de verdade no ledger, criado por um comando de domínio próprio (`ExerciseClosingService.closeExercise`), reusando `PostingService.postEntry`. **Um único lançamento multi-leg por exercício**: cada conta de resultado é zerada pelo lado oposto do seu saldo; o líquido (= resultado) contra a conta de PL (D4). `Σdéb==Σcréd` por construção.

**Por quê (invariante que decide):** **identidade livro-arquivo + continuidade entre exercícios.** A ECD formaliza o Diário/Razão *reais*. Sintetizar só no export deixaria o `balanceSheet`/`trialBalance` do sistema para sempre com contas de resultado ≠ 0 e o PL sem o resultado acumulado — **o livro do sistema contradiz o arquivo entregue** — e forçaria **fabricar** o I155(dez)=0 no serializer (o roadmap proíbe). Persistindo, o I155(dez)=0 e o J100 (A=P com detalhe) **caem das leituras já existentes** — zero fabricação (ACC-018: a verdade vive em `Posting`). **Descartado:** encerramento sintético no exporter — quebra a continuidade e a abertura do exercício seguinte.

### D2 — Marcador via `sourceType='closing'` + conta de PL no fixture ⇒ **ZERO migração**
**Decisão:** o lançamento de encerramento é identificado por `sourceType='closing'` (string livre já existente). A contrapartida é uma conta canônica **nova** adicionada ao `CANONICAL_ACCOUNTS` (self-seed). **Nenhuma alteração de `schema.prisma`.**

**Por quê:** `sourceType` livre + fixture aditivo-idempotente = a menor superfície (memória `stay-on-sqlite`; contrato: reuse antes de recriar). **Descartado:** enum tipado `entryType` no schema — geraria migração + smoke-gate sem ganho de compliance no MVP (só se um requisito futuro exigir query indexada por tipo → ADR próprio).
**Guarda-corpo (seed-backfill):** adicionar a conta ao fixture altera o chart de **tenants existentes** no próximo `ensureChartOfAccounts`. É mudança de **dado seed**, não de schema — mas o gate de teste tem de provar que o self-seed é **aditivo** (só cria faltantes, não toca contas existentes) e que a conta nova **participa do coverage-gate D5 da ECD** (ver D8).

### D3 — DRE closing-aware **no relatório compartilhado (INCR-4)**; BP **inalterado**  **[ratificado por sinal humano]**
**Decisão:** `incomeStatement` passa a **excluir** lançamentos `sourceType='closing'` da janela da DRE (mostra o resultado **operacional**, pré-encerramento). `balanceSheet` **não muda**: permanece closing-**inclusive**, então pós-encerramento o `equity` carrega o resultado (conta de PL postada) e o `netResultLine` **auto-zera** (a janela YTD inclui o encerramento) — `balanced = A === L + (E+resultado) + 0` continua válido.

**Consequência documentada (semântica que diverge pós-encerramento):** `incomeStatement.netResult` (operacional, closing-excluded) **deixa de ser igual** a `balanceSheet.netResultLine` (resultado ainda-não-encerrado, closing-included → 0). Pré-encerramento são iguais; pós, divergem **por necessidade contábil** — a DRE reporta a performance do ano, o BP mostra o resultado dentro do PL. A frase "netResultLine usa a mesma janela da DRE exibida" (`AccountingReportService.ts:407-408`) fica **desatualizada** e é corrigida.

**Por quê (menor blast radius de longo prazo):** "a DRE nunca inclui o encerramento" é verdade contábil **universal**, não quirk do SPED (ACC-021: regra de sinal/semântica **centralizada**). Colocar o filtro no report compartilhado conserta **de uma vez** o FE DRE e o SPED J150; deixá-lo local no exporter deixaria a **DRE do FE mostrando zero** para o ano encerrado (errado) e **duplicaria** a regra. **Descartado:** filtro local no exporter. Regressão: anos **sem** encerramento não mudam (exclusão é no-op) — só anos encerrados; teste de A=P bidirecional garante.

### D4 — Contrapartida = conta de PL canônica, **direto** (sem ARE intermediária no MVP)
**Decisão:** adicionar ao `CANONICAL_ACCOUNTS`:
- `2.3` **"Patrimônio Líquido"** — `Equity`, `acceptsEntries:false` (sintética; fecha a hierarquia sob o `2` Passivo — `COD_NAT` é por-conta no I050, um PL sob o grupo Passivo é conforme).
- `2.3.1` **"Lucros ou Prejuízos Acumulados"** — `Equity`, `acceptsEntries:true`.

O serviço resolve a conta por **constante de código canônico** (`RETAINED_EARNINGS_CODE='2.3.1'`), nunca por nome. O encerramento posta o líquido **direto** em `2.3.1`.

**Por quê:** o PGE não exige a conta transitória **ARE** (Apuração do Resultado do Exercício) — `REGRA_VALIDACAO_SALDO_CONTA` só checa as contas de **resultado**, não a contrapartida. ARE adicionaria conta transitória + 2º lançamento sem ganho de compliance (YAGNI). **Descartado/diferido:** ARE intermediária (ADR próprio se um requisito de apresentação exigir). `2.3` sintética entra junto para a hierarquia I050/`codCtaSup` fechar.

### D5 — Idempotência `sourceId=String(year)`; **reversão LIBERA a chave**  **[ratificado por sinal humano]**
**Decisão:** um encerramento por `(owner, unit, exercício)`: `sourceType='closing'`, `sourceId=String(year)` (ex.: `'2026'`), `date='${year}-12-31'`. Re-`closeExercise` do mesmo ano é **idempotente** (o `@@unique` faz P2002→re-fetch). **Reabrir/estornar** um encerramento (`ExerciseClosingService.reopenExercise`) (a) estorna via `reverseEntry` e (b) **renomeia o `sourceId` do encerramento estornado** para `closing:${year}:reversed:${id}`, **liberando** `closing:${year}` — então re-`closeExercise` produz um lançamento **novo e válido**.

**Por quê:** fecha a **classe-de-bug idempotência×soft-delete/reversão** (memórias `unique-de-idempotencia-x-soft-delete` + `idempotency-class-fix-discipline`) — o padrão "rename-on-free" é o já decidido no projeto. É comando **interno** (não evento externo), então chavear por exercício dentro do escopo não fere ACC-013. **Descartado:** (b') versão embutida no `sourceId` (`v2`) — complica a idempotência do caso normal; (c) diferir — deixaria a armadilha viva, contra a memória. **Gate obrigatório:** teste **cross-path** `estorna → re-encerra → lançamento NOVO` (não same-path).

### D6 — Encerramento é **comando próprio**, roda com dezembro **OPEN**, **antes** do hard-close
**Decisão:** `closeExercise` é rota/serviço próprio (ACC-016: estado por comandos), **desacoplado** do `PeriodService` (que é só transição de status e não posta). Como `postEntry` exige o mês-alvo OPEN (`assertPeriodOpenTx`), a sequência é: operacionais postados → **`closeExercise`** (dez OPEN) → `hardClosePeriod`.

**Por quê:** encerramento (posta lançamento) e close de período (muda status) são **agregados distintos**. **Guarda-corpo documentado:** `hardClose` é terminal (sem reopen) — hard-fechar dezembro **antes** de encerrar trava o exercício (`postEntry` bloqueia). MVP: `closeExercise` apenas propaga o erro do gate (honesto); um guard automático que valide a ordem é **diferido**. Documentar a ordem no brief e na resposta de erro.

### D7 — I350/I355 (pré-encerramento) derivados do **mesmo filtro `sourceType='closing'`**
**Decisão:** no exporter, os saldos pré-encerramento (I355) vêm de uma leitura das contas de resultado **excluindo** `sourceType='closing'` as-of 31/12 (= o que a DRE closing-aware da D3 já computa por conta). O I155 de dezembro usa a leitura completa (inclui o encerramento → contas de resultado zeram). `I350.DT_RES = 31/12` (== `DT_EX_SOCIAL`). No `buildI200`, **`IND_LCTO` deixa de ser hardcoded `'N'`**: deriva de `sourceType==='closing' → 'E'`, senão `'N'`.

**Por quê:** a mesma leitura filtrada que a DRE usa separa pré de pós sem contradição — `REGRA_VALIDACAO_CONTA_RESULTADO` (I155 dez = 0) e `REGRA_VALIDACAO_SALDO_CONTA` (Σ partidas 'E' == VL_CTA I355, D/C invertido) caem **por construção**. **Descartado:** recomputar saldos pré no serializer — fabricação proibida.

### D8 — Escopo do incremento (o que entra / o que não)
**Entra (write):** `ExerciseClosingService` (`closeExercise(year)`, `reopenExercise(year)`) + DTO `.strict()` + controller + rota 3-toques + factory; conta de PL no fixture; leitura de exclusão-closing no `IPostingRepository`/report.
**Entra (read/export):** builders `buildI350`/`buildI355` em `lib/sped.ts`; `IND_LCTO` derivado; `SpedGenerationService` emite I350/I355 e usa a DRE closing-aware para J150; J100 reconcilia automaticamente pós-encerramento.
**Fora (diferido — ADR próprio):** ARE intermediária (D4); guard automático de ordem período×encerramento (D6); assinatura/transmissão (J930 PKCS#7 / Receitanet); ECF; retificação; multi-período/fração de mês; `I351` (não existe no Leiaute 9) e demais registros já diferidos na ADR-SPED-ECD §4.

**Nota PVA-value-clean:** a ECD só reconcilia em valor **para um exercício encerrado**. Gerar ECD de exercício **não-encerrado** mantém o residual de valor do bloco J (estrutura OK) — encerre antes de gerar para transmitir.

---

## 3. Superfície de API (MVP)

Rota nova `/api/accounting/closing/*` (3-toques, OpenAPI JSDoc). Policy **reusa** `IAccountingPolicy.canPost` (é escrita no ledger).

| Método | Rota | Policy | Efeito |
|---|---|---|---|
| `POST` | `/closing/exercise` | `canPost` | valida DTO (`year`) → `ExerciseClosingService.closeExercise` → posta 1 encerramento multi-leg (`sourceType='closing'`, `sourceId=year`, dt=31/12) via `postEntry` → retorna o lançamento. Idempotente por ano. `422` se não há contas de resultado com saldo; erro de gate se dezembro não-OPEN. |
| `POST` | `/closing/exercise/reopen` | `canPost` | `reopenExercise(year)`: estorna o encerramento + libera a chave (D5). Idempotente. |

DTO `CloseExerciseRequestDto` (Zod `.strict()`): `year` (int, faixa sã) — ou `unitId` já vem do escopo. Sem campos de identificação (não é o DTO do SPED).

---

## 4. Definition of Done / gates de teste (domínio)

- `cd server && npx tsc --noEmit` + `cd my-app && npx tsc --noEmit` limpos · `npx jest features/accounting` + `lib` **verde sem regredir** · `docs:generate` (rotas novas) · skill-audit `wiring` · **review por agente independente (worktree isolado, T12)**. **Sem** smoke-migration-gate (D2: sem migração) — **mas** provar o seed-backfill (abaixo).
- **Testes obrigatórios (parecer §7):**
  1. `closeExercise` posta 1 encerramento balanceado (Σdéb==Σcréd) multi-conta, `sourceType='closing'`.
  2. **`REGRA_VALIDACAO_CONTA_RESULTADO`:** I155(dez).saldoFinal == 0 para **cada** conta de resultado após encerrar.
  3. **`REGRA_VALIDACAO_SALDO_CONTA`:** Σ partidas de encerramento por conta == I355.VL_CTA (D/C invertido).
  4. **`REGRA_REGISTRO_OBRIGATORIO_I350`:** I350 presente ⟺ existe I200 `IND_LCTO='E'`; `DT_RES==31/12==DT_EX_SOCIAL`.
  5. **A=P nos DOIS estados:** pré (netResultLine≠0, PL sem resultado) e pós (PL carrega, netResultLine=0) — `balanced===true` em ambos.
  6. **DRE exclui encerramento:** `incomeStatement` de ano encerrado mostra o resultado operacional (não zero); ano **sem** encerramento inalterado (regressão).
  7. **Idempotência:** re-`closeExercise` do mesmo ano → **mesmo** lançamento (sem duplicar).
  8. 🔴 **Reversão libera a chave (cross-path):** `closeExercise` → `reopenExercise` → `closeExercise` → lançamento **NOVO** válido (não retorna o estornado).
  9. **Gate de período:** encerrar com dezembro HARD_CLOSED → falha com erro do gate (honesto).
  10. **Coverage-gate D5 (integração ECD):** `2.3.1` analítica sem mapeamento referencial ⇒ geração da ECD falha com `unmappedAccounts` (a conta nova entra no gate).
  11. **Seed-backfill aditivo:** `ensureChartOfAccounts` num tenant sem `2.3.1` cria-a **sem** tocar contas existentes; idempotente na 2ª chamada.
  12. **Tenancy:** encerramento de outro escopo não vaza; cross-scope = NotFound.
  13. **Determinismo/ zero-fabricação:** I155/J100 derivam de leitura real; 2 gerações da ECD do ano encerrado ⇒ sha256 idêntico (o teste de determinismo do SPED continua verde com o encerramento presente).
  14. `IND_LCTO` derivado de `sourceType`, nunca hardcoded (unit test do `buildI200`).

---

## 5. Rejeitados (resumo)

| Alternativa | Vencedor | Motivo |
|---|---|---|
| Encerramento sintético no serializer | Lançamento real via `postEntry` (D1) | Identidade livro-arquivo + continuidade; evita fabricar I155(dez)=0 |
| Enum `entryType` no schema | `sourceType='closing'` (D2) | Zero migração; string livre já existe |
| Filtro closing local no exporter | DRE closing-aware no report INCR-4 (D3) | Verdade contábil universal; conserta FE+SPED de uma vez; senão FE DRE mostra zero |
| ARE intermediária no encerramento | Direto para `2.3.1` (D4) | PGE não exige; YAGNI |
| Diferir reversão / versão no sourceId | Rename-on-free na reversão (D5) | Fecha a classe-de-bug documentada; idempotência normal intacta |
| Acoplar encerramento ao close de período | Comando próprio (D6) | Agregados distintos; `postEntry` exige período OPEN |
| Mudar `balanceSheet` p/ closing-exclusive | BP inalterado (D3) | Double-count / A≠P; o BP DEVE incluir o encerramento p/ o PL carregar o resultado |
