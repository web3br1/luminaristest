# ADR-INCR9B — Seed/assistência do de-para referencial + importador do catálogo oficial RFB

- **Status:** **Proposed — FASE 1 (parecer + PLAN + ADR). NENHUM código escrito; nenhuma skill de geração roteada.** Follow-up natural do INCR-9 (destrava o item **diferido em D6** — "import do leiaute oficial diferido com o SPED"). A regra de uso do master map §1 proíbe rotear contra um nó diferido sem **ADR em disco + sinal humano** — este ADR é a metade "ADR em disco"; os **forks de escopo (§8) aguardam sinal humano**.
- **Date:** 2026-07-10
- **Decision class:** PRISMA_FIRST_CLASS (camada de compliance/de-para; nunca DynamicTable — Contrato §2.1, T3). **NÃO** muda valor de ledger — é descritiva, ao lado do plano de contas (igual INCR-9).
- **Depends on (tudo em `main`):** **INCR-9** (`ReferentialMapping` + `ReferentialMappingService.setMapping/coverage/listMappings` + gate in-tx ACC-011 + audit ACC-019 — este ADR **estende**, não recria), INCR-4 (padrão `mappingVersion`+diagnóstico), INCR-2 (`AuditService.append`), INCR-6 (máquina de import de arquivo — `parseTable`/job/artefato, reusável para o catálogo). Consumidores diretos do desbloqueio: **ADR-INCR-SPED-ECD** (coverage-gate D5) e **ADR-INCR-SPED-ECF** (coverage-gate D6 — o `3.3` sem código RFB é o bloqueador §5.1 nomeado lá).
- **Escopo (fonte):** este ADR + `docs/accounting/BE-INCR9B-referential-catalog-scope-brief.md` (PLAN) · **Roadmap:** `ACCOUNTING-MASTER-MAP.md` §5 (nó "Plano de Contas Referencial" ✅ INCR-9; este ADR entrega o **D6 diferido** — catálogo oficial + validação de pertinência).
- **Supersedes:** none · **Amends:** **ADR-INCR9 D6** (que deixou `referentialCode`/`label` como strings livres SEM catálogo/FK "diferido com o SPED") — este ADR é esse trabalho diferido; a Track B **adiciona** o catálogo e a validação de pertinência **sem** quebrar a shape existente (o de-para continua gravando `referentialCode`/`label` string; o catálogo é um lookup ao lado, não uma FK dura no MVP — ver D4/D9).

> **Nota de processo (T12).** ADR escrito **antes** do código: `PLAN → ADR → BRIEF → impl → test → review independente (worktree separado) → PR → smoke-migration-gate (se houver migração) → closeout → memória`. **Altitude desta FASE 1:** decisões de **escopo/estrutura**; a transcrição **campo-a-campo do leiaute referencial oficial** (colunas/tamanhos do arquivo RFB de contas referenciais) é **FASE 2** — mesma disciplina I052 da ECD/ECF (§7). Divergências vs. o brief de entrada marcadas **[REFINA O BRIEF]**.

---

## 1. Contexto

**O gate que trava.** `ReferentialMappingService.coverage(version)` (INCR-9, chart-driven) devolve `ready = unmappedAccounts.length === 0`, onde o universo é **toda conta-folha ativa** (`acceptsEntries && deletedAt:null`) do plano no escopo. `SpedGenerationService.generate()` e a futura geração ECF **falham fechado** (`ValidationError`) enquanto `ready === false`. Hoje, num tenant recém-criado, **zero** `ReferentialMapping` existe ⇒ `ready` é **sempre falso** ⇒ ECD/ECF **não geram**. O caso nominal do bloqueio é `3.3 Receita de Revenda de Mercadorias` (adicionada no PR #66, nasce não-mapeada — comportamento **correto** do gate chart-driven), mas na prática **todas** as ~12 folhas canônicas (+ quaisquer contas customizadas do tenant) estão sem código.

**O que a indústria automatiza (validado por pesquisa — Domínio, Contmatic, Questor, Sienge, Senior, CIGAM, IOB).** O de-para plano-interno→plano-referencial-RFB é um problema **universal** do SPED, resolvido como **"de-para assistido, confirmado por humano — nunca match 100% automático"**. O que os ERPs automatizam: **(a)** importar o **catálogo referencial oficial** que a RFB publica (planos referenciais versionados por tipo de entidade e ano-calendário, nas "tabelas dinâmicas do SPED"); **(b)** de-para **em lote**; **(c)** **cópia** da versão do ano anterior ("herança de ano"); **(d)** filtros de já-vinculado/inativo. O que permanece **humano**: a **decisão conta→código** (errar = SPED rejeitado / risco fiscal). Regra RFB: só contas **analíticas** mapeiam, e a conta referencial de **destino** também tem de ser **analítica**.

**O que INCR-9 já entregou (reuso, não recriação — CBM-001, código lido):** `ReferentialMapping` (Prisma first-class, `@@unique([userId,unitId,accountId,mappingVersion])`, sem `deletedAt`), `setMapping` (gate in-tx: Account **existe+ativo+folha**, ACC-011; audit na mesma tx, ACC-019), `unsetMapping`, `listMappings(version)`, `coverage(version)` (chart-driven). O lado **interno** do de-para (só folha mapeia — INCR-9 D4) **já é validado**. **O que falta** e o INCR-9 D6 deixou explicitamente diferido: o **catálogo oficial** (para validar/lookup o lado de **destino**) e as ergonomias de autoria em lote.

**A distinção que decide o design desta FASE 1 (grau VERIFICADO por leitura do gate):** o `coverage` é **binário** — uma conta está "mapeada" se existe **qualquer** `ReferentialMapping` para ela na versão, **independente do código ser um código RFB real** (D6 do INCR-9: sem catálogo, `referentialCode` é string livre não-validada). **Consequência dura:** semear o de-para com **códigos-placeholder** para "destravar o gate" produziria `ready === true` **FALSO** e deixaria ECD/ECF gerarem com **códigos-lixo** → rejeição no PVA na melhor hipótese, **erro fiscal** na pior. Portanto **o desbloqueio do gate NÃO é um ato de código — é um dado que só o humano/contador provê.** O código desta FASE só pode entregar **assistência** (esqueleto de autoria + catálogo de lookup + validação de pertinência); jamais preencher código por conta própria. Ver D1 (o guarda-corpo-mãe) e §7 (risco).

---

## 2. O que muda vs. INCR-9 (o núcleo do parecer)

| Eixo | INCR-9 (mergeado) | INCR-9B (este ADR) |
|---|---|---|
| **Lado interno do de-para** | Validado (só folha mapeia, ACC-011 in-tx) | Reusado sem mudança |
| **Lado de destino (código RFB)** | String livre, **não** validada (D6 sem catálogo) | **Validável** contra catálogo oficial — analítico + existe na versão (Track B) |
| **Origem dos códigos** | Humano digita 1-a-1 (`PUT /referential/mappings`) | Humano **seleciona** de catálogo + **em lote** + **copia do ano anterior** (assistência) |
| **Catálogo oficial RFB** | Ausente (D6 diferido) | **Importado** de arquivo oficial → `ReferentialAccount` (Track B) |
| **Esqueleto de autoria** | `coverage().unmappedAccounts` (já lista os pendentes) | Reusado como fonte do template/lote (D5) |
| **O gate `coverage.ready`** | Fecha só com todas as folhas mapeadas | **Inalterado** — nunca auto-destravado por código (D1) |

**Ponto de reuso máximo:** `coverage().unmappedAccounts[]` **já é** o esqueleto do de-para (lista as folhas ativas pendentes, ordenadas por `code`, com `nature`). O INCR-9B **não inventa** um novo enumerador — consome esse. O trabalho novo é **(1)** o catálogo de destino (Track B) e **(2)** as ergonomias de lote/cópia (Track A).

---

## 3. As decisões

### D1 — O gate `coverage.ready` **NUNCA** é destravado por código; semear código-placeholder é PROIBIDO  **[guarda-corpo-mãe — REFINA O BRIEF]**
**Decisão:** nenhum passo do INCR-9B grava um `ReferentialMapping` com código **inventado, placeholder ou heurístico**. O código entrega **assistência** (esqueleto + catálogo + validação); o **valor** de cada código RFB é **input humano/contador**. `coverage.ready` só vira `true` quando um humano preencheu códigos **reais** — exatamente como hoje, mas ergonômico.

**Por quê:** o `coverage` é binário e **não valida o conteúdo** do código (INCR-9 D6). Um placeholder produziria `ready===true` **falso** → ECD/ECF gerariam com lixo fiscal. É a mesma classe da lição **I052** (não fixar conteúdo de compliance de memória). **Descartado:** "semear o de-para para destravar" — viola o fail-closed que é o propósito do gate; seria um bug fiscal silencioso, não uma feature.

> **Corolário operacional:** o desbloqueio **já é possível HOJE** sem o INCR-9B — um contador faz ~12 `PUT /referential/mappings` (rota do INCR-9) com os códigos reais. **O INCR-9B não é pré-requisito para destravar; é a ferramenta que torna esse ato rápido, em lote e à prova de código-inválido.** Isso reprecifica o fork de escopo (§8).

### D2 — Escopo em **DUAS tracks**; a divisão A/B é **sinal humano** (§8)  **[FORK]**
**Decisão (proposta, a ratificar):** o trabalho parte em duas tracks compostáveis:
- **Track A — Autoria assistida (zero-migração):** estende `ReferentialMappingService` com **(a)** `setMappingsBatch` (de-para em lote numa tx), **(b)** `copyMappingsFromVersion(fromVersion, toVersion)` ("herança de ano anterior" da indústria), **(c)** exposição do **esqueleto** = `coverage().unmappedAccounts` como payload de autoria (já existe; só rota/serialização). **Reusa** `ReferentialMapping` — **sem** model novo, **sem** migração. Destrava o **workflow** do contador; o código RFB continua string livre (D6 do INCR-9 intocado).
- **Track B — Catálogo oficial RFB (migração + import):** novo model **`ReferentialAccount`** (catálogo do leiaute referencial, Prisma first-class) + importador do **arquivo oficial** RFB; habilita **validação de pertinência do destino** (D3), **auto-fill do `label`** (D9) e o **lookup/picker**. É o item **diferido em D6 do INCR-9**.

**Por quê:** A é o subconjunto ergonômico barato; B é o que adiciona o **invariante de domínio** que o pedido nomeia ("validação analítica-only nos DOIS lados") — e B **é o único** jeito de validar o destino sem **hardcodar** quais códigos RFB são folha (o que seria a armadilha I052). Recomendação (§8): **B é necessário para o terceiro entregável do pedido**; encená-las (A primeiro, B depois) dá vitória rápida sem migração e isola o risco alto (migração + parsing de arquivo externo) num PR próprio. **Descartado:** um único incremento monolítico A+B — infla o blast radius do PR e mistura zero-migração com migração+parsing.

### D3 — Analytic-only nos **DOIS** lados; o lado de **destino** só é validável com o catálogo (Track B)  **[REFINA O BRIEF]**
**Decisão:** (i) **lado interno** — só `acceptsEntries=true` mapeia: **já validado** no INCR-9 (`setMapping` rejeita conta sintética, ACC-011 in-tx). Reusado sem mudança. (ii) **lado de destino** — o `referentialCode` tem de apontar para uma conta referencial **analítica** do catálogo oficial. Isso **exige** o catálogo (Track B): a validação é "existe um `ReferentialAccount` com esse `code` na `layoutVersion` **e** ele é analítico". **Sem** Track B, o destino permanece string livre não-validada (estado INCR-9 D6) — a validação analytic-only-destino **não é entregável na Track A**.

**Por quê:** a hierarquia do plano referencial (quais códigos são sintéticos vs analíticos) é **dado do leiaute oficial**, não conhecimento do agente. Hardcodar "código X é folha" seria **inventar layout** = lição I052. Só o catálogo importado (transcrição do arquivo oficial) carrega essa verdade. **Descartado:** validar analytic-only-destino por regra de prefixo/heurística sem catálogo — I052; e validar contra um catálogo **inventado** — idem.

### D4 — `ReferentialAccount` é **dado externo GLOBAL versionado por leiaute**, NÃO self-seed por escopo  **[REFINA O BRIEF — difere do chart]**
**Decisão:** o catálogo (Track B) é uma tabela de **referência compartilhada** — **sem** `userId`/`unitId` (o leiaute referencial da RFB é o mesmo para todos os tenants). Chave `@@unique([layoutVersion, code])`; campos mínimos `layoutVersion`, `code`, `name`, `isAnalytic` (folha do plano referencial), opcional `parentCode` (a árvore do referencial, se o arquivo trouxer). Semeado por **importação do arquivo oficial** (uma vez por leiaute/ano), **não** por `ensureChartOfAccounts` per-scope.

**Por quê:** o chart interno é **per-tenant** (cada um tem o seu) e cabe num fixture de ~12 linhas em código; o catálogo referencial é **externo, único, com centenas/milhares de linhas que mudam por ano** ⇒ é **dado importado**, não fixture-em-código nem seed-por-escopo. Modelá-lo per-scope duplicaria a mesma tabela oficial em cada tenant sem ganho. **Descartado:** (a) fixture em código como `CANONICAL_ACCOUNTS` — o leiaute referencial não é ~12 linhas e não é nosso para transcrever a mão sem o arquivo; (b) self-seed per-scope — dado global não é per-tenant.

### D5 — Esqueleto/lote são **CHART-DRIVEN** (reusam `coverage`), NUNCA fixture-driven off `CANONICAL_ACCOUNTS`  **[REFINA O BRIEF — corrige "~12 canônicas"]**
**Decisão:** a fonte das contas que precisam de código é `coverage(version).unmappedAccounts` — **não** `CANONICAL_ACCOUNTS`. O esqueleto/lote enumera **toda folha ativa não-mapeada**, canônica **ou customizada**.

**Por quê:** o app permite **contas customizadas** além das ~12 canônicas (verificado no domínio do INCR-9 D3), e o `coverage` já é chart-driven exatamente por isso — uma conta-folha customizada sem código **também** trava o gate. Semear só as ~12 canônicas deixaria o gate travado em tenants com plano estendido, e reintroduziria o erro que o INCR-9 D3 já resolveu. **Descartado:** iterar `CANONICAL_ACCOUNTS` — subconjunto incompleto do universo real; o enumerador correto (`coverage`) já existe.

### D6 — "Herança de ano anterior" = **cópia em lote** `copyMappingsFromVersion`, re-snapshot do `label`; sem novo invariante
**Decisão:** `copyMappingsFromVersion(from, to)` lê os mapeamentos da versão `from` e faz `setMapping` (upsert) de cada um na versão `to`, numa tx. O `label` é **re-snapshotado** (com catálogo: revalidado/atualizado do `ReferentialAccount` da `to`; sem catálogo: copiado literal). É a mecânica industrial de "copiar a vinculação do ano anterior; humano revisa o delta".

**Por quê:** reuso puro de `setMapping` (gate + audit já corretos, ACC-011/019); o versionamento por `mappingVersion` (INCR-9 D2) foi desenhado para exatamente coexistir `v2025`/`v2026`. **Descartado:** copiar por SQL bruto fora do service — furaria o gate in-tx e a auditoria (ACC-012).

### D7 — `mappingVersion` de partida + relação ECD×ECF referencial = **PENDENTE-VERIFICAR (humano/contador + leiaute)**
**Decisão:** o INCR-9B **não fixa** o valor da `mappingVersion` de partida nem afirma que ECD e ECF compartilham o mesmo plano referencial. Propõe como **default a confirmar**: `mappingVersion` = o ano-calendário do leiaute oficial baixado (ex.: `"2025"` ou `"2026"`), e registra que a **ECF pode exigir um chart/versão referencial distinto** do referencial contábil da **ECD** (herdado do PENDENTE-VERIFICAR **ECF-7** do ADR-INCR-SPED-ECF). O `mappingVersion` é string livre (INCR-9 D1) e comporta ambos (`"2025"`, `"ECF-2025"`).

**Por quê:** qual leiaute/ano se aplica e se ECD/ECF partilham referencial é **compliance**, não decisão de engenharia — errar é risco fiscal (I052). **Descartado:** hardcodar `"2026"` no código — versão é dado, não schema (mesma razão do INCR-9 D1).

### D8 — Escrita em lote mantém o **gate in-tx + audit** do INCR-9 (ACC-011/012/019); atomicidade do lote é **sinal humano menor** (§8)  **[FORK menor]**
**Decisão:** `setMappingsBatch`/`copyMappingsFromVersion` abrem **uma** `runTransaction` e, para cada item, re-afirmam o gate (Account ativo+folha in-tx) e gravam audit na mesma tx — reuso integral do padrão `setMapping`. **A ratificar (menor):** o lote é **all-or-nothing** (uma tx; um item inválido aborta tudo) **ou** **best-effort com relatório** (itens válidos passam, inválidos voltam num sumário). Recomendação: **all-or-nothing** (atômico, previsível, casa com o gate fail-closed; o esqueleto já filtrou os elegíveis).

**Por quê:** o gate ACC-011 é sobre invariante **mutável** (a conta pode ser soft-deletada concorrente ao lote) — tem de estar in-tx por item; propagar `tx` a todo método (ACC-012) é inegociável. **Descartado:** lote fora de tx / preflight só — TOCTOU `map × softDelete` (INCR-9 D8).

### D9 — `label` continua **denormalizado**; com catálogo, é **auto-preenchido/validado** mas ainda snapshotado (não vira FK dura)
**Decisão:** o `ReferentialMapping.label` permanece **snapshot denormalizado por versão** (INCR-9 D6 — correto para ECD histórica: `v2025` preserva o rótulo vigente em 2025). Com Track B, o `label` passa a ser **auto-preenchido a partir do `ReferentialAccount`** no momento do set e o `referentialCode` **validado** contra o catálogo; **não** se troca a coluna por uma FK dura a `ReferentialAccount` no MVP.

**Por quê:** manter a denormalização preserva a semântica histórica que o INCR-9 D6 escolheu de propósito, e evita acoplar a integridade do de-para (que tem de sobreviver a um catálogo re-importado/corrigido) a uma FK que poderia quebrar em cascata. A validação "código existe+analítico na versão" é feita **no set** (checagem de leitura), não por constraint de banco. **Descartado:** FK `referentialAccountId` dura no `ReferentialMapping` — acoplaria o histórico ao catálogo mutável e forçaria migração de dados nos mapeamentos existentes do INCR-9.

### D10 — O que **NÃO** automatizar (fronteira humano×código, explícita)
**Decisão — permanecem humanos, por design:**
1. **A decisão conta→código** (nunca auto-match por nome/heurística/IA).
2. **O valor de cada código RFB** — inclusive o da `3.3` (o bloqueador §5.1 do ECF) — é digitado/selecionado por **contador**.
3. **Flipar `coverage.ready`** — só acontece como efeito de códigos reais preenchidos (D1).
4. **A escolha do leiaute/ano** (`mappingVersion`) e se ECD/ECF partilham referencial (D7).
5. **A "herança sintética→analítica" como decisão** — a cópia (D6) e o lote são **conveniências de digitação**; nenhuma **infere** o código de uma conta a partir do pai. (A árvore `parentCode` do catálogo, se importada, serve só ao **picker/validação**, nunca a preencher o de-para sozinha.)

**Por quê:** é o consenso da indústria (de-para assistido, confirmado por humano) e o guarda contra risco fiscal. **Descartado:** qualquer auto-sugestão que **grave** um código sem confirmação humana.

---

## 4. Modelo Prisma (só Track B — sujeito ao smoke-migration-gate)

```prisma
// Catálogo do plano de contas REFERENCIAL oficial da RFB (BE-INCR-9B / ADR-INCR9B, Track B).
// Dado EXTERNO GLOBAL versionado por leiaute — NÃO tem tenancy (userId/unitId): o leiaute é o
// mesmo para todos os tenants (D4). Semeado por IMPORTAÇÃO do arquivo oficial (D4), nunca inventado
// nem self-seed per-scope. Serve de LOOKUP e VALIDAÇÃO de pertinência do lado de destino do de-para
// (D3); o de-para em si (ReferentialMapping, INCR-9) continua gravando referentialCode/label string,
// SEM FK dura a esta tabela (D9). Campos exatos (colunas do arquivo oficial) = FASE 2, campo-a-campo.
model ReferentialAccount {
  id            String   @id @default(cuid())
  layoutVersion String   // leiaute/ano-calendário do plano referencial RFB (casa com mappingVersion — D7)
  code          String   // código da conta referencial RFB
  name          String   // nome oficial da conta referencial
  isAnalytic    Boolean  // true = folha (só analítica é destino válido do de-para — D3)
  parentCode    String?  // árvore do referencial, se o arquivo trouxer (só picker/validação — D10)
  createdAt     DateTime @default(now())

  @@unique([layoutVersion, code]) // idempotência do import + lookup por (versão, código)
  @@index([layoutVersion, isAnalytic])
  @@map("referential_accounts")
}
```

**Migração (Track B):** aditiva — `CREATE TABLE referential_accounts` + índices. **Zero ALTER** em tabelas existentes (o `ReferentialMapping` do INCR-9 **não** ganha coluna — D9). Tabela nova vazia até o import → blast radius mínimo. **Track A não tem migração.**

---

## 5. Superfície de API (proposta)

**Track A (zero-migração) — estende `/api/accounting/referential/*` (3-toques, OpenAPI):**

| Método | Rota | Policy | Efeito |
|---|---|---|---|
| `GET` | `/referential/skeleton?version=` | `canReadReferential` | esqueleto de autoria = `coverage().unmappedAccounts` (folhas ativas pendentes) — chart-driven (D5) |
| `PUT` | `/referential/mappings/batch` | `canManageReferential` | de-para em lote numa tx (D8) — reusa gate+audit do `setMapping` |
| `POST` | `/referential/mappings/copy` | `canManageReferential` | `copyMappingsFromVersion(from, to)` — herança de ano (D6) |

**Track B (migração) — catálogo:**

| Método | Rota | Policy | Efeito |
|---|---|---|---|
| `POST` | `/referential/catalog/import` | `canManageReferential` | importa o arquivo oficial RFB → `ReferentialAccount` (idempotente por `@@unique[layoutVersion,code]`) |
| `GET` | `/referential/catalog?version=&q=` | `canReadReferential` | lookup/picker de códigos analíticos da versão (D3/D10) |

(`canRead/ManageReferential` já existem — INCR-9.) Rotas finais e formato do arquivo de import = FASE 2 (§6/§7).

---

## 6. PENDENTE-VERIFICAR (contra o leiaute oficial — **FASE 2**, não chutar)

> Equivalentes-9B dos PVA-1..7 da ECD. **Nenhum resolvido nesta FASE 1.** Lição **I052**: não fixar layout de compliance de memória.

- **9B-1 (fonte do catálogo):** identificar o **arquivo/tabela dinâmica** oficial do plano referencial RFB para o ano-alvo (ECD e/ou ECF), seu **formato** (pipe/posicional/CSV das tabelas dinâmicas do SPED) e as **colunas** (código, nome, indicador de analítica, pai). Baixar do gov.br, extrair, transcrever campo-a-campo (mesmo procedimento ECD/ECF).
- **9B-2 (tipo de entidade):** o referencial é versionado por **tipo** (PJ geral / financeiras / seguradoras / imunes-isentas) além do ano — confirmar qual se aplica ao público-alvo e se `layoutVersion` precisa codificar o tipo além do ano.
- **9B-3 (ECD × ECF):** confirmar se ECD (I051) e ECF (J051/K) usam o **mesmo** plano referencial ou charts distintos (herda ECF-7 do ADR-INCR-SPED-ECF) — decide se há 1 ou 2 `layoutVersion`.
- **9B-4 (analítica de destino):** confirmar como o arquivo oficial marca conta **analítica vs sintética** (a coluna que alimenta `isAnalytic` — D3), e a regra exata de "destino tem de ser analítico".
- **9B-5 (encoding/parse):** encoding do arquivo oficial (Latin-1?) e terminador — não assumir paridade com nada.

---

## 7. Residual honesto + riscos/vieses do próprio parecer (nomeados)

**Residual honesto (registrado, não bloqueia a FASE 2 quando destravada):**
- **O valor de cada código RFB (inclusive `3.3`) = input humano/contador** — o INCR-9B **não** o fornece (D1/D10). O desbloqueio real de ECD/ECF depende desse ato humano, com ou sem o INCR-9B.
- **PVA-pass real = sign-off humano** no PVA da RFB (fora deste ambiente).
- **Pré-req operacional de ambiente (Track B, FASE 2):** o client Prisma local está **stale (pré-INCR-9)** e `prisma generate` está **quebrado** (mismatch de versão em `node_modules`) — a migração/geração da Track B exige **`npm ci` no worktree** e um `prisma generate` sadio antes de qualquer validação local (memória `worktree-deps-stale-prisma-client`). Não afeta planejar; trava impl/validação local.

**Riscos/vieses deste parecer (grau declarado):**
- **[VIÉS — o mais importante] Tentação de "destravar o gate semeando o de-para".** Seria um **bug fiscal** (D1): `coverage` não valida conteúdo, então placeholders dão `ready` falso. Nomeado e barrado em D1; é o eixo do parecer.
- **[VIÉS — INFERIDO, alto risco] Qualquer código RFB específico neste ADR seria conhecimento de domínio, não transcrição.** Por isso **este ADR não escreve nenhum código RFB** (nem "3.3 = 3.01.xx"). O catálogo os traz por **importação do arquivo oficial** (transcrição), nunca por invenção. Mesma superfície da lição **I052**.
- **[INFERIDO] Formato/fonte do catálogo oficial** (§6) é conhecimento de domínio fiscal a confirmar na FASE 2 — a estrutura de `ReferentialAccount` (D4) é o **esqueleto mínimo inferido**, não a transcrição das colunas do arquivo.
- **[ASSUMIDO] ECD e ECF podem exigir referenciais distintos** (D7/9B-3) — se compartilharem, uma `layoutVersion` basta; se não, o modelo já comporta (string livre), mas o **import** roda 2×.
- **[VERIFICADO, de escopo] O gate desbloqueia por dado humano, não por este incremento** — o INCR-9B é ergonomia+segurança do ato humano, não o ato. Honestidade de escopo contra inflar o valor da entrega.

---

## 8. Sinal humano — FORKS A RATIFICAR (destravam a FASE 2)

**Bloqueadores de DECISÃO (só o humano decide — não roteável sem isto):**

1. **🔵 [ESCOPO — o fork principal] UM incremento ou DOIS?**
   - **Track A só** (autoria em lote + esqueleto + cópia-de-ano; **zero-migração**): destrava o **workflow** do contador rápido; o código RFB fica string livre não-validada; **não** entrega a "validação analytic-only nos DOIS lados" do pedido.
   - **Track A + Track B** (catálogo oficial + validação de pertinência; **com migração + parsing de arquivo externo**): entrega o pedido inteiro, incluindo a validação de destino; é o padrão de todo ERP-BR; risco/esforço maiores (migração + FASE 2 de transcrição do leiaute).
   - **Recomendação:** **A+B, encenados** — A primeiro (PR curto, zero-migração, vitória ergonômica), B depois (PR com migração+import, isolado). **B é necessário** para o 3º entregável (analytic-only-destino, D3); A sozinho **não** o cobre. **Mas** se o único objetivo agora é *destravar ECD/ECF*, nem A é estritamente necessário (D1 corolário: 12 `PUT` do INCR-9 já bastam) — então a escolha é sobre **quanta ergonomia/segurança de autoria** se quer construir, não sobre "conseguir gerar".

2. **🔵 [ESCOPO] De onde vêm os VALORES dos códigos RFB — confirmado como HUMANO?** O ADR **não** inventa códigos (D1/D10). O esqueleto entrega as contas + a coluna vazia; o **contador** preenche do leiaute oficial (via lote/picker). Ratificar que essa fronteira é aceita (o produto **não** promete auto-de-para).

3. **🔵 [DADO — trava geração real, não a FASE 2] Código referencial da `3.3`** (e das demais folhas): é o bloqueador §5.1 do ADR-INCR-SPED-ECF. Continua **input humano/contador**; o INCR-9B só torna o preenchimento ergonômico/validado.

**Forks menores (podem ser confirmados no arranque da FASE 2):**
- **[D7] `mappingVersion` de partida** (`"2025"`? `"2026"`? `"ECF-2026"`?) e se **ECD/ECF partilham** o referencial (§6 9B-3).
- **[D8] Atomicidade do lote:** all-or-nothing (recomendado) vs best-effort-com-relatório.

> **Pergunta-de-sinal-humano exata para destravar a FASE 2 (impl):**
> **"Track A só (zero-migração, autoria em lote) ou A+B (com o catálogo oficial RFB + validação analytic-only de destino, com migração)? E confirma que o VALOR de cada código RFB — inclusive o da 3.3 — é preenchido por contador (o produto não faz auto-de-para)?"**
> Ratificado isso, o **Passo 0 da FASE 2** (baixar/transcrever o leiaute referencial oficial — §6) pode iniciar; ele **não** depende do valor dos códigos, só do arquivo oficial.
