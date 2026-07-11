# BE-INCR-9B — PLAN + parecer de domínio (seed/assistência do de-para referencial + catálogo oficial RFB)

- **Status:** **FASE 1 — PLAN + parecer + ADR. NÃO implementar. NÃO rotear ao implementer.** Aguarda sinal humano nos forks (§Forks).
- **Date:** 2026-07-10
- **ADR:** `docs/adr/ADR-INCR9B-referential-catalog-seed.md` (decisões D1–D10, forks §8, PENDENTE-VERIFICAR §6).
- **Objetivo:** entregar a **assistência** ao de-para plano-interno→código-RFB (esqueleto de autoria + de-para em lote + cópia-de-ano + catálogo oficial + validação analytic-only de destino), destravando com **segurança** o coverage-gate que hoje trava ECD/ECF pela `3.3` (e demais folhas) sem código RFB. **Follow-up do item diferido em D6 do INCR-9.**

---

## PARECER DE DOMÍNIO CONTÁBIL — BE-INCR-9B

**Bloco do roadmap:** 7 compliance (SPED/ECD/ECF readiness — plano referencial).
**Já existe no projeto?** SIM, a **metade interna**: INCR-9 (mergeado, PR #58) entregou `ReferentialMapping` + `ReferentialMappingService.setMapping/unsetMapping/listMappings/coverage` com gate in-tx (ACC-011) + audit (ACC-019) e cobertura **chart-driven** (D3). O INCR-9B **estende** isto — não recria. O item diferido explícito é o **catálogo oficial** (INCR-9 D6: "import do leiaute oficial diferido com o SPED").
**Colisão com decisão commitada?** **NÃO.** Não reabre torre multiempresa (§4 do map), Postgres, nem DynamicTable-para-contábil. **Amenda** o INCR-9 D6 (adiciona catálogo) **sem** quebrar a shape do de-para (o `ReferentialMapping` não muda — ADR D9). Nó do map = §5 "Plano de Contas Referencial" (✅ INCR-9); este entrega o D6 diferido.

### Invariantes que o plano DEVE garantir
- **[ACC-011] Gate in-tx no lote:** `setMappingsBatch`/`copyMappingsFromVersion` re-afirmam **por item, dentro da tx**, que a conta interna está **ativa+folha** (a conta pode ser soft-deletada concorrente ao lote). Reuso integral do padrão `setMapping`. (ADR D8)
- **[ACC-012] `tx` propagado** a todo método de repo dentro do bloco do lote — nada de tx aparente.
- **[ACC-019] Audit na mesma tx** de cada set/copy (rollback junto). O de-para não tem `deletedAt` (INCR-9 D5); a trilha é o AuditEvent.
- **[ACC-021 — análogo] Cobertura/esqueleto é chart-driven, NÃO balance-driven** (INCR-9 D3): o esqueleto vem de `coverage().unmappedAccounts` (toda folha ativa, canônica **ou customizada** — ADR D5), nunca de `CANONICAL_ACCOUNTS` nem filtrado por posting.
- **[GUARDA-CORPO-MÃE — ADR D1] Nenhum código RFB inventado/placeholder é gravado.** `coverage.ready` nunca é auto-destravado; o valor do código é input humano. Um teste de domínio DEVE provar que nenhum passo do 9B grava mapeamento com código não fornecido por humano.
- **Analytic-only nos DOIS lados (ADR D3):** interno já validado (INCR-9); **destino** só validável com o catálogo (Track B) — "existe `ReferentialAccount` analítico na versão". Sem catálogo, o destino fica string livre (estado INCR-9 D6).

### Tradução do doc aspiracional → realidade do projeto
- "Semear o de-para para destravar o gate" → **PROIBIDO** (ADR D1): `coverage` é binário e não valida conteúdo; placeholder = `ready` falso = bug fiscal. Só assistência, nunca valores.
- "Seed do de-para canônico" (framing do pedido, "~12 contas") → **chart-driven via `coverage`** (ADR D5): inclui contas customizadas; `CANONICAL_ACCOUNTS` é subconjunto incompleto.
- "Catálogo como fixture/self-seed (como o chart)" → **NÃO** (ADR D4): o referencial RFB é **dado externo global versionado**, importado de arquivo oficial; sem tenancy, não é fixture-em-código nem self-seed per-scope.
- "Herança sintética→analítica" → **conveniência de autoria** (cópia-de-ano D6 + picker), **nunca** inferência que grava código sozinha (ADR D10).

### Recomendação de roteamento (o orquestrador decide as skills — abaixo)
- **Prisma first-class** (catálogo = `ReferentialAccount`) — nunca DynamicTable. Track A é extensão de service/dto/controller/route sobre o `ReferentialMapping` existente (sem model).
- **Gates de teste de domínio obrigatórios:**
  - **D1:** nenhum mapeamento gravado sem código humano; `coverage.ready` não vira `true` por efeito de seed.
  - **D5:** esqueleto/lote incluem uma **conta-folha customizada** não-mapeada (não só canônicas); conta sintética **não** aparece; conta mapeada some.
  - **D8:** lote com um item de conta **soft-deletada** → aborta **dentro da tx** (all-or-nothing), nada órfão persiste; audit reverte junto.
  - **D6:** `copyMappingsFromVersion(v2025→v2026)` replica os pares; `v2025` intacta; re-run idempotente (upsert, sem P2002).
  - **Track B/D3:** set com código **sintético** do catálogo → rejeitado; com código **inexistente** na versão → rejeitado; import idempotente por `@@unique[layoutVersion,code]`.
  - **Track B/D9:** `label` auto-preenchido do catálogo mas gravado como **snapshot** (re-import/correção do catálogo não muta mapeamentos já gravados).

### Riscos de domínio
- **I052-análogo (alto):** qualquer código RFB no código-fonte seria domínio, não transcrição → o ADR não escreve nenhum; catálogo por import (FASE 2 transcreve o arquivo oficial).
- **Migração (Track B):** tabela nova aditiva (0 ALTER) → **smoke-migration-gate** sobre backup do `dev.db` real. **Pré-req operacional:** client Prisma stale + `prisma generate` quebrado no worktree → `npm ci` antes de migrar/validar (memória `worktree-deps-stale-prisma-client`).
- **Parsing de arquivo externo (Track B):** encoding/formato do leiaute oficial = FASE 2 (§6 do ADR), classe-de-risco posicional (UTC-shift/encoding) herdada de ECD/OFX/CNAB.

`PARECER PRONTO.`

---

## PLANO DE EXECUÇÃO — BE-INCR-9B (para quando o humano ratificar o escopo)

**Tarefa:** seed/assistência do de-para referencial + importador do catálogo oficial RFB + validação analytic-only nos dois lados; destravar (com segurança) o coverage-gate ECD/ECF.
**Intenção:** dar ao contador as ergonomias que todo ERP-BR tem (esqueleto, lote, cópia-de-ano, catálogo com picker+validação) **sem** o produto jamais inventar código fiscal. Não é gerar o SPED (isso é ECD/ECF, já planejados) — é tornar o **pré-requisito de dado** rápido e à prova de código-inválido.
**Risco:** Track A = **Medium** (extensão de service/rota, zero-migração). Track B = **High** (novo model + migração + parsing de arquivo externo).
**Branch recomendada:** `feature/be-incr9b-referential-*` (uma por track se encenar A→B).

### Passos — Track A (autoria assistida, ZERO-migração) — só rodar após ratificar §Forks-1

| # | Skill | Argumentos | Arquivos esperados | Motivo |
|---|---|---|---|---|
| A1 | codebase-memory (evidência) | `search_graph`/`semantic_query` sobre `ReferentialMappingService`, `coverage`, `setMapping` | — | Confirmar o canônico a estender (anti-ilha); localizar; evidência = código (CBM-001) |
| A2 | backend-dto-generator | `ReferentialMapping` (batch/copy/skeleton query) | `dtos/ReferentialMappingDto.ts` (estende: `BatchSetReferentialMappingSchema`, `CopyReferentialMappingSchema`) | DTOs `.strict()` do lote/cópia (reusa `idLike`/`shortText` existentes) |
| A3 | backend-service-generator | `ReferentialMappingService` (métodos novos) | edita `services/ReferentialMappingService.ts` + `repositories/ReferentialMappingRepository.ts` (+ interface) | `setMappingsBatch` (1 tx, gate+audit por item), `copyMappingsFromVersion`, `getSkeleton`=`coverage().unmappedAccounts` |
| A4 | backend-controller-generator | `referential` (handlers novos) | edita `controllers/*ReferentialController.ts` | Zod-guard + `handleApiError` para batch/copy/skeleton |
| A5 | backend-route-generator | `referential` (3-toques + OpenAPI) | edita `routes/*.ts` + registro | `GET /skeleton`, `PUT /mappings/batch`, `POST /mappings/copy` |
| A6 | backend-test-suite-generator | `service ReferentialMapping` | `services/__tests__/ReferentialMappingService.test.ts` (novos casos) | Gates de domínio D1/D5/D6/D8 acima |

### Passos — Track B (catálogo oficial RFB, MIGRAÇÃO) — só rodar após ratificar §Forks-1 = A+B

| # | Skill | Argumentos | Arquivos esperados | Motivo |
|---|---|---|---|---|
| B0 | **FASE 2 — transcrição** (humano+agente, não-skill) | baixar leiaute referencial oficial RFB; transcrever colunas (§6 do ADR) | nota de transcrição em `docs/accounting/` | I052: não fixar layout de memória; define os campos reais de `ReferentialAccount` |
| B1 | backend-prisma-model-generator | `ReferentialAccount` (`@@unique[layoutVersion,code]`, sem tenancy — D4) | `schema.prisma` + migração aditiva | Catálogo global versionado; **High** — confirm manual |
| B2 | backend-repository-generator | `ReferentialAccount` | `repositories/ReferentialAccountRepository.ts` (+ interface) | Acesso Prisma isolado; upsert idempotente por `@@unique` |
| B3 | job-generator **ou** structured-data-generator | importador do arquivo oficial → `ReferentialAccount` | `jobs/`/serviço de import + parser puro `lib/referentialCatalog.ts` | Import idempotente; parser puro testável (espelha `lib/sped.ts`/`ofx.ts`) |
| B4 | backend-service-generator | estende `ReferentialMappingService` p/ validar destino contra catálogo (D3) + auto-fill `label` snapshot (D9) | edita `services/ReferentialMappingService.ts` | Analytic-only-destino; `label` do catálogo mas snapshotado |
| B5 | backend-controller-generator + backend-route-generator | `referential/catalog` (import + lookup) | edita controller/route + OpenAPI | `POST /catalog/import`, `GET /catalog` |
| B6 | backend-test-suite-generator | `service` + parser | testes | Gates Track B/D3 e D9 acima; import idempotente |

### Passo final (ambos) — closeout do map (ORCH-007)
| # | Ação | Arquivo |
|---|---|---|
| Z | promover o nó §5 do map: registrar INCR-9B (catálogo D6 entregue) com ADR/merge; nota "gate desbloqueável com códigos humanos" | `docs/accounting/ACCOUNTING-MASTER-MAP.md` |

### Ordem obrigatória (dependências)
- Track A é **independente** e pode ir sozinha (zero-migração).
- Track B: B0 (transcrição) **antes** de B1 (o schema depende das colunas reais); B1→B2→B3 (import usa repo+model); B4 depende de B2 (valida via catálogo); B5 depois; B6 por último.
- Se encenar A→B: A pode mergear antes; B parte de `main` já com A.

### Checks de validação ao final
- [ ] `cd server && npx tsc --noEmit` · `cd my-app && npx tsc --noEmit`
- [ ] Jest verde sem regredir (novos casos de domínio D1/D5/D6/D8 + Track B/D3/D9)
- [ ] `npm run docs:generate` (rotas novas — guarda de path-count openapi)
- [ ] skill-audit `wiring` (rota/controller órfã, i18n parity)
- [ ] **(Track B) smoke-migration-gate** sobre backup do `dev.db` real (tabela nova vazia; fingerprint idempotência intacto)
- [ ] **(Track B) `npm ci` no worktree + `prisma generate` sadio** antes de migrar (pré-req operacional — client stale)
- [ ] review por **agente independente** (worktree isolado, T12)

### Riscos identificados
- **HIGH (Track B):** `backend-prisma-model-generator` + migração + parsing externo → branch própria, confirm manual, smoke-gate.
- **Anti-ilha:** A1 é obrigatório — estender `ReferentialMappingService`, **não** criar service paralelo. Reuso do canônico é o default (`_REUSE-CRITERION.md`).
- **I052:** B0 (transcrição do leiaute) antes de qualquer campo de `ReferentialAccount`; nenhum código RFB inventado.

### Decisões a registrar (rastreabilidade — via learning-log no closeout)
- `decision` (→ ADR-INCR9B): catálogo = dado externo global importado (D4), NÃO fixture/self-seed; amenda INCR-9 D6 sem tocar a shape do de-para (D9).
- `pitfall`: semear o de-para destravaria o gate **falsamente** (D1) — `coverage` é binário, não valida conteúdo; nunca gravar código não-humano.
- `pattern`: esqueleto/lote chart-driven via `coverage()` (D5), não fixture-driven — inclui contas customizadas.
- `decision`: analytic-only-destino **exige** o catálogo (D3); é o acoplamento que torna Track B necessária ao 3º entregável do pedido.

---

## Forks a ratificar (sinal humano) — resumo

1. **[ESCOPO principal] Track A só (zero-migração) ou A+B (com catálogo oficial + validação analytic-only de destino, com migração)?** Recomendação: **A+B encenados**; B é necessário para a validação de destino; A sozinho não a cobre; nenhum é estritamente necessário só para *gerar* (12 `PUT` do INCR-9 já bastam com os códigos humanos).
2. **[ESCOPO] Confirmar que o VALOR de cada código RFB (inclusive `3.3`) é preenchido por contador** — o produto **não** faz auto-de-para (ADR D1/D10).
3. **[menor] `mappingVersion` de partida + ECD/ECF partilham referencial?** (ADR D7 / §6 9B-3) — pode confirmar no arranque da FASE 2.
4. **[menor] Atomicidade do lote:** all-or-nothing (recomendado) vs best-effort (ADR D8).

> **Pergunta exata para destravar a FASE 2:** *"Track A só ou A+B (catálogo RFB + validação analytic-only, com migração)? E confirma que o valor de cada código RFB — inclusive a 3.3 — é preenchido por contador (sem auto-de-para)?"* O Passo B0 (transcrever o leiaute oficial) não depende do valor dos códigos e pode iniciar assim que o roteamento for autorizado.
