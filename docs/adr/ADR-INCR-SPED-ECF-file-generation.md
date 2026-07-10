# ADR-INCR-SPED-ECF — Geração do arquivo ECF (SPED Fiscal · IRPJ/CSLL · Lucro Presumido)

- **Status:** **Proposed — FASE 1 (parecer + PLAN + ADR). Aguardando aval humano.** Nó ⚫ **DIFERIDO** no master map §5. NENHUM código escrito; nenhuma skill de geração roteada. A regra de uso do master map §1 proíbe rotear contra um nó ⚫ sem **ADR em disco + sinal humano** — este ADR é a metade "ADR em disco"; a FASE 2 (impl) só destrava com o sinal humano (§8).
- **Date:** 2026-07-10
- **Decision class:** PRISMA_FIRST_CLASS · **READ/EXPORT** (leitura do ledger + apuração fiscal derivada + um write de metadados de job). **NÃO** muda valor de ledger. Contrato §2.1, T3.
- **Depends on (tudo em `main`):** INCR-4 (`AccountingReportService` — BP/DRE + `getAccountBalances(scope,from?,to?)` com janela e `excludeSourceTypes`), INCR-6 (`AccountingDataExchangeJob` + `storage` + download de artefato), **INCR-8 (proveniência — pré-req §5 do master map)**, **INCR-9 (`ReferentialMapping` + cobertura chart-driven)**, **BE-INCR-REVENUE-SPLIT / PR #66 (split serviço `3.1` × revenda `3.3` — a base do Bloco P)**, BE-INCR-SPED-ECD / PR #62 (precedente de serializer posicional puro + coverage-gate), BE-INCR-SPED-APURACAO / PR #63 (encerramento — relevante para a **ECD** recuperada, não para a base fiscal presumida).
- **Roadmap:** `docs/accounting/ACCOUNTING-MASTER-MAP.md` §5 — nó "**ECF readiness** (arquivo SPED Fiscal: IRPJ/CSLL)" (⚫ diferido). Regime de partida = **Presumido** (SN isento; Real raro).
- **Supersedes:** none · **Related:** ADR-INCR-SPED-ECD (mesma classe de risco campo-a-campo — lição I052), ADR-INCR-REVENUE-SPLIT (o pré-requisito de dado que este consome), ADR-INCR9 (mapeamento referencial = fonte do Bloco J/K), ADR-INCR-SPED-APURACAO (encerramento contábil — pré-req da **ECD recuperada**, não da apuração presumida).

> **Nota de processo (T12).** ADR escrito **antes** do código: `PLAN → ADR → BRIEF → impl → test → review independente (worktree separado) → PR → closeout → memória`. **Sem migração** prevista (ver D7) ⇒ smoke-migration-gate **não se aplica**. **Altitude desta FASE 1:** decisões de escopo/estrutura no nível **bloco/registro**; a transcrição **campo-a-campo** do leiaute oficial (ordem/tamanho/obrigatoriedade de cada campo) é **FASE 2** — os itens abertos estão em §6 (PENDENTE-VERIFICAR), exatamente como a ECD fez o campo-a-campo no Passo 2. **Divergências vs. o brief de entrada marcadas [REFINA O BRIEF].**

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

### D4 — Regime/identificação = **DTO transiente + constantes de domínio**; SEM entidade `TaxRegime`/`LegalEntity` persistida no MVP  **[REFINA O BRIEF — a proposta de "novo agregado TaxRegime"]**
**Decisão:** a declaração de regime (`0010.FORMA_TRIB=Presumido`), a identificação do declarante (`0000`: NOME/CNPJ/UF/COD_MUN/…), os signatários e o **período de apuração** entram como **parâmetros do DTO de geração** (transientes, por geração), exatamente como a ECD D3. As regras de presunção/alíquota são constantes de domínio (D2). **NÃO** se cria model `TaxRegime` nem `LegalEntity` no MVP.

**Por quê (segue o precedente ECD D3 + evita reabrir a torre rejeitada):** persistir um `TaxRegime`/cadastro de empresa colidiria com a **torre multiempresa rejeitada** (master map §4; T2 = `AccountingScope` de 2 níveis, sem `LegalEntity`) e **não adiciona invariante que o banco precise garantir** no MVP — o regime é entrada de compliance por geração, e a única coisa "de estado" (a presunção por atividade) já vive no plano de contas (`3.1`/`3.3`). **Descartado/DIFERIDO:** model `TaxRegime` persistido (regime histórico + query por ano) — é **DECISÃO ARQUITETURAL** (ADR próprio + sinal humano) se um requisito futuro exigir histórico consultável de opção-de-regime; **se o design tender a persistir cadastro de empresa/estabelecimento → PARAR** (colide §4). **[HUMANO — §8:** confirmar que TaxRegime transiente basta para o MVP, ou se há requisito de persistência já hoje.]**

### D5 — Recuperação da ECD (Blocos C/E) = **FORK QUE EXIGE SINAL HUMANO**  **[decisão NÃO tomada nesta FASE 1]**
**Contexto (grau INFERIDO — a confirmar contra o Manual da ECF na FASE 2):** a ECF de uma PJ que mantém escrituração contábil (**ECD**) tipicamente **recupera a ECD transmitida** — Bloco **C** (Informações Recuperadas da ECD, referenciando o **recibo/hash** da ECD transmitida) e Bloco **E** (Informações Recuperadas da ECD e Cálculos Fiscais — saldos contábeis recuperados). Luminaris **mantém escrituração contábil completa** (gera ECD — BE-INCR-SPED-ECD). Isso cria um **acoplamento**: a recuperação C/E depende de uma **ECD efetivamente transmitida** (com recibo), e a transmissão da ECD é ela própria um **passo humano residual** (PVA/Receitanet — fora deste ambiente).

**Duas rotas (a decidir com o humano, não aqui):**
- **(a) Standalone (menor superfície):** preencher P100/P150 e os saldos do Bloco K **direto** de `AccountingReportService` (INCR-4) + `ReferentialMapping` (INCR-9), **sem** emitir C/E de recuperação. Simples e autocontido; **risco:** o PVA-ECF pode **exigir** recuperação da ECD para PJ que a possui ⇒ arquivo rejeitado por obrigatoriedade de bloco.
- **(b) Recover-from-ECD (fiel):** emitir Bloco C/E referenciando o **hash/recibo da ECD transmitida**, recebido como **DTO transiente** (como a identificação do declarante). Mais fiel à obrigatoriedade; **custo:** depende do artefato humano (ECD transmitida) e de transcrição campo-a-campo de C/E na FASE 2.

**Por que não decido agora:** a obrigatoriedade C/E para Presumido-com-ECD é **interpretação legal + matriz de obrigatoriedade do leiaute** — os dois têm de ser confirmados (accountant + Manual da FASE 2). Escolher errado aqui inverte o escopo do MVP. **É a pergunta-de-sinal-humano central (§8).**

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
- **Recuperação da ECD (Blocos C/E)** — condicional ao FORK D5; se a rota (a) standalone for escolhida, C/E ficam FORA; se (b), entram na FASE 2 com transcrição campo-a-campo.

---

## 5. Pré-requisitos de dado **ABERTOS** (travam a FASE 2)

1. **🔴 `3.3 Receita de Revenda` sem código referencial RFB (BLOQUEADOR direto).** Follow-up registrado do PR #66: `3.3` fica não-mapeada no diagnóstico referencial (INCR-9, chart-driven — correto). O **coverage-gate (D6) FALHA a geração** enquanto `3.3` não tiver um código referencial. **Quem fecha:** um humano/contador atribui o código do plano referencial RFB à `3.3` (via a rota `PUT /referential/mappings` do INCR-9), na `mappingVersion` da ECF. **Não é trabalho de código deste incremento — é dado de compliance que só o humano provê.**
2. **🟡 Receita não-salão contabilizada como serviço.** `CrmOpportunityWonMapper` credita **tudo em `3.1`** (só vendas de salão fazem o split 3.1/3.3). ⇒ qualquer receita de oportunidade CRM entra na base presumida como **serviço (32%)**. Se houver revenda por fora do salão, a base fica **incorreta** (presume 32% onde deveria 8%). **Não bloqueia** a geração (o arquivo sai), mas é uma **incorreção de base fiscal** silenciosa. Registrar; a extensão do split ao mapper CRM é incremento próprio.
3. **🟡 Rota de recuperação da ECD (Blocos C/E)** — depende do FORK D5. Se rota (b), o **recibo/hash da ECD transmitida** é dado humano por geração.
4. **🟡 Código/versão do plano referencial da ECF** (D6) — pode divergir do referencial contábil da ECD; a confirmar na FASE 2 + o contador provê os códigos.

---

## 6. PENDENTE-VERIFICAR (contra o Manual da ECF — **FASE 2**, não chutar)

> Estes são os equivalentes-ECF dos PVA-1..7 da ECD. **Nenhum resolvido nesta FASE 1** — a lista de registros do §D3/D6 é INFERIDA de domínio; a FASE 2 transcreve o leiaute e confirma. A lição **I052** obriga: cruzar cada registro dependente com suas **Regras de Validação** do Manual antes de fechar.

- **ECF-1 (leiaute/versão):** fixar o Manual de Orientação da ECF do ano-calendário-alvo (ADE Cofis), baixar, extrair, isolar a **matriz de obrigatoriedade por regime** (coluna Presumido) + a seção de leiaute.
- **ECF-2 (conjunto de registros do Bloco P):** confirmar a lista/numeração exata dos registros do Presumido (P030 períodos · P100 balanço · P130 base IRPJ · P150 DRE · P200 IRPJ · P230/P300 base CSLL · P400/P500 CSLL · P990) — **os números acima são INFERIDOS**; a matriz do Manual é a fonte.
- **ECF-3 (Blocos 0/9/J/K/Y obrigatórios):** quais registros de 0 (0000/0010/0020/0030/0930/0990), 9 (9001/9900/9990/9999), J (J050/J051/J100/J990), K (K030/K155/K156/K355/K356/K990) e Y são obrigatórios para Presumido.
- **ECF-4 (recuperação ECD):** obrigatoriedade real dos Blocos C/E para Presumido-com-ECD (FORK D5).
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
- **[VIÉS — INFERIDO, alto risco] A lista de registros do Bloco P e dos Blocos C/E/J/K/Y é conhecimento de domínio fiscal, NÃO transcrita do leiaute oficial.** É exatamente a superfície que gerou a lição **I052** na ECD (ADR internamente inconsistente no campo-a-campo). **Mitigação:** §6 marca tudo como FASE-2-a-verificar; nenhuma decisão de campo é fechada aqui.
- **[INFERIDO] A obrigatoriedade da recuperação C/E da ECD para Presumido** é interpretação legal minha — pode estar errada nos dois sentidos (obrigatória, ou dispensada). Por isso é FORK humano (D5), não decisão.
- **[ASSUMIDO] Presumido é sempre trimestral** (D3) — verdadeiro pela regra geral; confirmar que não há caso de opção anual aplicável ao público-alvo.
- **[ASSUMIDO] A base presumida do MVP = só `3.1`/`3.3`** — ignora outras receitas tributáveis a 100% (§4). Correto para o salão típico; **incorreto** se o contribuinte tiver ganho de capital/receita financeira relevante.
- **[VERIFICADO, mas de escopo] O split só cobre vendas de salão** (§5.2) — a base CRM entra como serviço; não é bug deste incremento, é limite do PR #66.

---

## 8. Pergunta-de-sinal-humano (destrava a FASE 2)

Para promover o nó ⚫→⏳ e rotear as skills de geração, preciso do humano em **quatro** pontos (o item 1 é o bloqueador de rota; os demais são de escopo):

1. **[ROTA — bloqueador] Recuperação da ECD (D5):** o MVP da ECF-Presumido deve **(a) gerar standalone** (P100/P150/K a partir dos relatórios INCR-4, sem Blocos C/E) — mais simples, risco de o PVA exigir recuperação — **ou (b) recuperar a ECD transmitida** (Blocos C/E, recibo/hash da ECD como input humano) — mais fiel, mais superfície? *(Recomendação do parecer: confirmar a obrigatoriedade contra o Manual na FASE 2 e, se o PVA exigir, ir de (b); começar por (a) só se o Manual dispensar C/E para o caso.)*
2. **[ESCOPO] TaxRegime (D4):** confirmar que **regime transiente por geração** (DTO) basta para o MVP — sem persistir `TaxRegime`/cadastro de empresa — ou se já há requisito de histórico de regime consultável (que seria ADR próprio, colidindo com a torre §4).
3. **[ESCOPO] Bar de aceite:** ratificar **"importado sem erro de estrutura no PVA-ECF"** como o gate (idêntico à ECD), com o PVA-pass real sendo sign-off humano.
4. **[DADO] Código referencial de `3.3`:** o contador provê o código do plano referencial RFB para `3.3 Receita de Revenda` (§5.1) — sem ele, a geração é bloqueada pelo coverage-gate por construção.

**Enquanto (1) não for respondido, a FASE 2 não roteia** — a rota muda o conjunto de blocos do MVP.
