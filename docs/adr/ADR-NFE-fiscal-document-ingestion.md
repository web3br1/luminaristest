# ADR-NFE — NF-e (documento fiscal · ingestão)

- **Data:** 2026-07-15
- **Status:** **PROPOSED — NÃO ratificado.** Enquadramento (passo `PLAN → ADR`). FORKS abertos; nada travado até
  revisão fork-a-fork + sinal humano (G0). Nó do master map **⚫ diferido**. **Nenhum código autorizado.**
- **Autores:** enquadramento do orquestrador (ORCH-006).
- **Nó do master map:** §5.1 Bloco B item **11 — "NF-e (ingestão fiscal)"**; §5 *"Domínio fiscal pesado, ADR
  próprio campo-a-campo; alto esforço, valor condicionado a operação real emitindo NF."* §5 nomeia
  explicitamente **ingestão**, não emissão.

## TLDR (2 linhas)

NF-e é um XML fiscal assinado (leiaute 4.00). O escopo honesto e barato é **ingestão**: parsear o XML de
compra/venda e registrá-lo como **proveniência** (`SourceDocument` do INCR-8), reusando o padrão de bridge
pós-commit por origem (T10). **Emissão** (gerar + assinar com e-CNPJ + transmitir à SEFAZ + contingência) é um
domínio inteiro à parte, fora deste ADR. O fork central é: ingestão para-só-proveniência vs. ingestão que
alimenta uma bridge de lançamento.

---

## 1. Contexto e objetivo

O ledger já tem o seam de proveniência (INCR-8: `SourceDocument`+`JournalEntrySource`) e o padrão de bridge
pós-commit por origem (ADR-C01, T10). NF-e é a próxima **fonte de fato** natural: a nota de compra/venda é o
documento que origina lançamentos de despesa/receita e crédito de impostos. Hoje `grep -rin "nfe\|nota fiscal"
server/src/features/accounting/` → **0** (a confirmar na implementação) — não existe conceito de NF-e.

**Objetivo:** ingerir o XML da NF-e de forma idempotente, guardá-lo como evidência formal ligada (ou ligável) a
lançamentos, sem reintroduzir motor de regras no caminho do ledger (§4).

## 2. Rails que a ingestão DEVE respeitar (T1–T12) + colisões

| Rail | Como se aplica |
|---|---|
| **T10 bridge pós-commit por origem** | NF-e vira **mais uma origem** de bridge explícita (como salon/AccountingSync), fora do motor. |
| **§4 Motor de Regras REJEITADO** | A NF-e **não** pode "gerar lançamento por template/condições". Se virar lançamento, é bridge determinística por origem, com o mapeamento em código versionado — não `conditionsJson`. |
| **T7 idempotência por identidade do evento** | Chave = **chave de acesso da NF-e (44 dígitos)** + sha256 do XML → `sourceType='nfe'`, `sourceId=chaveAcesso`. Nunca `userId`. Guarda pré-tx via repo injetado. |
| **T8 auditoria in-tx** | Ingestão emite evento de audit na mesma tx; XML nunca sofre cascade-delete (audit-no-cascade). |
| **INCR-8 reuso** | `SourceDocument` já é o destino; NF-e é o **1º consumidor fiscal** dele (AP foi o 1º orgânico). |
| **INCR-6 reuso** | Upload/parse/staging já existe; XML é mais um formato de entrada, como OFX/CNAB foram para extrato. |
| **T4 cents** | Valores da NF-e (produtos, ICMS, IPI, PIS/COFINS) em centavo inteiro; `MAX_CENTS` guard. |

## 3. FORKS abertos (recomendação NÃO ratificada)

### F0 — Existencial / escopo-mestre
- (a) **Só ingestão → proveniência** (parsear + guardar `SourceDocument`, sem postar) — *recomendação MVP*:
  entrega evidência formal e rastreabilidade fiscal com risco mínimo; o lançamento continua manual.
- (b) Ingestão + bridge de lançamento (NF-e de compra posta despesa/estoque + impostos a recuperar) — passo 2,
  ADR/fork próprio; depende de estoque (item 12) para NF-e de mercadoria.
- (c) **Emissão** — **FORA** deste ADR (e-CNPJ, webservice SEFAZ, contingência, inutilização; domínio isolado).

### F1 — Direção da nota no MVP
- (a) **Entrada (compra) primeiro** — casa com Contas a Pagar (subrazão já pronta) e com estoque futuro.
- (b) Saída (venda) — o salão hoje reconhece receita por bridge própria (C01); NF-e de saída duplicaria a
  origem. Descartável até haver emissão real.

### F2 — Profundidade do parse
- (a) **Cabeçalho + totais + chave de acesso** (o suficiente para proveniência e idempotência) — *recomendação MVP*.
- (b) Item-a-item (produtos, NCM, CFOP, impostos por item) — necessário só quando alimentar estoque/crédito
  fiscal; alto esforço campo-a-campo. Diferir com (b) do F0.

## 4. Escopo provável / FORA

**Provável (MVP):** parser `lib/nfe.ts` (XML 4.00 → shape normalizado) → `SourceDocument` idempotente por chave
de acesso, com audit in-tx; upload aceitando `.xml`.
**FORA:** emissão/assinatura/transmissão SEFAZ; NFC-e/CT-e/MDF-e (outros modelos); apuração de ICMS/IPI (livros
fiscais próprios); manifestação do destinatário.

## 5. Riscos e vieses nomeados (T8)

1. **[verificado] Tentação de motor de regras** — "NF-e com CFOP X posta na conta Y" é exatamente o template que
   §4 rejeita no ponto mais crítico. A checagem que falha se eu ceder: qualquer `conditionsJson`/`templateJson`
   no caminho de ingestão. Mapeamento, se existir, é código versionado por origem (T10).
2. **[inferido] Idempotência da chave de acesso × soft-delete** — a chave de 44 dígitos como `@@unique` herda o
   problema de `unique-de-idempotencia-x-soft-delete` (re-import após delete). Decidir na modelagem quem libera
   a chave (rename-on-delete), como AP/AR fizeram.
3. **[assumido] XML é a fonte** — se a operação real usar PDF/DANFE em vez de XML, a chave de acesso ainda serve,
   mas o parse item-a-item some. Nomeado; valida na demanda real.
4. **[verificado] Valor condicionado a operação emitindo NF** — o mapa já diz isso; construir antes de haver
   fluxo real de notas é YAGNI. F0→(a) mantém o custo proporcional ao valor provado.

---

**PROPOSED.** Próximo gate = revisão fork-a-fork + sinal humano. Nó ⚫ até lá. Emissão é ADR separado.
