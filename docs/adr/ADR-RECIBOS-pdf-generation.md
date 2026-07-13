# ADR-RECIBOS — Geração de comprovante de lançamento em PDF

- **Status:** Accepted — decisão do dono do produto (web3br1) em **2026-07-12** (escolha explícita de **puppeteer** sobre pdfmake/pdfkit/HTML-puro, com o custo do Chromium na mesa). Backend Fase A+B implementado (**PR #84**, commit `2ba82e9`), **não mergeado**.
- **Date:** 2026-07-12
- **Decision class:** READ_ONLY (geração de documento; lê o ledger first-class, não escreve nem migra)
- **Depends on:** JournalEntry/Posting (INCR-3), IAccountRepository, IAccountingPolicy. Reusa o padrão "serializer puro em `lib/`" de `lib/sped.ts`.
- **Related:** INCR-5 Anexos (persistência via `DocumentAttachment` — deliberadamente NÃO usada aqui), master map §7 Núcleo 5.

---

## 1. Contexto (o gap)

O ledger não tinha como emitir um **comprovante formal de um lançamento** para impressão/arquivo. §7 Núcleo 5 listava "recibos" como falta. Não é domínio novo nem dado novo: renderiza um `JournalEntry` **imutável** que já existe. Nenhum gerador de PDF estava instalado (`pdf-parse` é leitura/extração para RAG, não geração).

## 2. Decisão

**Comprovante = render determinístico do lançamento em PDF, streamado sob demanda, sem persistir.**

- **Formato PDF via `puppeteer` (HTML→PDF, Chromium headless).** Escolha explícita do dono do produto sobre as alternativas leves (pdfmake/pdfkit), priorizando fidelidade de render de um template HTML.
- **Serializer puro em `lib/receiptHtml.ts`** (dados → HTML), espelhando `lib/sped.ts`: centavos inteiros + agrupamento de milhar **independente de ICU** (não usa `toLocaleString`), data via getters **UTC** (sem day-shift), `escapeHtml` em **todo** campo controlado pelo usuário.
- **`lib/pdf.ts`** — casa canônica de PDF; **Browser singleton lazy** reusado entre requests (single-process, T11); launch falho **não** é cacheado (self-heal); `closePdfBrowser` no shutdown.
- **`ReceiptService`** (read-only) injeta `IJournalEntryRepository` + `IAccountRepository` + `IAccountingPolicy`; gate `canRead`; resolve nomes de conta; conta removida vira placeholder sem derrubar a perna. **Persiste NADA.**
- **Endpoint:** `GET /api/accounting/journal-entries/:entryId/receipt?unitId=…` (handler streama o PDF; espelha `downloadDocumentAttachment`).

### Rejeitado — persistir o recibo como `DocumentAttachment` (INCR-5)
O comprovante é render determinístico de um lançamento imutável, **sempre regenerável** → guardar é YAGNI. Persistir só se um dia exigir cópia assinada/arquivada (aí entra INCR-5 + proveniência INCR-8).

### Rejeitado — pdfmake/pdfkit (sem navegador) e HTML-puro (sem dep)
pdfmake/pdfkit dispensariam o Chromium, mas o dono do produto optou por fidelidade de template HTML. HTML-puro (deixar a conversão a PDF com o cliente/print) foi descartado por não entregar o artefato PDF pedido.

## 3. Invariantes & riscos

- **Zero invariante de ledger tocado, zero migração.** Read-only puro; `canRead` é o único gate.
- **Segurança:** `escapeHtml` cobre os 5 chars significativos e é aplicado a description/nome de conta/sourceType/sourceId/status; dinheiro/data são numéricos. Confirmado por teste + review independente (enumerou toda interpolação do template).
- **Dependência pesada (o risco real):** puppeteer baixa Chromium próprio (~150–300 MB). ⚠️ **O smoke-migration-gate do deploy passa a exigir também um smoke-launch-gate**: confirmar que o Chromium **sobe** no ambiente-alvo antes de deploy-clear (o gate de deploy não é mais só de migração). Smoke real de render passou no ambiente de desenvolvimento (55 KB `%PDF`, conferido).
- **As-of:** o comprovante é fotografia do lançamento no instante do render; sem escrita, sem TOCTOU.

## 4. Consequências

- BE aditivo/backward-compatible; pode ir a `main` independentemente (FE diferido).
- Novo choke point de dep no runtime (Chromium) — primeiro caso do projeto que roda um navegador headless em produção.
- Residual: sign-off humano no browser (HTTP real), merge, smoke-launch-gate no deploy.
- Fora de escopo: recibo de pagamento/settlement, cópia assinada/arquivada, qualquer UI (FE diferido).
