# ADR-INCR7-CNAB — Ingestão de extrato bancário em CNAB 240

- **Status:** Accepted — 5 decisões ratificadas pelo parecer de domínio (`luminaris-accounting-architect`) em **2026-07-09**.
- **Date:** 2026-07-09
- **Decision class:** PRISMA_FIRST_CLASS (adendo **migration-free** ao módulo de conciliação; nenhum model/migração tocado)
- **Depends on:** BE-INCR-7 (conciliação bancária, `main`) — reusa integralmente o pipeline de import. BE-INCR7-OFX (`main`, PR #59) — este ADR espelha aquele padrão para um 3º formato.
- **Escopo (fonte):** `docs/accounting/BE-INCR7-CNAB-scope-brief.md` · **Roadmap:** `docs/accounting/ACCOUNTING-MASTER-MAP.md` §5
- **Supersedes:** **ADR-INCR7 §D2** (parte CNAB) e resolve a metade **CNAB 240** do nó ⚫ "CNAB/NF-e" do master map §5. CNAB **400**, CNAB de **remessa** (escrita) e NF-e seguem diferidos.
- **Related:** ADR-INCR7-OFX (mesmo padrão parser-puro→InTable), ADR-INCR7 (D1 idempotência sha256, D4 âncora de conta, D6 janela de match).

> **Nota de processo.** Nó ⚫ "Diferido" no master map exige **ADR em disco + sinal humano** para ser roteado (§8). O sinal humano é o pedido explícito do usuário; este ADR é o portão. Escrito **antes** do review independente (ordem: PLAN → ADR → BRIEF → impl → test → review). Governança T12.

---

## 1. Contexto

O import de extrato bancário (BE-INCR-7) aceita hoje **CSV/XLSX** (`parseTable`) e **OFX** (`parseOfx`, BE-INCR7-OFX). Bancos brasileiros também exportam extrato em **CNAB** — arquivo **posicional de largura fixa** (registros de 240 caracteres no padrão FEBRABAN moderno). É o formato que muitos ERPs e internet bankings entregam para conciliação.

**Objetivo:** aceitar CNAB 240 como um **terceiro parser** que normaliza o arquivo para o **mesmo shape de linha** que o pipeline já consome, reusando **toda** a validação (`parseLines`, o único portão) e persistência (`BankStatement/Line`) existentes. Zero mudança de ledger, model ou migração.

**Fato-chave que habilita o design (idêntico ao OFX):** `ReconciliationService.importStatement` separa **parse** (`{headers, rows}`) de **validação** (`parseLines`: `isValidDateOnly`, `/^-?\d+$/`, `MAX_CENTS`, zero-reject, all-or-nothing). Um parser CNAB que produza o **mesmo `{headers, rows}`** transforma a ramificação em uma linha; `parseLines` valida CNAB exatamente como valida CSV e OFX.

**Invariantes herdados aplicáveis:** ACC-014 (centavo inteiro + `MAX_CENTS`, exato, sem epsilon), classe date-only sem UTC-shift (`models/dates.ts`), T7/D1 (idempotência por `sha256(arquivo)`). **Nenhum é reaberto** — o parser é um seam inerte antes do gate.

---

## 2. As 5 decisões (ratificadas pelo parecer)

### C1 — Arquitetura: parser puro que NORMALIZA para o `InTable`, não novo pipeline

**Decisão:** `lib/cnab.ts` exporta `parseCnab(buffer): InTable` — o **mesmo** `{headers:['date','amountCents','description','externalRef'], rows}` que `parseTable`/`parseOfx` retornam. `importStatement` ramifica só na escolha do parser:
`format === 'cnab' ? parseCnab(buffer) : (format === 'ofx' ? parseOfx(buffer) : await parseTable(buffer, format))`. Depois roda o **mesmo `parseLines`**.

**Por quê:** reuso máximo (Contrato §0) — a validação **não** é duplicada. O 3º formato confirma o padrão "parser puro → InTable, `parseLines` = portão único" como reutilizável para N formatos. **Descartado:** parser que emite `CreateBankStatementLineInput[]` direto — duplicaria `parseLines`.

### C2 — Valor posicional → centavos inteiros, LEITURA DIRETA, sem float (ACC-014 / T4)

**Decisão:** o campo de valor do Segmento E é numérico posicional de **18 dígitos com 2 casas decimais implícitas, sem ponto, sem sinal**. Portanto o campo inteiro **já É centavos** (`R$ 1.500,00` → `000000000000150000` → `150000`). Conversão = **remover zeros à esquerda de uma string de dígitos** (`/^\d+$/`); **nunca** `Number(campo)` (o campo tem até 18 dígitos, acima de 2⁵³ → perderia exatidão) e **nunca** `Number(decimal)*100`. Emissão:
- campo não-numérico → **emitir o token cru** → `parseLines` reprova (`/^-?\d+$/`);
- valor 0 (ex.: saldo zerado) → `'0'` → `parseLines` reprova (`amountCents == 0`);
- valor acima de `MAX_CENTS` → passa o `/^-?\d+$/` mas `parseLines` reprova alto (`> MAX_CENTS`). Nenhum valor errado é persistido silenciosamente.

**Por quê:** exatidão monetária é o risco alto do incremento; fechado por leitura-inteira-string + falha-alta. O parser **não importa `MAX_CENTS`** — o teto é reaplicado por `parseLines`. Mais simples que o OFX (que tinha ponto decimal a desmontar).

### C3 — Sinal via indicador D/C → signed-cents, 1:1 e não-invertível

**Decisão:** CNAB codifica a natureza num **campo indicador** (`'C'` crédito / `'D'` débito), **não** no sinal do número. Mapa: **`C` → `+cents` (entrada/inflow)**, **`D` → `-cents` (saída/outflow)** — casando byte-a-byte com o comentário do schema (`BankStatementLine.amountCents … >0 inflow (statement credit), <0 outflow`). Um registro cujo indicador **não** é `C` nem `D` é **descartado** (não é movimento — ver C5/§3).

**Por quê:** é a decisão *correctness-crítica* do incremento (perspectiva do banco, fácil de inverter). Consistente com o pipeline existente (`findCandidates`: `amountCents>0 ? 'debit' : 'credit'` na conta-banco — crédito de extrato = débito no ativo-banco do cliente). **Teste obrigatório** prova os dois sentidos.

### C4 — Data posicional DDMMAAAA → YYYY-MM-DD por FATIA literal (classe date-only)

**Decisão:** a data do lançamento é **DDMMAAAA** (8 dígitos) → `YYYY-MM-DD` por **reordenação de fatia literal**: `${s.slice(4,8)}-${s.slice(2,4)}-${s.slice(0,2)}`. **Proibido** `new Date(...)` seguido de format (classe UTC-shift — memória `date-only-rendering-utc-shift`). `isValidDateOnly` (round-trip) revalida o slice e reprova `00000000`/`31021900`.

**Atenção documentada:** CNAB é **DDMMAAAA** (dia primeiro) — ordem *inversa* do OFX (`YYYYMMDD`). O slice **difere** do OFX; não copiar.

### C5 — externalRef = "Número do Documento", NUNCA idempotência de import

**Decisão:** o "Número do Documento" do Segmento E mapeia para `BankStatementLine.externalRef` (dica de dedup **do banco**, análoga ao `FITID` do OFX), `null` quando ausente. A idempotência de import continua sendo **`sha256(arquivo)`** (T7/D1) — **intocada**, nenhum `@@unique` novo. `description` = histórico/complemento do Segmento E, com **fallback** para o número do documento quando o histórico vem em branco (nunca derruba um movimento financeiramente válido por falta de rótulo — mesma filosofia do fallback OFX).

**Aceito (não-regressão):** o número do documento **não** faz dedup por-linha — herda o comportamento CSV/OFX (D1).

---

## 3. Invariantes de domínio deste formato

- **Multi-conta é REJEITADO alto** (espelha o OFX). O parser coleta a identidade de conta (agência+conta) de cada registro de movimento; se houver **>1 conta distinta**, lança `ValidationError`. Um extrato ancora em **uma** conta contábil (D4); ingerir movimentos de outra conta sob a âncora seria furo contábil silencioso. Rejeitar ≠ "pega a primeira".
- **Seleção de registro (posicional):** só registros de **detalhe** (`posição 8 == '3'`) do **Segmento E** (`posição 14 == 'E'`) com **natureza `C`/`D`** são ingeridos. Header/trailer de arquivo e de lote (`0/1/5/9`) e outros segmentos são ignorados.
- **Registros de SALDO descartados (R2).** O Segmento E também carrega linhas de **saldo** (abertura/fechamento), que **não** são transações. Filtro do MVP: (a) natureza não-`C`/`D` → descartada; (b) saldo com valor **0** cai no zero-reject de `parseLines`. **Limite aceito:** um saldo que um banco específico emita com natureza `C`/`D` válida e valor não-zero, sem marcador distinguível nas posições padrão, exigiria **calibração por banco** (ver R3) — declarado como resíduo do MVP.

---

## 4. Detecção de formato (sniff) e allowlist

`sniffFormat` ganha um ramo CNAB, **antes** do fallback CSV (senão um CNAB vira "CSV sem colunas"): ordem **xlsx-magic (PK) → OFX → CNAB → csv**. CNAB é detectado por **extensão** (`.ret`/`.cnab`) **ou** por **primeira linha de 240 caracteres cuja posição 8 é `'0'`** (header de arquivo). Cap de tamanho **inalterado**.

**Allowlist do multer:** **inalterada** — arquivos CNAB são texto e chegam como `text/plain` ou `application/octet-stream`, **ambos já permitidos** (não há MIME padrão para CNAB). O `makeUploadMiddleware` é MIME-based; a discriminação CNAB acontece no `sniffFormat` por conteúdo/extensão.

---

## 5. Escopo — o que fica de fora (ADR/incremento próprio)

| Item | Motivo |
|---|---|
| **CNAB 400** | Leiaute legado distinto (CBR643), mais variável, majoritariamente cobrança/pagamento. `parseCnab` **rejeita alto** um arquivo cuja 1ª linha tem ≥400 chars (`ValidationError` "CNAB 400 não é suportado"). |
| **CNAB de remessa** (pagamentos/cobrança) | É **escrita**, não extrato — outro domínio. |
| **Multi-conta por arquivo** | **REJEITADO alto** (D4). |
| **Calibração por banco (R3)** | O MVP mira as **posições padrão FEBRABAN 240** do Segmento E. Desvios de banco específico (posições de complemento/histórico, marcador de saldo próprio) são **calibração diferida** — as constantes de posição em `cnab.ts` são o ponto de tuning (marcado `ponytail:`). Este é o motivo de o master map classificar CNAB como ⚫ "posicional por banco (subprojeto)". |
| **NF-e** | Domínio fiscal. |

---

## 6. Consequências

- **Positivas:** conciliação usável com o arquivo CNAB que muitos bancos/ERPs entregam; zero dependência nova (largura fixa resolvida por `slice`); zero mudança de ledger/model/migração; validação e persistência 100% reusadas; confirma o padrão multi-parser.
- **Custos/limites (aceitos):** só 240; só Segmento E de extrato; calibração de posições por banco diferida; sem dedup por número de documento entre arquivos. Todos são escopo próprio.
- **Não muda:** regra-dura da conciliação (não altera valor de ledger); idempotência sha256; janela D6; âncora D4; o portão `parseLines` (estrito e inalterado).

## 7. Gates

- `cd server && npx tsc --noEmit` limpo.
- `jest src/lib/__tests__/cnab.test.ts` (parser + import e2e) + suíte accounting/lib verdes.
- Review independente (worktree separado, T12): leitura de centavos exata sem float (`Number` só onde seguro); date-only sem shift (DDMMAAAA→ISO por slice); reuso de `parseLines` (validação não reimplementada); sinal D/C 1:1; saldo descartado; multi-conta rejeitada; 400 rejeitado; **só `cnab.ts` + branch + `sniffFormat` + testes + docs mudaram** — nenhum model/migração.
- **smoke-migration-gate NÃO se aplica** (migration-free).
