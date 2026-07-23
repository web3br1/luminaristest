# PLANO DE EXECUÇÃO / BRIEF — BE-INCR-NFE (ingestão fiscal de NF-e)

> Artefato de handoff para o `luminaris-implementer`, produzido pelo orquestrador a partir de
> `docs/adr/ADR-INCR-NFE-fiscal-ingestion.md` (ratificado fork-a-fork 2026-07-20). O orquestrador NÃO
> implementa (ORCH-001); este é o plano. Item 11 da fila §5.1 do master map.
>
> **Nota do orquestrador (2 linhas):** o bloqueador de ORDENAÇÃO do ADR (F-NFE5, dependência do PR #130)
> **caiu** — a ponte AP→estoque está em `main` (verificado em disco). Mas a leitura do código expôs **dois
> furos de DESIGN que o ADR não cobre** e que travariam a implementação no primeiro XML real: a `Payable`
> não comporta uma nota **multi-item** (§0.1) e a NF-e de venda **não carrega o `saleId`** que D2b assume
> como âncora (§0.2). Ambos são FORK NOVO → exigem ratificação humana antes de qualquer código (ORCH-006).

**Tarefa.** Ingestão de NF-e: parser puro `lib/nfe.ts` (espelho de `cnab`/`ofx`) + serviço de integração que
(a) **pré-preenche** a `Payable`/entrada de estoque na NF-e de **compra** e (b) **cruza** a NF-e de **venda**
com a venda de salão já lançada, anexando proveniência **sem re-lançar**. NÃO cria subrazão contábil novo,
NÃO cria model fiscal. SEM frontend (`FE-INCR-NFE` diferido).

**Intenção (T1).** O objetivo sob a letra não é "ler XML" — é **parar de redigitar a nota do fornecedor** sem
abrir um segundo caminho de valoração de estoque. Por isso todo o dinheiro passa pelo `createPayable` já
provado; o parser é biblioteca pura, a integração vive em controller/serviço (fronteira §2.1 / T10).

**Risco principal.** O custo de aquisição (D3/F-NFE6) é o **único ponto sem espelho mecânico** de AP/AR — e o
tie-out do §7 valida a *distribuição* (Σ itens == total), **não a correção de regime**. Em segundo lugar, a
NF-e de venda é o único caminho do módulo que toca lançamento já postado; se ela postar, duplica receita+CMV.

---

## 0. Os 2 forks NOVOS — ✅ RATIFICADOS 2026-07-22 (emenda em `ADR-INCR-NFE §9`)

> **F-NFE7 → (a)** 1 nota = 1 `Payable` (passivo total) + N `StockMovement` · **F-NFE8 → (a)** `saleId`
> explícito do operador. Ambos confirmados por sinal humano via `AskUserQuestion`. **Nenhum bloqueador de
> DECISÃO restante** — resta o gate de **dado externo** (F0-2 leiaute oficial + F0-3 XML real).

### 0.1 F-NFE7 — nota de compra **multi-item** não cabe na `Payable` de hoje ✅ **(a)**

**Evidência em disco (verificado, não inferido):**

| Fato | Onde |
|---|---|
| A `Payable` tem **UM** par `inventoryProductRef`/`inventoryQty` — um SKU por payable | `server/prisma/schema.prisma` (model `Payable`, campos `inventoryProductRef`/`inventoryQty`) |
| A chave de negócio é `@@unique([userId, unitId, supplierName, documentNumber])` | `schema.prisma:874` |
| O DTO exige XOR estrito: `expenseAccountId` **XOR** (`inventoryProductRef` **E** `inventoryQty`); nenhum dos dois → rejeita | [PayableDto.ts:66-97](server/src/features/accounting/dtos/PayableDto.ts:66) |
| `isInventoryPurchase` = `inventoryProductRef != null && inventoryQty != null` | [Payable.model.ts:37-42](server/src/features/accounting/models/Payable.model.ts:37) |
| `recognitionDebitCode` **lança** se não é compra de estoque e não há conta de despesa | [PayableService.ts:631-638](server/src/features/accounting/services/PayableService.ts:631) |

**Consequência:** uma NF-e real com N itens de mercadoria **não tem representação**. N `Payable` (uma por item)
colidem em P2002 na chave de negócio (mesmo fornecedor + mesmo nº de NF); 1 `Payable` com os N itens não cabe
(um slot só) e, com `inventoryProductRef=null` + `expenseAccountId=null`, o DTO rejeita e o reconhecimento
lança. **O MVP de compra só funciona hoje para nota de item único** — o que não é o caso geral.

**Boa notícia (limita o estrago):** o backstop de idempotência do movimento é **por item** —
`@@unique([inventoryItemId, kind, sourceType, sourceId])` (`schema.prisma`, comentário D-b) — então N
`receiveStock` com o **mesmo** `sourceId = payableId` e `inventoryItemId` distintos são legítimos. O problema é
só do lado da `Payable`.

**Pernas (✅ ratificada = (a)):**
- **(a) ✅ RATIFICADA — 1 `Payable` = 1 nota (passivo total), itens fora da `Payable`.** Terceiro ramo no
  gate XOR (`kind = 'nfe-multi-item'`): débito total em `1.1.6 Estoques` / crédito `2.1.2`, e o
  `NfeImportService` dirige **N `receiveStock`** com `sourceId = payableId` (o `@@unique` per-item já cobre).
  Custo: `ALTER payables` (1 coluna discriminadora ou `inventoryQty` nullable com flag) + ramificar
  `isInventoryPurchase`/`recognitionDebitCode`/`reconcilePayables` (o twin do reconcile, lição Gap 2 do
  INVENTORY). Fica fiel à contabilidade: **uma nota = um passivo**.
- **(b) Tabela filha `PayableItem` first-class.** Mais limpo modelarmente, migração maior, e abre a porta do
  `FiscalDocument` que o ADR §1 declarou fora do MVP.
- **(c) MVP restrito a nota de item único.** Zero código novo de schema; entrega quase nada de valor real.
- **(d) N `Payable` com `documentNumber` sufixado (`NF123/1`, `NF123/2`).** Zero migração, mas fabrica N
  passivos para uma nota — **erra a contabilidade** e polui a chave de negócio. Não recomendada.

**Grau de abertura: ALTO** — muda schema e emenda a `ADR-INCR-INVENTORY §D3(b)`.

### 0.2 F-NFE8 — a NF-e de venda **não carrega o `saleId`**; D2b assume uma âncora que não existe ✅ **(a)**

**Evidência:** o ADR (D2b) diz que a NF-e de venda "casa com a venda já lançada (por identificador da venda /
valor / data; o `sourceId` da venda é a âncora)". O `sourceId` da venda existe do lado do ledger —
`findBySource(scope, 'salon.sale.finalized', saleId)`
([IJournalEntryRepository.ts:69](server/src/features/accounting/repositories/IJournalEntryRepository.ts:69)) — mas
**nada no XML da NF-e aponta para ele**: o `saleId` do Luminaris não é campo de NF-e. Casar por valor+data é
heurística que, num salão com várias vendas do mesmo ticket no mesmo dia, **anexa a nota à venda errada**.

**Pernas (✅ ratificada = (a)):**
- **(a) ✅ RATIFICADA — Âncora EXPLÍCITA do operador.** O endpoint de venda recebe `saleId` no corpo (a UI/
  operador escolhe a venda); o serviço confere valor/data e **sinaliza divergência** sem postar. Zero
  heurística, zero anexo errado. É o mesmo reflexo do D6 ("nunca auto-cria produto às cegas").
- **(b) Casamento automático por valor+data com janela.** Rápido de demonstrar, erra em silêncio; anexar
  proveniência à venda errada é dado contábil falso e difícil de detectar depois.
- **(c) Tirar a NF-e de venda do MVP** (volta ao F-NFE1 (a), compra-only) e reabrir quando houver emissão real.

**Grau de abertura: MÉDIO** — não muda schema; muda a forma do DTO e o valor entregue.

### 0.3 Sub-decisão de seam (não precisa de fork, precisa de registro)

A NF-e de venda precisa **anexar `SourceDocument` a um lançamento já postado**. Hoje o seam de proveniência é
usado **só** dentro do `postEntry`: `createSourceDocument` + `linkEntry` aparecem exclusivamente em
[PostingService.ts:339,353](server/src/features/accounting/services/PostingService.ts:339); o repositório
(`SourceProvenanceRepository`) já expõe os dois métodos + `findSourcesByEntry`.
**Decisão proposta (O-1):** expor um comando novo e mínimo no dono do seam —
`PostingService.attachSourceDocument(scope, entryId, doc)` (cria + linka na MESMA tx + audit) — em vez de
injetar `ISourceProvenanceRepository` no serviço de NF-e. Mantém a escrita de proveniência num dono só.

---

## 1. Base verificada em disco (CBM-001 — `origin/main` @ `28c247a`)

| Claim | Grau | Evidência |
|---|---|---|
| `server/src/lib/nfe.ts` **não existe**; nenhuma branch/PR de NF-e aberta | verificado | `git ls-tree origin/main server/src/lib`; `git branch -r`; `gh pr list` |
| Ponte AP→estoque **está em `main`** ⇒ **F-NFE5 caiu** | verificado | `inventoryProductRef` no `schema.prisma` de `origin/main`; [PayableService.ts:194-211](server/src/features/accounting/services/PayableService.ts:194) |
| `Counterparty` (A1) e `requiresDimension` (B1) mergeados ⇒ emitente tem FK e o gate de dimensão já existe | verificado | `schema.prisma` em `origin/main` |
| **Nenhuma dependência de XML** no `server/package.json` ⇒ `fast-xml-parser` é dep nova (F-NFE2 já ratificou) | verificado | `grep -iE "xml" server/package.json` = 0 |
| `receiveStock` é READ-FIRST idempotente em `sourceId` e retorna `{valueCents}` | verificado | [IInventoryService.ts:14-20](server/src/features/accounting/services/IInventoryService.ts:14) |
| `createPayable` já aceita `sourceDocument {externalRef, documentDate, attachmentId}` no reconhecimento | verificado | [PayableService.ts:652-656](server/src/features/accounting/services/PayableService.ts:652) |
| Upload de arquivo canônico = multer `makeUploadMiddleware(mimes, 'file', cap, magicBytes)` + sniff por conteúdo | verificado | [reconciliationController.ts:22-60](server/src/controllers/reconciliationController.ts:22) |
| Padrão de parser: normalizador **puro**, data por **reslice literal**, valor por **aritmética de string**→cents | verificado | [cnab.ts:61-88](server/src/lib/cnab.ts:61) |
| Registro de rota em `main` = **2 toques** (import + `router.use`) — o auth é **deny-by-default** com allowlist pública, não lista de protegidos | verificado | [routes/index.ts:18,65](server/src/routes/index.ts:18); [middleware/auth.ts](server/src/middleware/auth.ts) (`publicApiRoutes`) |
| A política do AP é coarse (`!!scope.actorUserId`) ⇒ reusar `canManagePayable` não afrouxa nada | verificado | `AccountingPolicy.ts` |

**Colisões com §1/§4 do master map:** nenhuma, desde que o parser não importe Prisma e a integração fique em
controller/serviço (T3/T10), o dinheiro nasça em centavos Int por aritmética de string (T4) e a idempotência
ligue na identidade do evento, nunca na chave de acesso (T7).

---

## 2. Passos

> **Fase 0 BLOQUEIA todo o resto.** F0-1 ✅ fechado; **F0-2 e F0-3 dependem de fonte externa** e seguem abertos.

| # | Skill (SKILL_MATRIX) | Argumentos | Arquivos esperados | Motivo |
|---|---|---|---|---|
| **F0-1** | ✅ **FEITO 2026-07-22** (`AskUserQuestion`) | F-NFE7→(a) + F-NFE8→(a) | `docs/adr/ADR-INCR-NFE-fiscal-ingestion.md` §9 (emenda escrita) | ORCH-006: os dois furos mudam schema/escopo; ratificados fork a fork. |
| **F0-1b** | `backend-prisma-model-generator` (só se confirmado) | 1 discriminador de compra multi-item em `payables` | `server/prisma/schema.prisma` + migração | Consequência de F-NFE7→(a): coluna nova **com default** ⇒ `ADD COLUMN` (não rebuild). Faz `isInventoryPurchase` valer para a nota multi-item sem inventar `productRef` sentinela. Serial, Fase 0 (PAR-004). |
| **F0-2** | ✅ **FEITO 2026-07-23** (transcrição de fonte oficial via web) | MOC 7.0 Anexo I + XSD `procNFe_v4.00` | [`BE-INCR-NFE-layout-transcription.md`](BE-INCR-NFE-layout-transcription.md) | **Lição I052 cumprida:** tags do escopo (`ide`, `emit/dest`, `det/prod`, `total/ICMSTot`, `protNFe/infProt/cStat`) transcritas do MOC oficial **com citação de página**. Grau VERIFICADO em §1-5/§7; 2 pontos PARCIAIS (imposto por-item, tamanhos de `protNFe`) fora do caminho crítico → **fecham com F0-3**. |
| **F0-3** | — (fixture de teste real) ⛔ **BLOQUEIA Fase A** | 1 XML de compra + 1 de venda, anonimizados | `server/src/lib/__tests__/fixtures/nfe/*.xml` | `sintetico-nao-cobre-formato-de-dado-real`: XML inventado por mim valida o meu próprio entendimento, não o leiaute. **Aguardando upload do dono** (nota real anonimizada; idealmente 1 compra multi-item com desconto+frete+IPI que não dividem exato, p/ exercer o gate 1 do rateio). |
| **A1-1** | — (dep nova, F-NFE2) | `npm i fast-xml-parser` no `server/` | `server/package.json` + lock | Parse **mecânico** só; toda semântica em `lib/nfe.ts`. |
| **A1-2** | — (biblioteca pura) | espelho de `lib/cnab.ts` | `server/src/lib/nfe.ts` | `parseNfe(buffer): ParsedNfe` — emitente, ident (`numero`/`serie`/`chaveAcesso`/`dhEmi`), `itens[]`, totais `*Cents`. **Não importa Prisma, não abre tx, não valida regra de negócio.** `dhEmi`→data-only por **reslice literal**; decimais `1234.56`→centavos por **aritmética de string** (nunca `Number()*100`); `cStat != 100` (denegada/sem protocolo) → **rejeita loud** (D5). |
| **A1-3** | `backend-test-suite-generator` | suite do parser | `server/src/lib/__tests__/nfe.test.ts` | Fixture real (F0-3): namespace + `<Signature>` ignorados; `cStat` 110/301/302 rejeitados; centavos exatos sem float; nota multi-item preserva N itens; XML truncado rejeita. |
| **A2-1** | `backend-dto-generator` | Zod `.strict()`, helpers `cents`/`dateOnly` | `server/src/features/accounting/dtos/NfeDto.ts` | `ImportNfePurchaseSchema` (`unitId`, `counterpartyId?`, `itemMappings[]` = `cProd`→`productRef` **confirmado pelo operador**, D6) e `ImportNfeSaleSchema` (`unitId`, **`saleId` obrigatório** — F-NFE8→(a)). Valores guardados por `MAX_CENTS`. |
| **A2-2** | `backend-service-generator` | injeta `(payableService, counterpartyRepo, policy, auditService)` | `server/src/features/accounting/services/NfeImportService.ts` | **Compra.** Resolve emitente→`Counterparty` (D6), computa custo (D3: `vProd−vDesc+vFrete+vOutro+vIPI+vICMS-ST`, ICMS próprio **incluso**), rateia header por `splitCredit` (resíduo na última linha, **Σ == total**) e chama **`PayableService.createPayable`** — nunca `postEntry` direto. **Multi-item (F-NFE7→(a)):** 1 `createPayable` com o total da nota + **N `receiveStock`** (`sourceId=payableId`, item distinto por `productRef`). |
| **A2-3** | `backend-test-suite-generator` | suite do serviço de compra | `.../__tests__/NfeImportService.test.ts` | Gates §3 abaixo (tie-out do rateio, re-import → 1 Payable, item não confirmado → rejeita). |
| **A3-1** | — (comando novo no dono do seam, O-1) | `attachSourceDocument(scope, entryId, doc)` | `server/src/features/accounting/services/PostingService.ts` | Cria `SourceDocument` + `linkEntry` na MESMA tx + audit. **Único** delta em arquivo vivo compartilhado desta fatia. |
| **A3-2** | `backend-service-generator` | injeta `(journalEntryRepo, postingService, policy)` | `.../services/NfeSaleReconciliationService.ts` | **Venda (D2b).** `findBySource('salon.sale.finalized', saleId)` → âncora; **0 lançamentos**; anexa proveniência (chave de acesso = `externalRef`) e **retorna divergência** (total/itens NF-e × venda lançada). Venda órfã → **rejeita loud**. |
| **A3-3** | `backend-test-suite-generator` | suite da venda | `.../__tests__/NfeSaleReconciliationService.test.ts` | **Gate duro:** venda já lançada → `postEntry` **nunca chamado**, 1 `SourceDocument` anexado; NF-e órfã rejeita; divergência de total sinaliza sem postar. |
| **B-1** | `backend-controller-generator` | multipart, espelho do extrato | `server/src/controllers/nfeController.ts` | `makeUploadMiddleware(['text/xml','application/xml','text/plain','application/octet-stream'], 'file', cap, false)` — magic-bytes **off** (XML é texto; ligar rejeitaria nota legítima, lição do sniff de OFX/CNAB). 2 handlers: compra e venda. |
| **B-2** | `backend-route-generator` | **2 toques** | `server/src/routes/nfe.ts` + `routes/index.ts` | `POST /api/nfe/purchase`, `POST /api/nfe/sale`. Auth é deny-by-default (allowlist pública) ⇒ **não** há 3º toque; rota nova já nasce protegida. |
| **B-3** | — (wiring Factory, serial) | 2 getters | `server/src/lib/factory.ts` | `getNfeImportService()` / `getNfeSaleReconciliationService()` reusando `PayableService`, `AccountingPolicy`, `AuditService`. |
| **B-4** | — (allowlist de audit) | só eventos EMITIDOS | `server/src/features/accounting/audit/auditCanonical.ts` | `nfe.purchase_imported`, `nfe.sale_matched` com ids/centavos-como-string. **Nunca** CNPJ/razão social no payload (T8/LGPD). |
| **B-5** | — (regen openapi) | `npm run docs:generate` | `my-app/public/openapi.json` | 2 paths novos; o artefato estático é o preferido e há teste de regressão de contagem de paths. |
| **B-6** | `luminaris-reviewer` (agente **separado**, worktree isolada) | por fatia | — | `reviewer-independence-separate-agent`: PASS da sequência que implementou é rejeitado. |

## 3. Gates de domínio obrigatórios (§7 do ADR + os dois novos)

1. **Tie-out do rateio (ACC-014/T4)** — nota com desconto + frete + IPI que **não** dividem exato:
   Σ custo dos itens == custo total. Único gate sem espelho mecânico de AP/AR.
2. **Idempotência (ACC-013/T7)** — mesmo XML importado 2× → **1 `Payable` + 1 entrada de estoque**. Chave de
   acesso é `externalRef` **humano**, jamais `sourceId`.
3. **Venda não posta (D2b)** — NF-e de venda de uma venda já lançada → **0 lançamentos novos**, 1
   `SourceDocument`; NF-e de venda órfã → rejeita. Este é o gate que impede duplicar receita + CMV.
4. **`cStat` (D5)** — denegada/sem protocolo rejeita loud; cancelamento pós-import só via `cancel` do AP
   (estorno novo, original intacto — T5).
5. **Pureza (§2.1)** — `lib/nfe.ts` não importa Prisma, não abre `runTransaction`; a escrita reusa
   `createPayable` (gate de período/audit/idempotência in-tx já provado).
6. **Item→produto (D6)** — `cProd`/EAN **nunca** auto-cria produto; sem confirmação do operador, rejeita.
7. **[NOVO — F-NFE7→(a)] Multi-item** — nota de N itens → **1 `Payable`** (passivo total) + **N**
   `StockMovement INBOUND`; re-drive do `reconcilePayables` reconhece o débito em `1.1.6` sem depender de
   `expenseAccountId` (lição Gap 2 do INVENTORY) e o tie-out Σ == saldo(1.1.6) fecha.
8. **[NOVO — F-NFE8→(a)] Âncora explícita** — `saleId` do corpo; divergência de valor/data **sinaliza**,
   nunca escolhe venda sozinha.

## 4. Ordem e paralelização (PAR-006)

- **Fase 0 — serial e bloqueante:** ~~ratificação (F0-1)~~ ✅ → **schema do discriminador (F0-1b, serial,
  PAR-004)** → transcrição do leiaute (F0-2) → fixture real (F0-3). F0-2 e F0-3 dependem de **fonte externa**;
  sem elas o parser vira adivinhação (classe I052).
- **Fase A — A1 é barrier, depois A2 ∥ A3:** A2 e A3 dependem dos tipos de `A1` (aresta de build). Prova de
  disjunção (PAR-002): A2 write-set = `{NfeDto.ts, NfeImportService.ts, PayableDto.ts, PayableService.ts,
  Payable.model.ts + testes}` (o 3º ramo do XOR + twin do reconcile, F-NFE7→(a)); A3 write-set =
  `{PostingService.ts, NfeSaleReconciliationService.ts + teste}`. **Interseção = ∅.**
- **Fase B — serial:** controller → rota → factory → audit → openapi. `tsc` verde entre cada delta.
- **Paralelismo honesto (PAR-005):** 1 par real (A2 ∥ A3). Todo o resto é serial. Não inflado.

## 5. Checks de validação

```bash
cd server && npx tsc --noEmit && npx jest src/features/accounting src/lib/__tests__/nfe.test.ts
```

- `my-app` **não** é tocado (FE diferido) ⇒ sem `next build` nesta fatia.
- `skill-audit` gate `wiring`: aridade dos construtores novos registrada no factory, rota sem órfão tsc-blind.
- **smoke-migration-gate: OBRIGATÓRIO** (F-NFE7→(a) toca `payables`) — sobre cópia do `dev.db` **real aninhado**
  `server/prisma/prisma/dev.db`, com linhas semeadas via Prisma. Coluna nova **com default** deve sair como
  `ADD COLUMN`; se o Prisma gerar rebuild de tabela, o gate vira crítico (a lição do `expenseAccountId` nullable
  do INVENTORY: rebuild malfeito dropa FK/índice em silêncio).

## 6. Riscos (T8 — inclui os meus vieses)

- **[ALTO] Regime tributário embutido na fórmula de custo.** D3 assume não-contribuinte pleno de ICMS (molde
  salão). Para um tenant contribuinte, ICMS é crédito e **sai** do custo — e o tie-out do gate 1 **não acusa**
  (ele valida distribuição, não regime). Antes de qualquer molde não-salão reusar `lib/nfe.ts`, é obrigatório
  um flag de recuperabilidade por tenant. Registrado no ADR §6 item 1; repetido aqui porque o plano é o que o
  implementer lê.
- **[ALTO] Duplo-lançamento da venda.** Mitigado por desenho (A3 nem injeta `PayableService`; só lê + anexa) e
  pelo gate 3. É o maior risco introduzido pela divergência ratificada F-NFE1=(b).
- **[MÉDIO] Nota mista (mercadoria + uso/consumo).** MVP classifica **grosso** (nota inteira = compra de
  mercadoria). Item de uso/consumo entra como estoque indevidamente. Declarado no ADR §6 item 6 — o operador
  precisa saber; refinamento item-a-item é incremento próprio.
- **[MÉDIO] Dep nova no caminho fiscal.** `fast-xml-parser` é superfície nova; mitigada por ser parse mecânico
  e por rejeitar loud o que não casa. XML externo = entrada não confiável: cap de tamanho no multer + rejeição
  de entidade externa (XXE) precisam de teste explícito.
- **[VIÉS MEU, nomeado] Espelhamento de extrato.** Escrevi este plano espelhando CNAB/OFX ("1 arquivo → N
  linhas"), e a NF-e é "1 documento → 1 passivo + N itens + emitente + impostos". Foi exatamente esse viés que
  produziu o furo §0.1 no ADR — eu só o achei lendo o `schema.prisma`, não o ADR. Onde este plano parecer
  "igual ao CNAB", desconfie.
- **[VIÉS MEU] Otimismo de fixture.** Sem XML real (F0-3), tanto o parser quanto os testes provam o meu
  entendimento do leiaute, não o leiaute. Por isso F0-2/F0-3 são bloqueantes, não "nice to have".

## 7. Decisões a registrar (learning-log, no fechamento)

- **O-1** Proveniência sobre lançamento já postado ganha comando próprio no `PostingService`
  (`attachSourceDocument`), em vez de injetar o repo de proveniência no serviço de NF-e — mantém um dono só
  para a escrita do seam INCR-8.
- **O-2** Policy reusada (`canManagePayable`) em vez de policy fiscal nova: a política do AP é coarse
  (`!!scope.actorUserId`), então uma policy nova seria cerimônia sem efeito. Revisitar quando houver RBAC.
- **O-3** Magic-bytes **desligado** no upload de XML (texto), diferente do import XLSX — espelha a exceção já
  tomada para OFX/CNAB no `reconciliationController`.
- **O-4/O-5** As resoluções de F-NFE7 e F-NFE8 (§0), com a perna escolhida e a consequência de schema.

## 8. Closeout (ORCH-007)

- Promover §5.1 item 11 do master map de ⚫ para ✅, **re-buscando `origin/main` antes do fold**
  (`accounting-master-map-source-of-truth`).
- Fold de higiene devido **já**, independente da NF-e: as linhas B1/B2 da §5.1 ainda dizem "pendente merge",
  mas `Counterparty` e `requiresDimension` estão em `main` (verificado).
- Registrar a emenda dos dois forks novos no `ADR-INCR-NFE §9`.
- Residual esperado (não bloqueia merge, bloqueia deploy): smoke-migration-gate + browser sign-off + `FE-INCR-NFE`.
  O gargalo do módulo continua sendo **validação humana**, não código.
