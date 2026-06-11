# dashboard/components

> Components que renderizam **dados dinâmicos do ERP** — formulários, botões de ação, sidebar de detalhes, e o overview da dashboard. Esses são os blocos schema-aware que vivem entre a API e as category-views.

**Status:** ✅ Gold Standard (auditado)

---

## 1. Estrutura

```
components/
├── DashboardOverview.tsx       (entry de boas-vindas + atalhos para categorias)
├── forms/
│   ├── DynamicForm.tsx         (orquestrador schema-driven)
│   ├── RelationSelector.tsx    (dropdown async para fields type=relation)
│   └── dynamic-form-fields/    (10 componentes de input por tipo)
└── shared/                     (utils e componentes que outras pastas consomem)
    ├── dynamic-tables.client.ts
    ├── relation-utils.client.ts
    ├── EditRecordButton.tsx
    ├── FloatingActionButton.tsx
    ├── GenericDataSidebar.tsx
    └── README.md               (doc específica da subpasta)
```

---

## 2. File Map

### Top-level

| Arquivo | Responsabilidade |
|---|---|
| `DashboardOverview.tsx` | Tela de boas-vindas. 4 atalhos rápidos (Finance/People/Commercial/Planning) + placeholders para futuro KPI panel e Support hub. |

### `forms/` — Schema-driven form rendering

| Arquivo | Responsabilidade |
|---|---|
| `DynamicForm.tsx` | Orquestrador do form. Mapeia cada `ISchemaField` para o componente correto via dispatch por tipo + heurística por nome (currency, percentage, work schedule, BANT slider, textarea, report type). Validação inline + agrupamento automático de campos de endereço. |
| `RelationSelector.tsx` | Dropdown async (com portal) para `type === 'relation'`. Faz lookup ao montar via `fetchRelatedTableData`. Suporta single + multiple. |

### `forms/dynamic-form-fields/`

| Arquivo | Renderiza |
|---|---|
| `InputField.tsx` | text/number/date/email/tel com máscaras automáticas (CPF/CNPJ/phone) |
| `CepAddressField.tsx` | CEP brasileiro com lookup automático em ViaCEP + auto-fill de endereço via `applyPatch` |
| `CurrencyField.tsx` | Valor monetário com símbolo + locale do `CurrencyContext` (BRL/USD/EUR/…) |
| `PercentageField.tsx` | Percentual locale-aware (separator pt-BR vs en-US), clamped [0,100] |
| `SelectField.tsx` | `<select>` com options i18n via `database:options.*` |
| `SelectOrInputField.tsx` | Toggle entre InputField livre e SelectField — usado em campos com whitelist opcional |
| `CheckboxField.tsx` | Toggle visual estilizado para boolean |
| `TextareaField.tsx` | Textarea com 6 rows |
| `SliderDiscrete.tsx` | Slider segmentado por opções discretas (ex: BANT — low/medium/high) |
| `WorkScheduleField.tsx` | Editor de horários por dia (mon-sun) com preset Mon-Fri 09:00–18:00 |

### `shared/`

| Arquivo | Responsabilidade |
|---|---|
| `dynamic-tables.client.ts` | **Type definitions canônicas** (`IDynamicTable`, `IDynamicTableData`, `ITableSchema`, `ISchemaField`) + `isTableSchema()` type guard + `useTableData()` hook. Importado por **todo** o módulo dashboard. |
| `relation-utils.client.ts` | `fetchRelatedTableData()` + `formatRelatedDisplayValue()` — helpers client-side para resolver labels de relations. |
| `EditRecordButton.tsx` | Botão pencil que abre Modal com `DynamicForm` em modo edit. Trata field-level errors do backend (`details`). |
| `FloatingActionButton.tsx` | Botão azul "+" que abre Modal com `DynamicForm` em modo create. Trata mesma estrutura de erro. Lazy-loads `DynamicForm` via `next/dynamic`. |
| `GenericDataSidebar.tsx` | Slide-over panel read-only para inspecionar um record. Resolve relations via `useTableRelationLookups`. |

Detalhes adicionais em [`shared/README.md`](./shared/README.md).

---

## 3. Gold Standard Patterns (auditoria)

| Padrão | Aplicação |
|---|---|
| **Zero `as any` no código** | `DynamicForm` antes tinha 8 `{...(props as any)}` casts polimórficos — eliminados via widening de `value: unknown` / `format: string` em `InputField`, `CepAddressField`, `SliderDiscrete`. Todos os field components agora aceitam props vagas e fazem coerção interna. |
| **EN fallbacks em todo `t()`** | Sem PT em strings de fallback. `EditRecordButton` agora usa `Edit` / `Record` (antes `Editar` / `Registro`). |
| **Heurísticas multilíngues onde aplicável** | `EditRecordButton.themeColor` checa `produto` OR `product` para suportar ambos os idiomas. |
| **`useCallback` em handlers** | `handleSubmit`, `handleOpenModal`, `handleCloseModal`, `handleUpdateRecord`, `handleDirtyChange`, `handleFieldChange`, `openDropdown`, `toggleOption`, `loadRelatedData`, etc. |
| **`import type` para types** | `ITableSchema`, `IDynamicTableData`, `ISchemaField`, `ApiErrorShape`. |
| **Type guards para `unknown`** | `isTableSchema()` em `GenericDataSidebar` para resolver schemas heterogêneos com segurança. |
| **`catch (err: unknown) + instanceof Error`** | Padrão consistente em `RelationSelector`, `CepAddressField`, `EditRecordButton`, `FloatingActionButton`, `dynamic-tables.client`. |
| **Locale-aware sem hardcode** | `CurrencyField` e `PercentageField` derivam locale de `CurrencyContext`. `formatRelatedDisplayValue` usa `formatDate` (que respeita locale). |
| **Comentários em EN** | `dynamic-tables.client.ts` teve comentário PT trocado por EN. |
| **Rules of Hooks** | `RelationSelector` documenta explicitamente que `openDropdown` deve ficar **antes** dos early returns (comentário no código). |

---

## 4. Padrão de dispatch em `DynamicForm`

O renderizador escolhe o componente de campo por uma **prioridade combinada**:

1. **Heurística por nome** (no renderField, mais alto):
   - `isWorkSchedule` (json + nome contém schedule/horario) → `WorkScheduleField`
   - `isCurrency` (number + nome contém price/amount/total/valor/preço) → `CurrencyField`
   - `isPercentage` (number + nome contém percent/commission) → `PercentageField`
   - `isBantSelect` (select + nome ∈ BANT) → `SliderDiscrete`
   - `isTextarea` (textarea OR string com nome description/notes/observações) → `TextareaField`
   - `isReportTypeSelect` (select com label "relatório/report") → `SelectOrInputField`

2. **Dispatch por tipo** (fallback via `fieldComponentMap`):
   - `string` → InputField (com sub-dispatch por format: email/phone/cpf/cnpj/CEP)
   - `number` → InputField type="number"
   - `date`/`datetime` → InputField type="date"
   - `textarea` → TextareaField
   - `select` → SelectField
   - `boolean`/`checkbox` → CheckboxField
   - `relation` → RelationSelector

Isso permite que o schema declare apenas `type: 'number'` e o form decida visualmente se é currency, percentage ou inteiro pelo nome do campo — sem o backend precisar declarar o sub-tipo.

---

## 5. Como adicionar um novo tipo de campo

1. Criar `components/forms/dynamic-form-fields/MyNewField.tsx`
   - Aceitar props compatíveis com `FieldComponentProps` (value: unknown, name, onChange)
   - Fazer coerção interna do `value`
2. Em `DynamicForm.tsx`:
   - Importar o componente
   - Adicionar entrada no `fieldComponentMap` se for despachado por tipo do schema, OU
   - Adicionar branch no `renderField` se for heurística por nome/label
3. Se for um type novo que o backend declarará: adicionar em `ISchemaField.type` (em `dynamic-tables.client.ts`)

---

## 6. Tech debt restante

Nenhum no código atual. Todas as casts foram removidas, todos os fallbacks são EN, todos os handlers usam `useCallback`.

---

## 7. Related

- **`category-views/shared/`** — Hooks/components compartilhados pelas views (`useTableColumnControls`, `useColumnSort`, `CategoryHeader`, etc.)
- **`dashboard/shared/`** — Infraestrutura cross-feature (notificações, modais, formatters)
- **Skill `category-view-standard`** — Padrões teóricos do módulo dashboard

---

_Última atualização: 2026-05-27 · Auditoria Gold Standard concluída._
