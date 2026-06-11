# Arquitetura — Dynamic Tables

> Modelo de dados, isolamento, ciclo de vida das operações, contratos (DTOs) e instalação de presets.
> Para **o que** declarar em metadados, ver [`../presets/README.md`](../presets/README.md).
> Para **como** os metadados são executados, ver [`validation-and-governance.md`](./validation-and-governance.md).

---

## 1. O modelo "sem tabela física"

O sistema **não cria uma tabela física por entidade**. Tudo vive em duas tabelas físicas (Prisma):

| Tabela física | Papel |
|---|---|
| `DynamicTable` | A **definição** de uma tabela do usuário: `name`, `category`, `internalName`, e o `schema` (JSON). |
| `DynamicTableData` | Os **registros**: cada linha tem `dynamicTableId` + a coluna `data` (JSON) + `deletedAt` (soft delete). |

Cada "tabela" que o usuário vê (Produtos, Vendas, Clientes…) é uma linha em `DynamicTable` com seu
`schema`, e seus registros são linhas em `DynamicTableData` apontando para ela. Isso permite que cada
usuário tenha tabelas totalmente diferentes **sem migração de banco**.

### Isolamento por usuário
Cada `DynamicTable` pertence a um `userId`. Unicidade, busca e relações são todas escopadas àquela
tabela específica — o workspace do "Salão da Maria" e o da "Barbearia do João" nunca se cruzam. A
política (`policies/DynamicTablePolicy.ts`) garante que um usuário só acesse o que é seu.

### `internalName` — a chave estável
Tabelas instaladas a partir de um preset recebem `internalName = <chave do preset>` (ex: `'sales'`,
`'saleItems'`, `'commissions'`). É essa chave que permite resolver tabelas por **query indexada** em
vez de varrer todas (ver [rules-engine.md](./rules-engine.md) → `resolveTable`). Tabelas criadas do
zero podem não ter `internalName`; nesse caso a resolução cai num fallback heurístico por nome/shape.

---

## 2. Ciclo de vida das operações de dado

Todas as operações passam pelo `services/DynamicTableService.ts`, que recupera o `schema` da tabela e
o aplica dinamicamente. Resumo de **quem chama o quê, em que ordem** (o detalhe de cada etapa está em
[validation-and-governance.md](./validation-and-governance.md)):

### `createTableData`
```
policy.canManageData
 → validateDataAgainstSchema   (Zod dinâmico: required/format/validation)
 → validateAdvancedRules       (unique, relation, compositeUnique, requiredIf, compare)
 → enforceNoOverlap            (anti-sobreposição)
 → runRules('beforeCreate')    (plugins)
 → repository.createData
 → runRules('afterCreate')
```

### `updateTableData`
```
policy.canManageData
 → validateDataAgainstSchema   (valida o payload)
 → Guard 1: readOnly           (rejeita mudança de campo read-only)
 → mergedData = {...existente, ...payload}
 → Guard 2: immutableAfter     (congela campos/registro por estado)
 → Guard 3: lifecycle          (transições de status permitidas)
 → validateAdvancedRules       (sobre o registro merged)
 → enforceNoOverlap
 → runRules('beforeUpdate')    (plugins podem mutar ctx.after — é persistido)
 → repository.updateData(persistedData)
 → runRules('afterUpdate')
```

### `deleteTableData`
```
runRules('beforeDelete')
 → deleteConstraints           (RESTRICT / CASCADE / RESTRICT_IF_AGGREGATE / IGNORE)
 → repository.deleteData (soft delete)
 → runRules('afterDelete')
```

> **Bypass de sistema (`isSystem`):** escritas originadas pelo próprio sistema (plugins via
> `ctx.repository.*`, seeds) pulam `readOnly`, `immutableAfter`, `lifecycle` e `noOverlap`. Ver detalhe
> em [validation-and-governance.md](./validation-and-governance.md).

---

## 3. Contratos & API (DTOs)

Definidos em `dtos/DynamicTable.dto.ts` (Zod). São a **borda de validação**: o controller parseia o
request contra eles antes de chamar o service. Desde a sincronização DTO↔modelo, o `TableSchema` e o
`AdvancedFieldSchema` declaram **toda** a governança (espelhando `models/DynamicTable.model.ts`).

| DTO | Uso |
|---|---|
| `CreateDynamicTableDto` | Criar tabela: `name`, `category`, `internalName?`, `schema` (campos + governança). |
| `UpdateDynamicTableDto` | Atualizar metadados simples (nome). |
| `UpdateDynamicTableSchemaDto` | Atualizar o `schema` (usado pelo fluxo de instalação de presets). |
| `CreateDynamicTableDataDto` / `UpdateDynamicTableDataDto` | Criar/atualizar **registro**. O `data` é um objeto genérico; a validação real contra o schema da tabela é **dinâmica** no service (`validateDataAgainstSchema`). |

### Exemplo — tabela custom **com governança** ponta a ponta
```jsonc
{
  "name": "Reservas de Sala",
  "category": "planning",
  "schema": {
    "defaultDisplayField": "title",
    "fields": [
      { "name": "title",  "label": "Title",  "type": "string",   "required": true },
      { "name": "roomId", "label": "Room",   "type": "relation", "required": true,
        "relation": { "targetTable": "<id-da-tabela-rooms>" }, "searchable": false },
      { "name": "startAt","label": "Start",  "type": "datetime", "required": true },
      { "name": "endAt",  "label": "End",    "type": "datetime", "required": true },
      { "name": "status", "label": "Status", "type": "select",   "required": true,
        "options": ["Scheduled", "Done", "Cancelled"], "defaultValue": "Scheduled" }
    ],
    "compare":  [{ "left": "endAt", "op": "gt", "right": "startAt", "errorMessage": "Fim deve ser após o início." }],
    "lifecycle":[{ "field": "status", "transitions": { "Scheduled": ["Done", "Cancelled"] } }],
    "noOverlap":[{ "startField": "startAt", "endField": "endAt", "scopeFields": ["roomId"],
                   "errorMessage": "Sala já reservada nesse período." }]
  }
}
```
Essa tabela **não casa com nenhum plugin** (`supports()`), então opera **100% por metadados**: o motor
aplica `compare`, `lifecycle` e `noOverlap` automaticamente em create/update. É o caso de uso central
de tabelas custom.

---

## 4. Instalação de presets (2 passagens)

`installPresetAsSystem` monta um ERP completo a partir de módulos (ver
[`../presets/README.md`](../presets/README.md)). Como tabelas se referenciam mutuamente, a instalação
é feita em duas passagens para resolver relações circulares:

1. **Criação:** cria cada `DynamicTable` com um schema **parcial** (sem os campos `relation`), e mapeia
   `chave-do-preset → id-real`. Aqui `internalName = chave-do-preset`.
2. **Resolução:** substitui cada `@@PRESET_TABLE_KEY::<chave>` pelo id real e grava o schema completo
   via `updateTableSchemaAsSystem`.

> O fluxo de instalação **passa o schema direto ao repositório** (não re-parseia pelo DTO), por isso a
> governança definida nos módulos (em TypeScript) é preservada integralmente.

---

## 5. Interação com outras features

- **`analytics`** — lê os `schema` das tabelas do usuário (via `internalName`) para calcular KPIs.
  Tabelas marcadas `ui.presentation: 'system'` (ex: `analyticsDefinitions`) são infra de analytics e
  não aparecem nas views nem são editáveis pelo usuário.
- **`kanban`** — cards são `DynamicTableData` de uma tabela dinâmica dedicada; a estrutura do card é
  flexível por ser dirigida por schema.
- **`users`** — toda `DynamicTable` é escopada a um `userId`; o `UserContext` dirige as checagens de
  política.

---

## 6. Mapa de arquivos da feature

```
features/dynamicTables/
├── README.md                  # índice (porta de entrada)
├── docs/                      # este conjunto de documentação
│   ├── architecture.md
│   ├── validation-and-governance.md
│   └── rules-engine.md
├── dtos/                      # contratos Zod (borda de validação)
├── models/                    # interfaces TS (ITableSchema, ISchemaField, regras de governança)
├── policies/                  # autorização (interface + impl)
├── repositories/              # acesso a dados (interface + impl Prisma; queries indexadas)
├── services/                  # DynamicTableService (CRUD + governança) + PresetService (instalação)
├── rules/                     # engine de plugins (RuleRegistry, RuleTypes, shared/, plugins/)
├── utils/                     # utilitários (TableFactory, RelationUtils, ...)
└── presets/                   # fields → modules → systems + README (referência de autoria)
```
