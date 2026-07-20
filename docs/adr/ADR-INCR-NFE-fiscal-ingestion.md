# ADR-INCR-NFE — Ingestão fiscal de NF-e (Nota Fiscal Eletrônica)

- **Data:** 2026-07-20
- **Status:** **Proposed — FASE 1 (parecer + ADR). RATIFICADO FORK-A-FORK 2026-07-20 (via AskUserQuestion,
  6 forks confirmados um a um pelo dono do produto — §5).** Nó ⚫ **DIFERIDO** no master map §5.1 (Bloco B
  item 11), **re-priorizado pelo dono 2026-07-20 para o PRÓXIMO incremento sequenciado logo APÓS o estoque
  (INCR-INVENTORY)** — deixa de ser "diferido sem ordem". A regra §1 do master map proíbe rotear código
  contra um nó ⚫ sem **ADR em disco + sinal humano**; ambas as metades agora existem. **NENHUM código
  escrito; nenhuma skill roteada.** **Divergência ratificada:** F-NFE1 → **(b) COMPRA + VENDA** (o dono
  escolheu incluir a NF-e de venda no MVP, além da recomendação compra-only do par); os outros 5 forks
  confirmados na opção recomendada (F-NFE5→(a), F-NFE6→(a), F-NFE2→(a), F-NFE3→(a), F-NFE4→(a)). **Bloqueador
  de ordenação (não de design):** a implementação só começa **após o PR #130 mergear** (a ponte de compra
  AP→estoque que a NF-e de compra pré-preenche ainda vive na branch `claude/incr-inventory`, ABERTA — §8/F-NFE5).
- **Autores:** par `luminaris-orchestrator` (roteamento, ORCH-001) + `luminaris-accounting-architect` (parecer
  de domínio, ACC-0xx). Mesmo formato dos precedentes `ADR-INCR-AP` / `ADR-INCR-AR` / `ADR-INCR-INVENTORY`.
- **Nó do master map:** §5 "Subrazões restantes (estoque, imobilizado, folha, **fiscal**)" — ⚫ diferido; §5.1
  Bloco B item 11. Este ADR abre **só a ingestão de NF-e** (parser + pré-preenchimento). Não colide com §1
  (T1–T12) nem §4 (rejeitadas) — verificação em §2.
- **Supersedes:** none · **Related:** `ADR-INCR-INVENTORY-stock-subledger` (§6 delega explicitamente a NF-e
  a este ADR; a ponte AP→estoque é o ancoradouro), `ADR-INCR-AP-accounts-payable` (a `Payable` que a NF-e de
  compra pré-preenche), `ADR-INCR8-source-document-provenance` (a NF-e é o documento de origem natural),
  `ADR-INCR7-CNAB-bank-statement` / `ADR-INCR7-OFX-bank-statement` (padrão de parser puro campo-a-campo),
  `ADR-INCR-SPED-ECD-file-generation` (lição I052 — leiaute fiscal transcrito do manual, nunca de memória),
  `ADR-INCR-COUNTERPARTY-first-class` (o emitente da NF-e resolve a `Counterparty` — quando #130/A1 mergearem).

## TLDR (2 linhas)

NF-e entra como **ingestão**, não como subrazão novo: um parser **puro** `lib/nfe.ts` (espelha
`cnab`/`ofx`/`sped`) normaliza o XML autorizado da nota → um objeto que **pré-preenche** a `Payable`/entrada de
estoque **já provada** (ponte AP→estoque do INCR-INVENTORY, #130), sem novo caminho de valoração e sem injetar
Prisma no motor DynamicTable. **MVP ratificado = NF-e de COMPRA + de VENDA** (F-NFE1 (b)): a de compra
pré-preenche a `Payable`/entrada de estoque; a de venda **anexa proveniência + cruza** com a venda de salão já
lançada (receita + CMV), **sem re-lançar** (D2b). O custo de estoque vem da nota (`vProd`+acessórios fiscais,
**não** `vNF` cego) e a idempotência liga na identidade do evento, não na chave de acesso.

---

## 1. Contexto e objetivo

Hoje a compra de mercadoria entra no ledger por **fatura manual** digitada no AP (INCR-AP, PR #102) e, com a
ponte de compra do INCR-INVENTORY (#130), essa `Payable` de mercadoria já vira **entrada de estoque valorada**
(`D 1.1.6 Estoques / C 2.1.2 Fornecedores` + `StockMovement INBOUND`). O que falta é a **fonte automática do
dado**: ler o **XML autorizado da NF-e** do fornecedor e **pré-preencher** essa mesma `Payable`/entrada —
fornecedor, número/série, data de emissão, itens, quantidades e **custo de aquisição** — em vez de o operador
redigitar a nota.

**Classificação (STOP block do CLAUDE.md):** a NF-e **não é uma entidade/módulo com invariante próprio** — é
**ingestão de documento** que *alimenta* entidades que já existem (`Payable`, estoque, `Counterparty`,
`SourceDocument`, todas Prisma first-class). Portanto **não** cria subrazão contábil novo, **não** é
DynamicTable, e o parser é uma **biblioteca pura** (não passa por camada Route→Service). A integração
(resolver produto/emitente, computar custo, chamar `createPayable`) vive no **controller/serviço de
integração**, pós-parse — nunca dentro do motor DynamicTable (§2.1, T10).

**Escopo MVP (ratificado em §5, F-NFE1 → (b) COMPRA + VENDA):**
- **Compra:** parser `lib/nfe.ts` + serviço de integração que **pré-preenche** a `Payable` de mercadoria a
  partir do XML, reusando integralmente a ponte AP→estoque (#130).
- **Venda:** ingerir o XML da NF-e de venda e **cruzá-lo com a venda de salão já lançada** (receita + CMV via
  bridge do INVENTORY), **anexando proveniência** (`SourceDocument`) e sinalizando divergência — **sem
  re-lançar receita nem CMV** (a venda de salão é a fonte-de-verdade contábil; a NF-e de venda é o documento
  fiscal dela). Ver D2b e o risco de duplo-lançamento (§6.5).

**FORA deste MVP (declarado):** processamento de **eventos** de NF-e (CC-e, cancelamento posterior por evento,
manifestação do destinatário), **outros modelos** (NFS-e serviço, NFC-e consumidor, CT-e transporte),
classificação fina item-a-item (estoque × despesa × imobilizado), e FE (`FE-INCR-NFE`, diferido).

## 2. Evidência de código (CBM-001 — confirmado por leitura em `origin/main` e `origin/claude/incr-inventory`)

| Claim | Grau | Evidência |
|---|---|---|
| **Não existe** parser de NF-e nem model fiscal de nota hoje (pré-ADR legítimo) | verificado | `git ls-tree origin/main server/src/lib` sem `nfe.ts`; sem ADR de NF-e em `docs/adr` |
| A ponte de compra AP→estoque (o ancoradouro) **só existe na branch #130**, não em `main` | verificado | `origin/claude/incr-inventory:schema.prisma:855-856` tem `inventoryProductRef`/`inventoryQty`; `grep` em `origin/main` = 0 |
| `Payable` (#130) já carrega os campos de pré-preenchimento: `inventoryProductRef?`/`inventoryQty?` (XOR com `expenseAccountId`) + `counterpartyId?` (A1) + `supplierName`/`supplierRef?`/`documentNumber?` | verificado | `origin/claude/incr-inventory:schema.prisma:846-857` (XOR :853-856; counterparty :857) |
| `PayableService.createPayable` já roteia o débito p/ `1.1.6` quando é compra de estoque (`isInventoryPurchase`), emite `StockMovement INBOUND`, gate/audit/idempotência in-tx | verificado | schema doc `:853` ("The service re-checks the branch via isInventoryPurchase"); ADR-INCR-INVENTORY §D3(b) |
| Parser fiscal precedente = **NORMALIZADOR PURO**: converte formato→`InTable`, **não valida** (emite RAW p/ `parseLines` rejeitar all-or-nothing), datas por **reslice literal** (nunca `new Date`), valores por **aritmética de string**→cents (nunca `Number()*100`) | verificado | `lib/cnab.ts` inteiro (`cnabDateToDateOnly` :60-65 reslice; `cnabAmountToCents` :73-81 string-arith; sem import de validação) |
| **NÃO existe dependência de XML** no `server/package.json` (o XML NF-e não tem parser hoje) | verificado | `grep -iE "xml\|fast-xml\|xml2js\|sax\|cheerio\|jsdom" server/package.json` = 0 |
| `SourceDocument` (INCR-8) tem exatamente os slots da NF-e: `externalRef` (**referência HUMANA**, separada do sourceId/idempotência), `documentDate`, `rawJson` (snapshot), `attachmentId` (arquivo bruto) | verificado | `origin/main:schema.prisma:734-748` (`externalRef` :739 "separada do sourceId/idempotência"; `rawJson` :743; `attachmentId` :742) |
| AP já é o **1º consumidor orgânico** do seam de proveniência com a NF do fornecedor (`externalRef`=nº NF, `documentDate`=data do documento) | verificado | `ADR-INCR-AP §D6` |
| Idempotência contábil = `@@unique([userId,unitId,sourceType,sourceId])` do JournalEntry + chave de negócio `@@unique([userId,unitId,supplierName,documentNumber])` do Payable (rename-on-delete) | verificado | `schema.prisma` (Payable business key comment :868-871); `ADR-INCR-AP §D3` |
| Rateio de header (frete/desconto) entre linhas com **resíduo em centavos** (Σ preservado) = técnica provada | verificado | `SalonSaleFinalizedMapper.ts` `splitCredit`; `ADR-INCR-REVENUE-SPLIT` |
| Lição de leiaute fiscal: cada campo transcrito do **manual oficial com citação de página**, desambiguado pelas **Regras de Validação**, **nunca de memória** (I052 era erro rígido do PVA) | verificado | `ADR-INCR-SPED-ECD §D12/PVA-2` (transcrição campo-a-campo com nº de página) |

**Colisões com decisões commitadas:** nenhuma — desde que (i) o parser seja **puro** e a integração viva no
controller/serviço, nunca no motor DynamicTable (§2.1, T10); (ii) a NF-e **reuse** a ponte AP→estoque, sem
criar caminho de valoração novo (T3/T4); (iii) idempotência ligue na **identidade do evento**, não na chave de
acesso crua (T7); (iv) valores nasçam em **centavos Int** por aritmética de string (T4); (v) nenhuma torre de
cadastro `Product`/`Fornecedor` first-class nova (produto = `productRef`, emitente = `Counterparty` já
ratificada em A1) e nenhum rule-engine dirigido por template (§4) — a NF-e roteia **campos conhecidos** para
`createPayable`, não gera lançamento por template.

## 3. As decisões fixadas (D1–D8)

### D1 — `lib/nfe.ts` = parser PURO, espelho de `cnab`/`ofx`/`sped`
Uma função `parseNfe(xml)` → objeto normalizado `ParsedNfe` (emitente `{cnpj,nome,ie}`, identificação
`{numero,serie,chaveAcesso,dhEmi}`, `itens: [{cProd,xProd,ncm,cfop,qCom,unidade,vProdCents,...}]`, totais
fiscais `{vProdCents,vDescCents,vFreteCents,vOutroCents,vIpiCents,vIcmsCents,vIcmsStCents,vNfCents}`). **Não
importa Prisma, não valida regra de negócio, não toca banco.** Datas (`dhEmi`) por **reslice literal** do
`YYYY-MM-DD` embutido (nunca `new Date`); valores decimais do XML (`1234.56`) → **centavos Int por aritmética
de string** (mesma disciplina de `cnabAmountToCents`; nunca `Number()*100`). O que não converte exato é
sinalizado para rejeição **loud, all-or-nothing** (nunca arredonda em silêncio — ACC-014).

**Sourcing do leiaute (lição I052, obrigatório):** os caminhos de tag (`nfeProc/NFe/infNFe/emit/…`, `det/prod`,
`total/ICMSTot`) e a semântica de cada campo são transcritos do **Manual de Orientação do Contribuinte (MOC) da
NF-e + schema XSD oficial**, com citação, **nunca de memória**. NF-e é XML com **namespace** (`http://www.
portalfiscal.inf.br/nfe`) e **assinatura digital** (`<Signature>`) — o parser ignora a assinatura e lê `infNFe`.

### D2a — NF-e de COMPRA **pré-preenche** a `Payable`/entrada; reuso integral da ponte #130
O serviço de integração `NfeImportService` recebe o `ParsedNfe`, resolve **emitente→`Counterparty`** e cada
item→**`productRef`** (D6), computa o **custo de aquisição** (D3) e chama **`PayableService.createPayable`**
com `inventoryProductRef`/`inventoryQty` setados (compra de mercadoria) — exatamente o caminho da ponte
AP→estoque (#130). **Nenhum caminho de valoração novo, nenhum `postEntry` direto do parser:** a NF-e é uma
**fonte de dado** para o `createPayable` já provado (que carrega período/audit/idempotência/estoque in-tx).

### D2b — NF-e de VENDA **cruza** com a venda de salão já lançada; NUNCA re-lança (F-NFE1 = (b), ratificado)
A venda de salão **já é a fonte-de-verdade contábil**: o bridge pós-commit lança receita (`salon.sale.finalized`,
`D 1.1.2 / C 3.1+3.3`) e, com o INVENTORY (#130), o CMV (`salon.sale.cogs`, `D 4.2 / C 1.1.6`). A NF-e de venda
é o **documento fiscal** dessa mesma venda — **não um segundo fato gerador**. Portanto o serviço de venda:
1. **casa** o XML com a venda já lançada (por identificador da venda / valor / data; o `sourceId` da venda é a
   âncora), **anexa `SourceDocument`** (chave de acesso da NF-e de saída) ao(s) lançamento(s) existente(s), e
2. **sinaliza divergência** se o total/itens da NF-e não batem com a venda lançada (relatório de conciliação
   fiscal, read-only) — **sem postar nada**.

**Guard-rail crítico (§6.5):** a NF-e de venda **NÃO** chama `postEntry` nem `createPayable` — se o fizesse,
duplicaria receita/CMV. Uma NF-e de venda **sem** venda de salão correspondente (venda avulsa faturada, não-PDV)
fica **FORA do MVP** (é o território do AR-formal / faturas avulsas — declarado em §4); no MVP a NF-e de venda
**exige** a venda de salão âncora, senão rejeita loud. Este é o ponto onde a divergência ratificada (compra +
venda) introduz o maior risco novo, e por isso o cruzamento é **read-only + proveniência**, jamais lançamento.

### D3 — Custo de estoque da NF-e **≠ `vNF` cego** (fronteira fiscal de dinheiro — F-NFE6)
O custo de aquisição que valoriza o estoque **não** é o total da nota. Regra proposta (a ratificar, F-NFE6):
```
custoCents = vProdCents − vDescCents + vFreteCents + vOutroCents + vIpiCents + vIcmsStCents
```
com o **ICMS próprio (`vICMS`) NÃO subtraído** (incluso no custo por **não-recuperabilidade no regime alvo** do
molde-salão — Simples/Presumido, não-contribuinte pleno de ICMS). **Por quê:** ICMS recuperável seria crédito
(sairia do custo) para contribuinte pleno; no público-alvo não é. IPI e ICMS-ST compõem custo para o
adquirente não-industrial. **Rateio** de `vDesc`/`vFrete`/`vOutro` de header entre os N itens = técnica
`splitCredit` (proporcional a `vProd` da linha, resíduo de centavo na última linha, `Σ == custo total`).
**Este é o ponto sem espelho mecânico de AP/AR — gate de review obrigatório (§7).** Usar `vNF` cego
super/subvaloriza o estoque; é a decisão de dinheiro mais perigosa da NF-e, por isso é fork explícito.

### D4 — Idempotência liga na IDENTIDADE DO EVENTO; chave de acesso = `externalRef` HUMANO (T7)
A **chave de acesso** da NF-e (44 dígitos) entra como **`externalRef` do `SourceDocument`** — referência
**humana**, `schema.prisma:739` diz literalmente "separada do sourceId/idempotência". A idempotência real
permanece a do `Payable`/posting: chave de negócio `@@unique([userId,unitId,supplierName,documentNumber])`
(número da NF) + `@@unique([...sourceType,sourceId])` do JournalEntry. **Re-import do mesmo XML → 1 Payable**
(o `createPayable` curto-circuita na chave de negócio; rename-on-delete libera a chave em cancel/estorno).
**NUNCA** ligar idempotência na chave de acesso crua (uma reemissão/ajuste furaria). **Teste obrigatório:**
importar o mesmo XML 2× → 1 Payable, 1 entrada de estoque.

### D5 — NF-e denegada/cancelada: rejeitar denegada loud; cancelamento pós-import = estorno do AP (T5)
O parser lê `cStat`/protocolo de autorização e **rejeita loud** (como `parseCnab` rejeita CNAB 400) qualquer
XML que **não seja NF-e autorizada** (`cStat=100`): denegada (110/301/302) e sem protocolo são recusadas com
erro explícito. NF-e **cancelada por evento posterior**, depois de já ter virado `Payable`, é tratada pelo
comando **`cancel` do AP** (que dispara `reverseEntry` — T5/ACC-018), nunca por edição destrutiva. O
**processamento de eventos** (ler o XML de cancelamento/CC-e e casar com a nota) fica FORA do MVP — declarado
em §6.

### D6 — Emitente→`Counterparty`, item→`productRef`; sem auto-criar produto silenciosamente
O emitente (`emit/CNPJ`,`emit/xNome`) resolve/cria a **`Counterparty`** (A1) re-escopada, com `supplierName`
como snapshot (espelho do `createPayable`). Cada item (`det/prod`) casa com um **`productRef`** de linha
DynamicTable — mas o `cProd`/`xProd`/EAN da nota **não** casa automaticamente com o produto do salão: o MVP
**pré-preenche** e **exige o operador confirmar** o `productRef` (nunca auto-cria produto às cegas). Espelha o
`customerRef`/A1 (produto/nome não são invariante fiscal — F-NFE, T3).

### D7 — Proveniência via `SourceDocument` (INCR-8), consumidor orgânico natural (F-NFE4)
A NF-e é literalmente "a nota do fornecedor" que o INCR-8 formalizou. O posting de reconhecimento do AP passa
`sourceDocument` com `externalRef`=chave de acesso (ou nº NF), `documentDate`=`dhEmi`, `rawJson`=snapshot do
XML, `attachmentId`=o XML anexado (`DocumentAttachment`, INCR-5). **Nenhum modelo de proveniência novo.**

### D8 — Estratégia de parse do XML: `fast-xml-parser` (dep mínima) vs hand-rolled (F-NFE2)
NF-e é XML **profundamente aninhado, com namespace e assinatura digital** — não campo-fixo (CNAB) nem
chave-valor raso (OFX). **NÃO existe parser de XML no `package.json`** (verificado). Recomendação: dependência
mínima **`fast-xml-parser`** (zero-dependency, pequena, amplamente usada) para o **parse mecânico**; toda a
lógica de negócio (quais tags, como valorar) fica em `lib/nfe.ts`. **Ponytail (rung 4):** a dep resolve o parse
mecânico que "poucas linhas" de regex sobre XML fariam **frágil** (a classe de bug I052 — leiaute complexo lido
errado). **Carimbo honesto:** é dependência nova no caminho fiscal — merece ratificação (F-NFE2). Alternativa
hand-rolled = mais código frágil, rejeitada pelo arquiteto.

---

## 4. Fronteira e sequenciamento

- **A NF-e é ingestão, não subrazão (§2.1 confirmado — F-NFE3):** gera/pré-preenche `Payable`+entrada+
  proveniência; **não** cria tabela contábil nova, **não** injeta Prisma no motor DynamicTable, integração no
  nível controller/serviço pós-parse. Reusa `PayableService.createPayable` (não posta direto).
- **Bloqueador de ordenação (não de design) — F-NFE5:** a ponte de compra AP→estoque vive no **PR #130
  (ABERTO)**. O ADR pode ser **escrito e ratificado JÁ**; a **implementação só começa após #130 mergear** —
  sem ela, a NF-e de compra não tem onde pousar o item de mercadoria (`inventoryProductRef`/`inventoryQty` +
  `receiveStock`). Registrado em §8.
- **NF-e de venda (ratificada NO MVP — F-NFE1 (b)):** cruza com a venda de salão já lançada (proveniência +
  conciliação read-only), **sem re-lançar** (D2b). Venda avulsa faturada **sem** venda de salão âncora fica
  FORA (território AR-formal).
- **Diferido (cada um ADR/incremento próprio):** **eventos** NF-e (cancelamento/CC-e/manifestação do
  destinatário); **outros modelos** (NFS-e serviço, NFC-e consumidor, CT-e transporte); **classificação fina
  item→(estoque | despesa | imobilizado)** (MVP pode ser grossa = nota inteira é compra de mercadoria);
  **FE** (`FE-INCR-NFE`).

## 5. FORKS — RATIFICADOS FORK-A-FORK POR SINAL HUMANO (2026-07-20, via AskUserQuestion)

> Ratificação coletada em revisão interativa fork a fork com o dono do produto (cada fork apresentado com
> pernas, recomendação e grau de abertura, decisão confirmada individualmente). **Resultado: 5 dos 6 na opção
> recomendada; F-NFE1 divergiu → (b) COMPRA + VENDA** (o dono ampliou o escopo do MVP). O corpo do ADR (TLDR,
> §1, D2a/D2b, §4) reflete F-NFE1=(b).

| Fork | Pernas | **RATIFICADO** | Grau de abertura |
|---|---|---|---|
| **F-NFE1 — escopo MVP** | (a) só NF-e de COMPRA · (b) compra **+** venda (venda cruza a venda de salão) | ✅ **(b) COMPRA + VENDA** — **divergiu** da recomendação (a); o dono incluiu a NF-e de venda. Consequência: D2b (cruza sem re-lançar) + risco §6.5 | médio |
| **F-NFE5 — dependência do #130** | (a) ADR+ratif. JÁ; impl bloqueada até #130 · (b) esperar #130 até para escrever | ✅ **(a)** — desenho maduro; bloquear só a impl adianta a ratificação sem custo | baixo (ordering, não design) |
| **F-NFE6 — custo de estoque na NF-e** | (a) `vProd−vDesc+vFrete+vOutro+vIPI+vICMS-ST`, ICMS próprio incluso · (b) `vNF` cego · (c) só `vProd` líquido | ✅ **(a)** — fiel ao custo de aquisição do regime alvo (não-contribuinte pleno de ICMS); (b)/(c) super/subvalorizam. **Ressalva viva:** errado p/ contribuinte pleno (§6.1) | **ALTO — invariante de dinheiro** |
| **F-NFE2 — parse do XML** | (a) `lib/nfe.ts` puro + `fast-xml-parser` · (b) puro + hand-rolled (sem dep) | ✅ **(a)** — XML aninhado/namespace/assinatura; hand-rolled = classe de bug I052; dep mínima justificada (rung 4) | médio (dep nova) |
| **F-NFE3 — fronteira §2.1** | (a) ingestão que pré-preenche Payable/evento · (b) subrazão fiscal próprio | ✅ **(a)** — NF-e não tem invariante próprio; (b) reabriria motor/torre | baixo (confirmação) |
| **F-NFE4 — proveniência** | (a) `SourceDocument` (INCR-8) · (b) model de proveniência novo | ✅ **(a)** — consumidor orgânico natural; (b) recria o que o INCR-8 formalizou | baixo (confirmação) |

## 6. Riscos e vieses nomeados (T8)

1. **[RISCO ALTO — fronteira fiscal, sem espelho de AP/AR] Custo de estoque ≠ `vNF`.** ICMS/IPI/ST compõem ou
   não o custo conforme regime. A regra D3/F-NFE6 assume o regime do molde-salão (não-contribuinte pleno);
   **incorreta para um tenant contribuinte de ICMS** (aí ICMS é crédito, sai do custo). Limite explícito;
   gate de review = tie-out `Σ custo dos itens == custo total da nota` sobre nota com desconto+frete+IPI que
   não dividem exato.
2. **[chave de acesso vs idempotência]** 44 dígitos = `externalRef` humano, jamais `sourceId` (D4). Mitigado.
3. **[NF-e denegada/cancelada]** MVP exige `cStat=100`; eventos posteriores (cancelamento/CC-e) FORA do MVP —
   cancelamento pós-import só pelo `cancel` do AP. Declarado (D5/§4).
4. **[mapeamento item→produto é o elo fraco]** `cProd`/EAN da nota não casa com o `productRef` do salão; MVP
   exige confirmação do operador, nunca auto-cria produto. Rateio de frete/desconto = `splitCredit`.
5. **[RISCO ALTO — NOVO com F-NFE1=(b) COMPRA+VENDA] Duplo-lançamento da venda.** A venda de salão **já lança**
   receita + CMV (bridges `salon.sale.finalized`/`salon.sale.cogs`). Se a NF-e de venda chamar `postEntry`/
   `createPayable`, **duplica** receita/CMV. **Mitigação dura (D2b):** a NF-e de venda **NUNCA** posta — só
   **casa** com a venda âncora, **anexa `SourceDocument`** e **sinaliza divergência** (conciliação read-only);
   NF-e de venda sem venda de salão âncora **rejeita loud** (venda avulsa = território AR-formal, FORA). Este é
   o maior risco introduzido pela divergência ratificada. **Teste obrigatório:** ingerir NF-e de venda de uma
   venda já lançada → 0 lançamentos novos, 1 `SourceDocument` anexado; NF-e de venda órfã → rejeita.
6. **[viés de espelhamento nos parsers de extrato]** CNAB/OFX são "1 arquivo → N linhas de 1 conta"; a NF-e é
   "1 documento → 1 Payable + N itens + counterparty + impostos" — estrutura mais rica. O risco é subestimar
   o mapeamento fiscal por analogia com extrato. Caso adversarial: nota com item de uso/consumo misturado com
   mercadoria de revenda → nem todo item é estoque (alguns são despesa `4.x`). MVP: classificação **grossa**
   (nota inteira = compra de mercadoria); refinamento item-a-item diferido (§4).
7. **[dep nova no caminho fiscal — F-NFE2]** `fast-xml-parser` é superfície de ataque/manutenção nova; mitigado
   por ser o parse **mecânico** apenas (lógica em `lib/nfe.ts`) e por rejeitar loud o que não casa.
8. **[bloqueador #130]** Se #130 mudar a assinatura de `createPayable`/campos de estoque antes do merge, a
   fatia de integração re-alinha — por isso a impl espera #130 (§8).

## 7. Checklist de invariantes (ACC) que a implementação DEVE provar

- **ACC-013/T7** — idempotência `('ap.payable', payableId)`; chave de acesso = `externalRef`, nunca `sourceId`
  nem `userId`; re-import do mesmo XML → 1 Payable + 1 entrada.
- **ACC-014/T4** — custo em centavos Int por aritmética de string; `MAX_CENTS` no DTO; **tie-out do rateio**
  `Σ custo dos itens == custo total` sobre nota com desconto+frete+IPI não-exatos (o gate sem espelho de AP/AR).
- **ACC-011/012/T6** — o parser é puro (fora de tx); a escrita reusa `createPayable` (gate de período/status
  in-tx já provado); nenhuma `runTransaction` nova no `lib/nfe.ts`.
- **Fronteira §2.1** — `lib/nfe.ts` não importa Prisma; integração no controller/serviço; não posta direto.
- **ACC-016/018/T5** — import é comando; cancelamento pós-import = `cancel` do AP (estorno novo, original
  intacto). Denegada rejeitada loud (D5).
- **[F-NFE1=(b)] NF-e de venda NÃO posta (D2b)** — cruza com a venda de salão âncora (proveniência +
  conciliação read-only); NF-e de venda órfã rejeita. Teste: venda já lançada → 0 lançamentos novos.
- **ACC-010** — proveniência via `SourceDocument`, separada do `AuditEvent` (D7).
- Sourcing do leiaute (D1): cada tag/campo citado do MOC/XSD oficial, **nunca de memória** (lição I052).

---

## 8. Sinal humano — estado do gate

**RATIFICADO (2026-07-20, via AskUserQuestion — fork-a-fork COMPLETO):** F-NFE1 → **(b) COMPRA + VENDA**
(divergiu da recomendação compra-only; consequência D2b/§6.5); F-NFE5 → (a) ADR já, impl bloqueada até #130;
F-NFE6 → (a) `vProd−vDesc+vFrete+vOutro+vIPI+vICMS-ST` com ICMS próprio incluso; F-NFE2 → (a) `lib/nfe.ts` +
`fast-xml-parser`; F-NFE3 → (a) ingestão (fronteira §2.1 confirmada); F-NFE4 → (a) `SourceDocument`.
**Nenhum bloqueador de DECISÃO restante.**

**Bloqueador de ORDENAÇÃO (não de decisão):** a implementação só inicia **após o PR #130 mergear** — a ponte
de compra AP→estoque (`inventoryProductRef`/`inventoryQty` + `receiveStock`) é o ancoradouro que a NF-e de
compra pré-preenche, e vive na branch `claude/incr-inventory` (ABERTA). **O ADR pode ser escrito e ratificado
já** (F-NFE5 (a)); nada aqui depende de dado externo de terceiro (diferente do ECF/PVA).

> **Processo (mesmo de AP/AR/DIM/INVENTORY):** `ADR (este) → ratificação fork-a-fork → [merge do #130] →
> PLAN → impl (SERIAL, PAR-005) → review independente (worktree separado) → smoke-migration-gate (a migração
> é aditiva — dep nova + nenhuma ALTER em `journal_entries`; roda o gate por disciplina) → PR → closeout
> (ORCH-007 promove o nó §5.1 item 11 e move NF-e de ⚫ para ✅) → memória`. Nada implementado; nó permanece
> ⚫ até a implementação fechar.
