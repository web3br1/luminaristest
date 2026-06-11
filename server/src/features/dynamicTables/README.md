# Feature: Tabelas Dinâmicas (Dynamic Tables)

Permite que cada usuário crie e opere **tabelas próprias com schema personalizado**, sem migração de
banco. Toda a definição vive como JSON e os registros são validados dinamicamente contra esse schema.
A governança (validação, imutabilidade, máquina de estados, anti-sobreposição, regras de exclusão) é
**declarativa**: descrita em metadados do schema e aplicada por um motor genérico — então **qualquer
tabela, inclusive custom do usuário, opera corretamente sem código específico**.

## Modelo em uma frase

Não há tabela física por entidade. Existe `DynamicTable` (a **definição** — `schema` JSON) e
`DynamicTableData` (os **registros** — coluna `data` JSON). Cada "tabela" do usuário é uma linha em
`DynamicTable`; seus registros apontam para ela. Tudo é escopado por `userId`.

---

## 🗺️ Mapa de documentação

Comece pelo doc da sua necessidade:

| Você quer… | Leia |
|---|---|
| Entender o modelo de dados, o ciclo de vida das operações, os DTOs e a instalação de presets | [`docs/architecture.md`](./docs/architecture.md) |
| Saber **como e onde** cada regra é executada (guards, validação avançada, no-overlap, bypass de sistema) | [`docs/validation-and-governance.md`](./docs/validation-and-governance.md) |
| Trabalhar com **plugins** (contrato, hooks, detecção de tabela, fronteira metadado×plugin, catálogo) | [`docs/rules-engine.md`](./docs/rules-engine.md) |
| **Autorar** tabelas/presets e a referência completa de **cada metadado** (fields → modules → systems) | [`presets/README.md`](./presets/README.md) |

> Regra de divisão: `presets/README.md` é **o que declarar** (autoria); `docs/validation-and-governance.md`
> é **como executa**; `docs/rules-engine.md` é **plugins**; `docs/architecture.md` é **modelo/fluxo/contratos**.

---

## Estrutura de arquivos

```
features/dynamicTables/
├── README.md                  # este índice
├── docs/                      # architecture · validation-and-governance · rules-engine
├── dtos/                      # DynamicTable.dto.ts — contratos Zod (borda de validação)
├── models/                    # DynamicTable.model.ts — ITableSchema, ISchemaField, regras de governança
├── policies/                  # IDynamicTablePolicy + DynamicTablePolicy (autorização)
├── repositories/              # IDynamicTableRepository + DynamicTableRepository (Prisma; queries indexadas)
├── services/                  # DynamicTableService (CRUD + governança) + PresetService (instalação)
├── rules/                     # engine de plugins: RuleRegistry, RuleTypes, shared/, plugins/ (+ plugins/sales/)
├── utils/                     # TableFactory, RelationUtils, TableDependencyUtils, ...
└── presets/                   # fields/ · modules/ · systems/ + README (referência de autoria)
```

---

## Conceitos essenciais (resumo)

- **Validação dinâmica:** o `DynamicTableService` recupera o `schema` da tabela e constrói um validador
  Zod em runtime (`buildZodSchema`) para validar cada registro. Detalhe em
  [`docs/validation-and-governance.md`](./docs/validation-and-governance.md).
- **Governança declarativa:** `readOnly`, `searchable`, `requiredIf` (campo) e `deleteConstraints`,
  `compositeUnique`, `immutableAfter`, `compare`, `lifecycle`, `noOverlap`, `ui` (tabela). O **DTO**
  (`dtos/`) espelha o **modelo** (`models/`), então a borda valida e tipa toda a governança.
- **Engine de plugins:** lógica de domínio que **não** é declarável (side-effects cross-table, campos
  computados, checagens vs `now`). Plugins são opt-in via `supports()`. Detalhe em
  [`docs/rules-engine.md`](./docs/rules-engine.md).
- **Presets:** ERPs completos compostos em 3 camadas (fields → modules → systems), instalados em 2
  passagens com resolução de relações (`@@PRESET_TABLE_KEY::`). Detalhe em
  [`presets/README.md`](./presets/README.md).

---

## Autorização (resumo)

`policies/DynamicTablePolicy.ts`: criar/editar/excluir tabela são operações de sistema (bloqueadas por
padrão para o usuário direto); `canManageData` libera CRUD de **dados** ao dono — exceto tabelas
`ui.presentation: 'system'`, que são infra e nunca editáveis. Métodos `*AsSystem` no service rodam sem
política para fluxos confiáveis (instalação de presets, seeds).
