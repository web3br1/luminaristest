# Plano de Execução — Atomicidade & Tenancy

> **Data**: 2026-06-11 · **Pré-requisito de leitura**: `auditoria_consolidada.md` (R1–R4) e `auditoria_profunda_areas.md` (RE-*, PR-*, DOC-2)
> **Escopo**: resolver as duas fundações apontadas como "ficam mais caras a cada dia": (A) atomicidade das escritas multi-tabela e (B) isolamento de tenant.
> **Nada neste plano foi implementado** — é o blueprint para execução.

---

## Descobertas-chave que moldam o plano (verificadas no código)

Antes do plano, três fatos do código que mudam radicalmente o esforço:

1. **`RuleContext` já injeta o repositório nos plugins** (`RuleTypes.ts:6-15` — campo `repository: IDynamicTableRepository`), e **todos os writes de todos os 10 plugins passam por `ctx.repository`** (verificado por grep: `LeadsPlugin.ts:351,360,381`, `LeadsSeedOnUnitPlugin.ts:27,41`, `ProductAutoStockPlugin.ts:47`, `appointmentSync.ts:70,133`, `commissions.ts:59,90`, `stockSync.ts`, etc.). Nenhum plugin importa `prisma` diretamente. **Consequência**: basta trocar a instância de repositório passada no ctx por uma versão ligada à transação — zero mudança nos plugins.

2. **`__isSystem` é lido ANTES da validação Zod** (`DynamicTableService.ts:389,467`) e o `buildZodSchema` usa `z.object(shape)` que, por padrão, **descarta chaves desconhecidas** no parse (l.666-679). Ou seja: o flag nunca chega ao banco — ele só existe nessas duas leituras pré-validação. **Consequência**: matar o vetor de ataque = substituir 2 linhas por um parâmetro explícito.

3. **`chatController.postChat` não valida posse dos `documentIds`** (`chatController.ts:7-21` — passa `parse.data` direto ao service), e `VectorRepository.search()` monta filtro Qdrant só com `should: documentId` (`VectorRepository.ts:156-163`), enquanto `searchVectors()` já usa `must: userId` (l.245-252). O payload de **todo ponto** no Qdrant já contém `userId` (`DocumentProcessingPipeline.ts:166-170`). **Consequência**: o dado para filtrar já existe em 100% dos pontos; é só usar.

---

# WORKSTREAM B — TENANCY (executar primeiro: menor, maior impacto)

## B1 — Filtro de userId na busca vetorial (fecha R3/DOC-2)

### B1.1 Mudar a assinatura de `search()`
**Arquivo**: `server/src/features/documents/repositories/VectorRepository.ts:140-199`

Assinatura atual → nova:
```typescript
// ANTES
async search(vector: number[], limit: number, documentIds?: string[]): Promise<ScoredPoint[]>
// DEPOIS
async search(vector: number[], limit: number, userId: string, documentIds?: string[]): Promise<ScoredPoint[]>
```

Novo filtro Qdrant (substituindo l.156-163) — `userId` em `must` (AND obrigatório) e `documentIds` como `should` aninhado dentro do `must` (Qdrant suporta cláusula aninhada; o `should` interno vira "pelo menos um dos documentIds"):
```typescript
const must: QdrantCondition[] = [
  { key: 'userId', match: { value: userId } },
];
if (documentIds && documentIds.length > 0) {
  must.push({ should: documentIds.map(id => ({ key: 'documentId', match: { value: id } })) } as any);
}
const searchParams: SearchRequest = {
  vector, limit,
  filter: { must },
  with_payload: true,
  with_vector: false,
};
```
> Nota: validar a tipagem de `QdrantFilter` local (definida no próprio arquivo) — pode ser preciso ampliar o tipo para aceitar cláusula aninhada. O cliente oficial `@qdrant/js-client-rest` aceita.

E **tornar `userId` obrigatório no contrato** — atualizar `IVectorRepository` (mesma pasta) para refletir a nova assinatura, para que o compilador aponte todos os call sites.

### B1.2 Atualizar o call site do chat
**Arquivo**: `server/src/features/chat/services/ChatService.ts:193`
```typescript
// ANTES
const searchResults = await this.vectorRepository.search(queryEmbedding, 10, documentIds);
// DEPOIS
const searchResults = await this.vectorRepository.search(queryEmbedding, 10, user.id, documentIds);
```
`user` já está no escopo (destruturado na l.85). Verificar se o campo é `user.id` ou `user.userId` — o `UserContext` usado no agente usa `user.userId` (`LuminarisAgentService.ts:140`); padronizar com o que `getUserContextFromRequest` retorna.

### B1.3 Validação de posse dos documentIds (defesa em profundidade)
Mesmo com o filtro do Qdrant, validar posse cedo dá erro claro ao usuário e protege contra regressões futuras.

**Local**: `ChatService.generateResponse()`, logo após detectar modo RAG (l.108-111). Injetar `DocumentRepository` (via factory — já existe `findAllForUser(userId)` em `DocumentRepository.ts:75-85`; criar método mais barato `findOwnedIds(userId, ids): Promise<string[]>` com `prisma.document.findMany({ where: { userId, id: { in: ids } }, select: { id: true } })`).

Política recomendada: **rejeitar com 403** se qualquer ID não pertencer ao usuário (não filtrar silenciosamente — filtrar mascara bugs do front e dá falsa sensação de "documento vazio"):
```typescript
const owned = await this.documentRepository.findOwnedIds(user.id, documentIds);
if (owned.length !== documentIds.length) {
  throw new ForbiddenError('One or more selected documents do not belong to you.');
}
```

### B1.4 Índice de payload no Qdrant
Para performance com o novo filtro: criar payload index `userId` (keyword) na collection `documents`. **Local**: `qdrant-initializer.ts` (onde a collection é criada) — adicionar `createPayloadIndex(COLLECTION_NAME, { field_name: 'userId', field_schema: 'keyword' })` idempotente no boot (try-catch para "already exists").

### B1.5 Auditoria de pontos legados
Todo ponto novo tem `userId` (pipeline l.166-170), mas pontos criados por versões antigas podem não ter. Script one-shot (em `server/scripts/`):
1. `qdrant.scroll(COLLECTION_NAME, { filter: { must_not: [{ key: 'userId', match: { any: ... } }] } })` — na prática: scroll completo paginado, coletar pontos com `payload.userId == null`
2. Para cada ponto órfão: resolver `documentId` → `prisma.document.findUnique` → `setPayload({ userId })`; se o documento não existe mais → `delete` do ponto (lixo)
3. Logar contagem antes/depois

### B1.6 Testes de aceitação (B1)
- **T1**: usuário A faz upload de doc; usuário B chama POST /chat com `documentIds: [docDeA]` → 403 (B1.3)
- **T2**: remover temporariamente a validação B1.3 no teste e chamar `search()` direto com userId de B + documentId de A → 0 resultados (B1.1 segura sozinha)
- **T3**: usuário A com 2 docs, busca filtrando 1 → só chunks daquele doc
- **T4**: busca sem documentIds (se o fluxo permitir) → só chunks do próprio usuário

---

## B2 — Eliminar `__isSystem` do payload (fecha R2 + PR-7 + a amplificação via plugins)

### B2.1 Inventário de produtores legítimos
Passo zero: `grep -rn "__isSystem" server/ my-app/` e listar todos os call sites. Esperados (da auditoria): instalação de presets, seed, e possivelmente o caminho do agente. Para cada um, anotar se chama `createTableData`/`updateTableData` (service) ou `repository.createData` direto (plugins escrevem direto no repositório e **não passam pela validação do service** — esses não precisam do flag).

### B2.2 Trocar leitura do payload por parâmetro explícito
**Arquivo**: `server/src/features/dynamicTables/services/DynamicTableService.ts`

```typescript
// ANTES (l.389 e l.467)
const isSystem = !!(dataDto.data as any)?.__isSystem;

// DEPOIS — assinatura com options
async createTableData(user: UserContext, tableId: string, dataDto: CreateDynamicTableDataDtoType,
                      opts?: { asSystem?: boolean }) {
  ...
  const isSystem = opts?.asSystem === true;
```
Idem em `updateTableData` (l.462). Os chamadores internos legítimos (B2.1) passam `{ asSystem: true }`; controllers HTTP **nunca** passam o options (o default é false).

### B2.3 Higienização defensiva na borda
Mesmo com a leitura removida, sanear chaves `__*` na entrada para impedir reaparecimento futuro:
- No `validateDataAgainstSchema` (l.666): antes do parse, `Object.keys(data).filter(k => k.startsWith('__')).forEach(k => delete data[k])` — ou, melhor, no DTO Zod do controller (`CreateDynamicTableDataDto`) com `.transform()`.
- O Zod já descarta desconhecidas no parse, mas o delete explícito documenta a intenção e protege caminhos que leem `dataDto.data` antes do parse (exatamente o bug atual).

### B2.4 Auditar usos de `ctx.isSystem` nos plugins
Com `isSystem` agora confiável, revisar cada bypass nos plugins para confirmar que continua correto (lista da auditoria profunda):
- `AppointmentsPlugin` — permite appointment no passado se system (auto-criação por venda retroativa): OK manter
- `SalesPlugin/saleItems` — permite mix de tipos se system: revisar se algum fluxo legítimo usa; se não, remover o bypass
- Guards 1-3 do `updateTableData` (readOnly/immutableAfter/lifecycle): seguem pulados apenas para chamadas internas genuínas

### B2.5 Testes de aceitação (B2)
- **T5**: POST /dynamic-tables/:id/data com `{data:{__isSystem:true, campoReadOnly:'x'}}` → o flag é ignorado, update de readOnly → 400
- **T6**: PATCH com `__isSystem:true` tentando furar `immutableAfter` (venda Paid) → 400
- **T7**: instalação de preset (caminho system legítimo) continua funcionando — campos readOnly seedados corretamente
- **T8**: lifecycle FSM não é contornável via payload

---

## B3 — Endurecimento sistêmico de tenancy

### B3.1 Fechar R6 (chat-instances vaza tenants)
**Arquivo**: `ChatInstanceService.ts:102` + `chatInstancesController.ts:27` — `getAllInstances(ctx, page, limit)` sem userId quando não há `?type`. Fix: o repositório deve **sempre** receber e aplicar `where: { userId: ctx.userId }`; remover qualquer caminho "listar todos" que não seja explicitamente admin (e se for admin, exigir `role === 'ADMIN'` na policy, não só autenticação).

### B3.2 Varredura de todos os `getAll*/findAll*/findById`
Checklist mecânico — para cada repositório, classificar cada método de leitura:
| Método | Recebe userId? | Chamado por quem? | Ação |
|---|---|---|---|
| `DocumentRepository.findById(id)` | ❌ | DocumentService | service DEVE checar `doc.userId === user.id` após fetch — verificar e testar |
| `DynamicTableRepository.findDataById(dataId)` | ❌ | service + plugins | service usa `findTableForData` → policy.canView ✅ (l.657-664); plugins herdam tabela já validada ✅ |
| `ChatInstanceRepository.*` | parcial | R6 | corrigir (B3.1) |
| `ChatMessageRepository.*` | verificar | chatMessagesController | auditar caminho de leitura de mensagens de instância alheia |
| `ActionProposalRepository.findById` | ❌ | executeProposal | já valida `proposal.userId !== user.userId` ✅ (l.181) |
| `StructuredDataRepository.findByDocumentId` | ❌ | structuredDataController | verificar se controller valida posse do documento antes |

Critério: **toda** leitura por id "cego" precisa de uma das duas proteções — (a) where com userId no próprio query, ou (b) checagem de posse imediatamente após o fetch, com teste cobrindo.

### B3.3 Invariante documentada + suíte de testes de tenancy
Criar `server/src/__tests__/tenancy.spec.ts` com a matriz completa: para cada recurso (tabela, registro, documento, chunk/busca, chat instance, chat message, proposal, analytics), usuário B tenta **ler / escrever / deletar** recurso de A → esperar 403/404, nunca 200. Esta suíte vira o gate de regressão permanente — qualquer endpoint novo precisa entrar na matriz.

### Estimativa Workstream B
| Fase | Esforço |
|---|---|
| B1 (filtro + posse + índice + backfill) | 1–1,5 dia |
| B2 (flag + sanitização + revisão de bypasses) | 1 dia |
| B3 (R6 + varredura + suíte de testes) | 2–3 dias |
| **Total B** | **~1 semana** |

---

# WORKSTREAM A — ATOMICIDADE

## Estratégia central

Prisma suporta **interactive transactions** (`prisma.$transaction(async tx => ...)`) onde `tx` é um `Prisma.TransactionClient` com a mesma API de query. O `DynamicTableRepository` hoje usa o singleton `prisma` importado diretamente em cada método (`DynamicTableRepository.ts:1,18,31...`). O plano: tornar o client **injetável**, criar um **unit-of-work** no contrato, e como o `RuleContext` já propaga `repository` para os plugins, **a transação flui para todos os side-effects sem tocar em nenhum plugin**.

Restrições do SQLite que moldam decisões:
- **Single-writer**: transações de escrita serializam. Bom para consistência, ruim para latência sob carga — aceitável no estágio atual (e o plano de migrar para PostgreSQL já está no P3 da auditoria).
- **Sem transações aninhadas no Prisma**: a recursão de cascade do `deleteTableData` (l.638-640 chama a si mesmo) precisa ser reestruturada para reusar o MESMO tx, nunca abrir outro.
- Configurar no boot: `PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;` (reduz `database is locked` — já recomendado no R20).

## A1 — Repositório transacionável (fundação)

### A1.1 Client injetável
**Arquivo**: `server/src/features/dynamicTables/repositories/DynamicTableRepository.ts`

```typescript
import prisma from '../../../lib/prisma';
import type { PrismaClient, Prisma } from 'generated/prisma';

type Db = PrismaClient | Prisma.TransactionClient;

export class DynamicTableRepository implements IDynamicTableRepository {
  constructor(private readonly db: Db = prisma) {}
  // em TODOS os métodos: trocar `prisma.` por `this.db.`
```
Trabalho mecânico: ~30 métodos, substituição `prisma.` → `this.db.`. Atenção a 1 exceção: `findDataBatchStreamByTableId` (async generator de streaming, l.21 da interface) — **streams não devem rodar dentro de transação** (segura a tx aberta por tempo indeterminado). Manter esse método sempre no singleton: `const db = this.isTx ? prisma : this.db` ou simplesmente documentar+forçar `prisma` nele.

### A1.2 Unit-of-work no contrato
**Arquivo**: `server/src/features/dynamicTables/repositories/IDynamicTableRepository.ts`

```typescript
export interface IDynamicTableRepository {
  /**
   * Executa fn dentro de uma transação; o repo recebido por fn está ligado à tx.
   * NÃO aninhar chamadas (SQLite/Prisma não suportam nested tx).
   */
  runInTransaction<T>(fn: (repo: IDynamicTableRepository) => Promise<T>): Promise<T>;
  // ... métodos existentes inalterados
}
```
Implementação:
```typescript
async runInTransaction<T>(fn) {
  if (this.db !== prisma) {
    // já estamos numa tx — reusar (suporta composição acidental sem quebrar)
    return fn(this);
  }
  return prisma.$transaction(
    async tx => fn(new DynamicTableRepository(tx)),
    { timeout: 15_000, maxWait: 10_000 }  // cascades + plugins podem demorar; calibrar
  );
}
```
O guard de reentrância (`this.db !== prisma → reusar`) é o que permite à recursão do cascade delete e a futuros compositores não explodirem.

### A1.3 Verificação de pureza dos plugins
Pré-condição para o ctx transacional funcionar: **nenhum plugin pode tocar I/O externo** (OpenAI, Qdrant, fs) dentro de hooks, porque rodarão dentro de tx. Verificado na auditoria: todos os side-effects dos 10 plugins são DB-only via `ctx.repository`. Adicionar ao plano um grep de confirmação no momento da implementação: `grep -rn "openai\|qdrant\|fetch(\|axios" server/src/features/dynamicTables/rules/` → deve retornar zero.

## A2 — Envolver os 3 pipelines CRUD

### A2.1 `createTableData` (l.384-400)
```typescript
async createTableData(user, tableId, dataDto, opts?) {
  const table = await this.getTableById(user, tableId);          // fora da tx (leitura + policy)
  if (!this.policy.canManageData(user, table)) throw ...;
  const isSystem = opts?.asSystem === true;                       // (B2)
  const validatedData = this.validateDataAgainstSchema(...);      // puro, fora da tx

  return this.repository.runInTransaction(async (repo) => {
    // DENTRO da tx — checks check-then-write ficam consistentes:
    await this.validateAdvancedRulesWith(repo, table, validatedData);   // compositeUnique/compare
    await this.enforceNoOverlapWith(repo, table, schema, validatedData, isSystem);
    await this.runRules({ ..., repository: repo, isSystem }, 'beforeCreate');
    const created = await repo.createData(tableId, validatedData);
    const afterWithId = { ...validatedData, id: created.id };
    await this.runRules({ ..., repository: repo, isSystem }, 'afterCreate');
    return created;
  });
}
```
**Decisão importante**: `validateAdvancedRules` e `enforceNoOverlap` (que hoje usam `this.repository` para `countByFieldValue`/`countOverlaps`) **entram na transação**. Motivo: são check-then-write — fora da tx, duas requests paralelas passam ambas no check de unicidade composta. Dentro da tx do SQLite (writer serializado), o gap fecha. Refatorar essas duas privates para receber o repo como parâmetro (`validateAdvancedRulesWith(repo, ...)`) em vez de usar `this.repository`.

**Trade-off aceito**: o afterCreate do `ProductAutoStockPlugin` (cria N linhas de estoque) e do `LeadsSeedOnUnitPlugin` (5 creates) agora rodam na mesma tx — é exatamente o que queremos (unidade criada COM pipeline e estoque, ou nada), ao custo de tx mais longa. Com timeout de 15s e bases atuais, seguro; monitorar.

### A2.2 `updateTableData` (l.462-560)
Mesma estrutura. O que entra na tx:
1. `findDataById` do registro existente (l.482) — **mover para dentro** (lê o estado que os guards 2/3 vão validar; fora da tx há TOCTOU entre o read e o write)
2. Guards 2 (immutableAfter) e 3 (lifecycle) — dependem do `existingData` lido na tx
3. `validateAdvancedRules` + `enforceNoOverlap` (com repo da tx)
4. beforeUpdate → `repo.updateData` → afterUpdate

O que fica fora: `findTableForData` + policy (leitura de tabela), validação Zod (pura), guard 1 readOnly (olha só o payload).

**Atenção ao afterUpdate do SalesPlugin** (o caso que motivou tudo): `processSaleStockUpdate` + `createMovementsForItems` + `materializeCommissions` (SalesPlugin.ts:331-337) passam a ser atômicos com o update do header — falhou a comissão, reverte estoque E movimento E o próprio update. Exatamente o R1 resolvido.

### A2.3 `deleteTableData` (l.562-643) — o mais delicado (recursão)
Reestruturar em wrapper público + core privado:
```typescript
async deleteTableData(user, dataId) {
  const table = await this.findTableForData(user, dataId);        // fora: policy
  if (!this.policy.canManageData(user, table)) throw ...;
  return this.repository.runInTransaction(repo =>
    this._deleteTableDataCore(repo, user, table, dataId)
  );
}

private async _deleteTableDataCore(repo, user, table, dataId) {
  // ... varredura de constraints usando `repo` (findTablesByUserId, findRowsReferencingId)
  // ... beforeDelete (ctx.repository = repo)
  await repo.deleteData(dataId);
  for (const cascade of cascadeIds) {
    const childTable = await repo.findTableByDataId(cascade.dataId);
    // re-checar policy do filho se necessário, então:
    await this._deleteTableDataCore(repo, user, childTable, cascade.dataId);  // MESMO repo/tx
  }
  // ... afterDelete
}
```
A recursão atual (l.639 chama o método público) abriria tx aninhada — o core privado recebendo `repo` resolve. O guard de reentrância do A1.2 é o cinto de segurança caso algo escape.

**Risco a calibrar**: cascade profundo (venda → N itens → ajustes de reserva por item) numa tx só. Para volumes atuais OK; adicionar log de duração da tx e alarme se > 5s.

### A2.4 `installPresetAsSystem` (l.187-315) — fecha PR-1/PR-4/PR-5
Três mudanças combinadas:

1. **Pré-validar TODOS os marcadores antes de qualquer write** (mata PR-4): antes da 1ª passagem, varrer todos os schemas do preset coletando todo `relation.targetTable` que começa com `@@PRESET_TABLE_KEY::` e validar que a chave existe em `Object.keys(preset.tables)`. Hoje isso só explode na 2ª passagem (l.94-98), com tabelas já criadas.

2. **Resolver o import dinâmico da variante saleItems ANTES da transação** (l.299-310): imports são I/O de módulo — fazer fora da tx, guardar o schema da variante numa variável, e dentro da tx só aplicar. De quebra, trocar o try-catch silencioso por `logger.warn` + fallback explícito ao Mixed (PR-3).

3. **Envolver as 3 passagens em `runInTransaction`**: criar tabelas → resolver relações → trocar variante, tudo ou nada. Falhou no meio → zero tabelas órfãs → o usuário pode tentar de novo (o 403 do controller deixa de ser uma prisão).

4. **Constraint de unicidade** (mata PR-5 na raiz): migração Prisma:
```prisma
model DynamicTable {
  ...
  @@unique([userId, internalName])
}
```
Pré-migração: query de verificação de duplicatas existentes (`GROUP BY userId, internalName HAVING COUNT(*) > 1`) — resolver manualmente antes de aplicar. Com a constraint, dois installs simultâneos: o segundo falha na 1ª inserção e a tx dele reverte inteira. Comportamento correto sem lock explícito.
> Validar antes: usuários podem criar tabelas custom com nome livre — `internalName` é gerado/derivado? Se houver caminho onde dois custom tables colidem legitimamente em `internalName`, ajustar a geração para sufixar (`-2`) em vez de abandonar a constraint.

### A2.5 Idempotência (complemento da atomicidade — fecha RE-8 e o double-apply do R1)
1. **ProductAutoStockPlugin** (`ProductAutoStockPlugin.ts:44-48`): antes de cada `createData`, checar existência como o UnitAutoStockPlugin já faz (`findRowsByFieldValue(productUnitsTableId, 'productId', productId)` + match de unitId). Dentro da tx, o check é consistente.
2. **processSaleStockUpdate** (stockSync.ts): adicionar guarda de transição — só aplicar baixa de estoque se `prevStatus !== 'Finalized' && nextStatus === 'Finalized'` (e o inverso para cancelamento). A informação prev/next já está no ctx do afterUpdate. Alternativa mais forte: antes de criar movimentos, checar se já existem movimentos `sourceType='SALE'` para aquele `saleId` com o mesmo sentido → skip (idempotência por evidência).

## A3 — Ordem de execução, testes e rollout

### Sequência (cada passo compila e passa testes antes do próximo)
1. **A1.1 + A1.2** — repositório injetável + runInTransaction (sem nenhum caller ainda) + grep de pureza A1.3
2. **A2.1** create na tx → rodar suíte + smoke manual (criar produto → estoque provisionado)
3. **A2.2** update na tx → smoke: finalizar venda (o caminho SalesPlugin completo)
4. **A2.3** delete na tx (refatoração da recursão) → smoke: delete com cascade
5. **A2.4** presets → smoke: install do BeautySalon do zero; install duplo simultâneo
6. **A2.5** idempotência
7. Migração `@@unique` por último (depois de validar geração de internalName)

### Testes novos (mínimo obrigatório)
| Teste | Cenário | Asserção |
|---|---|---|
| TX-1 | Finalizar venda; injetar falha em `materializeCommissions` (mock do repo que lança no 3º write) | Estoque E movimentos E status revertidos — estado pré-finalização intacto |
| TX-2 | Criar movimento de estoque; falha no insert do movimento após mutação de estoque | Estoque NÃO mudou (fecha RE-11) |
| TX-3 | Delete com cascade; falha no 2º filho | Pai e 1º filho restaurados |
| TX-4 | Install de preset; falha na 2ª passagem (marcador inválido forjado) | Zero tabelas no banco; segundo install funciona |
| TX-5 | 2 installs concorrentes (Promise.all) | Exatamente 1 sucesso; o outro erro limpo; contagem de tabelas = 1 preset |
| TX-6 | Rerun de afterCreate de produto (chamar 2×) | Sem duplicatas de productUnit |
| TX-7 | 2 creates concorrentes violando compositeUnique | Exatamente 1 sucesso |
| TX-8 | Stream de analytics durante tx longa | Stream não bloqueia nem entra na tx |

### Estimativa Workstream A
| Fase | Esforço |
|---|---|
| A1 (repo injetável + UoW) | 1–2 dias |
| A2.1–A2.3 (3 pipelines) | 3–4 dias |
| A2.4 (presets + constraint) | 1–2 dias |
| A2.5 (idempotência) | 1 dia |
| Testes TX-1..8 | 2–3 dias |
| **Total A** | **~2 semanas** |

---

## Cronograma combinado (1 dev, foco integral)

```
Semana 1: Workstream B inteiro (tenancy) + suíte de testes de tenancy
Semana 2: A1 + A2.1 + A2.2 (o caminho da venda atômico = maior valor)
Semana 3: A2.3 + A2.4 + A2.5 + testes TX + constraint única
Buffer:   3-4 dias para o que a realidade cobrar
```

**Por que B antes de A**: B é 5× menor, fecha os buracos exploráveis hoje (cross-tenant + bypass), e não conflita com A — nenhum arquivo é tocado pelos dois workstreams exceto `DynamicTableService.ts` (B2 muda 2 linhas + assinatura; A2 reescreve os mesmos métodos — fazer B2 primeiro evita rebase mental).

## Riscos do próprio plano

| Risco | Mitigação |
|---|---|
| Tx longas no SQLite serializam todas as escritas do servidor | timeout 15s + log de duração; volumes atuais comportam; PostgreSQL já está no roadmap P3 |
| Algum plugin futuro chamar I/O externo dentro de hook | Documentar a invariante no `RuleTypes.ts` (comentário no RulePlugin) + grep no CI |
| `findDataBatchStreamByTableId` acidentalmente em tx | Forçar singleton no método + teste TX-8 |
| Duplicatas pré-existentes quebram a migração unique | Query de verificação ANTES; script de dedup se necessário |
| `user.id` vs `user.userId` inconsistente (424 `as any` escondem isso) | Confirmar o shape real do UserContext no início de B1; é 1 linha mas errar = filtro vazio |
| Pontos Qdrant legados sem userId somem das buscas após B1 | Script B1.5 ANTES de ligar o filtro em produção |

## Critérios de aceite finais (definição de "pronto")

1. Suíte de tenancy verde: nenhuma operação cross-tenant retorna 200 em nenhum recurso
2. TX-1 a TX-8 verdes
3. `grep -rn "__isSystem" server/src` retorna só os call sites internos com `asSystem` explícito
4. Filtro `must: userId` presente em **ambas** as rotas de busca vetorial; índice de payload criado
5. Install de preset: falha simulada → banco limpo → retry funciona
6. Zero `prisma.` direto dentro de `DynamicTableRepository` (tudo via `this.db`)
