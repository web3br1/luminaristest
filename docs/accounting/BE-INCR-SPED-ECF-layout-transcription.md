# BE-INCR-SPED-ECF — Passo A: transcrição do leiaute oficial + reconciliação com o ADR

> **Estado:** FASE 2 — Passo A (transcrição) CONCLUÍDO + implementação FEITA.
> Resolve ECF-1..ECF-7 do ADR §6 contra o **Manual oficial**. **TRÊS divergências
> VERIFICADAS** vs. a lista INFERIDA do ADR — todas ratificadas pelo humano em
> 2026-07-12 e absorvidas no ADR (§Emenda FASE 2, pontos 1-6):
> (1) Blocos C/E recuperados pelo PVA — não importados (§2);
> (2) numeração do Bloco P trocada (§3);
> (3) **o PVA computa a presunção+imposto; Luminaris só segrega receita bruta**
>     nas linhas E de P200/P400 (§7 — parecer do architect + Tabelas Dinâmicas).
> **Fonte normativa final = ADR (§Emenda) + §7 deste doc.** As §§4-5 abaixo são o
> registro de descoberta do Passo A (anteriores à decisão do humano); onde
> divergirem do §7/ADR, **prevalece o §7/ADR** (J/K = marcadores vazios; Bloco P
> emitido = P001·P030·P200(E)·P400(E)·P990; P100/P150/P300/P500 = PVA).

## Fonte normativa (ECF-1 — RESOLVIDO)

- **Manual de Orientação do Leiaute 12 da ECF** — Anexo ao **ADE Cofis nº 02/2026**,
  atualização **julho/2026**, 621 páginas. É o leiaute vigente para o
  **ano-calendário 2025** (ECF entregue até o último dia útil de julho/2026) e
  situações especiais de 2026.
- Origem: `gov.br/sped` →
  `manual_ecf_leiaute_12_20_05_2026_ac_2025_sit_esp_2026.pdf`. Extraído com
  `pdftotext -layout -enc UTF-8` (mesmo procedimento da ECD).
- Todas as citações abaixo são página do Manual (grau **VERIFICADO** — leitura
  direta do PDF oficial), não inferência de domínio.

---

## 1. ECF-6 (encoding/terminador/valor) — RESOLVIDO: paridade com a ECD **CONFIRMADA**

Manual **p. 31**:
- **Charset:** ASCII **ISO 8859-1 (Latin-1)** — packed decimal não aceito.
- **Delimitador:** `|` (pipe, ASCII 124) ao início do registro e ao fim de cada campo.
- **Terminador de linha:** **CR+LF** (ASCII 13+10) após o `|` final de cada linha.
- **Valor (p. 31):** sem separador de milhar, sem sinal embutido no valor comum,
  **vírgula** como separador decimal. → idêntico ao ECD.
- **NOVO vs ECD:** o Manual define o tipo **`NS` (Numérico Sinalizado)** — sinal
  `+`/`-` prefixando o número (p. 31, "NUMÉRICO SINALIZADO"). Alguns campos de
  base/resultado do Bloco P (ex.: bases que podem ser negativas / prejuízo) usam
  `NS`, **diferente** do padrão ECD (magnitude sem sinal + indicador D/C). O
  serializer da ECF precisa de um formatador de valor **com sinal** além do padrão
  ECD. Confirmar por campo na transcrição do Bloco P (Passo A cont.).

**Consequência p/ reuso:** as primitivas `spedLine`, `centsToSpedDecimal`,
`spedDate`, `countRegisters` de `lib/sped.ts` são **byte-idênticas** para a ECF
nesses aspectos — reusáveis. Falta **acrescentar** um formatador `NS` (valor com
sinal) para os campos que o exigirem.

---

## 2. ⛔ DIVERGÊNCIA 1 (Blocos C/E) — o ADR D5 está incorreto no nível campo-a-campo

**O que o ADR D5 afirma (grau INFERIDO, ratificado só quanto à ROTA):** "o MVP
**emite** Bloco C e Bloco E, recuperados da ECD transmitida; o DTO transiente
ganha `ecdRecibo`/`ecdHash` (input humano) para casar a ECD."

**O que o Manual determina (VERIFICADO):**

- **p. 40 (Relação de Blocos):** os Blocos **C** e **E** são explicitamente
  *"Bloco recuperado pelo sistema — **Não é importado e não é editado no
  programa**"*.
- **p. 12–13 (§1.3):** *"O arquivo da ECD **não é importado** para a ECF e sim
  **recuperado**."* A recuperação é feita **dentro do PVA-ECF** contra a *ECD ativa
  na base do SPED* (transmitida) — passo humano-operado no programa, **não** um
  conteúdo do nosso `.txt`.
- **p. 43 (Tabela de Obrigatoriedade):** todo registro de **dado** de C e E tem
  **Obrigatoriedade de Entrada = `N` (Não Deve Existir)** no arquivo importado —
  C040, C050, C051, C053, C100, C150, C155, C157, C350, C355, E010, E015, E020,
  E030, E155, E355. Só os pares de abertura/fechamento **C001/C990** e **E001/E990**
  existem no arquivo importado.
- **p. 13 (§1.3):** para Presumido **obrigado à ECD** (caso Luminaris — mantém
  escrituração completa), `0010.TIP_ESC_PRE = "C"` e a recuperação da ECD é
  **obrigatória** (feita pelo PVA). Para Presumido **não obrigado** (`TIP_ESC_PRE
  = "L"`), *"os blocos C, E, J e K **não serão preenchidos**"*.

**Reconciliação:** a DECISÃO humana (rota (b) recover-from-ECD) **continua
correta** — Luminaris gera ECD ⇒ `TIP_ESC_PRE='C'` ⇒ recuperação obrigatória. O
que muda é a **realização de campo**:
- O nosso `.txt` **NÃO** carrega registros de dado de C/E — emite só
  `C001`+`C990` e `E001`+`E990` (marcadores de bloco vazio; o PVA preenche C/E na
  recuperação).
- **NÃO existe** campo `ecdRecibo`/`ecdHash` de Bloco C para preenchermos. Os
  únicos campos de hash de recuperação (`0010.HASH_ECF_ANTERIOR`) são da
  **recuperação da ECF anterior do Lucro REAL** (p. 13, §1.3; FORMA_TRIB=1) — não
  se aplicam ao Presumido nem à recuperação da ECD. ⇒ **remover `ecdRecibo`/
  `ecdHash` do DTO planejado (ADR D5/Passo D)**.

Este é exatamente o padrão **I052** que o ADR §7 nomeou como risco: um ADR
ratificado internamente inconsistente no nível de campo. A ROTA sobrevive; o
layout inferido não.

---

## 3. ⛔ DIVERGÊNCIA 2 (numeração do Bloco P) — a lista INFERIDA do ADR §2/§D2 está trocada

**O que o ADR infere:** "P130 base IRPJ · P300 base CSLL · P200/P500 imposto".

**O que o Manual determina (VERIFICADO — TOC pp. 326–347 + Tabela de
Obrigatoriedade p. ~49):**

| Registro | Nome oficial (Manual) | Página | Papel real |
|---|---|---|---|
| **P001** | Abertura do Bloco P | 326 | abertura |
| **P030** | Identificação dos Períodos e Formas de Apuração do IRPJ e da CSLL (Presumido) | 327 | **períodos trimestrais** (≙ ADR D3) |
| **P100** | Balanço Patrimonial (plano **referencial**) | 329 | BP referencial |
| **P130** | Demonstração das **Receitas Incentivadas** do Lucro Presumido | 333 | **condicional** (`IND_REC_RECEITA=2`) — ≠ "base IRPJ" |
| **P150** | Demonstração do Resultado (DRE referencial) | 336 | DRE referencial |
| **P200** | **Apuração da Base de Cálculo do IRPJ** com Base no Lucro Presumido | 339 | **base IRPJ** (ADR errou → dissera P130) |
| **P230** | Cálculo da Isenção e Redução do Lucro Presumido | 341 | **condicional** (`IND_RED_ISEN=S`) |
| **P300** | **Cálculo do IRPJ** com Base no Lucro Presumido | 343 | **imposto IRPJ** (ADR errou → dissera "base CSLL") |
| **P400** | **Apuração da Base de Cálculo da CSLL** com Base no Lucro Presumido | 345 | **base CSLL** (ADR errou → dissera P300) |
| **P500** | **Cálculo da CSLL** com Base no Lucro Presumido | 347 | **imposto CSLL** |
| **P990** | Encerramento do Bloco P | — | fechamento |

**Conjunto MVP corrigido do Bloco P (Presumido típico, sem incentivadas/isenção):**
`P001 · P030 · P100 · P150 · P200 · P300 · P400 · P500 · P990`.
`P130` e `P230` ficam **de fora** do caso típico (condicionais) — incluí-los só
quando houver receita incentivada / isenção-redução.

A matemática do ADR D2/D3 (base = Σ receita × presunção; IRPJ 15% + adicional 10%
sobre excedente de R$60k/tri; CSLL 9%; trimestral) **permanece válida** — o que
estava errado eram os **números de registro** onde ela se materializa.

---

## 4. Conjunto de blocos/registros do MVP — CORRIGIDO (Presumido + ECD, `TIP_ESC_PRE='C'`)

| Bloco | Registros que o **nosso .txt** emite | Origem do dado |
|---|---|---|
| **0** | 0000, 0001, 0010 (FORMA_TRIB∈{5,7,8,9}, TIP_ESC_PRE='C', FORMA_APUR trimestral), 0020, 0030, 0930 (signatários), 0990 | DTO + identificação |
| **C** | **C001 + C990 apenas** (bloco vazio) | PVA recupera da ECD |
| **E** | **E001 + E990 apenas** (bloco vazio) | PVA recupera da ECD |
| **J** | **decisão pendente** (§5): marcadores vazios (J001+J990) **ou** J050/J051/J100 importados de `ReferentialMapping` | Entrada=F |
| **K** | **decisão pendente** (§5): marcadores vazios (K001+K990) **ou** K030/K155/K156… | Entrada=F |
| **P** | P001, P030, P100, P150, P200, P300, P400, P500, P990 (P130/P230 condicionais) | **núcleo Luminaris** — apuração via ledger |
| **Y** | Y001 + Y990 + Y-obrigatórios que a matriz exigir p/ Presumido (a transcrever: Y672? Y720? Y750?) + Y990 | a confirmar |
| **9** | 9001, 9100 (avisos), 9900 (contagem por registro), 9990, 9999 | contagem |

Nota Bloco 9: a matriz mostra `9990` **e** `9999` como encerradores (p. ~49:
`9990 Encerramento do Bloco 9`; `9999 Encerramento do Arquivo Digital`). Há também
`9100 Avisos` (Saída=O). Difere levemente do fechamento da ECD — transcrever
campo-a-campo.

---

## 5. Decisão de escopo que precisa de sinal humano (Blocos J/K)

C/E são inequívocos (recuperados pelo sistema; emitimos vazios). **J e K têm
Entrada = `F` (facultativo)** (p. 44–45): podem ser (a) **deixados vazios** e
construídos automaticamente pelo PVA a partir da ECD recuperada, ou (b)
**importados** por nós a partir do `ReferentialMappingService` (intenção do ADR
D6). Como a ECD que o PVA recupera **já carrega** o mapeamento referencial (é o
mesmo que o BE-INCR-SPED-ECD gera), importar J/K por fora arrisca **divergência**
com o recuperado (o Manual cria K915/K935 justamente para justificar divergências
de saldo entre importado e recuperado). Ver §6 do relatório de reporte.

**Impacto no ADR D6 / coverage-gate:** se J/K forem deixados ao PVA, o
coverage-gate deixa de valer para J/K. Mas **P100/P150 são planos referenciais**
(Manual §1.12, p. 16: "Registros de Planos de Contas Referenciais … P100, P150") —
logo a completude do referencial (e o bloqueador §5.1 da `3.3` sem código RFB)
**continua relevante para o Bloco P**. O gate migra de "monta J/K" para "monta
P100/P150 referencial".

---

## 6. Estado dos itens PENDENTE-VERIFICAR (ADR §6)

| Item | Estado | Resultado |
|---|---|---|
| **ECF-1** leiaute/versão | ✅ RESOLVIDO | Leiaute 12, ADE Cofis 02/2026, AC 2025 |
| **ECF-2** registros Bloco P | ✅ RESOLVIDO (§3) | numeração corrigida vs ADR |
| **ECF-3** 0/9/J/K/Y obrigatórios | 🟡 PARCIAL (§4) | conjunto mapeado; Y-mínimo a fechar campo-a-campo |
| **ECF-4** recuperação C/E | ✅ RESOLVIDO (§2) | C/E **não** importados — divergência do ADR |
| **ECF-5** base presumida | 🟡 PENDENTE | transcrever P200/P300/P400/P500 campo-a-campo + regras de validação |
| **ECF-6** encoding/valor | ✅ RESOLVIDO (§1) | Latin-1/CRLF/vírgula = ECD; +tipo NS sinalizado |
| **ECF-7** referencial ECF | 🟡 PENDENTE | confirmar versão/chart referencial + periodicidade K |

Próximo passo de código (após sinal humano do §5): transcrever campo-a-campo
P030/P100/P150/P200/P300/P400/P500 + 0010/0020/0030 + Y-mínimo, cada builder
citando a página, cruzando com as **Regras de Validação** do Manual (disciplina
I052), antes de escrever `lib/ecf.ts`.

---

## 7. Parecer do `luminaris-accounting-architect` (2026-07-12) — divisão de responsabilidade + gate

Validação de domínio do achado das Tabelas Dinâmicas (grau VERIFICADO nas fórmulas oficiais):

1. **Rateio PVA × Luminaris — CORRETO e mais seguro.** O PVA-ECF é o motor oficial da apuração
   Presumida; presunção (1,6/8/16/32/38,4%) e alíquotas (IRPJ 15%, adicional 10%, CSLL 9%) são
   fórmulas da RFB embutidas (linhas CNA/CA de P200/P300/P400/P500). Luminaris fornece receita bruta
   segregada e o PVA computa ⇒ fonte única de verdade do tributo, zero risco de divergência.
   Computar o imposto duplicaria a autoridade da RFB (a LC 224/25 já mudou fórmulas neste leiaute).
2. **Receita bruta da presunção × ledger.** Conceito legal (art. 12 DL 1.598/77; art. 15 Lei
   9.249/95; art. 25 Lei 9.430/96): receita da atividade, líquida de devoluções, descontos
   incondicionais, IPI, ICMS-ST; regime de competência (default). O salão reconhece na finalização
   (competência); PR#66 rateia desconto; devolução (INCR-D) reduz a conta ⇒ o **crédito líquido de
   3.1/3.3 na janela do trimestre É a receita bruta legal**. Usar o fluxo do período (não saldo
   acumulado), só `POSTED`, natureza credora.
3. **Gate real = exaustividade da receita** (não coverage referencial). Toda conta `Revenue`
   analítica com movimento no ano tem de ser 3.1 ou 3.3; qualquer outra ⇒ `ValidationError` com a
   lista (guard FAIL-1 do PR#66: nunca dropar em silêncio = subtributação). Implementado em
   `SpedEcfGenerationService`.
4. **§5.1 (3.3 sem código RFB) NÃO trava a ECF** — o `.txt` não emite linha keyed por código
   referencial RFB (P100/P150/J/K recuperados pelo PVA da ECD). O bloqueador migra para a ECD.
5. **Riscos declarados:** [ASSUMIDO] 3.1=serviço 32% e 3.3=revenda 8%/12% (quebra se houver atividade
   com presunção diferente — transporte 8%, hospitalar 8%); [VERIFICADO/escopo] cutover do split
   (3.3 backfill-zero) → revenda pré-split ficou em 3.1 (32%); [VERIFICADO] §5.2 CRM→3.1 permanece.

Reconciliação com decisões commitadas: accounting first-class ✓, AccountingScope ✓, revenue-split
PR#66 é justamente o produtor da segregação que este incremento consome ✓.
