# ADR-INCR7-OFX — Ingestão de extrato bancário em OFX

- **Status:** Accepted — 5 decisões ratificadas pelo parecer de domínio (`luminaris-accounting-architect`) em **2026-07-09**.
- **Date:** 2026-07-09
- **Decision class:** PRISMA_FIRST_CLASS (adendo **migration-free** ao módulo de conciliação; nenhum model/migração tocado)
- **Depends on:** BE-INCR-7 (conciliação bancária, `main`) — reusa integralmente o pipeline de import. Gate literal do master map §5 ("OFX depende do INCR-7 CSV/XLSX provado") **satisfeito**.
- **Escopo (fonte):** `docs/accounting/BE-INCR7-OFX-scope-brief.md` · **Roadmap:** `docs/accounting/ACCOUNTING-MASTER-MAP.md` §5
- **Supersedes:** **ADR-INCR7 §D2** (parte OFX) — D2 deferiu OFX/CNAB/NF-e para "ADR próprio"; este ADR resolve a parte **OFX**. CNAB 240/400 e NF-e seguem diferidos.
- **Related:** ADR-INCR7 (D1 idempotência sha256, D4 âncora de conta, D6 janela de match), ADR-INCR6B (idempotência de import).

> **Nota de processo.** ADR escrito **antes** do review independente (ordem: PLAN → ADR → BRIEF → impl → test → review). As 5 decisões vieram do parecer de domínio sobre a leitura do código (CBM-001) e do master map. Governança T12.

---

## 1. Contexto

O import de extrato bancário (BE-INCR-7) aceita hoje **apenas CSV/XLSX** (`sniffFormat` no `reconciliationController.ts`, `parseTable` em `lib/spreadsheet.ts`). Bancos brasileiros exportam extrato nativamente em **OFX** (Open Financial Exchange) — o formato que o internet banking entrega. Sem OFX, o usuário monta a planilha à mão, o que torna a conciliação pouco usável na prática.

**Objetivo:** aceitar OFX como um **segundo parser** que normaliza o arquivo para o **mesmo shape de linha** que o pipeline já consome, reusando **toda** a validação e persistência existentes. Zero mudança de ledger, model ou migração.

**Fato-chave que habilita o design:** `ReconciliationService.importStatement` já separa **parse** (`parseTable → {headers, rows}`) de **validação** (`parseLines`, o único portão: `isValidDateOnly`, `/^-?\d+$/`, `MAX_CENTS`, zero-reject, all-or-nothing). Basta um parser OFX que produza o **mesmo `{headers, rows}`** e a ramificação vira uma linha; `parseLines` valida OFX exatamente como valida CSV.

**Invariantes herdados aplicáveis:** ACC-014 (centavo inteiro + `MAX_CENTS`, exato, sem epsilon), classe date-only sem UTC-shift (`models/dates.ts`), T7/D1 (idempotência por `sha256(arquivo)`).

---

## 2. As 5 decisões (ratificadas pelo parecer)

### O1 — Arquitetura: parser puro que NORMALIZA para o `InTable`, não novo pipeline

**Decisão:** `lib/ofx.ts` exporta `parseOfx(buffer): InTable` — o **mesmo** `{headers:['date','amountCents','description','externalRef'], rows}` que `parseTable` retorna. `importStatement` ramifica só na escolha do parser:
`const table = format === 'ofx' ? parseOfx(buffer) : await parseTable(buffer, format)`. Depois roda o **mesmo `parseLines`**.

**Por quê:** reuso máximo (Contrato §0) — a validação **não** é duplicada. Uma única superfície de validação para os 3 formatos. Herda a semântica all-or-nothing por construção. **Descartado:** parser que emite `CreateBankStatementLineInput[]` direto — duplicaria `parseLines`, reprovaria no critério de reuso.

### O2 — TRNAMT decimal → centavos inteiros, EXATO, sem float (ACC-014 / T4)

**Decisão:** conversão por **aritmética de string** sobre as partes: regex `^([+-]?)(\d+)(?:\.(\d+))?$`, `cents = sinal·(int·100 + fracPad2)`. **Nunca** `Number(decimal)*100` (float drift). Casas decimais:
- ≤2 casas → exato;
- >2 casas com dígito **significativo** (não-zero) além da 2ª → **NÃO converter, emitir o token cru** para `parseLines` reprovar o import inteiro. **Nunca arredondar** (arredondar inventa centavo — viola "exato, sem epsilon").
- trailing-zero além da 2ª casa (`100.000`) → aceito, vira `10000`.
- **Separador só `.`** (spec OFX). Vírgula não aparece em OFX de banco BR; se vier, cai como linha inválida (emitida crua → `parseLines` rejeita). **Aceito** — não implementar suporte a `,` (YAGNI).

**Por quê:** exatidão monetária é o único risco alto do incremento; fechado por int-math nas partes (dentro de `MAX_CENTS`, muito abaixo de 2⁵³ → exato) + falha-alto em imprecisão. O parser **não importa `MAX_CENTS`**: o teto é reaplicado por `parseLines`.

### O3 — FITID → `externalRef` por linha, NUNCA idempotência de import

**Decisão:** `<FITID>` mapeia para `BankStatementLine.externalRef` (a chave de dedup **do banco**). A idempotência de import continua sendo **`sha256(arquivo)`** (T7/D1) — **intocada**, nenhum `@@unique` novo.

**Aceito (não-regressão):** FITID **não** faz dedup por-linha. Dois arquivos *diferentes* com transações sobrepostas duplicam linhas — **exatamente** o comportamento CSV/XLSX atual (D1). OFX herda, não regride. Dedup por FITID entre arquivos é escopo futuro (se pedido).

### O4 — DTPOSTED → YYYY-MM-DD por FATIA literal; offset IGNORADO

**Decisão:** `DTPOSTED` (`YYYYMMDD[HHMMSS][.XXX][gmt]`) → `YYYY-MM-DD` por **slice literal dos 8 primeiros dígitos**. **Proibido** construir `Date` do timestamp e formatar (classe UTC-shift: um `[-3:BRT]` à noite rolaria o dia). O offset governa a **hora**, não a **data-calendário** que o banco postou. `parseLines`/`isValidDateOnly` revalidam o slice.

**Por quê:** a data do extrato é a data local que o banco escreveu. Rede extra: a janela D6 ±3d absorve qualquer ambiguidade de 1 dia. **Aceito:** offset ignorado deliberadamente.

### O5 — description = `[NAME, MEMO].filter(Boolean).join(' — ')`

**Decisão:** junta `<NAME>` e `<MEMO>` (ambos quando presentes; qualquer um sozinho; vazio quando nenhum → `parseLines` rejeita `description vazia`).

**Por quê:** description é auxílio de exibição/auditoria, **não** invariante de ledger — a versão mais rica ajuda o conferente humano.

---

## 3. Invariante de domínio NOVO — arquivo multi-conta é REJEITADO

`parseOfx` **rejeita** (throw `ValidationError`) um arquivo com mais de um agregado de conta/extrato (`>1 <BANKACCTFROM>/<CCACCTFROM>` ou `>1 <STMTRS>/<CCSTMTRS>`). Um extrato é ancorado a **uma** conta contábil no import (D4); ingerir *todos* os `<STMTTRN>` de um arquivo multi-conta atribuiria transações de **outra** conta ao `glAccount` ancorado — **furo contábil silencioso**. "Multi-conta OUT" (escopo) significa **rejeitar alto**, não "pega a primeira e ignora o resto". **Teste obrigatório** (presente).

---

## 4. Detecção de formato (sniff)

`sniffFormat` ganha um ramo OFX, **antes** do fallback CSV (senão um OFX vira "CSV sem colunas"): ordem **xlsx-magic (PK) → OFX (`OFXHEADER` no início, ou contém `<OFX>`, ou nome `.ofx`) → csv**. Allowlist do multer ganha `application/x-ofx`/`application/ofx` (OFX texto já cai em `text/plain`/`application/octet-stream`, ambos já permitidos). Cap de tamanho **inalterado**.

---

## 5. Consequências

- **Positivas:** conciliação usável com o arquivo que o banco já entrega; zero dependência nova (OFX 1.x SGML + 2.x XML resolvidos por regex); zero mudança de ledger/model/migração; validação e persistência 100% reusadas.
- **Custos/limites (aceitos):** sem dedup por FITID entre arquivos; sem `,` decimal; sem multi-conta; sem CNAB/NF-e. Todos são escopo de ADR/incremento próprio.
- **Não muda:** regra-dura da conciliação (não altera valor de ledger); idempotência sha256; janela D6; âncora D4.

## 6. Gates

- `cd server && npx tsc --noEmit` limpo.
- `jest src/lib/__tests__/ofx.test.ts` (parser + import e2e) + suíte accounting verdes.
- Review independente (worktree separado, T12): conversão de centavos exata sem float; date-only sem shift; reuso de `parseLines` (validação não reimplementada); multi-conta rejeitada; nenhum model/migração tocado.
- **smoke-migration-gate NÃO se aplica** (migration-free).
