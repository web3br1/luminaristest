# ADR-INCR-SPED-ECD — Geração do arquivo ECD (SPED Contábil)

- **Status:** **Proposed — aguardando aval humano no Passo 1 (ADR + sourcing do leiaute).** Nenhum código escrito ainda. Decisões tomadas pelo agente com base no parecer `luminaris-accounting-architect` + master map + leitura de código (CBM-001) + leiaute oficial da RFB.
- **Date:** 2026-07-09
- **Decision class:** PRISMA_FIRST_CLASS · **READ/EXPORT** (majoritariamente leitura do ledger + um write de metadados de job). **NÃO** muda valor de ledger — consome razão/balancete/plano/mapeamento já existentes. Contrato §2.1, T3.
- **Depends on (tudo em `main`):** INCR-4 (`AccountingReportService` — balancete/razão/BP/DRE), INCR-1 (períodos), INCR-2 (`AuditService` hash-chain), INCR-6 (`AccountingDataExchangeJob` + `storage` + download de artefato), **INCR-8 (proveniência — pré-requisito §5)**, **INCR-9 (`ReferentialMapping` + cobertura chart-driven — pré-requisito §5)**.
- **Roadmap:** `docs/accounting/ACCOUNTING-MASTER-MAP.md` §5 — nó "**ECD/ECF readiness**" (⚫ diferido). Este ADR entrega o gate remanescente: **a geração do arquivo**. Ambos os pré-requisitos (INCR-8 proveniência, INCR-9 mapeamento referencial) já em `main`.
- **Supersedes:** none · **Related:** ADR-INCR9 (mapeamento referencial — a **fonte** do I051), ADR-INCR8 (proveniência), ADR-INCR4 (BP/DRE = fonte de J100/J150), ADR-INCR7-OFX/CNAB (precedente de **parser posicional puro em `lib/`** — mesma classe de risco).

> **Nota de processo (T12).** ADR escrito **antes** do código. `PLAN → ADR → BRIEF → impl → test → review independente (worktree separado) → PR → closeout → memória`. **Sem migração** (ver D1) ⇒ smoke-migration-gate **não se aplica**. Divergências vs. o brief de entrada marcadas **[REFINA O BRIEF]**.

---

## 1. Contexto

**O que é ECD.** A Escrituração Contábil Digital (SPED Contábil) é um **arquivo texto único**, organizado em **blocos → registros**, layout **pipe-delimitado** (`|CAMPO|CAMPO|...|`, um registro por linha, começando e terminando em `|`). Substitui os livros Diário/Razão em papel. Cada registro tem um leiaute de campos fixo, **ordem e obrigatoriedade** definidas pelo manual oficial da RFB — que **muda por leiaute/ano-calendário**.

**Fonte normativa fixada (CBM-001 aplicado a spec externa):**
> **Manual de Orientação do Leiaute 9 da ECD — Anexo ao Ato Declaratório Executivo Cofis nº 01/2026 — Atualização: janeiro de 2026 (235 páginas).**
> URL oficial: `https://www.gov.br/sped/pt-br/assuntos/escrituracoes-digitais/ecd/manuais-e-documentos-tecnicos/manual_de_orientacao_da_ecd_leiaute_9_janeiro_2026.pdf`
> PDF baixado em disco (tool-results) e texto integral extraído (`pdftotext -layout`) para `scratchpad/ecd_leiaute9_utf8.txt` (14.392 linhas) + seção de leiaute dos registros isolada em `scratchpad/ecd_leiaute9_LAYOUT_SECTION.txt`. **Essa é a referência de campo-a-campo do Passo 2.**

**Bar de aceite (decidido pelo usuário):** **VALIDAÇÃO PVA** — o arquivo `.txt` deve ser **importado e validado sem erro de estrutura** pelo PGE/PVA do SPED Contábil. (O PVA importa e valida um `.txt` **não assinado**; assinar/transmitir é passo posterior — ver §7 diferido.)

**Por que agora.** Os dois pré-requisitos que o master map §5 nomeava (proveniência formal ✅ INCR-8; mapeamento referencial versionado ✅ INCR-9) estão em `main`. O gate remanescente registrado é "só a geração do arquivo — ADR próprio". Este é esse ADR.

**Achados de código que moldam o design (confirmados por leitura, CBM-001):**
- `AccountingDataExchangeJob.kind`/`direction`/`status` são **`String` puros** (`schema.prisma:524-526`); as unions vivem só no DTO (`models/DataExchange.model.ts:14-36`). ⇒ novo `kind` **não gera migração**.
- `DataExchangeExportService` (INCR-6) já cria job + persiste artefato em disco (`storage.saveFile`) + audit na mesma tx + serve download (`getArtifactForDownload`) — `DataExchangeExportService.ts:116-207`.
- `AccountingReportService` expõe `trialBalance`, `getAccountBalances(scope, from?, to?)` (privado, mas é o motor de saldo por janela), `balanceSheet(asOf)` (=J100), `incomeStatement(asOf)` (=J150) e `LEDGER_STATUSES = ['Posted','Reconciled','Reversed']` (exclui `Draft`) — `AccountingReportService.ts:145,160-187,410-514`.
- `ReferentialMappingService.coverage(version)` → `{ unmappedAccounts[], ready }` (chart-driven) e `listMappings(version)` → fonte do I051 — `ReferentialMappingService.ts:151-192`.
- `models/dates.ts::isValidDateOnly` (round-trip, sem UTC-shift) e `money.ts::MAX_CENTS` — canônicos a reusar.

---

## 2. As decisões

### D1 — **SEM model novo**: reusar `AccountingDataExchangeJob` (kind `EXPORT_SPED_ECD`)  **[REFINA O BRIEF]**

**Decisão:** a geração do arquivo é registrada como um **job de export** na tabela existente `AccountingDataExchangeJob`: `direction='EXPORT'`, `kind='EXPORT_SPED_ECD'` (novo valor no union `EXPORT_KINDS`), `status='EXPORTED'`, `mimeType='text/plain'`, `sha256`/`sizeBytes`/`storageKey` do `.txt`. O artefato é servido pela **rota de download de job JÁ existente** — só a rota de **geração** é nova.

**Por quê (vencedor):** `kind`/`direction`/`status` são `String` puros (evidência acima) ⇒ **zero migração, zero smoke-migration-gate**. Toda a máquina de job+artefato+download+audit do INCR-6 é reusada. **Descartado:** model `SpedExport` (período+hash+status) próprio — duplicaria integralmente essa máquina sem nenhum invariante novo que o banco precise garantir; é exatamente a "ilha bespoke" que o critério de reuso proíbe. **Guarda-corpo:** se algum requisito futuro exigir estado que o job não comporta, isso é ADR próprio — não improvisar model aqui.

### D2 — Serializer é **lib pura** em `server/src/lib/sped.ts`, fora do service

**Decisão:** o layout posicional/pipe (montagem de linhas de registro, `centsToSpedDecimal`, `spedDate`, contagem de registros) vive numa **função pura** em `server/src/lib/sped.ts`, testável isolada. O service **compõe dados** e chama o serializer; **não** carrega layout.

**Por quê:** espelha o precedente `lib/ofx.ts`/`lib/cnab.ts`/`lib/spreadsheet` (parser/serializer posicional desacoplado do model — mesma classe de risco). Mantém o service fino e o layout 100% coberto por teste unitário determinístico. **Descartado:** layout dentro do `SpedGenerationService` — acopla I/O a formatação e dificulta o teste byte-a-byte.

### D3 — Identificação do declarante = **parâmetro de DTO transiente**, NUNCA model  **[guarda-corpo §4]**

**Decisão:** os campos de identificação do registro **0000** (e os signatários do **J930**, o termo **I030/J900**) que **não existem no ledger** entram como **input do DTO de geração**, por geração. Campos-chave (leiaute 0000, pp. 64-…): `NOME`, `CNPJ`, `UF`, `IE`, `COD_MUN` (IBGE), `IM`, indicadores (`IND_SIT_ESP`, `IND_NIRE`, `IND_FIN_ESC`, `TIP_ECD`, `COD_VER_LC` etc.); do I030/J900: `NUM_ORD` (nº de ordem do livro), `NAT_LIVRO`; do J930: lista de signatários (`NOME`, `CPF`, `QUALIF_ASSIN`, ...).

**Por quê:** persistir um cadastro de empresa/estabelecimento reabriria a **torre multiempresa rejeitada** (master map §4; T2 = `AccountingScope` de 2 níveis, sem `LegalEntity`). A identificação é **entrada de compliance por geração**, não entidade de negócio. **Descartado:** model `CompanyProfile`/`LegalEntity` — colisão direta com §4; seria **DECISÃO ARQUITETURAL** (ADR + sinal humano) e está **fora** deste incremento. **Se o design tender a persistir esse cadastro → PARAR.**

### D4 — Escopo = **ECD, Livro Diário Geral (tipo G), anual** — conjunto de registros do MVP

**Decisão:** gerar uma ECD do tipo **G (Diário Geral)** para um **ano-calendário** (DT_INI=01/01, DT_FIN=31/12), com o conjunto **obrigatório** de registros abaixo. Fundamentado na **matriz de obrigatoriedade** do manual (coluna **G**, pp. 60-61) + notas de rodapé:

| Bloco | Registros do MVP (coluna G = Obrigatório, salvo nota) |
|---|---|
| 0 | `0000` (abertura+identificação), `0001` (abertura bloco 0), `0990` (encerramento). `0007` (outras inscrições) = **condicional/opcional** — emitir só se o DTO trouxer inscrições extras. |
| I | `I001`, `I010` (identificação da escrituração), `I030` (termo de abertura), `I050` (plano de contas), **`I051` (plano referencial)**, `I150` (saldos periódicos – período), `I155` (detalhe dos saldos), `I200` (lançamento), `I250` (partidas), `I990`. |
| J | `J001`, `J005` (demonstrações), **`J100` (Balanço)**, **`J150` (DRE)**, `J900` (termo de encerramento), `J930` (signatários), `J990`. |
| 9 | `9001`, `9900` (contagem por tipo de registro), `9990`, `9999` (total de linhas). |

**Sobre o Bloco J (por que entra):** na matriz, `J005/J100/J150` aparecem como `F(5)` — **nota de rodapé 5: "J100 e J150 são obrigatórios se J005 corresponde ao final do exercício social."** Como o MVP gera a ECD **anual** (J005 = fim do exercício), **Bloco J é obrigatório** — confirma a decisão de escopo expandido do usuário. J100/J150 = output direto de `AccountingReportService.balanceSheet`/`incomeStatement` (INCR-4) ⇒ reuso, não cálculo novo.

**Por quê tipo G:** é a menor superfície que ainda é uma ECD real e válida (Diário Geral completo). **Descartado:** tipos R/A/B/Z (resumida/auxiliar/balancetes diários/razão auxiliar) — puxam registros I012/I015/I300/I310/I500+ que são de livros auxiliares, fora do MVP.

### D5 — **Cobertura referencial bloqueia a geração** (gate único), reusando o diagnóstico INCR-9

**Decisão:** antes de montar qualquer registro, chamar `ReferentialMappingService.coverage(mappingVersion)`. Se `ready === false` ⇒ **`ValidationError`** com a lista `unmappedAccounts[]` (code/name/nature já vêm prontos) — **NÃO gerar arquivo incompleto**. O I051 é montado de `listMappings(mappingVersion)`.

**Por quê:** ECD exige que **toda conta-folha ativa** tenha código referencial (I051). Gerar sem cobertura produziria um arquivo que o PVA rejeita **e** um livro contábil incorreto. A cobertura é **chart-driven** (INCR-9 D3) — reuso direto. **Descartado:** gerar com placeholder para contas não mapeadas — mascara lacuna de compliance.

### D6 — I200/I250 = **só `LEDGER_STATUSES`**; Draft nunca entra; **estorno + original ambos presentes** (T5)

**Decisão:** os lançamentos (I200) e partidas (I250) incluem entries com status ∈ `LEDGER_STATUSES` (`Posted`/`Reconciled`/`Reversed`) e **excluem `Draft`**. Um estorno e seu original **ambos** aparecem como lançamentos reais (não netar no nível de lançamento — netar só ocorre em **saldos**).

**Por quê:** `Draft` não é escriturado — incluí-lo falsifica o livro (compliance-crítico). T5: o livro reflete a **história real** incluindo estornos; ambos são lançamentos que de fato ocorreram (`Reconciled` é marcador reversível economicamente idêntico a `Posted`, `AccountingReportService.ts:138-142`). **Descartado:** só `Posted` (some `Reconciled`/`Reversed` do livro) ou netar estorno (esconde o lançamento original).

### D7 — **Read-only ⇒ SEM gate de período in-tx**; único bloqueio é a cobertura (D5)

**Decisão:** a geração é **leitura** do ledger + **um write de metadados** (o job). **Não** wire gate de status de período (ACC-011) no caminho de leitura. Surfacear o status do período em diagnóstico é opcional; **travar** geração por período aberto/fechado está **fora do MVP**.

**Por quê:** o gate de período é invariante de **escrita** (post/close) — TOCTOU `post × close`. Aqui nada de ledger muda; o único invariante de bloqueio é a completude referencial (D5). **Descartado:** exigir período HARD-closed — regra de negócio não pedida; adia geração de ECD-rascunho legítima (o contribuinte pode gerar/conferir antes de fechar).

### D8 — Datas literais, dinheiro em centavos→decimal-BR só na serialização, **determinismo**

**Decisão (no serializer puro):**
- **Datas:** formato SPED `ddmmyyyy` (sem separador) via **reslice literal** do ISO (`YYYY-MM-DD` → `DDMMYYYY`), **nunca** `toLocaleDateString`/`new Date(...).getDate()` (UTC-shift). Validar entrada com `isValidDateOnly` (`models/dates.ts`).
- **Dinheiro:** valor SPED = decimal com **vírgula**, 2 casas, **sem separador de milhar** (ex.: `1234,56`), derivado de centavos `Int` por **divmod** (`trunc(abs/100)` + `(abs%100).padStart(2,'0')`), **nunca float**. O **sinal** vai num **indicador D/C separado** (campo `IND_DC`/`IND_VL`); o campo de valor é **magnitude sem sinal**.
- **Determinismo:** ordenação estável — contas por `code`, lançamentos por `date`+`entryNumber`, partidas por ordem de posting — ⇒ mesmo período gera arquivo **byte-idêntico** (asserção de teste via sha256).

**Por quê:** classe-de-risco CNAB/OFX (posicional) — o projeto já tem as três armadilhas (UTC-shift, float, sinal) documentadas como class-bugs. Determinismo é o que torna o arquivo auditável e testável.

### D9 — **Read-gap** I200/I250: nova leitura "entries+legs por janela, `LEDGER_STATUSES`"

**Decisão:** não existe hoje uma leitura "todos os `JournalEntry` (com seus `Posting`) numa janela de datas, só `LEDGER_STATUSES`, `Draft` excluído" — `accountLedger` é por-conta. Compor via os repositórios já injetados (`journalEntryRepo` + `postingRepo`), num método focado (no `AccountingReportService` ou num leitor dedicado do service SPED). Read-only.

**Por quê:** I200/I250 é o Diário completo (todos os lançamentos), não um razão por conta. **Descartado:** iterar `accountLedger` por conta e deduplicar entries — O(contas×postings), reintroduz risco de dupla-contagem; a leitura por-entry é a natural.

### D10 — Mapeamento **registro → fonte de dados**

| Registro | Conteúdo | Fonte |
|---|---|---|
| `0000`/`0001`/`0007` | Identificação + abertura bloco 0 | **DTO** (declarante) + período |
| `I001` | Abertura bloco I | constante |
| `I010` | Identificação da escrituração (tipo G, forma) | **DTO** (tipo/forma) |
| `I030` | Termo de abertura do livro | **DTO** (`NUM_ORD`, `NAT_LIVRO`) + período |
| `I050` | Plano de contas (code, nature, acceptsEntries, name) | `accountRepo.findManyByUnit` (via report service) |
| `I051` | Conta → código referencial RFB | `ReferentialMappingService.listMappings(version)` |
| `I150` | Saldos periódicos — identificação do período | **um por mês** (12/ano — ver D11); `getAccountBalances` por janela mensal |
| `I155` | Detalhe dos saldos (inicial, débito, crédito, final, D/C) | `getAccountBalances(inícioMês,fimMês)` + carry-forward de saldo (D11) |
| `I200` | Lançamento contábil (nº, data, valor, histórico) | **read-gap D9** (`JournalEntry` `LEDGER_STATUSES`) |
| `I250` | Partidas do lançamento (conta, D/C, valor, histórico) | **read-gap D9** (`Posting` do entry) |
| `I990` | Encerramento bloco I (contagem) | serializer |
| `J001`/`J005` | Abertura bloco J + identificação das demonstrações | período |
| `J100` | Balanço Patrimonial | `AccountingReportService.balanceSheet(asOf=DT_FIN)` (INCR-4) |
| `J150` | DRE | `AccountingReportService.incomeStatement(asOf=DT_FIN)` (INCR-4) |
| `J900`/`J930`/`J990` | Termo de encerramento + signatários | **DTO** (signatários) + serializer |
| `9001`/`9900`/`9990`/`9999` | Bloco 9: contagem por registro + total de linhas | serializer |

### D11 — I150/I155 são **MENSAIS** (12 por ano-calendário), com carry-forward de saldo  **[ratificado pelo accounting-architect por evidência do leiaute]**

**Decisão:** emitir **um I150 por mês** (12 num exercício anual cheio), cada um com seus I155. Cada I150 tem `DT_INI`=1º dia do mês e `DT_FIN`=último dia do mês. Balanços com **carry-forward**: `saldoInicial(mês N) = saldoFinal(mês N-1)`; `saldoInicial(janeiro) = saldo de abertura` (toda a história antes de 01/01). Toda conta com **saldo corrente não-nulo** aparece em **todos** os meses (continuidade), com débito/crédito=0 nos meses sem movimento.

**Por quê (evidência, Leiaute 9 pp. 131-132 — não de memória):**
- `REGRA_DATA_MES`: `DT_INI` e `DT_FIN` do I150 têm de estar **no mesmo mês** ⇒ um I150 anual único é **rejeitado** pelo PGE.
- Texto normativo do I155: *"Os saldos devem ser informados **por mês**, ou seja, deve haver um registro I150 por mês."*
- `REGRA_CONTINUIDADE_SALDOS_PERIODICOS`: exige I155 para **todos os meses** do intervalo do arquivo; `REGRA_DUPLICIDADE_PERIODO_SALDO_PERIODICO`: no máx. 1 por mês; `REGRA_DT_INI_INICIO_MES`/`REGRA_DT_FIN_FIM_MES`: 1º/último dia do mês. Exemplo oficial: `|I150|01012023|31012023|`.
- Exceção (fração de mês) só em cisão/fusão/incorporação/extinção/início de atividade — **fora do MVP**.

**Invariante cross-registro (o que o PGE valida — gate de teste E2):** débito/crédito do **I155** de um mês têm de **fechar com a soma das partidas I250** daquela conta/mês (mesmo conjunto `LEDGER_STATUSES`, mesma janela). `REGRA_VALIDACAO_SOMA_SALDO_INICIAL`/`SOMA_SALDO_FINAL`/`DEB_DIF_CRED`/`SALDO_FINAL` (pp. 132). ⇒ **I155 e I250 têm de derivar da MESMA leitura filtrada** — divergência de status/janela reprova. **Descartado:** I150 anual único — colide com `REGRA_DATA_MES` (D11 é a razão de existir do ADR ter grounded o leiaute, não chutado).

### D12 — **I052 entra no MVP** (aglutinação conta→bloco J), 1:1 por conta analítica  **[EMENDA E4 — REFINA O ADR, ratificada por decisão do usuário no Passo 2b]**

**Decisão:** incluir o registro **I052** (Indicação dos Códigos de Aglutinação, manual p. 124) — filho analítico do I050, 3 campos: `REG`, `COD_CCUS` (vazio no MVP), `COD_AGL`. Cada conta **analítica** recebe um I052 com um `COD_AGL` **1:1 com seu código de conta**; as linhas de **Detalhe (D)** do J100/J150 referenciam esses `COD_AGL`, e as linhas **Totalizadoras (T)** usam códigos de seção distintos (`BP_ATIVO`, `DRE_REC`…) que **não** estão no I052.

**Por quê (achado grounded, Passo 2b):** `REGRA_OBRIGATORIO_I052` (pp. 175/210) é **erro rígido** do PGE — *toda* linha D do J100/J150 exige um I052 com o mesmo `COD_AGL`. E J100/J150 **não** podem ser só-Totalizador (T sem filho falha `REGRA_SOMA_DAS_PARCELAS`). Logo a própria **barra de aceite** deste ADR ("importado sem erro de estrutura pelo PVA") **exige** I052 — a afirmação original de D4/§4 ("J100/J150 = reuso direto, I052 diferido") era internamente inconsistente. O `COD_AGL` é "prerrogativa da PJ" (manual p. 176), então usar o próprio código de conta é conforme. **Custo:** +1 registro trivial (igual I051), derivado da classificação de seção que o `AccountingReportService` já faz — **zero dado novo**. **Descartado:** diferir todo o bloco J (colide com Nota 5 — J obrigatório no fim do exercício) ou emitir J com D-lines sem I052 (hard-error garantido no PGE).

---

## 3. Superfície de API (MVP)

Rota nova `/api/accounting/sped/*` (3-toques, OpenAPI JSDoc). Policy **reusa** `IAccountingPolicy.canRead`.

| Método | Rota | Policy | Efeito |
|---|---|---|---|
| `POST` | `/sped/ecd/generate` | `canRead` | valida DTO → coverage-gate (D5) → monta blocos → `lib/sped` → cria job `EXPORT_SPED_ECD` + persiste `.txt` + audit `sped.ecd_generated` (na mesma tx). Retorna o job summary. `409/422` com `unmappedAccounts` se cobertura incompleta. |
| `GET` | *(reusa)* `/data-exchange/jobs/{id}/download` | `canRead` | download do `.txt` (rota INCR-6 existente — nenhuma nova). |

DTO `SpedEcdRequestDto` (Zod `.strict()`): `mappingVersion`, `year` (ou `dtIni`/`dtFin` validados por `isValidDateOnly`), `declarant` (NOME/CNPJ/UF/IE/COD_MUN/IM/indicadores), `book` (NUM_ORD/NAT_LIVRO), `signers[]` (NOME/CPF/QUALIF). Guardas de shape (CNPJ 14 díg., UF ∈ tabela, `MAX_CENTS` não se aplica a input aqui).

---

## 4. Escopo **DIFERIDO** (explícito — cada um é ADR próprio)

- **ECF** (Escrituração Contábil Fiscal, e-Lalur/e-Lacs, apuração IRPJ/CSLL) — **outro domínio fiscal**, não contábil.
- **Assinatura digital** (PKCS#7 / certificado ICP-Brasil no registro J930/rodapé) e **transmissão/recepção** ao SPED (Receitanet).
- **Registros fora do MVP:** `I012`/`I015` (auxiliares), `I020` (moeda funcional), `I053` (subcontas correlatas), `I075`/`I100` (histórico padronizado/centro de custos), `I157` (transferência de saldos), `I300`/`I310`/`I350`/`I355` (balancetes diários / resultado antes do encerramento), `I500`+ (razão auxiliar parametrizável), `J210`/`J215` (DLPA/DMPL), `J800`/`J801` (outras infos / termo de substituição), `J932`/`J935` (signatários de substituição / auditores), **Bloco K** (consolidação), `0150`/`0180` (participantes — o MVP **evita** referenciar participante no I250 para não puxá-los). **(`I052` foi movido PARA o MVP — ver D12/E4.)**
- **Multi-período / retificação / substituição** (`IND_FIN_ESC=1`, `COD_HASH_SUB`).

---

## 5. Residual honesto (não bloqueia merge; fica registrado)

**PVA-pass real só é verificável rodando o PGE/PVA do SPED Contábil sobre o `.txt` gerado** — ferramenta desktop da RFB, **fora deste ambiente**. É um **sign-off humano residual**, análogo ao "browser sign-off" dos incrementos de FE. O que este incremento entrega e verifica **automaticamente**: estrutura de blocos, ordem/contagem de registros, formatação de data/valor, gate de cobertura, e conformidade **campo-a-campo contra o manual** (Passo 2). O que **só um humano/PVA fecha**: a importação real sem erro no validador oficial.

---

## 6. PENDENTE-VERIFICAR (contra o manual, no Passo 2 — **não** chutados)

- ~~**PVA-1 (I150/I155 periodicidade)**~~ **RESOLVIDO → MENSAL (D11)** por evidência do leiaute (`REGRA_DATA_MES` + texto normativo "um registro I150 por mês", pp. 131-132). Ratificado pelo accounting-architect.
- ~~**PVA-2 (campo-a-campo)**~~ **RESOLVIDO no Passo 2b:** ordem exata de cada campo dos 25 registros transcrita do leiaute com **citação de página** em cada builder de `lib/sped.ts` (0000 pp.64-67, I030 pp.113-114, I050 pp.117-118, I051 p.123, I052 p.124, I150 pp.131-132, I155 pp.132-133, I200 pp.142-143, I250 pp.147-148, J005 pp.171-172, J100 pp.174-176, J150 pp.180-182, J900 pp.195-196, J930 pp.199-201, bloco 9 pp.229-232). Campos garbled desambiguados pelas Regras de Validação (fonte normativa), não de memória.
- ~~**PVA-3 (I155 saldo de abertura)**~~ **RESOLVIDO:** `IND_DC` de saldo zero deve ser "D" **ou** "C" (nunca vazio) — manual obs. I155 p. 133; `dcIndicator(0)='D'` é conforme. Conta com saldo não-nulo aparece em **todos** os meses com deb/cred=0 (`REGRA_CONTINUIDADE`, D11).
- ~~**PVA-4 (I051 campos)**~~ **RESOLVIDO:** I051 tem **3 campos** — `REG`, `COD_CCUS`, `COD_CTA_REF`. **NÃO** há `COD_ENT_REF`. Exemplo oficial `|I051||11100009|` (p. 123).
- ~~**PVA-5 (J930 qualificação)**~~ **RESOLVIDO (parcial):** J930 tem `IDENT_QUALIF` (descrição, campo 04) **e** `COD_ASSIN` (código, campo 05; 900=Contador — `REGRA_OBRIGATORIO_ASSIN_CONTADOR` p. 200). A tabela extraída ficou com linhas desalinhadas (900 vs 999); como os signatários vêm do **DTO**, o código QUALIF é input validado por shape — o serializer não hardcoda a tabela. **Resíduo:** o valor exato do código por papel é responsabilidade do declarante/PVA.
- ~~**PVA-6 (9900)**~~ **RESOLVIDO:** `9900` = **uma linha por tipo de registro presente**, incluindo auto-referência a `9900`/`9990`/`9999` (`REGRA_QTD_REG_BLC_OBRIGATORIO` p. 230). Implementado e testado no assembler.
- ~~**PVA-7 (encoding/quebra de linha)**~~ **RESOLVIDO:** charset **ISO-8859-1 (Latin-1)**, terminador **CRLF** por registro (manual pp. 62-63). `serializeEcd` emite CRLF; o service grava bytes Latin-1.

---

## 7. Definition of Done / gates de teste (domínio)

- `cd server && npx tsc --noEmit` + `cd my-app && npx tsc --noEmit` limpos · `npx jest features/accounting` **verde sem regredir** · `docs:generate` (rota nova) · skill-audit `wiring` · **review por agente independente (worktree isolado, T12)**. **Sem** smoke-migration-gate (D1: sem migração).
- **Testes obrigatórios (serializer + service):**
  - **Cobertura bloqueia (D5):** conta-folha ativa sem mapeamento na versão ⇒ geração falha com `ValidationError` + `unmappedAccounts`; **nenhum** arquivo produzido.
  - **Draft excluído (D6):** entry `Draft` na janela **não** aparece em I200/I250.
  - **Estorno + original ambos (D6/T5):** original e seu estorno aparecem como dois lançamentos em I200; saldos I155 refletem o net.
  - **Determinismo (D8):** duas gerações do mesmo período ⇒ **sha256 idêntico** (byte-a-byte).
  - **Data sem shift (D8):** lançamento em `2026-01-01` serializa `01012026` (não `31122025`); rodar com TZ deslocado.
  - **Dinheiro sem float (D8):** `123456` centavos ⇒ `1234,56`; magnitude sem sinal + `IND_DC` correto; valor > `MAX_CENTS` no ledger nunca ocorre (guardado no post).
  - **Contagem (D8):** `9999` = total de linhas; `9900` por tipo de registro; `I990`/`J990`/`0990`/`9990` corretos.
  - **Mensalidade (D11):** exercício anual ⇒ **12** I150 (um por mês, `01mmaaaa`..`fimMês`); nenhum I150 cruza fronteira de mês; conta com saldo aparece em todos os 12 meses (continuidade).
  - **Cross-registro I155×I250 (E2):** para cada conta/mês, `Σ débitos/créditos das partidas I250` == débito/crédito do I155; `saldoInicial(mês N)`==`saldoFinal(mês N-1)`; `saldoInicial(jan)`==saldo de abertura. I155 e I250 derivam da mesma leitura `LEDGER_STATUSES`.
  - **Tenancy:** geração de outro `userId`/`unitId` não vaza; cross-tenant = `NotFoundError`.
  - **Invariante de fechamento:** **nenhuma** escrita em `Posting`/`JournalEntry`/débito/crédito — prova de que nenhum valor de ledger muda (só o job de metadados é criado).

---

## 8. Rejeitados (resumo "por quê / vencedor")

| Alternativa | Vencedor | Motivo |
|---|---|---|
| Model `SpedExport` (período+hash+status) | Reusar `AccountingDataExchangeJob` (kind livre) | `kind`/`direction`/`status` são String puros ⇒ zero migração; model novo duplica a máquina de job sem invariante novo (D1) |
| Layout dentro do `SpedGenerationService` | Serializer puro `lib/sped.ts` | Espelha `lib/ofx.ts`/`lib/cnab.ts`; testável byte-a-byte; service fino (D2) |
| Model `LegalEntity`/`CompanyProfile` p/ o 0000 | Identificação via DTO transiente | Reabriria a torre multiempresa **rejeitada** (§4/T2) — seria DECISÃO ARQUITETURAL (D3) |
| Só blocos 0/I/9 (sem J) | Bloco J incluído | Nota 5 do manual: J100/J150 obrigatórios no fim do exercício ⇒ ECD anual exige J (D4); e J100/J150 = INCR-4 pronto |
| Gerar com placeholder p/ contas sem mapeamento | Coverage-gate bloqueia | ECD exige toda conta-folha mapeada; arquivo incompleto = rejeição PVA + livro incorreto (D5) |
| Só `Posted` em I200/I250, ou netar estorno | `LEDGER_STATUSES`, ambos presentes | Livro reflete história real; `Reconciled`/`Reversed` somem se filtrar; netar esconde lançamento (D6) |
| Exigir período HARD-closed p/ gerar | Read-only, sem gate de período | Geração não escreve ledger; adia ECD-rascunho legítima (D7) |
| Iterar `accountLedger` por conta p/ I200/I250 | Leitura por-entry na janela | Diário é por-lançamento, não por-conta; evita dupla-contagem O(contas×postings) (D9) |
