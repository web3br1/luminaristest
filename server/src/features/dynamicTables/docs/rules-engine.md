# Rules Engine — Plugins

> O mecanismo de plugins de regra (`rules/`): contrato, hooks, detecção de tabela, a fronteira
> metadado × plugin, o catálogo atual e como estender.
> Para validação declarativa (não-plugin), ver [validation-and-governance.md](./validation-and-governance.md).

---

## 1. Contrato

```typescript
// rules/RuleTypes.ts
interface RuleContext {
  userId: string;
  table: IDynamicTable;
  schema: ITableSchema;
  operation: 'create' | 'update' | 'delete';
  before?: Record<string, any> | null;
  after?: Record<string, any> | null;
  repository: IDynamicTableRepository;
  isSystem?: boolean;
}

interface RulePlugin {
  name: string;
  supports(ctx: RuleContext): boolean;          // este plugin se aplica a esta tabela?
  beforeCreate?(ctx): Promise<void> | void;
  afterCreate?(ctx):  Promise<void> | void;
  beforeUpdate?(ctx): Promise<void> | void;     // mutar ctx.after PERSISTE
  afterUpdate?(ctx):  Promise<void> | void;
  beforeDelete?(ctx): Promise<void> | void;
  afterDelete?(ctx):  Promise<void> | void;
}
```

- **`RuleRegistry`** (`rules/RuleRegistry.ts`) mantém o `globalRuleRegistry`; cada plugin é registrado
  uma vez. `getApplicable(ctx)` retorna os plugins cujo `supports()` casa (erros em `supports` são
  engolidos → plugin simplesmente não se aplica).
- **`DynamicTableService.runRules(ctx, phase)`** resolve e executa os aplicáveis para cada hook.

> **Mutação em hooks:** em `beforeCreate`/`beforeUpdate`, escrever em `ctx.after` é persistido (o
> service extrai o objeto mutado antes de gravar). Em `after*`/`*Delete`, a gravação já ocorreu.

---

## 2. Detecção de tabela — `tableMatches` e `resolveTable`

Toda detecção vive em **`rules/shared/tableFinder.ts`** (single source of truth):

```typescript
// "esta tabela pertence ao plugin X?" — usado por TODO supports() e pelo fallback de resolveTable
tableMatches(table, { internalNames, categories?, names? }): boolean
```
Regra: a categoria filtra (se dada) e então casa por `internalName` (tabelas de preset) **ou** por um
`name` conhecido (tabelas custom). Exemplo de `supports()` padronizado:
```typescript
supports: (ctx) => tableMatches(ctx.table, {
  categories: ['planning'], internalNames: ['appointments'], names: ['Appointments'],
}),
```

```typescript
// resolver OUTRA tabela do workspace (ex: o SalesPlugin precisa achar a tabela de comissões)
resolveTable(ctx, { internalName, category?, names?, schemaMatch? }): Promise<IDynamicTable | null>
```
- **Caminho rápido:** `findTableByInternalName` — query indexada (preset tem `internalName = presetKey`).
- **Fallback:** carrega as tabelas 1× e casa por `tableMatches` ou por uma heurística de shape
  (`schemaMatch`), para tabelas custom sem `internalName`.

### Regra de ouro: query indexada, nunca full scan
Plugins **não** devem usar `findDataByTableId` + filtro em JS. Use:
- `repository.findRowsByFieldValue(tableId, field, value)` — todas as linhas onde `data.field === value`
  (sem limite; seguro para coleções de negócio).
- `repository.findDataById(id)` — lookup por PK.
- `repository.countByFieldValue` / `countOverlaps` — contagens.

`findRowsReferencingId` tem `LIMIT 100` e serve só para "existe algum referenciador?" (delete scan) —
**não** para somar itens/comissões.

---

## 3. A fronteira metadado × plugin

| É declarativo (NÃO-plugin) | Justifica plugin |
|---|---|
| formato/regex, faixas (`validation`), presença (`required`/`requiredIf`) | side-effects cross-table (criar movimentos de estoque, materializar comissões) |
| unicidade simples/composta (`unique`/`compositeUnique`) | campos computados (score BANT, `result` de metas) |
| comparação cross-field (`compare`) | checagens contra o **relógio** (não concluir agendamento antes de `endAt`) |
| imutabilidade por estado (`immutableAfter`) | lógica cruzada não expressável (paymentStatus↔status em Sales) |
| transições de status (`lifecycle`) | orquestração entre múltiplas tabelas |
| anti-sobreposição (`noOverlap`) | |

Como tudo da esquerda é metadado, **tabelas custom herdam essas regras sem plugin**. Plugins removidos
porque viraram metadado: `GenericFieldValidation`, `Inventory`, `FinancialBaselines`, `Campaigns`,
`Expenses`, `OtherRevenues` (16 → 10 plugins).

---

## 4. Catálogo (10 plugins)

| Plugin | Responsabilidade (o que sobrou de não-declarável) |
|---|---|
| `SalesPlugin` | Orquestrador de vendas: itens, estoque/reserva, agenda, comissões, métricas de cliente (ver §5). |
| `AppointmentsPlugin` | Checagens vs `now` (passado/futuro, concluir só após `endAt`), cliente, duração, horário de trabalho. |
| `CommissionsPlugin` | Só `autoStampPaidAt` (carimba `paidAt` ao entrar em `Paid`). |
| `GoalsPlugin` | Só `autoComputeResult` (Reached/Partial/Not Reached). |
| `LeadsPlugin` | Coerência de pipeline/stage, transições sequenciais, score BANT, snapshot de proposta, atividades. |
| `LeadsSeedOnUnitPlugin` | Semeia pipeline+estágios padrão ao criar uma unidade. |
| `ProductAutoStockPlugin` | Provisiona linhas de estoque (stock=0) por unidade ao criar um produto. |
| `UnitAutoStockPlugin` | Provisiona estoque para todos os produtos ao criar uma unidade. |
| `StockMovementsApplyPlugin` | Aplica movimentos manuais (In/Out) ao estoque (exclui os gerados por venda). |
| `EmployeesPlugin` | Coerência do `workSchedule` e presença de unidade/agenda. |

---

## 5. Anatomia do SalesPlugin (orquestrador fino + módulos)

O `SalesPlugin.ts` (~350 linhas) só tem `supports` + os 6 hooks, delegando para módulos focados em
`rules/plugins/sales/`:

| Módulo | Responsabilidade |
|---|---|
| `shared.ts` | `SALE_KEYS` + `findSaleById` (compartilhados). |
| `saleItems.ts` | validação de item (XOR produto/serviço, no-mix), `loadSaleItems`, guard de venda finalizada. |
| `stockSync.ts` | reservas, deltas de estoque e geração de movimentos. |
| `appointmentSync.ts` | coerência/auto-create/cancelamento de agendamento de itens de serviço. |
| `commissions.ts` | materialização e estorno de comissões. |
| `customerMetrics.ts` | agregados de receita do cliente + flags new/loyal. |

É o template de como quebrar um plugin grande: hooks finos no topo, lógica em módulos coesos, finders
internos via `resolveTable`.

---

## 6. Receitas

### Adicionar um plugin
1. Crie `rules/plugins/MeuPlugin.ts` exportando um `RulePlugin`.
2. `supports` com `tableMatches` (copie categorias/nomes exatos).
3. Implemente só os hooks necessários; para ler outras tabelas, use `resolveTable` + queries indexadas.
4. Registre em `rules/RuleRegistry.ts` (`globalRuleRegistry.register(MeuPlugin)`).
5. Header JSDoc: responsabilidade + nota "validação declarativa fica no schema; este plugin cuida de X".

### Quando **NÃO** escrever um plugin
Se a regra é validação pura (presença, comparação, transição, unicidade, formato, anti-overlap), ela é
**metadado** — declare no schema do módulo (ver [`../presets/README.md`](../presets/README.md)) e toda
tabela, inclusive custom do usuário, a herda de graça. Plugin só para side-effect/cross-table/`now`.
