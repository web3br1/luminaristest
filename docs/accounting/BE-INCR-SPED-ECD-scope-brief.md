# BRIEF / Prompt de Continuação — Geração do arquivo ECD (SPED Contábil)

> **Uso:** este é o handoff resumível do incremento. Entregar ao `luminaris-implementer`.
> Ele carrega o estado verificado, os passos restantes, os invariantes e os gates — para
> continuar **sem re-derivar** o que já foi decidido. Governança T12: `PLAN → ADR → BRIEF →
> impl → test → review independente (worktree separado) → PR → closeout → memória`.
> **ADR normativo:** `docs/adr/ADR-INCR-SPED-ECD-file-generation.md` (ratificado pelo
> `luminaris-accounting-architect`, emendas E1–E3). Leia-o inteiro antes de codar.

---

## 0. Estado atual (VERIFICADO — não refazer)

- **Passo 1 — ADR + leiaute:** FECHADO. ADR escrito e ratificado. Versão normativa fixada:
  **Manual de Orientação do Leiaute 9 da ECD — Anexo ao ADE Cofis nº 01/2026 (janeiro/2026, 235 p.)**.
  - PDF baixado; texto integral extraído (`pdftotext -layout`) em
    `…/scratchpad/ecd_leiaute9_utf8.txt` (14.392 linhas) e a seção de leiaute dos registros
    isolada em `…/scratchpad/ecd_leiaute9_LAYOUT_SECTION.txt`. **Esta é a fonte campo-a-campo.**
    (scratchpad = `C:\Users\smurf\AppData\Local\Temp\claude\C--Users-smurf-Downloads-Luminaris--claude-worktrees-musing-napier-f0e3be\859dc5ef-8d4b-4c90-b1bf-7a33bbea1d2e\scratchpad`)
  - Se a sessão for nova e o scratchpad não existir, **re-obter** o PDF do gov.br
    (URL no ADR §1) e re-extrair com `pdftotext -layout -enc UTF-8`.
- **Passo 2 — fundação:** `server/src/lib/sped.ts` (primitivas puras) + `__tests__/sped.test.ts`
  (**13/13 verde**). Cobrem os class-bugs: `centsToSpedDecimal` (divmod, sem float, magnitude sem
  sinal), `dcIndicator`, `spedDate` (slice literal, sem UTC-shift), `spedLine` (pipe, rejeita `|`),
  `countRegisters`. **NÃO reescrever — só estender** com os register builders.
- **Ambiente:** worktree recebeu `npm ci` local + `prisma generate` (junctions foram removidas por
  causarem skew de versão do Prisma). **`cd server && npx tsc --noEmit` = exit 0 limpo.** Schema é
  **byte-idêntico a main** (0 migração — ADR D1). `my-app` ainda precisa de `npm ci` para o gate de
  tsc do front (não há front neste incremento, mas o gate roda).

### Localização das âncoras de registro no manual (linhas em `ecd_leiaute9_utf8.txt`)
Matriz de obrigatoriedade (coluna **G** = Diário Geral): ~3690-3849 (com as notas de rodapé).
Layouts: 0000 ~3907 · 0001 ~4719 · 0007 ~4774 · 0990 ~5406 · I001 ~6156 · I010 ~6208 · I030 ~6873 ·
I050 ~7130 · I051 ~7399 · I150 ~7964 · I155 ~8191 · I200 ~8802 · I250 ~9148 · I990 ~10117 ·
J001 ~10184 · J005 ~10268 · J100 ~10434 · J150 ~10879 · J900 ~12034 · J930 ~12282 · J990 ~12847 ·
9001 ~14029 · 9900 ~14081 · 9990 ~14154 · 9999 ~14197.

---

## 1. Decisões travadas (do ADR — aplicar, não re-decidir)

- **D1** SEM model novo: job em `AccountingDataExchangeJob`, `kind='EXPORT_SPED_ECD'` (novo valor no
  union `EXPORT_KINDS` de `features/accounting/models/DataExchange.model.ts`), `direction='EXPORT'`,
  `status='EXPORTED'`, `mimeType='text/plain'`. **Zero migração ⇒ zero smoke-migration-gate.**
- **D2** Serializer é lib pura em `server/src/lib/sped.ts` (layout NÃO vai no service).
- **D3** Identificação do declarante (0000), signatários (J930), termo (I030/J900) = **params do DTO
  transiente**. **NUNCA** criar `LegalEntity`/`CompanyProfile` (colide com §4 — se tender a isso, PARE).
- **D4** Escopo = ECD, Livro **Diário Geral (tipo G), anual**. Conjunto de registros no ADR §2 D4.
- **D5** **Coverage-gate**: `ReferentialMappingService.coverage(mappingVersion)`; `ready===false` ⇒
  `ValidationError` com `unmappedAccounts` — **não gera arquivo**. I051 vem de `listMappings(version)`.
- **D6** I200/I250 só `LEDGER_STATUSES` (Posted/Reconciled/Reversed); **Draft nunca**; estorno+original
  **ambos** presentes (T5).
- **D7** Read-only ⇒ **sem gate de período in-tx**. Único bloqueio é a cobertura (D5).
- **D8** Datas `ddmmyyyy` slice literal; centavos→decimal BR só na serialização (sem float); sinal em
  indicador D/C separado; **determinismo** (ordenar contas por `code`, lançamentos por `date`+`entryNumber`).
- **D9** Read-gap I200/I250: nova leitura "entries+legs por janela, `LEDGER_STATUSES`" (compor via repos
  já injetados — não iterar `accountLedger` por conta).
- **D11** **I150/I155 MENSAIS** (12/ano-cheio): um I150 por mês (`DT_INI`=1º dia, `DT_FIN`=último dia);
  carry-forward `saldoInicial(mês N)=saldoFinal(mês N-1)`, `saldoInicial(jan)=saldo de abertura`; toda
  conta com saldo não-nulo aparece em todos os meses (continuidade). **E2:** `Σ I250(conta,mês)` tem de
  fechar com débito/crédito do `I155(conta,mês)` — I155 e I250 da MESMA leitura filtrada.

### Reuso obrigatório (confirmado por código — não recriar)
`AccountingReportService` (`trialBalance`, `getAccountBalances(scope,from?,to?)` privado → tornar
acessível o suficiente para janelas mensais, `balanceSheet(asOf)`=J100, `incomeStatement(asOf)`=J150,
`LEDGER_STATUSES`) · `ReferentialMappingService.coverage`/`listMappings` · `IDataExchangeRepository`
(`createJob`/`updateJob`/`findJobById`/`runTransaction`, todos aceitam `tx`) · `storage` (saveFile/
resolveReadPath — INCR-6) · `AuditService.append(tx,scope,event)` · `IAccountingPolicy.canRead` ·
`AccountingScope`/`accountingScopeWhere` · `models/dates.ts::isValidDateOnly` · `money.ts::MAX_CENTS`.
Rota de **download** do artefato = a de job do INCR-6 (não criar nova).

---

## 2. Passos restantes (executar em ordem; `tsc` verde é gate entre passos)

### Passo 2b — Register builders em `lib/sped.ts` (+ testes)
Para **cada** registro do MVP (lista D4), ler o layout no manual (âncoras §0), transcrever os campos
**na ordem exata**, e escrever uma função pura que monta a(s) linha(s) via `spedLine`. Agrupar por
bloco. **Não inventar** ordem/tamanho/obrigatoriedade — citar a página do manual em comentário.
Resolver os **PENDENTE-VERIFICAR** contra o manual antes de fechar:
- **PVA-2** ordem/tam/decimais/obrigatoriedade de cada campo (todos os registros).
- **PVA-3** I155: convenção `IND_DC` do saldo inicial/final; conta sem movimento no mês.
- **PVA-4** I051: confirmar campos (`COD_CTA_REF`, e se há `COD_ENT_REF`/entidade responsável).
- **PVA-5** J930: tabela `QUALIF_ASSIN` (valores válidos).
- **PVA-6** 9900: uma linha por tipo de registro presente + auto-referência (contar 9900/9990/9999).
- **PVA-7** encoding (Latin-1/ISO-8859-1?) e terminador de linha (CRLF?) exigidos pelo PGE.
Testes unitários por registro/bloco (determinismo byte-a-byte incluso).

### Passo 3 — DTO `SpedEcdRequestDto` (`.strict()`)
`mappingVersion`, `year` (ou `dtIni`/`dtFin` validados por `isValidDateOnly`), `declarant`
(NOME/CNPJ/UF/IE/COD_MUN/IM/indicadores), `book` (NUM_ORD/NAT_LIVRO), `signers[]`
(NOME/CPF/QUALIF). Guardas de shape (CNPJ 14 díg. etc.). Espelhar DTOs de `features/accounting/dtos`.

### Passo 4 — `SpedGenerationService`
Policy-first (`canRead`). Fluxo: coverage-gate (D5) → montar dados (12 janelas mensais D11 + carry-
forward; read-gap D9 para I200/I250; J100/J150 via INCR-4; I050 via chart; I051 via listMappings) →
`lib/sped` monta o arquivo (ordem de blocos + 9900/9999) → `repo.createJob` + `storage.saveFile` +
`audit.append('sped.ecd_generated')` na mesma tx (espelhar `DataExchangeExportService.export`).
Factory: registrar em `lib/factory.ts` (`getSpedGenerationService()`), reusando repo/policy existentes.

### Passo 5 — Controller + Rota (3-toques)
`POST /api/accounting/sped/ecd/generate`. Registrar em `routes/index.ts` +
`protectedApiPaths` (`middleware/auth.ts`) + `@openapi` em `routes/docs.paths.ts`. Download = rota de
job existente.

### Passo 6 — Suíte de testes de domínio (`backend-test-suite-generator`, tipo service)
Gates obrigatórios (ADR §7): cobertura bloqueia · Draft fora de I200/I250 · estorno+original ambos ·
determinismo (2 gerações → sha256 idêntico) · data sem shift · dinheiro sem float · contagens
(9999/9900/I990/J990/0990/9990) · **mensalidade (12 I150)** · **cross-registro I155×I250 (E2)** ·
tenancy (NotFoundError) · invariante de fechamento (nenhuma escrita em Posting/JournalEntry).

### Passo 7 — `api-contract-sync-generator` → `npm run docs:generate` (rota nova no openapi.json).

### Passo 8 — Closeout
`docs/accounting/ACCOUNTING-MASTER-MAP.md` §5: promover o nó ECD/ECF ⚫→✅ (com PR/merge) — **ORCH-007,
tarefa do implementer**. Registrar decisões via `learning-log`. Atualizar as memórias `accounting-*`.

### Fechamento — Review independente (T12)
`luminaris-reviewer` em **worktree SEPARADO**, re-checando o commit do zero. **Residual honesto:**
"PVA aceita" só é certificável rodando o PGE/PVA da RFB (passo humano) — declarar, não bloquear merge.

---

## 3. Gates de envio (OPS-001) a preencher no handoff ao reviewer
- Caso adversarial tentado (ex.: conta-folha sem mapeamento; entry Draft na janela; mesma geração 2×).
- Checagem que teria falhado se errado (teste vermelho→verde; sha256 de determinismo; E2 I155×I250).
- Risco principal remanescente (o silencioso: fidelidade campo-a-campo vs. PGE — só o PVA fecha).
