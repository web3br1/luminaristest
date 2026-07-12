# ADR-INCR-SPED-ECF — Geração do arquivo ECF (SPED Fiscal · IRPJ/CSLL · Lucro Presumido)

- **Status:** **Proposed — FASE 1 (parecer + PLAN + ADR). Forks de decisão RESOLVIDOS por sinal humano (2026-07-10).** Nó ⚫ **DIFERIDO** no master map §5. NENHUM código escrito; nenhuma skill de geração roteada. A regra de uso do master map §1 proíbe rotear contra um nó ⚫ sem **ADR em disco + sinal humano** — este ADR é a metade "ADR em disco". **Duas ratificações humanas registradas (2026-07-10):** (1) **FORK D5 → rota (b) recover-from-ECD** (Blocos C/E entram no MVP); (2) **D4 → TaxRegime transiente** (nada persistido). **A FASE 2 (impl) NÃO tem mais bloqueador de decisão** — resta travada apenas pelos **dois bloqueadores EXTERNOS** de dado (§5.1 código RFB da `3.3`; §5.2 receita CRM como serviço) que **não** são decisão nossa.
- **Date:** 2026-07-10
- **Decision class:** PRISMA_FIRST_CLASS · **READ/EXPORT** (leitura do ledger + apuração fiscal derivada + um write de metadados de job). **NÃO** muda valor de ledger. Contrato §2.1, T3.
- **Depends on (tudo em `main`):** INCR-4 (`AccountingReportService` — BP/DRE + `getAccountBalances(scope,from?,to?)` com janela e `excludeSourceTypes`), INCR-6 (`AccountingDataExchangeJob` + `storage` + download de artefato), **INCR-8 (proveniência — pré-req §5 do master map)**, **INCR-9 (`ReferentialMapping` + cobertura chart-driven)**, **BE-INCR-REVENUE-SPLIT / PR #66 (split serviço `3.1` × revenda `3.3` — a base do Bloco P)**, BE-INCR-SPED-ECD / PR #62 (precedente de serializer posicional puro + coverage-gate), BE-INCR-SPED-APURACAO / PR #63 (encerramento — relevante para a **ECD** recuperada, não para a base fiscal presumida).
- **Roadmap:** `docs/accounting/ACCOUNTING-MASTER-MAP.md` §5 — nó "**ECF readiness** (arquivo SPED Fiscal: IRPJ/CSLL)" (⚫ diferido). Regime de partida = **Presumido** (SN isento; Real raro).
- **Supersedes:** none · **Related:** ADR-INCR-SPED-ECD (mesma classe de risco campo-a-campo — lição I052), ADR-INCR-REVENUE-SPLIT (o pré-requisito de dado que este consome), ADR-INCR9 (mapeamento referencial = fonte do Bloco J/K), ADR-INCR-SPED-APURACAO (encerramento contábil — pré-req da **ECD recuperada**, não da apuração presumida).

> **Nota de processo (T12).** ADR escrito **antes** do código: `PLAN → ADR → BRIEF → impl → test → review independente (worktree separado) → PR → closeout → memória`. **Sem migração** prevista (ver D7) ⇒ smoke-migration-gate **não se aplica**. **Altitude desta FASE 1:** decisões de escopo/estrutura no nível **bloco/registro**; a transcrição **campo-a-campo** do leiaute oficial (ordem/tamanho/obrigatoriedade de cada campo) é **FASE 2** — os itens abertos estão em §6 (PENDENTE-VERIFICAR), exatamente como a ECD fez o campo-a-campo no Passo 2. **Divergências vs. o brief de entrada marcadas [REFINA O BRIEF].**

---

## ⚠️ EMENDA FASE 2 · Passo A (2026-07-12) — correções de leiaute contra o Manual oficial

> A transcrição do **Manual de Orientação do Leiaute 12 da ECF** (Anexo ao ADE Cofis nº 02/2026, jul/2026,
> AC 2025) resolveu os PENDENTE-VERIFICAR do §6 e revelou **duas divergências VERIFICADAS** entre o leiaute
> real e a lista **INFERIDA** desta FASE 1 — exatamente a lição **I052** que o §7 nomeou como risco. A
> **decisão-rota humana (D5 rota (b), D4 transiente) permanece intacta**; o que se corrige é a **realização de
> campo** que a FASE 1 inferiu. Detalhe campo-a-campo com citações de página em
> `docs/accounting/BE-INCR-SPED-ECF-layout-transcription.md`. Sinal humano de continuidade dado em 2026-07-12
> (corrigir ADR + implementar; Blocos J/K = marcadores vazios).

1. **[CORRIGE D5 — realização de campo]** Os Blocos **C e E são "recuperados pelo sistema — NÃO importados e
   não editados no programa"** (Manual p. 40, §1.3 pp. 12-13). Todo registro de **dado** de C/E tem
   **Obrigatoriedade de Entrada = `N` (Não Deve Existir)** (Tabela de Obrigatoriedade p. 43). ⇒ o nosso `.txt`
   emite **apenas** `C001+C990` e `E001+E990` (blocos vazios); o PVA preenche C/E na "Recuperar ECD". **Não
   existe** campo `ecdRecibo`/`ecdHash` de Bloco C para preenchermos (o `0010.HASH_ECF_ANTERIOR` é da
   recuperação da **ECF anterior do Lucro REAL**, não da ECD nem do Presumido). ⇒ **`ecdRecibo`/`ecdHash`
   REMOVIDOS do DTO** (contra o previsto em D5/Passo D). A rota (b) sobrevive via `0010.TIP_ESC_PRE='C'`
   (recuperação obrigatória para Presumido obrigado à ECD — o caso Luminaris).

2. **[CORRIGE §2/§D2 — numeração do Bloco P]** O mapeamento inferido ("P130 base IRPJ · P300 base CSLL ·
   P200/P500 imposto") está **trocado**. Real (Manual pp. 326-347): **P200 = base IRPJ · P300 = cálculo IRPJ ·
   P400 = base CSLL · P500 = cálculo CSLL**; **P130 = Receitas Incentivadas** (condicional
   `IND_REC_RECEITA=2`) e **P230 = Isenção/Redução** (condicional `IND_RED_ISEN=S`). A **matemática** de D2/D3
   (Σreceita×presunção; IRPJ 15%+adicional 10%/60k-tri; CSLL 9%; trimestral) **permanece** — só os números de
   registro mudam. Conjunto MVP do Bloco P: `P001·P030·P100·P150·P200·P300·P400·P500·P990` (P130/P230
   omitidos no caso típico, sem incentivadas/isenção).

3. **[REFINA D6 — Blocos J/K]** J/K têm **Entrada = `F` (facultativo)** — o PVA os constrói da ECD recuperada
   (que já carrega o mapeamento referencial do BE-INCR-SPED-ECD). **Decisão (sinal humano 2026-07-12):**
   emitir **marcadores vazios** `J001+J990` e `K001+K990`; **não** importar J/K por fora (evita divergência
   K915/K935 com o recuperado; menos código). O **coverage-gate (D6) migra** de "montar J/K" para "montar
   **P100/P150 referencial**" — que são planos de contas referenciais (Manual §1.12 p. 16). ⇒ o **bloqueador
   §5.1 da `3.3` sem código RFB permanece** (P100/P150 são referenciais), só muda o registro onde falha.

4. **[RESOLVE §6 ECF-6 — encoding]** Paridade com a ECD **CONFIRMADA** (não assumida): Latin-1 / CRLF /
   vírgula-decimal (Manual p. 31). Primitivas de `lib/sped.ts` reusáveis byte-a-byte. **Acréscimo:** tipo
   **`NS` (numérico sinalizado, +/−)** para campos de base/resultado do Bloco P — mas ver ponto 5: nós só
   emitimos linhas `E` de receita bruta (≥0), então o `NS` fica nas linhas CNA que **o PVA** computa, não nas
   nossas. Formatador `NS` fica como utilitário, uso mínimo.

5. **[INVERTE D2 — o PVA computa o imposto; nós só segregamos receita bruta] — sinal humano 2026-07-12.**
   As **Tabelas Dinâmicas oficiais** (`Tabelas_Dinamicas_ECF_Leiaute_12`, planilhas P200/P300/P400/P500,
   grau VERIFICADO) mostram que **os coeficientes de presunção e as alíquotas são fórmulas da RFB embutidas
   no PVA**, em linhas `TIPO=CNA/CA` (não-editáveis): P200(10)=`Σ P200(2)*0,016+P200(4)*0,08+P200(6)*0,16+
   P200(8)*0,32+P200(9)*0,384`; P300(3)=`P300(1)*0,15`; P300(4) adicional=`(P300(1)−20000*MESES)*0,10`;
   P500(2)=`P500(1)*0,09`. As **únicas linhas de entrada (`TIPO=E`)** são a **receita bruta segregada por
   percentual**: serviço(3.1)→P200(8) 32% & P400(4) 32%; revenda(3.3)→P200(4) 8% & P400(2) 12%. ⇒ **ADR D2
   invertido:** Luminaris **NÃO computa** base/IRPJ/adicional/CSLL — fornece receita bruta segregada e o PVA
   computa (fonte única de verdade = programa da RFB; zero risco de divergência; a LC 224/25 já mudou
   fórmulas neste leiaute — duplicá-las seria dívida fiscal). **`models/presumption.ts` NÃO é módulo de
   constantes fiscais de cálculo** — no máximo um mapa de layout `atividade → {linha P200, linha P400}`.
   Bloco P que emitimos: **P001 · P030 · P200(E) · P400(E) · P990** (P100/P150 recuperados/calculados pelo
   PVA para TIP_ESC_PRE='C', Manual p. 329/336; P300/P500 computados pelo PVA; P130/P230 condicionais).

6. **[SUBSTITUI D6 — gate de exaustividade da receita, não coverage referencial] — sinal humano 2026-07-12.**
   Como o `.txt` **não** emite linha keyed por código referencial RFB (P100/P150/J/K são recuperados pelo
   PVA da ECD), **não há coverage-gate referencial no serviço da ECF** — o `3.3` sem código RFB (§5.1) é
   invariante da **ECD recuperada** (BE-INCR-SPED-ECD), migra para lá e **não trava a ECF**. O **gate real**
   é **exaustividade da receita**: toda conta natureza `Revenue` com movimento no trimestre tem de mapear a
   uma linha de presunção conhecida (3.1, 3.3); conta `Revenue` não-mapeada ⇒ **`ValidationError` com a
   lista** (guard da lição **FAIL-1 do PR#66**: nunca dropar em silêncio = subtributação). Parecer completo:
   `luminaris-accounting-architect` (2026-07-12) em `docs/accounting/BE-INCR-SPED-ECF-layout-transcription.md §7`.

### Fechamento FASE 2 — residuais de sign-off humano no PVA-ECF (review independente PASS 2026-07-12)

Review independente (agente separado, re-checou o commit `6192799` do zero) **PASS** em toda a superfície
verificável (mapa atividade→linha, gate de exaustividade, contadores, determinismo, camadas, reuso; tsc
limpo, testes verdes). Sem defeito confirmado. Restam **só** questões de aceitação estrutural que **apenas
o PVA-ECF resolve** (validador desktop RFB, fora do ambiente) — ordenadas por prioridade:

1. **Bloco S (TEF/SAF).** Emitimos exatamente a "Relação de Blocos" (Manual p. 41, autoridade de ordem)
   **menos S**; S é condicional de FORMA_TRIB=10 e ausente da Relação. Sinal conflitante: S001 na Tabela de
   Obrigatoriedade (p. 43+) tem Saída='O'. **Confirmar no PVA;** incluir `S001/S990` é uma linha em
   `EMPTY_BLOCKS_TAIL` se exigido.
2. **P300/P500 sem linhas de dedução.** Emitimos P200/P400 (receita bruta) e deixamos o PVA computar
   P300/P500. As linhas `E` de dedução de P300/P500 (IRRF retido, isenção/redução, CSLL retida) **não** são
   recuperáveis da ECD e **não** são emitidas — o MVP não representa crédito de retenção na fonte. Omitir só
   **aumenta** o tributo (conservador, nunca subtributa); um salão B2C típico não tem retenção. **Extensão
   própria** quando houver retenção relevante.
3. **`0000.COD_VER='0012'`** (o exemplo do Manual mostra `'0011'`, artefato de exemplo não-atualizado).
   Confirmar no PVA.

---

## 1. Contexto

**O que é ECF.** A Escrituração Contábil Fiscal (SPED Fiscal-IRPJ/CSLL) é um **arquivo texto único**, organizado em **blocos → registros**, layout **pipe-delimitado** (`|CAMPO|CAMPO|...|`, um registro por linha), no mesmo estilo estrutural da ECD. É a declaração anual que apura **IRPJ e CSLL** e substituiu a DIPJ. O leiaute e a matriz de obrigatoriedade de registros **variam por regime de tributação** (Real / Presumido / Arbitrado / Imune-Isenta) e por ano-calendário — publicados no **Manual de Orientação da ECF** da RFB.

**Fonte normativa (a fixar na FASE 2, CBM-001 aplicado a spec externa):** **Manual de Orientação da ECF** vigente para o ano-calendário-alvo (leiaute publicado por ADE Cofis). **NÃO fixado neste ADR** — a versão exata do leiaute e a transcrição campo-a-campo dos registros do MVP são o **primeiro passo da FASE 2** (baixar o PDF do gov.br, `pdftotext -layout`, isolar a seção de leiaute + a matriz de obrigatoriedade por regime — mesmo procedimento da ECD). **Motivo de não fixar agora:** a lista de registros abaixo (§ D3/D6) é de **conhecimento de domínio fiscal, grau INFERIDO**, não transcrita do leiaute — é a mesma superfície de erro que gerou a lição **I052** na ECD (um ADR ratificado pode ser internamente inconsistente no nível campo-a-campo; só a transcrição do manual revela). Ver §7 (riscos/vieses).

**Bar de aceite (proposto, a ratificar):** **VALIDAÇÃO PVA-ECF** — o `.txt` deve ser **importado e validado sem erro de estrutura** pelo PVA da ECF. Idêntico ao critério da ECD; o PVA importa e valida um `.txt` não assinado; assinar/transmitir é passo humano posterior (§4 diferido).

**Por que a ECF agora é planejável.** Os pré-requisitos de dado que o master map §5 nomeava estão **todos em `main`**: proveniência (INCR-8 ✅), mapeamento referencial versionado (INCR-9 ✅) e — o específico da ECF-Presumido — **o split de receita por natureza** serviço×revenda (PR #66 ✅), que é o que permite aplicar a **presunção-por-atividade** como leitura de saldo por conta.

**Achados de código que moldam o design (confirmados por leitura, CBM-001):**
- `ChartOfAccountsFixture.ts:44,48` — `3.1 Receita de Serviços` e `3.3 Receita de Revenda de Mercadorias` existem como **folhas `Revenue`** distintas ⇒ a base presumida por atividade é **legível por conta**.
- `AccountingReportService.getAccountBalances(scope, from?, to?, excludeSourceTypes?)` (`:159-168`) — janela de datas + exclusão por `sourceType` já suportadas ⇒ **apuração trimestral** (4 janelas) é leitura da primitiva existente, **sem read novo** de saldo por janela. `balanceSheet(asOf)` / `incomeStatement(asOf)` (`:415,475`) = fontes de P100/P150.
- `AccountingDataExchangeJob.kind`/`direction`/`status` são **`String` puros** (schema; unions só no DTO) ⇒ novo `kind='EXPORT_SPED_ECF'` **não gera migração** (mesma base da ECD D1).
- `ReferentialMappingService.coverage(version)` → `{ unmappedAccounts[], ready }` (chart-driven) e `listMappings(version)` — fonte do Bloco J/K referencial e do **coverage-gate**.
- **Lacuna de dado ativa:** `CrmOpportunityWonMapper.ts:17` credita **tudo em `3.1`** (só o `SalonSaleFinalizedMapper` faz o split 3.1/3.3). Ver §5 (pré-requisito aberto) e §7 (risco).

---

## 2. O que a ECF-Presumido tem de FUNDAMENTALMENTE diferente da ECD

Esta seção é o núcleo do parecer de domínio — o que muda a arquitetura, não só os nomes de registro.

| Eixo | ECD (SPED Contábil) | ECF-Presumido (este ADR) |
|---|---|---|
| **O que apura** | Livro Diário/Razão — a escrituração contábil | **IRPJ + CSLL** — o tributo |
| **Base de cálculo** | (não apura tributo) | **Receita bruta × presunção-por-atividade** — NÃO o lucro líquido contábil |
| **Periodicidade da apuração** | Anual (exercício social) | **TRIMESTRAL** (4 apurações/ano — `P030`) |
| **Papel do encerramento (I350/I355)** | Central — zera resultado, reconcilia o Bloco J em valor (BE-INCR-SPED-APURACAO) | **Irrelevante para o imposto** — o lucro líquido contábil NÃO entra na base presumida. (O encerramento só importa para a **ECD recuperada**, se houver — D5.) |
| **LALUR / Parte B / e-Lacs** | N/A | **NÃO EXISTE no Presumido** — é do Lucro Real (Blocos M/N). FORA (§4). |
| **Plano referencial** | I050/I051 (contábil) | J050/J051 + K155/K156 (contábil **e** referencial recuperados/mapeados) |
| **Bloco de resultado** | Bloco J (Balanço/DRE contábeis) | **Bloco P** (Presumido): P100 balanço, P150 DRE, P130/P300 bases, P200/P500 imposto |

**A distinção que decide o design (grau VERIFICADO por lei + por código):** no Presumido a base de IRPJ/CSLL é **`Σ receita bruta da atividade × percentual de presunção da atividade`**, apurada por trimestre. Os percentuais são **constantes de lei** por atividade:
- **Serviços em geral:** presunção **32%** (IRPJ) / **32%** (CSLL) → conta `3.1 Receita de Serviços`.
- **Revenda de mercadorias / comércio:** presunção **8%** (IRPJ) / **12%** (CSLL) → conta `3.3 Receita de Revenda`.

Alíquotas sobre a base presumida: **IRPJ 15%** + **adicional 10%** sobre a parcela da base que exceder **R$ 60.000 por trimestre** (R$ 20.000/mês); **CSLL 9%**. ⇒ **PR #66 é o enabler direto:** a presunção vira `getAccountBalances(3.1, trimestre)×32% + getAccountBalances(3.3, trimestre)×8%` (IRPJ) — leitura de saldo por conta e janela, que já existe. **A DRE (P150) e o BP (P100) são informativos e NÃO dirigem o imposto** — o oposto do que a intuição "result-driven" sugere (essa só vale no Real).

---

## 3. As decisões

### D1 — Regime único do MVP = **Lucro Presumido**; Real / Arbitrado / Imune-Isenta **DIFERIDOS**
**Decisão:** o MVP gera ECF **apenas** para PJ tributada pelo **Lucro Presumido** (`0010.FORMA_TRIB` = Presumido). Real (Blocos L/M/N + LALUR/e-Lacs), Arbitrado (Bloco T) e Imune/Isenta (Bloco U) ficam FORA, cada um ADR próprio.

**Por quê (obrigação legal, não preferência — ratifica ADR-REVENUE-SPLIT D1):** **Simples Nacional é ISENTO de ECF**; o slice de PJ obrigada à ECF no público SMB é esmagadoramente **Presumido**; **Lucro Real é raro** (receita > R$ 78 mi/ano ou setor específico) e carrega a torre LALUR/Parte A/B — domínio pesado próprio. **Descartado:** MVP multi-regime — multiplicaria a superfície de registro sem público correspondente.

### D2 — Base **receita-driven por presunção-por-atividade**, lida do ledger via o split `3.1`×`3.3`
**Decisão:** as bases de cálculo (P130 IRPJ, P300 CSLL) derivam de `Σ receita bruta por atividade × presunção`, computadas **por trimestre** a partir de `getAccountBalances(scope, inícioTri, fimTri)` filtrado às contas de receita, aplicando a presunção por **natureza de conta** (`3.1`→32%; `3.3`→8%/12%). Os percentuais e alíquotas (15%/adicional 10%/R$60k/9%) são **constantes de domínio fiscal** num módulo `lib/`/`models/` (ex.: `models/presumption.ts`), **nunca** input do usuário nem valor de ledger.

**Por quê:** é a razão de o PR #66 existir — a presunção-por-atividade só é computável porque a receita nasce separada por conta. Centralizar as constantes fiscais (ACC-021: regra de sinal/semântica centralizada) evita espalhar percentual mágico. **Descartado:** derivar base do lucro líquido/encerramento (é o modelo do Real, errado no Presumido); pedir a base como input (fabricação — a base tem de cair do ledger).

### D3 — Apuração **TRIMESTRAL** (`P030` = 4 períodos/ano), não anual  **[difere estruturalmente da ECD]**
**Decisão:** o Bloco P declara **4 apurações** por ano-calendário (1T/2T/3T/4T). Cada trimestre tem sua base (D2), seu IRPJ (15% + adicional sobre excedente de R$ 60.000/tri) e sua CSLL (9%). Janelas via a primitiva de saldo existente (verificado: `from`/`to` suportados).

**Por quê:** o Presumido apura IRPJ/CSLL **trimestralmente** por lei — a apuração anual é do Real (estimativa mensal + ajuste anual). Tratar como anual falharia a estrutura do P030 e os limites do adicional (que são **por trimestre**). **Descartado:** apuração anual única — errada para o regime.

### D4 — Regime/identificação = **DTO transiente + constantes de domínio**; SEM entidade `TaxRegime`/`LegalEntity` persistida no MVP  **[RATIFICADO POR SINAL HUMANO 2026-07-10 — REFINA O BRIEF: a proposta de "novo agregado TaxRegime" foi descartada]**
**Decisão:** a declaração de regime (`0010.FORMA_TRIB=Presumido`), a identificação do declarante (`0000`: NOME/CNPJ/UF/COD_MUN/…), os signatários e o **período de apuração** entram como **parâmetros do DTO de geração** (transientes, por geração), exatamente como a ECD D3. As regras de presunção/alíquota são constantes de domínio (D2). **NÃO** se cria model `TaxRegime` nem `LegalEntity` no MVP.

**Por quê (segue o precedente ECD D3 + evita reabrir a torre rejeitada):** persistir um `TaxRegime`/cadastro de empresa colidiria com a **torre multiempresa rejeitada** (master map §4; T2 = `AccountingScope` de 2 níveis, sem `LegalEntity`) e **não adiciona invariante que o banco precise garantir** no MVP — o regime é entrada de compliance por geração, e a única coisa "de estado" (a presunção por atividade) já vive no plano de contas (`3.1`/`3.3`). **Descartado/DIFERIDO:** model `TaxRegime` persistido (regime histórico + query por ano) — é **DECISÃO ARQUITETURAL** (ADR próprio + sinal humano) se um requisito futuro exigir histórico consultável de opção-de-regime; **se o design tender a persistir cadastro de empresa/estabelecimento → PARAR** (colide §4).

> **RATIFICADO (sinal humano, 2026-07-10):** TaxRegime **transiente por geração** (DTO) confirmado como suficiente para o MVP; **nada persistido**, sem reabrir a torre §4. Se surgir requisito de histórico de regime consultável, é ADR próprio — não deste incremento.

### D5 — Recuperação da ECD (Blocos C/E) = **rota (b) recover-from-ECD**  **[FORK RESOLVIDO POR SINAL HUMANO 2026-07-10]**
**Decisão (fechada):** o MVP **INCLUI os Blocos C/E**, recuperados da **ECD transmitida**. O MVP emite Bloco **C** (Informações Recuperadas da ECD — referencia a ECD transmitida) e Bloco **E** (Informações Recuperadas da ECD e Cálculos Fiscais — saldos contábeis recuperados). O **recibo/hash da ECD transmitida** é **INPUT HUMANO por geração**, entrando no **DTO transiente** (ao lado da identificação do declarante — D4), **nunca** persistido nem derivado automaticamente.

**Contexto (grau INFERIDO — a confirmar campo-a-campo na FASE 2):** a ECF de uma PJ que mantém escrituração contábil (**ECD**) recupera a ECD transmitida. Luminaris **mantém escrituração contábil completa** (gera ECD — BE-INCR-SPED-ECD), então a rota fiel é recuperar. Há um **acoplamento consciente**: a recuperação C/E depende de uma **ECD efetivamente transmitida** (com recibo), e a transmissão da ECD é ela própria um **passo humano residual** (PVA/Receitanet — fora deste ambiente). Por isso o recibo/hash é input humano, não automação.

**Consequências propagadas desta decisão (o que muda no ADR):**
- **Conjunto de blocos do MVP passa a incluir C/E** — §4 remove C/E da lista "condicional/fora" e §D6/§6 ganham os registros C/E.
- **DTO transiente ganha `ecdRecibo`/`ecdHash`** (e o que o leiaute do Bloco C exigir para casar a ECD recuperada) — ver §3.
- **Superfície fiscal aumenta** ⇒ os registros C/E entram na disciplina campo-a-campo **PENDENTE-VERIFICAR** (§6, item ECF-4) — mesma lição **I052**: não fechar o layout de C/E de memória; transcrever do Manual e cruzar com as Regras de Validação.

**Rota descartada:** **(a) standalone** (preencher P100/P150/K só de INCR-4, sem C/E) — mais simples, mas **arriscava rejeição do PVA** por obrigatoriedade de recuperação da ECD para PJ que a possui. O humano optou pela rota fiel.

### D6 — Bloco J/K referencial reusa `ReferentialMapping` (INCR-9) + **coverage-gate**; `3.3` sem código RFB **BLOQUEIA a geração**
**Decisão:** o plano de contas + mapeamento referencial da ECF (J050/J051) e os saldos contábeis+referenciais (K155/K156) consomem `ReferentialMappingService.coverage(mappingVersion)` / `listMappings(version)`. **Antes de montar qualquer registro**, `coverage.ready===false` ⇒ **`ValidationError`** com `unmappedAccounts[]` — **não gera arquivo incompleto** (idêntico à ECD D5). Como **`3.3 Receita de Revenda` está NÃO-MAPEADA** no diagnóstico referencial (follow-up do PR #66 — comportamento correto do gate chart-driven do INCR-9), **a geração da ECF FALHA até `3.3` receber um código referencial RFB**. Ver §5.

**Por quê:** a ECF referencia o plano referencial da RFB; uma conta de receita sem código referencial produz base/mapeamento incompletos → rejeição do PVA **e** apuração incorreta. O gate já existe (INCR-9), só é reusado. **PENDENTE-VERIFICAR (FASE 2):** o plano **referencial da ECF pode ter versão/chart distinta** do referencial contábil da ECD (a `mappingVersion` é string livre — INCR-9 D1 — e comporta uma versão "ECF-<ano>"); confirmar contra o Manual qual referencial a ECF-Presumido exige e se K155/K156 pedem saldo por trimestre ou anual.

### D7 — Serializer é **lib pura** `server/src/lib/ecf.ts`; job em `AccountingDataExchangeJob` (`kind='EXPORT_SPED_ECF'`); **ZERO migração**
**Decisão:** o layout pipe/posicional (montagem de linhas, formatação de valor/data, contagem de registros) vive numa **lib pura** `server/src/lib/ecf.ts` (espelha `lib/sped.ts`/`lib/ofx.ts`/`lib/cnab.ts`), testável byte-a-byte. A geração registra um **job de export** na tabela existente `AccountingDataExchangeJob` (`direction='EXPORT'`, `kind='EXPORT_SPED_ECF'` — novo valor no union do DTO, `status='EXPORTED'`, `mimeType='text/plain'`, `sha256`/`sizeBytes`/`storageKey`). Download = **rota de job existente** (INCR-6). **`kind`/`direction`/`status` são String puros ⇒ zero migração.**

**Por quê:** reuso integral da máquina job+artefato+download+audit do INCR-6 (critério de reuso — nenhum invariante novo que o banco precise garantir). **Descartado:** model `EcfExport` próprio (ilha bespoke que duplica a máquina de job).

### D8 — **Read-only ⇒ SEM gate de período in-tx**; único bloqueio é a cobertura (D6)
**Decisão:** a geração é **leitura** do ledger + **um write de metadados** (o job). Não wire gate de status de período (ACC-011) no caminho de leitura. O único invariante de bloqueio é a completude referencial (D6).

**Por quê:** idêntico à ECD D7 — o gate de período é invariante de **escrita** (post/close); aqui nada de ledger muda. **Descartado:** exigir período/exercício fechado para gerar — adia ECF-rascunho legítima.

### D9 — Datas/valores **determinísticos, campo-a-campo**; encoding a confirmar; **PENDENTE-VERIFICAR na FASE 2**
**Decisão (no serializer puro):** datas em formato SPED por **reslice literal** do ISO (nunca `toLocaleDateString`/`new Date().getDate()` — UTC-shift); valores derivados de **centavos `Int` por divmod** (nunca float); ordenação estável ⇒ **arquivo byte-idêntico** (asserção sha256). Encoding/terminador (Latin-1/CRLF vs UTF-8) e o formato exato de valor da ECF (nº de casas, sinal, separador) **a confirmar contra o Manual da ECF** — a ECD usa Latin-1/CRLF, mas **não assumir paridade** sem verificar (§6).

**Por quê:** é a classe-de-risco posicional já documentada no projeto (UTC-shift, float, sinal) — herdada da ECD/CNAB/OFX. **Descartado:** reusar cegamente as primitivas de `lib/sped.ts` sem reconfirmar formato de campo da ECF (o formato pode divergir).

### D10 — Proveniência (INCR-8) = pré-requisito **satisfeito**, consumo **indireto**
**Decisão:** INCR-8 (`SourceDocument`/`JournalEntrySource`) é pré-requisito de dado **satisfeito**; a ECF não tem um registro que mapeie 1:1 a `SourceDocument` (diferente da ECD, cujo I200/I250 é o Diário). O consumo é **indireto** — a rastreabilidade dos lançamentos que compõem a receita/DRE. Nenhum trabalho novo de proveniência neste incremento.

**Por quê:** honestidade de escopo — listar INCR-8 como "usado" sem consumo direto seria inflar dependência. O pré-requisito conta como **fundação de confiabilidade do ledger** que a ECF lê, não como fonte de registro.

---

## 4. Escopo **DIFERIDO** (explícito — cada um é ADR próprio)

- **Lucro Real inteiro:** Bloco **L** (L100 balanço / L200/L210 / L300 DRE fiscal), Bloco **M** (**e-Lalur/e-Lacs — Parte A do LALUR**), Bloco **N** (cálculo IRPJ/CSLL do Real, compensação de prejuízo), **Parte B do LALUR**. — Regime raro + torre de ajustes própria.
- **Lucro Arbitrado** (Bloco T) e **Imunes/Isentas** (Bloco U).
- **Bloco X** (Informações Econômicas) e o grosso do **Bloco Y** (Informações Gerais) — **PENDENTE-VERIFICAR (FASE 2)** quais registros de Y são de fato **obrigatórios** para Presumido (ex.: Y520/Y540/Y600/Y612 conforme o Manual); o MVP inclui só o mínimo obrigatório.
- **Outras receitas na base presumida a 100%** (ganho de capital, receita financeira, demais receitas não-operacionais que entram na base **sem** presunção): o MVP escopa às **duas receitas de atividade** (`3.1`/`3.3`). Se o contribuinte tiver receitas não-operacionais tributáveis, é extensão própria.
- **Assinatura digital** (PKCS#7 / ICP-Brasil) e **transmissão** (Receitanet).
- **Retificação / substituição** da ECF.

> **NOTA (fork D5 resolvido):** a **Recuperação da ECD (Blocos C/E)** — antes condicional — está **DENTRO do MVP** (rota (b), §D5). Os registros C/E entram na FASE 2 com transcrição campo-a-campo (§6, ECF-4).

---

## 5. Pré-requisitos de dado **ABERTOS** (travam a FASE 2)

1. **🔴 `3.3 Receita de Revenda` sem código referencial RFB (BLOQUEADOR direto).** Follow-up registrado do PR #66: `3.3` fica não-mapeada no diagnóstico referencial (INCR-9, chart-driven — correto). O **coverage-gate (D6) FALHA a geração** enquanto `3.3` não tiver um código referencial. **Quem fecha:** um humano/contador atribui o código do plano referencial RFB à `3.3` (via a rota `PUT /referential/mappings` do INCR-9), na `mappingVersion` da ECF. **Não é trabalho de código deste incremento — é dado de compliance que só o humano provê.**
2. **🟡 Receita não-salão contabilizada como serviço.** `CrmOpportunityWonMapper` credita **tudo em `3.1`** (só vendas de salão fazem o split 3.1/3.3). ⇒ qualquer receita de oportunidade CRM entra na base presumida como **serviço (32%)**. Se houver revenda por fora do salão, a base fica **incorreta** (presume 32% onde deveria 8%). **Não bloqueia** a geração (o arquivo sai), mas é uma **incorreção de base fiscal** silenciosa. Registrar; a extensão do split ao mapper CRM é incremento próprio.
3. **🟡 Recibo/hash da ECD transmitida (Blocos C/E — rota (b) fechada, D5).** É **input humano por geração** (a transmissão da ECD é passo humano PVA/Receitanet, fora do ambiente). **Não bloqueia o design** (é um campo do DTO), mas cada geração real depende de uma ECD já transmitida com recibo. Registrar como dado operacional humano, não de código.
4. **🟡 Código/versão do plano referencial da ECF** (D6) — pode divergir do referencial contábil da ECD; a confirmar na FASE 2 + o contador provê os códigos.

> **Bloqueadores de DECISÃO: nenhum** (os dois forks foram ratificados em 2026-07-10 — D5 rota (b), D4 transiente). Os itens 3–4 são dados operacionais/humanos, não decisões pendentes; **os únicos bloqueadores EXTERNOS de dado que travam uma geração real são o item 1 (🔴 código RFB da `3.3`) e o item 2 (🟡 receita CRM como serviço)**.

---

## 6. PENDENTE-VERIFICAR (contra o Manual da ECF — **FASE 2**, não chutar)

> Estes são os equivalentes-ECF dos PVA-1..7 da ECD. **Nenhum resolvido nesta FASE 1** — a lista de registros do §D3/D6 é INFERIDA de domínio; a FASE 2 transcreve o leiaute e confirma. A lição **I052** obriga: cruzar cada registro dependente com suas **Regras de Validação** do Manual antes de fechar.

- **ECF-1 (leiaute/versão):** fixar o Manual de Orientação da ECF do ano-calendário-alvo (ADE Cofis), baixar, extrair, isolar a **matriz de obrigatoriedade por regime** (coluna Presumido) + a seção de leiaute.
- **ECF-2 (conjunto de registros do Bloco P):** confirmar a lista/numeração exata dos registros do Presumido (P030 períodos · P100 balanço · P130 base IRPJ · P150 DRE · P200 IRPJ · P230/P300 base CSLL · P400/P500 CSLL · P990) — **os números acima são INFERIDOS**; a matriz do Manual é a fonte.
- **ECF-3 (Blocos 0/9/J/K/Y obrigatórios):** quais registros de 0 (0000/0010/0020/0030/0930/0990), 9 (9001/9900/9990/9999), J (J050/J051/J100/J990), K (K030/K155/K156/K355/K356/K990) e Y são obrigatórios para Presumido.
- **ECF-4 (recuperação ECD — rota (b) fechada, D5):** transcrever campo-a-campo os registros dos Blocos **C** (Informações Recuperadas da ECD — ex.: C001/C040/C050 + o registro que casa o **recibo/hash** da ECD transmitida) e **E** (Informações Recuperadas da ECD e Cálculos Fiscais — ex.: E001/E010/E015/E020/E030 saldos recuperados), na ordem/tamanho/obrigatoriedade do Manual. **A superfície fiscal cresceu com a rota (b)** — mesma disciplina I052: não fixar o layout de C/E de memória; cruzar com as Regras de Validação. Confirmar quais campos do DTO o Bloco C exige para casar a ECD (recibo/hash/período).
- **ECF-5 (base presumida):** confirmar percentuais por atividade e o **limite do adicional por trimestre** (R$ 60.000), regras de arredondamento da base, tratamento de deduções/retenções (IRRF na fonte a deduzir do devido).
- **ECF-6 (encoding/terminador/formato de valor):** Latin-1 vs UTF-8, CRLF, casas decimais e sinal — **não assumir paridade com a ECD**.
- **ECF-7 (referencial):** versão/chart referencial da ECF vs. contábil; periodicidade dos saldos K (trimestral vs anual).

---

## 7. Residual honesto + riscos/vieses do próprio parecer (nomeados)

**Residual honesto (não bloqueia a FASE 2 quando destravada; fica registrado):**
- **PVA-pass real = sign-off humano no PVA-ECF da RFB** (ferramenta desktop, fora deste ambiente) — análogo ao residual da ECD.
- **Código referencial de `3.3` = input humano/contador** (§5.1).
- **Assinatura/transmissão = humano** (§4).

**Riscos/vieses deste parecer (grau declarado):**
- **[VIÉS — INFERIDO, alto risco] A lista de registros do Bloco P e dos Blocos C/E/J/K/Y é conhecimento de domínio fiscal, NÃO transcrita do leiaute oficial.** É exatamente a superfície que gerou a lição **I052** na ECD (ADR internamente inconsistente no campo-a-campo). **A rota (b) do D5 AUMENTA essa superfície** (C/E entram no MVP). **Mitigação:** §6 marca tudo como FASE-2-a-verificar; nenhuma decisão de campo é fechada aqui.
- **[INFERIDO] A obrigatoriedade da recuperação C/E da ECD para Presumido** — o humano optou pela **rota fiel (recuperar, D5)**; a decisão de escopo está **fechada**. O que resta é confirmar campo-a-campo o **layout** de C/E contra o Manual (ECF-4) — fidelidade de campo é FASE 2, não decisão.
- **[ASSUMIDO] Presumido é sempre trimestral** (D3) — verdadeiro pela regra geral; confirmar que não há caso de opção anual aplicável ao público-alvo.
- **[ASSUMIDO] A base presumida do MVP = só `3.1`/`3.3`** — ignora outras receitas tributáveis a 100% (§4). Correto para o salão típico; **incorreto** se o contribuinte tiver ganho de capital/receita financeira relevante.
- **[VERIFICADO, mas de escopo] O split só cobre vendas de salão** (§5.2) — a base CRM entra como serviço; não é bug deste incremento, é limite do PR #66.

---

## 8. Sinal humano — RESOLVIDO (2026-07-10); estado do gate da FASE 2

**Ratificações de DECISÃO recebidas (fecham o roteamento):**
1. ✅ **[ROTA — era o bloqueador] Recuperação da ECD (D5) → rota (b) recover-from-ECD.** O MVP inclui os Blocos C/E; o recibo/hash da ECD transmitida é input humano no DTO. Consequências propagadas em D5/§4/§5/§6/§7.
2. ✅ **[ESCOPO] TaxRegime (D4) → transiente por geração.** Nada persistido; sem reabrir a torre §4.

**Ainda a ratificar (escopo, não bloqueia o roteamento — pode confirmar junto ao arranque da FASE 2):**
- **[ESCOPO] Bar de aceite:** "importado sem erro de estrutura no PVA-ECF" (idêntico à ECD), PVA-pass real = sign-off humano. *(Assumido como o gate; corrigir se divergir.)*

**Bloqueadores de DECISÃO restantes: NENHUM.** Os dois forks foram fechados. A FASE 2 fica travada **apenas** pelos **dois bloqueadores EXTERNOS de dado** — que **não são decisão nossa**:
- 🔴 **§5.1 — `3.3` sem código referencial RFB:** um **contador** tem de cadastrar o código (rota `PUT /referential/mappings` do INCR-9) na `mappingVersion` da ECF; sem isso o **coverage-gate (D6) falha a geração por construção**.
- 🟡 **§5.2 — receita CRM não-salão contabilizada como serviço (`3.1`):** `CrmOpportunityWonMapper` credita tudo em `3.1`; se houver **revenda fora do salão**, a base presumida fica **incorreta** (presume 32% onde caberia 8%). Não impede o arquivo de sair; é incorreção de base fiscal a fechar por extensão do split (incremento próprio).

> **Resumo do gate:** decisão = destravada; a FASE 2 (impl) aguarda **só** o dado externo (código RFB da `3.3`) para uma geração correta, e a extensão do split CRM para uma base fiscal fiel quando houver revenda fora do salão. O primeiro passo de código da FASE 2 (Passo A do PLAN — baixar/transcrever o Manual) **não** depende desses bloqueadores e pode iniciar assim que o roteamento for autorizado.
