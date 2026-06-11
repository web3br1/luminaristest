# Ecossistema de Presets — Tabelas Dinâmicas

> 📍 Parte do conjunto de docs da feature — ver o [mapa de documentação](../README.md#-mapa-de-documentação).
> Este arquivo é a referência de **autoria** (o que declarar). Para **como/onde** cada metadado é
> executado, ver [`../docs/validation-and-governance.md`](../docs/validation-and-governance.md);
> para **plugins**, ver [`../docs/rules-engine.md`](../docs/rules-engine.md).

Este documento é a referência completa do sistema de presets. Ele explica como
as tabelas dinâmicas são definidas, como os presets se compõem em camadas, e
**todos os metadados disponíveis** com exemplos reais.

> **Convenção de idioma:** descrições, comentários e este documento ficam em PT.
> Todos os `label` e `description` de campos ficam em **EN** — o frontend traduz
> via i18n (`database:fields.<name>`) com fallback para o label EN.

---

## 1. Como os dados funcionam (visão geral)

O sistema **não cria uma tabela física por entidade**. Em vez disso:

- Existe uma tabela física `DynamicTable` — guarda a **definição** (o schema) como JSON.
- Existe uma tabela física `DynamicTableData` — guarda os **registros**, com a coluna `data` em JSON.

Cada "tabela" que o usuário vê (Produtos, Vendas, Clientes…) é uma linha em
`DynamicTable` com seu schema, e seus registros são linhas em `DynamicTableData`
apontando para ela. Isso permite que cada usuário tenha tabelas totalmente
diferentes sem migração de banco.

**Isolamento:** cada `DynamicTable` pertence a um `userId`. Unicidade, busca e
relações são todas escopadas àquela tabela específica — o sistema do "Salão da
Maria" e o da "Barbearia do João" nunca se cruzam.

---

## 2. Arquitetura de 3 camadas

```
┌─────────────────────────────────────────────────────────────┐
│  SYSTEMS  (presets/systems/)                                 │
│  Um ERP completo. Ex: BeautySalonPreset = 16 tabelas.       │
│  Compõe MODULES via createTableFromModule().                │
└────────────────────────────┬────────────────────────────────┘
                             │ usa
┌────────────────────────────▼────────────────────────────────┐
│  MODULES  (presets/modules/)                                │
│  Uma tabela. Ex: productModule, salesModule.                │
│  Compõe FIELDS (presets + overrides + campos inline).       │
└────────────────────────────┬────────────────────────────────┘
                             │ usa
┌────────────────────────────▼────────────────────────────────┐
│  FIELDS  (presets/fields/)                                  │
│  Um campo reutilizável. Ex: salePrice, customerId, date.    │
│  Objetos ISchemaField puros, agrupados por tipo.            │
└──────────────────────────────────────────────────────────────┘
```

**Regra de ouro:** quanto mais baixo na pilha, mais reutilizável. Sempre que um
campo for genérico (preço, data, FK para clientes), use o **field preset**. Só
declare inline o que for específico daquela tabela.

---

## 3. FIELDS — presets de campo

Vivem em `presets/fields/`, agrupados por tipo:

| Arquivo | Contém |
|---|---|
| `text/TextPresets.ts` | `name`, `description`, `notes`, `email`, `phone`, `sku`, `brand`, endereço, etc. |
| `number/NumberPresets.ts` | `amount`, `price`, `salePrice`, `costPrice`, `quantity`, `stock`, `commission`, etc. |
| `date/DatePresets.ts` | `date`, `dueDate`, `paymentDate`, `startAtDateTime`, `dateRange`, etc. |
| `boolean/BooleanPresets.ts` | `isActive`, `isPlanned`, `simpleCustomerFlag` |
| `select/SelectPresets.ts` | `saleStatus`, `paymentStatus`, `paymentMethod`, `appointmentStatus`, etc. |
| `relation/RelationPresets.ts` | `unitId`, `customerId`, `productId`, `serviceId`, `saleId`, etc. |

Cada preset é um objeto `ISchemaField`:

```typescript
export const salePrice: ISchemaField = {
  name: 'salePrice',
  label: 'Sale Price',
  type: 'number',
  required: false,
  numberFormat: 'currency',
  validation: { minValue: 0 },
  searchable: false,
};
```

Todos são reexportados pelo barrel `presets/fields/index.ts`, então um módulo
importa de um lugar só:

```typescript
import { salePrice, customerId, date } from '../../fields';
```

### Override via spread

Field presets são imutáveis por convenção. Para ajustar um campo num módulo,
use spread e sobrescreva só o que muda:

```typescript
{ ...customerId, required: false }          // torna a FK opcional
{ ...unitId, label: 'Business Unit' }       // muda só o label
{ ...date, label: 'Sale Date' }             // reutiliza o campo 'date' com outro label
```

> O `createTableFromModule` faz deep-clone (`JSON.parse(JSON.stringify())`),
> então nem o spread nem a instalação mutam o preset original.

### `dateRange` — preset que é um array

`dateRange` exporta **dois campos** (`startDate` + `endDate`). Espalhe direto no
array de fields:

```typescript
import { dateRange } from '../../fields';
fields: [
  ...dateRange,   // injeta startDate e endDate
]
```

---

## 4. MODULES — presets de tabela

Vivem em `presets/modules/<categoria>/`. Cada módulo descreve **uma tabela**:

```typescript
import type { ITableSchema } from '../../../models/DynamicTable.model';
import { name, brand, sku, usageType } from '../../fields';

export const productModule = {
  name: 'Products',                       // nome de exibição
  description: 'Master catalog of all products offered.',
  category: 'products',                   // categoria (ver TableCategories.ts)
  meta: {                                 // injeção de dependências (opcional)
    providesCapabilities: ['catalog.products'],
  },
  schema: {
    defaultDisplayField: 'name',
    fields: [
      name,
      brand,
      sku,
      { name: 'category', label: 'Category', type: 'string', required: false },
      usageType,
    ],
    deleteConstraints: [ /* ... */ ],
  } as ITableSchema,
};
```

| Propriedade | Obrigatório | Descrição |
|---|---|---|
| `name` | ✅ | Nome de exibição da tabela. |
| `description` | ✅ | Descrição curta (usada em UI de instalação e na IA). |
| `category` | ✅ | Agrupa tabelas. Valores válidos em `models/TableCategories.ts`. |
| `meta` | ➖ | Capabilities e dependências (ver §6). |
| `schema` | ✅ | Estrutura: `defaultDisplayField`, `fields`, e metadados de governança. |
| `analytics` | ➖ | Configurações de KPIs/charts pré-construídos para a tabela. |

---

## 5. SYSTEMS — presets de sistema

Vivem em `presets/systems/`. Um system é um ERP completo, composto de módulos
via `createTableFromModule()`:

```typescript
import { createTableFromModule } from '../../utils/TableFactory';
import { customerModule } from '../modules/people/CustomerModule';
import { productModule, productUnitModule } from '../modules/product/ProductModule';
// ...

const BeautySalonPreset = {
  key: 'beautySalon',
  name: 'ERP Avançado para Salão de Beleza',
  description: 'Solução completa para gestão de salões...',
  tables: {
    customers:    createTableFromModule(customerModule),
    products:     createTableFromModule(productModule),
    productUnits: createTableFromModule(productUnitModule),
    // ... a chave (ex: 'customers') é o identificador da tabela no preset
  },
};

export default BeautySalonPreset;
```

A **chave** de cada entrada em `tables` (ex: `customers`, `products`) é o que
o marcador `@@PRESET_TABLE_KEY::` referencia (ver §8).

### `createTableFromModule(module, config?)`

Transforma um módulo numa definição de tabela instalável. O segundo argumento
opcional permite customizar:

```typescript
createTableFromModule(productModule, {
  omit: ['brand'],                                  // remove campos
  add: [{ name: 'warranty', label: 'Warranty', type: 'string', required: false }],
})
```

### Tipos de system

| System | Papel |
|---|---|
| `CoreSystemPreset` | **Base obrigatória.** Instalado para todo usuário. Contém `units`, `employees`, `tasks`, `leads`, etc. Todo outro preset depende dele. |
| `BeautySalonPreset` | Preset de exemplo completo (salão de beleza). Usa os 16 módulos de negócio. |

---

## 6. Metadados de MÓDULO — `meta` (capabilities)

O `meta` declara o contrato de dependências entre tabelas. Resolvido na
instalação do preset (`DynamicTableService.installPresetAsSystem`).

```typescript
meta: {
  providesCapabilities: ['inventory.stock'],   // "eu ofereço isto"
  requiresCapabilities: ['inventory.stock'],   // "preciso que alguém ofereça isto"
  requiresTables: ['saleItems'],               // "preciso desta tabela pelo nome"
  excludesTables: ['saleItemsServicesOnly'],   // "sou incompatível com esta"
}
```

| Campo | Descrição |
|---|---|
| `providesCapabilities` | Capacidades que a tabela fornece. Uma string livre tipo `'inventory.stock'`. |
| `requiresCapabilities` | Exige que **alguma** tabela do preset forneça estas capacidades. Se faltar, a instalação falha. |
| `requiresTables` | Exige a presença de tabelas específicas pelo nome-chave. Dependência rígida. |
| `excludesTables` | Declara incompatibilidade com outras tabelas. |

**Por que capabilities > requiresTables:** capabilities permitem substituição.
Se amanhã você criar `warehouseStock` que também declara
`providesCapabilities: ['inventory.stock']`, qualquer módulo que exija essa
capacidade aceita o novo módulo sem mudar nada. `requiresTables` engessa ao nome.

**Exemplo real:** `stockMovementsModule` declara
`requiresCapabilities: ['inventory.stock']`. Se você instalar um preset com
movimentações de estoque mas sem nenhuma tabela que forneça `inventory.stock`
(ex: sem `productUnits`), a instalação é rejeitada.

---

## 7. Metadados de CAMPO (`ISchemaField`)

Referência completa de todos os atributos de um campo. Definição canônica em
`models/DynamicTable.model.ts`.

### 7.1 Identificação e tipo

| Atributo | Tipo | Descrição |
|---|---|---|
| `name` | `string` ✅ | Chave do campo no JSON do registro. Único na tabela. camelCase. **Nunca mude depois de em produção** — é a chave dos dados gravados. |
| `label` | `string` ✅ | Rótulo de exibição (EN; i18n no front). |
| `type` | `string` ✅ | `string` \| `number` \| `boolean` \| `date` \| `datetime` \| `relation` \| `select` \| `textarea` \| `json` |
| `description` | `string` ➖ | Texto de ajuda/tooltip no formulário. |

### 7.2 Formatação

| Atributo | Aplica a | Descrição |
|---|---|---|
| `format` | `type: 'string'` | Máscara/validação: `email`, `phone`, `cpf`, `cnpj`, `url`, `custom`. Validado declarativamente no `buildZodSchema` (`DynamicTableService`), para qualquer tabela. |
| `numberFormat` | `type: 'number'` | Renderização: `currency`, `percentage`, `integer`, `decimal`. Afeta como o front formata (R$, %, etc.). |
| `options` | `type: 'select'` | Lista de opções. Ex: `['Paid', 'Pending']`. |

### 7.3 Comportamento de entrada

| Atributo | Tipo | Descrição |
|---|---|---|
| `required` | `boolean` ✅ | Se `true`, não aceita nulo/vazio. |
| `unique` | `boolean` ➖ | Valor único na tabela. Verificado no backend (create e update). |
| `defaultValue` | `any` ➖ | Valor inicial. Pode ser literal ou `'CURRENT_TIMESTAMP'`. |
| `hidden` | `boolean` ➖ | Se `true`, **não aparece no formulário** (`DynamicForm` filtra). Útil para campos internos como `detailKey`, `order`. |
| `validation` | `object` ➖ | Regras: `{ minLength, maxLength, minValue, maxValue }`. |

### 7.4 Governança de campo (NOVOS)

| Atributo | Tipo | Descrição |
|---|---|---|
| `readOnly` | `boolean` ➖ | Se `true`, o backend **rejeita** qualquer update que tente mudar este campo (exceto processos de sistema). O front mostra o campo desabilitado com label "(Read only)". |
| `searchable` | `boolean` ➖ | Se `false`, o campo é **excluído da busca textual global**. Default: `true`. |
| `requiredIf` | `object` ➖ | Torna o campo **condicionalmente obrigatório** com base no valor de outro campo. Validado no backend (create e update) sobre o registro completo. |

#### Sobre `readOnly`

Use em campos que só podem ser alterados por lógica de sistema, nunca pelo
usuário direto. Exemplo real (`productUnitModule`):

```typescript
{ ...stock, readOnly: true },    // estoque só muda via StockMovements
{ name: 'reserved', ..., readOnly: true },  // reserva só muda pelo SalesPlugin
```

O enforcement é no `updateTableData` (Guard 1). Tentar editar via API direta,
mobile ou qualquer cliente é bloqueado — não é só "esconder no front".

#### Sobre `searchable`

A busca textual global do front filtra por `searchable !== false`. Marque
`false` em campos cujo conteúdo polui a busca:

- **Sempre `false`:** relations (são CUIDs), números (preços viram ruído),
  datas (datas geram falsos positivos), booleans.
- **Decisão por caso para `select`:** estados que o usuário busca naturalmente
  (`paymentStatus`, `paymentMethod`) idealmente ficam `searchable: true` para
  permitir digitar "paid" ou "pix". Selects internos/analíticos ficam `false`.
- **Mantenha pesquisável (sem a flag):** `name`, `sku`, `email`, `brand`,
  `description`, `notes`.

> ⚠️ **Busca por data ≠ busca textual.** Buscar registros por intervalo de data
> não é feito pela busca textual — exige um filtro de datepicker dedicado na
> filter bar. Marcar a data como `searchable: false` é o correto; a busca por
> período é um recurso separado a ser implementado nas filter bars.

#### Sobre `requiredIf`

Torna um campo obrigatório **apenas quando** outro campo satisfaz uma condição. A
presença é avaliada sobre o **registro completo** (merge do existente + payload),
então funciona em updates parciais. Validado no `validateAdvancedRules`.

```typescript
// ExpensesModule: a data de pagamento só é obrigatória quando a despesa está paga
{ ...paymentDate, required: false,
  requiredIf: { field: 'paymentStatus', op: 'eq', value: 'Paid' } }

// OtherRevenuesModule: a fonte só é obrigatória para certos tipos de receita
{ name: 'source', required: false,
  requiredIf: { field: 'type', op: 'in', value: ['Interest', 'Rent', 'Resale'] } }
```

| Campo de `requiredIf` | Descrição |
|---|---|
| `field` | Nome do campo cujo valor é avaliado. |
| `op` | `eq` (igual), `neq` (diferente) ou `in` (está na lista). |
| `value` | Valor único (`'Paid'`, `true`) ou array (para `in`). |

> **Padrão:** declare o campo como `required: false` e deixe o `requiredIf`
> assumir a obrigatoriedade condicional. Isso corrige o caso clássico de um campo
> que herda `required: true` do preset mas só deveria ser exigido em certos estados.

### 7.5 Relação (`type: 'relation'`)

```typescript
{
  name: 'customerId',
  label: 'Customer',
  type: 'relation',
  required: true,
  relation: {
    targetTable: '@@PRESET_TABLE_KEY::customers',
    allowMultiple: false,
  },
}
```

| Campo de `relation` | Descrição |
|---|---|
| `targetTable` | ✅ Tabela alvo. Use o marcador `@@PRESET_TABLE_KEY::<chave>` (ver §8). |
| `allowMultiple` | ➖ Se `true`, vira relação N:N (o campo guarda um array de IDs). Default: `false`. |

> **Display da relação:** o texto exibido para uma FK vem do
> `defaultDisplayField` da **tabela alvo** (ver §9), não de um campo declarado na
> relação. Ex: ao mostrar a FK `customerId`, o sistema lê o
> `defaultDisplayField` da tabela `customers` (que é `'name'`) e exibe o nome.

---

## 8. O marcador `@@PRESET_TABLE_KEY::`

Relations declaram a tabela alvo por **chave de preset**, não por ID (que só
existe após a instalação):

```typescript
relation: { targetTable: '@@PRESET_TABLE_KEY::customers' }
```

Na instalação, `resolvePresetRelations` (no service) substitui
`@@PRESET_TABLE_KEY::customers` pelo ID real da tabela `customers` criada
naquela instalação específica. A chave (`customers`) deve corresponder à chave
usada no objeto `tables` do system (§5).

---

## 9. Metadados de SCHEMA (`ITableSchema`)

Além de `fields`, o schema carrega metadados que valem para a tabela inteira.

```typescript
schema: {
  defaultDisplayField: 'name',
  fields: [ /* ... */ ],
  deleteConstraints: [ /* ... */ ],
  compositeUnique: [ /* ... */ ],
  immutableAfter: [ /* ... */ ],
  compare: [ /* ... */ ],      // comparação cross-field (endDate > startDate)
  lifecycle: [ /* ... */ ],    // máquina de estados de status
  noOverlap: [ /* ... */ ],    // anti-sobreposição de períodos (agenda)
  ui: { presentation: 'standalone' }, // dica de apresentação no front
}
```

### 9.1 `defaultDisplayField`

O `name` do campo usado para representar um registro quando ele é referenciado
por outra tabela (FK). Ex: `customers` tem `defaultDisplayField: 'name'`, então
toda FK para clientes mostra o nome do cliente em vez do ID.

### 9.2 `deleteConstraints` — regras de exclusão

Controlam o que acontece ao deletar (soft delete) um registro referenciado por
outras tabelas. Avaliadas no `deleteTableData`.

```typescript
deleteConstraints: [
  {
    type: 'RESTRICT_IF_AGGREGATE',
    targetTable: '@@PRESET_TABLE_KEY::productUnits',
    aggregate: { field: 'stock', operator: 'gt', value: 0 },
    errorMessage: 'Cannot deactivate: you still have physical stock.'
  },
  {
    type: 'CASCADE',
    targetTable: '@@PRESET_TABLE_KEY::productUnits',
    cascadeCondition: 'ALWAYS'
  },
  {
    type: 'RESTRICT',
    targetTable: '@@PRESET_TABLE_KEY::saleItems',
    errorMessage: 'Product is linked to active sales.'
  },
  {
    type: 'IGNORE',
    targetTable: '@@PRESET_TABLE_KEY::stockMovements'
  }
]
```

| `type` | Comportamento |
|---|---|
| `RESTRICT` | Bloqueia a exclusão se **qualquer** registro da tabela alvo referenciar este. |
| `RESTRICT_IF_AGGREGATE` | Bloqueia só se a soma de um campo (`aggregate.field`) dos referenciadores satisfizer a condição (`operator` + `value`). Ex: bloqueia se soma de `stock` > 0. |
| `CASCADE` | Soft-deleta os registros referenciadores junto (recursivamente, respeitando as constraints deles). |
| `IGNORE` | Não bloqueia nem cascateia. Deixa os referenciadores intactos (ex: logs de auditoria). |

**Comportamento padrão:** se uma tabela referencia este registro e **não há
constraint declarada** para ela, o sistema aplica `RESTRICT` por padrão. Isso
protege contra exclusões acidentais sem precisar declarar tudo.

`aggregate.operator`: `gt` | `lt` | `eq` | `neq`.

### 9.3 `compositeUnique` — unicidade composta

Garante que uma **combinação** de campos seja única. O `unique` de campo cobre
um campo só; isto cobre N campos juntos.

```typescript
compositeUnique: [
  {
    fields: ['productId', 'unitId'],
    errorMessage: 'A stock record for this product already exists in the selected unit.',
  },
]
```

Verificado em create e update (`validateAdvancedRules`). Exemplo real:
`productUnits` não pode ter dois registros para o mesmo `(productId, unitId)` —
isso duplicaria o saldo de estoque.

### 9.4 `immutableAfter` — imutabilidade por estado

Bloqueia edição de campos (ou do registro inteiro) depois que uma condição é
satisfeita. É o "deleteConstraints do update". Avaliado no `updateTableData`
(Guard 2).

```typescript
immutableAfter: [
  {
    condition: { field: 'paymentStatus', op: 'eq', value: 'Paid' },
    scope: ['totalAmount', 'subtotal', 'discountAmount', 'taxAmount', 'customerId', 'unitId'],
    errorMessage: 'Paid sales cannot have financial or customer fields modified.'
  },
  {
    condition: { field: 'status', op: 'in', value: ['Finalized', 'Cancelled', 'Returned'] },
    scope: 'all',
    errorMessage: 'Finalized, cancelled or returned sales cannot be edited.'
  }
]
```

| Campo | Descrição |
|---|---|
| `condition.field` | O campo cujo valor dispara a imutabilidade. |
| `condition.op` | `eq` (igual a um valor) ou `in` (está numa lista). |
| `condition.value` | Valor único (`'Paid'`) ou lista (`['Finalized', 'Cancelled']`). |
| `scope` | `'all'` = bloqueia qualquer mudança no registro. `string[]` = bloqueia só esses campos. |
| `errorMessage` | Mensagem retornada quando a regra dispara. |

**Por que importa:** sem isso, uma venda paga pode ter o `totalAmount` alterado,
corrompendo relatórios financeiros. Com isso, a única forma de "corrigir" uma
venda paga é cancelar e refazer — integridade contábil garantida.

> Processos de sistema (`isSystem: true`) e plugins fazem bypass de `readOnly` e
> `immutableAfter` — eles precisam atualizar campos protegidos (ex: o
> `SalesPlugin` ajusta `stock`/`reserved`).

### 9.5 `compare` — comparação cross-field

Compara dois campos do **mesmo registro** (ex: data fim > data início, gasto ≤
orçamento). Avaliado em create e update (`validateAdvancedRules`). Se **qualquer**
um dos campos estiver ausente, a regra é **pulada** (presença é papel de
`required`/`requiredIf`).

```typescript
compare: [
  { left: 'endAt', op: 'gt',  right: 'startAt', errorMessage: 'Fim deve ser após o início.' },
  { left: 'spent', op: 'lte', right: 'budget',  errorMessage: 'Gasto não pode exceder o orçamento.' },
]
```

| Campo | Descrição |
|---|---|
| `left` | Nome do campo à esquerda. |
| `op` | `gt` \| `gte` \| `lt` \| `lte` \| `eq` \| `neq`. Aplicado como `left op right`. |
| `right` | Nome do campo à direita. |
| `errorMessage` | Mensagem quando a comparação falha. |

A tipagem da comparação segue o `type` dos campos: `date`/`datetime` comparam como
timestamp, `number` como número, o resto como string.

### 9.6 `lifecycle` — máquina de estados de status

Restringe as transições de um campo de estado (ex: `status`). Avaliado **só no
update** (no create o estado inicial é validado pelo `options` do campo) e **só
para usuário** (`isSystem` faz bypass). Estados **ausentes** do mapa `transitions`
são **terminais** (não podem mudar). Escrita sem mudança de estado é sempre OK.

```typescript
lifecycle: [
  {
    field: 'status',
    transitions: {
      Pending: ['Paid', 'Cancelled'],
      // Paid e Cancelled ausentes ⇒ terminais
    },
    errorMessage: 'Transição de status inválida.',
  },
]
```

| Campo | Descrição |
|---|---|
| `field` | O campo que guarda o estado. |
| `transitions` | `{ estadoOrigem: [estadosDestinoPermitidos] }`. |
| `errorMessage` | Mensagem quando a transição é proibida. |

**Combina com `immutableAfter`:** o `lifecycle` controla _para onde_ o status pode
ir; o `immutableAfter` (scope `'all'`) congela o registro inteiro quando já está
num estado terminal (ex: `Paid`). Os dois juntos formam o ciclo de vida completo.

> **Side-effects continuam em plugin.** O `lifecycle` só **valida** a transição.
> Efeitos colaterais da mudança (ex: carimbar `paidAt` ao entrar em `Paid`)
> permanecem em plugins enxutos (ex: `CommissionsPlugin.autoStampPaidAt`).

### 9.7 `noOverlap` — anti-sobreposição de períodos

Rejeita registros cujo intervalo `[startField, endField]` se sobrepõe ao de outro
registro existente que compartilhe o mesmo escopo. Avaliado em create e update;
`isSystem` faz bypass. Usa query SQL (`countOverlaps`), **não** full scan.

```typescript
noOverlap: [
  {
    startField: 'startAt',
    endField: 'endAt',
    scopeFields: ['unitId', 'responsibleEmployeeId'],
    errorMessage: 'Conflito de agenda: já existe outro compromisso nesse período.',
  },
]
```

| Campo | Descrição |
|---|---|
| `startField` / `endField` | Campos de início/fim do intervalo (date/datetime). |
| `scopeFields` | Conflito só vale dentro do mesmo escopo (ex: mesma unidade **e** mesmo profissional). Um campo de escopo **ausente/vazio** no registro é ignorado. |
| `errorMessage` | Mensagem quando há conflito. |

Teste de sobreposição **half-open**: `existente.start < novo.end AND existente.end >
novo.start`. Logo, intervalos adjacentes (11:00-12:00 após 10:00-11:00) **não**
conflitam. A comparação usa `datetime()` no SQL para normalizar fusos/formatos ISO.

### 9.8 `ui.presentation` — dica de apresentação

Sinaliza ao front (e ao roteador de views) como a tabela deve ser apresentada.
Lido pelo helper `isNavigable(table)`.

```typescript
ui: { presentation: 'embedded' }
```

| Valor | Significado |
|---|---|
| `'standalone'` | **Default.** Tabela navegável; aparece nas views de categoria. |
| `'embedded'` | Filha/detalhe de outra tabela (ex: `saleItems`); não aparece sozinha. |
| `'system'` | Infraestrutura interna (ex: `analyticsDefinitions`); nunca editável pelo usuário — o `canManageData` bloqueia escrita. |

---

## 10. Onde cada metadado é executado (backend)

| Metadado | Onde roda | Operação |
|---|---|---|
| `required`, `format`, `validation` | `validateDataAgainstSchema` (`buildZodSchema`) | create, update |
| `unique` | `validateAdvancedRules` | create, update |
| `relation` (existência do alvo) | `validateAdvancedRules` | create, update |
| `compositeUnique` | `validateAdvancedRules` | create, update |
| `requiredIf` | `validateAdvancedRules` | create, update |
| `compare` | `validateAdvancedRules` | create, update |
| `noOverlap` | `enforceNoOverlap` (`countOverlaps`) | create, update¹ |
| `lifecycle` | `updateTableData` (Guard 3) | update¹ |
| `readOnly` | `updateTableData` (Guard 1) | update¹ |
| `immutableAfter` | `updateTableData` (Guard 2) | update¹ |
| `deleteConstraints` | `deleteTableData` | delete |
| `meta` (capabilities) | `installPresetAsSystem` | instalação |
| `searchable` | **frontend** (`getSearchableFields`) | busca textual |
| `ui.presentation` | roteador de views (`isNavigable`) + `canManageData` | navegação/escrita |
| `hidden`, `readOnly` (UI) | **frontend** (`DynamicForm`) | renderização do form |

> ¹ **Bypass de sistema:** `readOnly`, `immutableAfter`, `lifecycle` e `noOverlap`
> são pulados para escritas de sistema (`isSystem: true`) — plugins precisam ajustar
> campos protegidos e o sistema cria registros sem passar pelos guards.

> Além desses, há **plugins de regra** (`rules/plugins/`) que cuidam **apenas** de
> lógica de domínio não-declarável: side-effects cross-table (ex: `SalesPlugin`
> reserva estoque e materializa comissões), campos computados (ex: `GoalsPlugin`
> calcula `result`) e checagens contra `now` (ex: `AppointmentsPlugin` impede
> concluir antes do horário). Validação pura é sempre metadado, nunca plugin.

---

## 11. Checklist para criar um novo módulo

1. **Reutilize field presets.** Importe de `../../fields`. Só declare inline o
   que for específico da tabela.
2. **`name`, `description`, `category`** no topo. Categoria válida em
   `TableCategories.ts`.
3. **`defaultDisplayField`** — escolha o campo que melhor representa um registro.
4. **`meta`** se a tabela depende de / fornece capacidades.
5. **Relations** com `@@PRESET_TABLE_KEY::<chave>`.
6. **Governança onde fizer sentido:**
   - Campos só-sistema → `readOnly: true`.
   - Campos obrigatórios condicionais → `requiredIf`.
   - Combinações únicas → `compositeUnique`.
   - Comparações entre campos (fim > início) → `compare`.
   - Estados que travam edição → `immutableAfter`.
   - Transições de status permitidas → `lifecycle`.
   - Tabelas com período/agenda → `noOverlap`.
   - Referências que bloqueiam/cascateiam delete → `deleteConstraints`.
   - Tabela embedded/system → `ui.presentation`.
7. **`searchable: false`** já vem dos field presets de número/data/relation/bool.
   Para selects, decida caso a caso.
8. **Registre no system** via `createTableFromModule` no preset apropriado.
9. **Valide:** `cd server && npx tsc --noEmit` e `npm run build`.

> **Regra de ouro da governança:** se a regra é validação pura (presença,
> comparação, transição, unicidade, formato), ela é **metadado** e qualquer tabela
> custom do usuário a herda de graça. Só vá ao plugin para side-effects cross-table,
> campos computados ou checagens contra o relógio (`now`).

---

## 12. Erros comuns

| Erro | Causa |
|---|---|
| Relação não resolve na instalação | Chave do `@@PRESET_TABLE_KEY::` não bate com a chave em `tables`. |
| Instalação rejeitada por capability | `requiresCapabilities` sem nenhum módulo que forneça. |
| Campo "some" do formulário | `hidden: true` (intencional) ou erro de digitação no `name`. |
| Update rejeitado inesperadamente | Campo marcado `readOnly` ou regra `immutableAfter` disparando. |
| Busca não encontra um campo | Campo com `searchable: false`. |
| Label aparece em EN para usuário PT | Falta a entrada `database:fields.<name>` no `common.json` PT. |

---

_Última atualização: alinhada com `models/DynamicTable.model.ts` — governança de
campo (`readOnly`, `searchable`, `requiredIf`) e de schema (`compositeUnique`,
`immutableAfter`, `compare`, `lifecycle`, `noOverlap`, `ui.presentation`) — e a
arquitetura de 3 camadas fields → modules → systems._
