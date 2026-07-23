# BE-INCR-NFE — F0-2: transcrição do leiaute oficial NF-e 4.00 (modelo 55)

> **Estado:** F0-2 do [BE-INCR-NFE-impl-plan.md](BE-INCR-NFE-impl-plan.md) — transcrição de fonte oficial,
> escopada nas tags que o parser `server/src/lib/nfe.ts` consome (NÃO o leiaute inteiro). Cumpre a lição
> **I052** (`accounting-sped-ecf-generation`): cada campo vem do manual/XSD **com citação**, nunca de memória.
> Espelha [BE-INCR-SPED-ECF-layout-transcription.md](BE-INCR-SPED-ECF-layout-transcription.md).
>
> **Pendência conhecida (fecha com F0-3, não bloqueia F0-2):** dois pontos ficam grau **PARCIAL** aqui —
> (a) IDs de imposto no nível do item (`vICMSST`/`vIPI` por grupo de CST) e (b) `protNFe/infProt` (não está no
> Anexo I numerado, vem do XSD `procNFe_v4.00`). **Ambos estão fora do caminho crítico do MVP** (§9) e a **NF-e
> real anonimizada do F0-3 os confirma empiricamente** — é o fixture que fecha o grau.

## Fonte normativa

- **MOC 7.0 — Anexo I, Leiaute e Regras de Validação da NF-e/NFC-e** (CONFAZ), 153 páginas. Leiaute vigente do
  modelo 55, versão **4.00**. PDF oficial:
  `https://www.confaz.fazenda.gov.br/legislacao/arquivo-manuais/moc7-anexo-i-leiaute-e-rv.pdf`.
  Páginas citadas = rodapé "Página X / 153". Grau **VERIFICADO** = texto/tamanho copiado do PDF oficial.
- **Esquemas XML oficiais** (`procNFe_v4.00.xsd` + `tiposBasico_v4.00.xsd`) — Portal NF-e →
  Documentos → Esquemas XML: `https://www.nfe.fazenda.gov.br/portal/listaConteudo.aspx?tipoConteudo=ndIjl+iEFdE=`.
  Usado para `protNFe/infProt` (§6), que **não existe** no Anexo I numerado (o Anexo I descreve só a NF-e; o
  protocolo é do schema de processamento). Grau desses = **PARCIAL** (estrutura padrão do XSD; travar tamanhos
  contra o `.xsd` ou contra o XML real do F0-3).
- Cross-check da tabela de cStat: `mazinsw/nfe-api` (secundária) — mas o texto do §7 é o **oficial do MOC §4.4.1**.

**Convenção de tipo/tamanho do MOC:** `N`=numérico, `C`=caractere, `D`=data/hora, `G`=grupo, `CE`=escolha.
`13v2` = **até 13 dígitos inteiros + 2 decimais**. `11v0-4` = até 11 inteiros e **0 a 4** decimais.
`11v0-10` = até 11 inteiros e **0 a 10** decimais.

---

## 1. Raiz e chave de acesso (Grupo A) — VERIFICADO (p.7)

| XPath | ID | descrição | ocor. | tipo/tam. |
|---|---|---|---|---|
| `nfeProc/@versao` / `NFe/infNFe/@versao` | A01 | Versão do leiaute = **4.00** | 1-1 | C |
| `NFe/infNFe/@Id` | A03 | Identificador assinado = literal `NFe` + 44 dígitos | 1-1 | ID, tam. **47** |

**Regra p/ o parser:** a **chave de acesso (44 díg.)** = `infNFe/@Id`.slice(3) (remove o prefixo `NFe`).
Validar: `Id.startsWith('NFe') && Id.length === 47` e `Id.slice(3) === protNFe/infProt/chNFe` (§6). A chave é o
**`externalRef` HUMANO** (T7) — nunca `sourceId`. O XML pode vir com raiz `nfeProc` (nota processada, com
protocolo) OU `NFe` avulsa (sem protocolo) — o parser aceita ambas e trata ausência de `protNFe` como "sem
autorização" (§7).

---

## 2. Identificação `infNFe/ide` (Grupo B) — VERIFICADO (p.7-9)

| XPath | ID | descrição | ocor. | tipo/tam. |
|---|---|---|---|---|
| `ide/cUF` | B02 | UF do emitente (IBGE) | 1-1 | N, 2 |
| `ide/natOp` | B04 | Natureza da operação (texto) | 1-1 | C, 1-60 |
| `ide/mod` | B06 | Modelo — **deve ser 55** | 1-1 | N, 2 |
| `ide/serie` | B07 | Série | 1-1 | N, 1-3 |
| `ide/nNF` | B08 | **Número da nota** | 1-1 | N, 1-9 |
| `ide/dhEmi` | B09 | **Data-hora de emissão**, UTC `AAAA-MM-DDThh:mm:ssTZD` (fuso obrigatório) | 1-1 | D |
| `ide/tpNF` | B11 | **0=Entrada / 1=Saída** | 1-1 | N, 1 |
| `ide/tpAmb` | B24 | 1=Produção / 2=Homologação | 1-1 | N, 1 |
| `ide/finNFe` | B25 | 1=normal 2=complementar 3=ajuste 4=devolução | 1-1 | N, 1 |

**Regras p/ o parser:**
- `dhEmi` → **data-only por reslice literal** `dhEmi.slice(0,10)` (`YYYY-MM-DD`). **NUNCA** `new Date(dhEmi)`
  (`date-only-rendering-utc-shift-class-bug` + reslice do CNAB/OFX). Guardar só a data (o fato contábil é diário).
- `mod !== '55'` → **rejeita loud** (NFC-e mod 65 e outros estão fora do MVP).
- `tpAmb === '2'` (homologação) → **rejeita loud** por default (nota de teste não vira passivo real); permitir só
  sob flag explícita de fixture.
- `tpNF` é informativo. A direção **compra × venda é decidida pelo ENDPOINT** (`/nfe/purchase` vs `/nfe/sale`,
  escolha do operador), **não** por `tpNF` sozinho — a nota de compra que recebo é `tpNF=1` (saída) na ótica do
  **fornecedor**. Registrar `tpNF` no shape para diagnóstico, mas não rotear por ele.

---

## 3. Emitente `infNFe/emit` (Grupo C) e Destinatário `infNFe/dest` (Grupo E) — VERIFICADO (p.12-13)

| XPath | ID | descrição | ocor. | tipo/tam. |
|---|---|---|---|---|
| `emit/CNPJ` | C02 | CNPJ do emitente | CE 1-1 | N, 14 |
| `emit/CPF` | C02a | CPF do emitente (escolha c/ CNPJ) | CE 1-1 | N, 11 |
| `emit/xNome` | C03 | Razão social / nome do emitente | 1-1 | C, 2-60 |
| `emit/IE` | C17 | Inscrição estadual | 1-1 | C, 2-14 |
| `dest/CNPJ` | E02 | CNPJ do destinatário | CE 1-1 | N, 14 |
| `dest/CPF` | E03 | CPF do destinatário | CE 1-1 | N, 11 |
| `dest/xNome` | E04 | Razão social / nome do destinatário (obrigatória p/ mod 55) | 0-1 | C, 2-60 |

**Regra p/ o parser + serviço (D6):** na **compra**, o **emitente** (`emit`) é o fornecedor → resolve para
`Counterparty` (INCR-COUNTERPARTY, já em `main`) por CNPJ/CPF. **Nunca auto-cria** contraparte às cegas — o
serviço exige `counterpartyId` confirmado no DTO (o parser só extrai; a resolução é do `NfeImportService`).
**T8/LGPD:** CNPJ/CPF/razão social **não** entram em payload de audit (§B-4 do plano).

---

## 4. Itens `infNFe/det` (Grupo H) → `det/prod` (Grupo I) — VERIFICADO (p.17-18)

`det` tem `@nItem`, **ocorrência 1-990** (parser trata como array; item único = array de 1).

| XPath | ID | descrição | ocor. | tipo/tam. |
|---|---|---|---|---|
| `det/@nItem` | H02 | Número do item (1-990) | 1-1 | A, N |
| `det/prod/cProd` | I02 | **Código do produto** (do fornecedor) | 1-1 | C, 1-60 |
| `det/prod/cEAN` | I03 | GTIN/EAN | 1-1 | C, 0/8/12/13/14 |
| `det/prod/xProd` | I04 | Descrição | 1-1 | C, 1-120 |
| `det/prod/NCM` | I05 | NCM (8 díg.) | 1-1 | N, 2 ou 8 |
| `det/prod/CFOP` | I08 | CFOP | 1-1 | N, 4 |
| `det/prod/uCom` | I09 | Unidade comercial | 1-1 | C, 1-6 |
| `det/prod/qCom` | I10 | **Quantidade comercial** — decimais VARIÁVEIS | 1-1 | N, **11v0-4** |
| `det/prod/vUnCom` | I10a | Valor unitário — decimais VARIÁVEIS | 1-1 | N, **11v0-10** |
| `det/prod/vProd` | I11 | **Valor bruto do item** (peso do rateio) | 1-1 | N, 13v2 |
| `det/prod/vFrete` | I15 | Frete do item | 0-1 | N, 13v2 |
| `det/prod/vSeg` | I16 | Seguro do item | 0-1 | N, 13v2 |
| `det/prod/vDesc` | I17 | Desconto do item | 0-1 | N, 13v2 |
| `det/prod/vOutro` | I17a | Outras despesas do item | 0-1 | N, 13v2 |
| `det/prod/indTot` | I17b | **0 = vProd NÃO compõe o total; 1 = compõe** | 1-1 | N, 1 |

**Regras p/ o parser:**
- `qCom` (I10) e `vUnCom` (I10a) têm **decimais variáveis** (0-4 e 0-10) — **NÃO** assuma 2 casas. `qCom` alimenta
  a **quantidade do `receiveStock`** (multi-item, F-NFE7). Ler como decimal de precisão arbitrária (string).
- `vProd` de item (I11, 13v2) = **peso do rateio** do custo de header (§5). Guardar em centavos por aritmética de
  string.
- `indTot === '0'`: item que não compõe o total da nota → **excluir do rateio** (senão Σ itens ≠ vNF).
- `cProd`/`cEAN` **nunca** auto-criam produto (D6) — o mapeamento `cProd → productRef` é confirmado pelo operador
  no DTO (`itemMappings[]`).

**Impostos no nível do item — grau PARCIAL** (confirmar no XSD `leiauteNFe_v4.00`/no XML real F0-3):
`imposto/ICMS/ICMSxx/vICMSST` (≈N23), `imposto/IPI/IPITrib/vIPI` (≈O14). **Fora do caminho crítico do MVP:** a
fórmula de custo (§5) usa os **totais** de IPI/ICMS-ST (`ICMSTot`), não os por-item. Só entram se um incremento
futuro fizer custeio item-a-item.

---

## 5. Totais `infNFe/total/ICMSTot` (Grupo W) — VERIFICADO (p.~40) · **o caminho do dinheiro (D3)**

Todos os campos abaixo são **N, 13v2**. `total` (W01) → `ICMSTot` (W02, 1-1).

| XPath | ID | descrição | uso no custo D3 |
|---|---|---|---|
| `ICMSTot/vProd` | W07 | Total bruto dos produtos | **+** |
| `ICMSTot/vDesc` | W10 | Total de desconto | **−** |
| `ICMSTot/vFrete` | W08 | Total de frete | **+** |
| `ICMSTot/vOutro` | W17 | Outras despesas acessórias | **+** |
| `ICMSTot/vIPI` | W12 | Total de IPI | **+** |
| `ICMSTot/vST` | W06 | **Total de ICMS-ST** (= Σ vICMSST) | **+** |
| `ICMSTot/vICMS` | W04 | Total de ICMS próprio | **NÃO subtrai** (ver risco ALTO) |
| `ICMSTot/vICMSDeson` | W04a | ICMS desonerado | (informativo) |
| `ICMSTot/vNF` | W16 | **Valor total da NF-e** | tie-out (§8 gate 1) |

**Fórmula de custo de aquisição (D3 / F-NFE6), computada no HEADER e rateada aos itens:**

```
custoTotalCents = vProd − vDesc + vFrete + vOutro + vIPI + vST      (tudo de ICMSTot, centavos-int)
```

- **ICMS próprio (`vICMS`/W04) NÃO é subtraído** — o MVP assume tenant **não-contribuinte pleno** (molde salão):
  o ICMS embutido é custo. **Este é o RISCO ALTO nomeado** (ADR §6.1 / plano §6): para tenant contribuinte, o
  ICMS vira crédito e **sai** do custo, e o tie-out do gate 1 **não acusa** (valida distribuição, não regime).
  Antes de qualquer molde não-salão reusar `lib/nfe.ts` → flag de recuperabilidade de ICMS por tenant.
- O rateio distribui `custoTotalCents` aos itens proporcional a `vProd` de item, **resíduo de arredondamento na
  última linha** → `Σ custo_item == custoTotalCents` (gate 1, ACC-014/T4; espelha o `splitCredit` do salon
  bridge). Fronteira de dinheiro do plano A2-2.

---

## 6. Protocolo `protNFe/infProt` — grau PARCIAL (XSD `procNFe_v4.00`, fora do Anexo I)

| XPath | descrição | tam. (XSD `tiposBasico`) |
|---|---|---|
| `protNFe/infProt/chNFe` | **Chave de acesso** (44 díg., sem prefixo) | N, 44 |
| `protNFe/infProt/cStat` | **Código de status** | N, 3 |
| `protNFe/infProt/xMotivo` | Descrição literal do status | C, 1-255 |
| `protNFe/infProt/nProt` | Número do protocolo de autorização | N, 15 |
| `protNFe/infProt/dhRecbto` | Data-hora do processamento (UTC) | D |
| `protNFe/infProt/tpAmb` | 1=prod / 2=homolog | N, 1 |

**Regra p/ o parser:** ler `cStat` (gate D5, §7) e `chNFe` (confere com a chave do §1). **Ausência de `protNFe`**
(NF-e avulsa não transmitida) → tratar como **sem autorização** → rejeita loud. Tamanhos exatos = confirmar no
`.xsd` ou no XML real do F0-3 (não são parse-blocking; são validação).

---

## 7. Tabela de cStat (MOC §4.4.1, p.143+) — VERIFICADO · **gate D5**

| cStat | descrição oficial | classificação do parser |
|---|---|---|
| **100** | Autorizado o uso da NF-e | ✅ **AUTORIZADA** |
| **150** | Autorizado o uso da NF-e, autorização fora de prazo | ✅ **AUTORIZADA** |
| **101** | Cancelamento de NF-e homologado | ⛔ CANCELADA |
| **151** | Cancelamento de NF-e homologado fora de prazo | ⛔ CANCELADA |
| **110** | Uso Denegado | ⛔ DENEGADA |
| **205** | NF-e está denegada na base da SEFAZ | ⛔ DENEGADA |
| **301** | Uso Denegado: irregularidade fiscal do emitente | ⛔ DENEGADA |
| **302** | Uso Denegado: irregularidade fiscal do destinatário | ⛔ DENEGADA |
| **303** | Uso Denegado: destinatário não habilitado na UF | ⛔ DENEGADA |

**Regra dura (D5):** aceita **somente `cStat ∈ {100, 150}`**. Qualquer outro valor, ou ausência de `protNFe`,
→ **rejeita loud** (não vira `Payable`/estoque). Cancelamento **pós-import** só via `cancel` do AP (estorno novo,
original intacto — T5); o parser não trata evento de cancelamento (fora do MVP, ADR §4).

---

## 8. Regras de parsing consolidadas (o contrato do `lib/nfe.ts`)

Biblioteca **pura** (§2.1): não importa Prisma, não abre `runTransaction`, não valida regra de negócio de ledger.

1. **Dinheiro (T4):** todo `13v2` → centavos `Int` por **aritmética de string** (split em `.`, normaliza a 2
   casas, concatena). **NUNCA** `Number(x) * 100` (erro de float). Teto `MAX_CENTS` conferido no serviço.
2. **Quantidade:** `qCom`/`vUnCom` têm decimais variáveis (0-4 / 0-10) — preservar como string/decimal, não
   truncar a 2 casas.
3. **Data:** `dhEmi`/`dhRecbto` → `slice(0,10)` (reslice literal). Nunca `new Date()`.
4. **Chave:** `@Id.slice(3)`, valida 47/`NFe`/igualdade com `chNFe`.
5. **cStat:** aceita só {100,150}; ausência de `protNFe` = rejeita.
6. **`mod`:** só 55; **`tpAmb`:** rejeita homologação (2) por default.
7. **Namespaces e assinatura:** ignorar `<Signature>` e prefixos de namespace no parse.
8. **XXE (entrada hostil, T-segurança):** `fast-xml-parser` **não processa DTD/entidades externas por default** —
   **manter** `processEntities` sem habilitar entidade externa e **rejeitar** documento com `<!DOCTYPE`
   (billion-laughs/XXE). Cap de tamanho no multer (borda). **Teste explícito** (plano §6, risco MÉDIO).
9. **Multi-item:** preserva os N itens; item único = array de 1 (não colapsar objeto/array — quirk do
   `fast-xml-parser`: 1 `<det>` vira objeto, N vira array → `alwaysArray` para `det`).

---

## 9. Grau de evidência e o que o F0-3 fecha

| Bloco | Grau | Fecha com |
|---|---|---|
| §1-§5, §7 (raiz, ide, emit/dest, itens, totais, cStat) | **VERIFICADO** (MOC oficial, texto copiado) | — |
| §4 impostos por-item (`vICMSST`/`vIPI`) | **PARCIAL** — fora do caminho crítico do MVP | XSD `leiauteNFe_v4.00` **ou** XML real F0-3 |
| §6 `protNFe/infProt` (tamanhos) | **PARCIAL** — estrutura padrão do XSD | XSD `procNFe_v4.00` **ou** XML real F0-3 |
| §8.9 quirk objeto-vs-array do parser | inferido do comportamento do `fast-xml-parser` | teste `nfe.test.ts` sobre F0-3 |

**Viés declarado (T8):** transcrevi da fonte oficial, mas os dois PARCIAIS eu não reli no `.xsd` — a NF-e real do
F0-3 é a prova empírica que os fecha. **Sem o F0-3, o parser e seus testes provam o meu entendimento do leiaute,
não o leiaute** (`sintetico-nao-cobre-formato-de-dado-real`). Por isso F0-3 é bloqueante da Fase A, não opcional.

## 10. Mapa campo → consumo (handoff p/ A1-2 / A2-2 / A3-2)

| Campo | Consumido por | Para |
|---|---|---|
| `@Id`→chave, `nNF`, `serie`, `dhEmi` | `NfeImportService` / `NfeSaleReconciliationService` | `documentNumber`/`externalRef`/data do fato |
| `emit` (CNPJ/xNome) | `NfeImportService` (compra) | resolve `Counterparty` (D6) |
| `det/prod` (cProd, xProd, qCom, vProd) | `NfeImportService` (compra) | N `receiveStock` + pesos do rateio |
| `ICMSTot` (§5) | `NfeImportService` (compra) | custo D3 → **1** `createPayable` (F-NFE7) |
| `cStat`, `chNFe` | ambos | gate D5 + `externalRef` humano |
| `vNF`, itens, data | `NfeSaleReconciliationService` (venda) | divergência vs venda ancorada por `saleId` (F-NFE8); **0 lançamentos** |
