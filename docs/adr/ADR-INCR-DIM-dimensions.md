# ADR-INCR-DIM — Dimensões (centro de custo / projeto)

- **Data:** 2026-07-15
- **Status:** **Accepted — RATIFICADO POR SINAL HUMANO EM REVISÃO FORK-A-FORK 2026-07-15 (via AskUserQuestion).**
  Decisões confirmadas: **F0 → CONSTRUIR** (build **completa**, não MVP mínimo — sinal humano explícito);
  **F1 → (a)** catálogo **Prisma first-class** (`DimensionDefinition` + `DimensionValue` com `parentId`/rollup
  hierárquico + `PostingDimension`); **F2 → (a)** vínculo na **partida** (`Posting`, linha); **F3+F4 → ponte
  `PostingDimension` + N eixos** (CREATE TABLE puro, zero-ALTER em `postings`); **F5 → (a)** dimensão **sempre
  opcional** (não reabre §4); **F6 → (a)** leitura = **razão/balancete filtrável + DRE por dimensão**.
  **Implementação (Task pós-ADR) ainda NÃO iniciada** — este é o gate ADR+sinal que o master map §1 exige; o
  nó permanece ⚫ até a implementação fechar (ORCH-007 promove no closeout). Abre o item **9 da fila §5.1**.
- **Autores:** par `luminaris-orchestrator` (roteamento, ORCH-001) + `luminaris-accounting-architect`
  (parecer de domínio) — mesmo formato dos precedentes `ADR-INCR-AP` / `ADR-INCR-AR`.
- **Nó do master map:** §5 "Domínios DIFERIDOS → **Dimensões (centro de custo/projeto —
  DimensionDefinition/Value/PostingDimension)**" ⚫ ("Sem precedente; YAGNI até demanda real"); fila §5.1
  item 9. Este ADR **abre** o nó. **F0 era existencial** (o mapa segura como YAGNI e não havia demanda na
  sessão — DIFERIR foi apresentado como recomendação de 1ª classe); o humano **decidiu construir a task
  completa**. Colisões com §1 (T1–T12) e §4 (rejeitadas) verificadas em §2 — a única colisão possível
  (enforcement por conta = motor de regras, §4) foi **descartada** no F5→(a).

## TLDR (2 linhas)

Uma **dimensão** (centro de custo, projeto) é uma **etiqueta descritiva** numa partida — metadado que
**não** altera `Σdébito=Σcrédito`, período, numeração nem auditoria (T4/T6/T8 intocados); habilita a "análise
por dimensão" que falta ao Núcleo 4. Build **completa**: catálogo **Prisma first-class** de N eixos
(`DimensionDefinition`/`DimensionValue` hierárquico/`PostingDimension` — 3 tabelas aditivas, **CREATE TABLE
puro, zero-ALTER em `postings`**), etiqueta **opcional** na linha, e leitura recortada (razão/balancete +
DRE por dimensão). Nenhum motor novo; a etiqueta é ortogonal ao plano de contas e **não é dinheiro**.

---

## 1. Contexto e objetivo

Hoje o razão responde "quanto na conta `4.1` (Despesas Operacionais)?" mas não "quanto da `4.1` foi do
**Projeto X** / do **centro de custo Loja Centro**?". Essa é a "análise por dimensão" que o §7 lista como o
buraco do Núcleo 4 (~70%) e o §241 do Núcleo 2 ("falta dimensões"). Uma dimensão é um **eixo de classificação
gerencial ortogonal ao plano de contas**: a mesma conta-folha aparece recortada por centro de custo / projeto.

**Natureza da entidade (STEP-0 §2.1 — obrigatório antes de qualquer linha):** uma dimensão tem DUAS partes; a
resposta honesta **não** é binária, e ambas foram resolvidas para **Prisma** na build completa:

| Parte | O que é | Rail escolhido (F1→a) |
|---|---|---|
| **Catálogo de valores** ("Marketing", "Loja Centro", "Projeto X") | Lista que o usuário cria/edita em runtime — como cliente/fornecedor (AR/AP F1→c) e a própria `unit` já são | **Prisma first-class** (`DimensionDefinition`+`DimensionValue`): integridade + `parentId` p/ rollup hierárquico ("todos os sub-centros de Marketing"). É o nó que o mapa nomeia. **NÃO** é a torre §4 (aquilo era multi-empresa/`LegalEntity`) — é catálogo de classificação gerencial |
| **Vínculo partida↔valor** + **agregação em relatório** | Qual `Posting` carrega qual valor; precisa somar exato por (conta × dimensão) | **Prisma** (`PostingDimension`, ponte) |

O ledger e o balanceamento **permanecem** Prisma first-class (T3); a dimensão é **metadado** sobre a partida,
nunca um valor de ledger. Isto **não** é "modelar entidade contábil como DynamicTable" (§4 rejeita). O
catálogo Prisma (F1→a) foi escolhido sobre o espelho DynamicTable-ref do AR/AP porque a build **completa**
pede rollup hierárquico + integridade que uma ref-string escopada não dá de graça.

**Escopo (build completa, ratificada):** (1) catálogo Prisma de N eixos com hierarquia; (2) captura da
etiqueta **opcional** por linha em `postEntry`; (3) leitura recortada — razão/balancete filtrável por
dimensão + DRE por dimensão. FE diferido (`FE-INCR-DIM`, padrão FE-INCR-AP/AR). **FORA:** obrigatoriedade
por conta (F5→a, colidiria §4), re-etiquetagem pós-post mutável (correção = estorno, T5 — §6.3), alçada/RBAC.

## 2. Evidência de código (CBM-001 — tudo confirmado por leitura)

| Claim | Grau | Evidência |
|---|---|---|
| **NÃO existe** conceito de dimensão no mundo contábil hoje — `grep -rin dimension server/src/features/accounting/` → **0 ocorrências** | verificado | grep vazio; `schema.prisma` `Posting` (`:613-632`) só tem `accountId`/`debitCents`/`creditCents` |
| O `ProfitByDimension` que existe é **analytics sobre DynamicTable**, NÃO ledger — agrupa um campo runtime (`customerId`/`campaign`/`channel`) de linhas DynamicTable; **não toca `Posting`/`JournalEntry`** e **não** fecha o gap do Núcleo 4 (que é do ledger) | verificado | `analytics/kpis/profit/ProfitByDimensionProcessor.ts:1-8` (`import ISchemaField from dynamicTables`) |
| `PostingService.postEntry` = fronteira única de escrita; monta `resolvedLines: {accountId,debitCents,creditCents}` e chama `postingRepo.create` por linha dentro da tx; balanceamento inteiro exato; gate de período preflight+in-tx; audit in-tx; seam INCR-8 | verificado | `services/PostingService.ts:161-319` (linhas resolvidas `:195-203`, create por leg `:231-243`) |
| A etiqueta entra por `PostEntryInput.lines[]` (campo opcional na linha), flui em `resolvedLines`, e vira `PostingDimension` **na mesma tx** após criar a `Posting` — **nenhum** ponto novo de escrita nem mudança no cálculo de balanceamento | verificado | `PostingDto.ts:46-100` (`PostEntryLineSchema`); `PostingService.ts:195-243` |
| Relatórios agrupam via `prisma.posting.groupBy({ by:['accountId'], _sum:{...} })` — **Prisma `groupBy` NÃO cruza tabela-ponte**; recorte por dimensão via `PostingDimension` exige query com join (ou include+reduce), não groupBy nativo. Trade-off aceito (F3→ponte) para não dar ALTER na tabela quente `postings` | verificado | `repositories/PostingRepository.ts:50-90` (groupBy `by:['accountId']`); `AccountingReportService.ts:166` |
| Adicionar `dimensions PostingDimension[]` ao model `Posting` é **relação virtual** (a FK vive em `posting_dimensions`) — **zero coluna nova, zero ALTER** na tabela `postings`. Migração = `CREATE TABLE` ×3 pura (precedente AP/AR/INCR-8) | verificado | `schema.prisma:613-632` (Posting); `ADR-INCR-AR §D1` (CREATE TABLE aditiva) |
| **Self-relation em Prisma é precedente vivo** — `JournalEntry.reversedById` (`schema.prisma:483-485`) é self-relation; logo `DimensionValue.parentId` (árvore de rollup) não é padrão novo. (O `Account` usa hierarquia por `code` string `"1.1.2"`, não `parentId` — a dimensão escolhe `parentId` por ser árvore livre, não plano de contas) | verificado | `schema.prisma:483-485` (Reversal self-rel); `:398` (Account.code hierárquico) |
| `MAX_CENTS`, período, numeração, idempotência (`sourceType+sourceId`), BP/DRE absorvem por natureza — a etiqueta é **ortogonal à conta** e **não é dinheiro**, logo não entra em nenhum desses invariantes | verificado | `models/money.ts:14`; `schema.prisma:500-503`; `StatementMappingFixture.ts` (nature-only) |
| §4 rejeita **Motor de Regras Contábeis** (template/condições gerando/validando lançamento) — "obrigar dimensão em certas contas" é regra dirigida por dado, o mesmo cheiro ⇒ descartado no F5 | verificado | master map §4 (linha "Motor de Regras Contábeis 🔴 Rejeitada") |
| Tenancy = `AccountingScope` (`userId`+`unitId`); toda tabela nova carrega os dois eixos; sem torre Organization/LegalEntity | verificado | `scope/AccountingScope.ts`; padrão de toda tabela accounting (`accounts`/`payables`/`receivables`) |

**Colisões com decisões commitadas:** **nenhuma remanescente** — a única possível (enforcement por conta,
§4) foi descartada no F5→(a). O resto não colide desde que: (i) o catálogo Prisma seja um catálogo de
classificação gerencial, **não** uma torre multi-empresa (§4/T2); (ii) a etiqueta seja opcional e **não**
entre em balanceamento/período/numeração/idempotência/audit-chain (T4/T6/T7/T8); (iii) SQLite + gate in-tx
onde houver validação (T1/T6).

## 3. Decisões fixadas (D1–D7 — RATIFICADAS)

### D1 — Catálogo Prisma first-class de N eixos, com hierarquia (F1→a, F4→N)
Três models novos (`@@map` snake), migração **aditiva `CREATE TABLE` ×3, zero ALTER**:

- **`DimensionDefinition`** (o EIXO/tipo): `userId` (FK User cascade; trilha = AuditEvent, T8), `unitId`,
  `code` (chave estável, ex. `"COST_CENTER"`, `"PROJECT"`), `name` (rótulo), `status` (`ACTIVE|ARCHIVED`),
  `createdById?`, timestamps, `deletedAt?`. `@@unique([userId,unitId,code])`, `@@index([userId,unitId])`.
- **`DimensionValue`** (a LISTA, hierárquica): `userId`, `unitId`, `definitionId` (FK), `code` (estável no
  eixo), `name`, `parentId?` (**self-relation** `DimensionValueTree` — rollup; precedente
  `JournalEntry.reversedById`), `status` (`ACTIVE|ARCHIVED`), `isLeaf`-implícito (folha = sem filhos; só
  folha é etiquetável — D3), `createdById?`, timestamps, `deletedAt?`.
  `@@unique([userId,unitId,definitionId,code])`, `@@index([userId,unitId,definitionId])`, `@@index([parentId])`.
- **`PostingDimension`** (o VÍNCULO/ponte): `userId`, `unitId`, `postingId` (FK `Posting`,
  `onDelete:Cascade`), `definitionId` (denormalizado p/ query = `value.definitionId`), `valueId` (FK
  `DimensionValue`), `createdAt`. **`@@unique([postingId, definitionId])`** — invariante central: **uma
  partida carrega no máximo UM valor por eixo** (uma linha não pode estar em dois centros de custo; se
  precisar, quebre a partida). `@@index([userId,unitId,definitionId,valueId])`, `@@index([postingId])`.

O model `Posting` ganha **apenas** a relação virtual `dimensions PostingDimension[]` (zero coluna/ALTER — a
FK vive na ponte). Tenancy `userId`+`unitId` nos três (T2).

### D2 — Gestão do catálogo por comandos (`DimensionService`), auditada
`DimensionService` (Service+Repo+Policy+DTO próprios, Contrato §2/§3): `createDefinition`, `createValue`
(valida `parentId` **do mesmo `definitionId`** + **guarda de ciclo** na árvore, in-tx), `archiveValue`/
`archiveDefinition` (soft — `status=ARCHIVED`; valor arquivado não é etiquetável novo, mas **postings
existentes preservam o vínculo** — a trilha histórica não some), `listTree`. Cada mutação de catálogo emite
`AuditService.append` **na mesma tx** (T8) — 3 eventos novos na allowlist: `dimension.definition_created`,
`dimension.value_created`, `dimension.value_archived` (payload id-only + code, sem PII). Catálogo é
**management data**, não valor de ledger — mas auditado por consistência com INCR-9 (que auditou set/batch).

### D3 — Captura da etiqueta na partida, OPCIONAL, in-tx, ortogonal ao balanceamento (F2→partida, F5→opcional)
`PostEntryLineSchema` ganha `dimensions?: Array<{ definitionId: string; valueId: string }>` (`.strict`,
opcional, default ausente). Dentro da tx do `postEntry`, **após** criar cada `Posting`:
1. Gate in-tx (T6): cada `valueId` existe no escopo, `status='ACTIVE'`, é **folha** (só analítica etiqueta —
   espelho de `acceptsEntries` das contas), e pertence a um `definitionId` válido; **no máx. um valor por
   eixo por linha** (checado + fechado pelo `@@unique([postingId,definitionId])`, P2002 vira erro claro).
2. Grava as linhas `PostingDimension` na mesma tx (`tx` propagado, T6).

**Ortogonalidade (ACC-024):** a etiqueta é escrita **depois** do cálculo `Σdébito=Σcrédito` e **nunca** entra
nele. Postar com ou sem etiqueta produz **balancete/BP/DRE agregados por conta byte-idênticos**. Partida sem
etiqueta é válida (agrega no bucket `"(sem dimensão)"` na leitura). A etiqueta **não é um eixo de
idempotência** (a chave continua `sourceType+sourceId`, T7).

### D4 — Etiqueta é IMUTÁVEL com a partida; correção = estorno (T5)
`Posting` é imutável (T5); a `PostingDimension` nasce e morre com ela (`onDelete:Cascade`). **Não há
comando de re-etiquetagem pós-post** no escopo: corrigir um centro de custo errado = **estornar + re-postar**
(mesmo regime de qualquer erro de lançamento). Escolha deliberada (§6.3): mantém "o lançamento postado é um
fato congelado" e **zero** superfície de mutação nova a auditar. Re-etiquetagem mutável = follow-up com ADR
próprio se a demanda aparecer.

### D5 — Leitura: razão/balancete filtrável + DRE por dimensão, com rollup (F6→a)
`PostingRepository` ganha um read `groupByAccountAndDimension(scope, statuses, { definitionId, from, to })`
que **junta** `posting_dimensions` (Prisma `groupBy` não cruza a ponte → query com `where` no join / include +
reduce em memória, escala SQLite atual). `AccountingReportService`:
- **Razão/balancete por dimensão:** aceita `definitionId` (+ `valueId?` opcional) e recorta os totais por
  (conta × valor de dimensão), com bucket `"(sem dimensão)"` para partidas não etiquetadas.
- **DRE por dimensão:** particiona as folhas `Revenue`/`Expense` por valor de dimensão → resultado por centro
  de custo/projeto (reusa a lógica nature-only do income-statement INCR-4).
- **Rollup (D1 `parentId`):** um valor-pai agrega os filhos, caminhando a árvore `parentId` — "Marketing"
  soma seus sub-centros. Read-only, first-class, zero migração de leitura.

### D6 — Invariantes de ledger INALTERADOS (T4/T6/T7/T8)
A etiqueta **não** entra em `Σdébito=Σcrédito`, no gate de período, na numeração `fiscalYear+entryNumber`,
na idempotência `@@unique([userId,unitId,sourceType,sourceId])`, nem na hash-chain de audit do lançamento.
`MAX_CENTS`/cents intactos — **a dimensão não é dinheiro**. Os únicos eventos de audit novos são os 3 de
gestão de catálogo (D2); o post em si continua emitindo `entry.posted` como hoje.

### D7 — Tenancy = `AccountingScope`; zero-migration exceto as 3 CREATE TABLE aditivas
`resolveAccountingScope` + `accountingScopeWhere`; `userId`+`unitId` nas três tabelas novas; nenhuma torre
Organization/LegalEntity (§4/T2). A única mudança de schema são os 3 `CREATE TABLE` + a relação virtual em
`Posting`. **Espelha D7 do AP/AR.**

---

## 4. Plano de implementação (Task pós-ADR — só após esta ratificação)

**PAR-006 — veredito: SERIAL de ponta a ponta (PAR-005).** Domínio único; a Fatia 2 edita arquivos
existentes do mundo accounting (`PostingDto`, `PostingService`, `PostingRepository`, allowlist de audit) e a
Fatia 3 edita `AccountingReportService` — fan-in alto, serial evita conflito. 1 branch / 1 worktree isolado
(`npm ci`, **nunca** junction do client Prisma — memória `worktree-deps-stale-prisma-client`). Golden refs
literais: **AP/AR** (módulo first-class por comandos) para a Fatia 1; **INCR-4** (`AccountingReportService`)
para a Fatia 3.

- **Fase 0 — schema (serial):** `DimensionDefinition` + `DimensionValue` (self-relation `parentId`) +
  `PostingDimension` + relação virtual `dimensions` em `Posting` + migração aditiva única (`CREATE TABLE`
  ×3, **zero ALTER**) + `prisma generate`. **smoke-migration-gate sobre cópia do dev.db real** (precedente
  AP/AR: mesmo sendo CREATE TABLE puro, roda o gate — tabelas novas vazias, idempotência do ledger
  byte-idêntica).
- **Fase A — corpos (serial):**
  - **Fatia 1 — catálogo (golden ref AP/AR):** `models/Dimension.model.ts` (consts `DIMENSION_STATUSES`) →
    `dtos/DimensionDto.ts` Zod `.strict()` + `@openapi` (create definition, create value com `parentId?`,
    archive, list) → `repositories/DimensionRepository.ts` (tx-aware) → `policies/DimensionPolicy.ts` →
    `services/DimensionService.ts` (create def/value com **guarda de ciclo** + parent-same-definition,
    archive soft, listTree; audit in-tx). Testes: hierarquia válida/ciclo rejeitado, parent de outro eixo
    rejeitado, archive preserva vínculo histórico, tenancy isolada.
  - **Fatia 2 — captura no ledger:** estende `PostEntryLineSchema` (`dimensions?` opcional `.strict`) →
    `PostingRepository.create` (ou um `createPostingDimensions` tx-aware) → `PostingService.postEntry`
    resolve+valida (gate in-tx: value ACTIVE + folha + escopo + um-por-eixo) e grava `PostingDimension` na
    mesma tx. **Zero** mudança no cálculo `Σdébito=Σcrédito`. Testes: **ortogonalidade (ACC-024 — agregados
    por conta idênticos com/sem etiqueta)**; post com N eixos; duplo-valor-no-mesmo-eixo rejeitado (P2002 →
    erro claro); post sem etiqueta OK; estorno de partida etiquetada cascateia a ponte.
  - **Fatia 3 — leitura (golden ref INCR-4):** `PostingRepository.groupByAccountAndDimension` →
    `AccountingReportService` razão/balancete filtrável por dimensão (bucket "(sem dimensão)") + DRE por
    dimensão com rollup `parentId` → `controllers/dimensionReportController.ts` + DTO de query. Testes:
    recorte por valor, rollup pai-soma-filhos, bucket sem-dimensão, DRE por centro de custo bate com o DRE
    total quando somados todos os valores + sem-dimensão.
- **Fase B — registro (serial, `tsc` verde entre toques):** `routes/dimensions.ts` (catálogo CRUD) +
  `routes/dimensionReports.ts` → `routes/index.ts` → `middleware/auth.ts` (`protectedApiPaths` — furo
  tsc-cego que o wiring-gate REV-006 pega) → `factory.ts` → `docs.paths.ts` + `npm run docs:generate` +
  bump do `BASELINE` do openapi-paths.test.
- **Gates por fatia:** tsc×2 limpo; jest da fatia + suíte accounting; **review independente**
  (`reviewer-independence-separate-agent`); `skill-audit wiring`; openapi baseline; **smoke-migration-gate**
  → `SMOKE-MIGRATION-GATE-INCR-DIM.md`; merge via `loop-auto-merge-after-review`; browser sign-off humano
  (FE deferido).

## 5. FORKS — RATIFICADOS POR SINAL HUMANO EM REVISÃO FORK-A-FORK (2026-07-15)

> Ratificação coletada via AskUserQuestion (2026-07-15), em duas rodadas: **F0 (existencial) primeiro** —
> DIFERIR foi apresentado como recomendação de 1ª classe (o mapa segura o nó como YAGNI e não havia demanda),
> e o humano **decidiu construir a task completa**; depois **F1/F4/F5/F6** (design). **F2** foi fixado como
> default (partida/linha — cabeçalho é estritamente pior p/ "custo por projeto"). **Resultado: F0→CONSTRUIR,
> F1→(a), F2→(a), F3→ponte, F4→N, F5→(a), F6→(a).** Nenhum fork ficou aberto.

### F0 — Existencial (STEP-0 / gate YAGNI)  **[RATIFICADO → CONSTRUIR (build completa)]**
- (a) DIFERIR — recomendação apresentada (mapa segura como YAGNI, sem demanda na sessão). **Descartada pelo
  humano.**
- ✅ **CONSTRUIR, build completa (não MVP mínimo)** — sinal humano explícito: "vamos planejar a task
  completa". Abre F1–F6 e o plano §4.

### F1 — Catálogo de valores (STEP-0 §2.1)  **[RATIFICADO → (a) Prisma first-class]**
- ✅ **(a) `DimensionDefinition` + `DimensionValue` (parentId/rollup) + `PostingDimension`** — integridade e
  rótulos no mundo contábil, rollup hierárquico, é o nó que o mapa nomeia. NÃO é a torre §4 (multi-empresa),
  é catálogo de classificação gerencial. Escolhido sobre o espelho DynamicTable-ref porque a build completa
  pede hierarquia + integridade.
- (b) DynamicTable-ref + snapshot (espelho AR/AP F1) — descartada: rollup e integridade ficariam fracos.

### F2 — Ponto de vínculo  **[FIXADO default → (a) partida/linha]**
- ✅ **(a) `Posting` (linha)** — recorte por (conta × dimensão), padrão contábil; um lançamento multi-linha
  separa centros de custo por linha; é onde os relatórios já agrupam. (b) cabeçalho descartado (não separa
  linhas do mesmo lançamento).

### F3+F4 — Armazenamento + cardinalidade  **[RATIFICADO → ponte `PostingDimension` + N eixos]**
- ✅ **Tabela-ponte `PostingDimension` + N eixos** — `CREATE TABLE` puro (respeita zero-ALTER de AP/AR,
  **não** toca a tabela quente `postings`); suporta centro de custo **+** projeto **+** … na mesma linha.
  Custo aceito: relatório por join (Prisma `groupBy` não cruza a ponte) — D5.
- Coluna nullable em `postings` + 1 eixo — descartada (ALTER em tabela quente; contra "build completa").

### F5 — Enforcement  **[RATIFICADO → (a) sempre opcional]**
- ✅ **(a) Sempre opcional** — metadado livre; nunca bloqueia post; nunca toca balanceamento/período/audit.
  Não reabre §4.
- (b) Obrigatório por conta — **descartada**: reintroduz regra dirigida por dado (Motor de Regras §4); seria
  `DECISÃO ARQUITETURAL` própria, não feature.

### F6 — Escopo de leitura  **[RATIFICADO → (a) razão/balancete + DRE por dimensão]**
- ✅ **(a) Razão/balancete filtrável + DRE por dimensão** — realiza o gap "análise por dimensão" do Núcleo 4.
  Read-only, reusa `AccountingReportService`, rollup por `parentId`.
- (b) só razão/balancete — descartada (DRE por dimensão é o valor gerencial central). (c) só captura —
  descartada (etiqueta sem leitura = valor zero, cheiro "aceito-e-ignorado").

---

## 6. Riscos e vieses nomeados (T8)

1. **[verificado] Construir contra o YAGNI do mapa.** O mapa marcava YAGNI e não havia demanda declarada; o
   humano optou por construir a build completa. **Risco residual:** feature gerencial rica sobre demanda
   ainda não observada em produção. Mitigação: a etiqueta é **opcional** (F5) — nada quebra se ninguém
   etiquetar; o custo é a superfície de código, não risco de ledger. Nomeado e aceito por sinal humano.
2. **[verificado] Enforcement-por-conta era a única colisão §4** — descartado no F5→(a). Se algum dia se
   quiser "toda despesa exige centro de custo", é ADR próprio que reabre §4, não um ajuste deste módulo.
3. **[verificado] Etiqueta imutável = correção por estorno (D4).** Um centro de custo errado numa partida
   postada só se corrige estornando + re-postando (T5). Trade-off deliberado: consistência com "post é fato
   congelado" e zero superfície de mutação nova. **Custo de UX** nomeado; re-etiquetagem mutável (metadado,
   não dinheiro) é follow-up com ADR se a demanda aparecer.
4. **[verificado] Relatório por join, não groupBy nativo (D5).** A ponte (F3) impede o `groupBy` nativo; a
   leitura junta `posting_dimensions` (query/include+reduce). Escala SQLite atual comporta; se um dia o
   volume exigir, materializar por coluna é a saída — nomeada, não pré-construída (ponytail).
5. **[inferido] Ciclo/parent cross-eixo na árvore.** `DimensionValue.parentId` self-relation admite ciclo
   ou pai de outro eixo se não guardado — o gate in-tx da Fatia 1 (parent-same-definition + cycle-check) é o
   que **falharia** se essa suposição estivesse errada; teste obrigatório.
6. **[assumido] Ortogonalidade preservada (o invariante-mestre).** Assume-se que a etiqueta nunca altera o
   balanceamento; o teste ACC-024 (agregados por conta byte-idênticos com/sem etiqueta) é a checagem que
   falha se a etiqueta vazar para o cálculo. Sem esse teste, o módulo não fecha.

## 7. Checklist de invariantes (ACC) que a implementação DEVE provar

- **ACC-024 (ortogonalidade — o invariante-mestre):** postar com/sem etiqueta ⇒ **balancete/BP/DRE agregados
  por conta byte-idênticos**; `Σdébito=Σcrédito` inalterado (T4). Teste que falha se a etiqueta vazar para o
  cálculo de balanceamento.
- **ACC-025 (integridade do vínculo):** `@@unique([postingId,definitionId])` — no máx. 1 valor por eixo por
  linha; gate in-tx: value ACTIVE + folha + do escopo (T6, `tx` propagado). Teste: duplo-valor-mesmo-eixo
  rejeitado.
- **ACC-026 (árvore sã):** `parentId` do mesmo `definitionId` + **sem ciclo**; guarda in-tx na Fatia 1.
- **ACC-016/comandos:** catálogo por comandos (`/definitions`, `/values`, `/values/:id/archive`), nunca
  `PATCH status` cru; archive preserva vínculos históricos.
- **Invariantes de ledger intocados (T6/T7/T8):** período, numeração, idempotência (`sourceType+sourceId`),
  hash-chain — a etiqueta **não** é novo eixo de nenhum. 3 eventos de audit novos só p/ gestão de catálogo,
  in-tx.
- **Tenancy (T2):** `userId`+`unitId` nas 3 tabelas; sem torre §4. **Migração:** `CREATE TABLE` ×3, zero
  ALTER em `postings`; smoke-migration-gate sobre dev.db real. **DTO `.strict()`** rejeita chave de etiqueta
  desconhecida; `MAX_CENTS`/cents intactos (a dimensão não é dinheiro).

---

**RATIFICADO POR SINAL HUMANO EM REVISÃO FORK-A-FORK 2026-07-15** (F0→CONSTRUIR build completa; F1→(a)
catálogo Prisma; F2→(a) partida; F3→ponte + F4→N eixos; F5→(a) opcional; F6→(a) razão/balancete + DRE por
dimensão). A fase PRE-ADR está encerrada. **Próximo gate = Task de implementação** (cadeia Prisma por fatia,
§4 — golden refs AP/AR + INCR-4), não decisão de design. O nó do master map permanece ⚫ até a implementação
fechar; a promoção ⚫→✅ é o closeout da Task (ORCH-007), não deste ADR.
