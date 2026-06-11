# Validação & Governança — O Motor

> **Como e onde** cada regra é executada no `services/DynamicTableService.ts`.
> Este doc é o complemento de execução da referência de autoria em
> [`../presets/README.md`](../presets/README.md) (§7–9, que descreve **o que** cada metadado significa).
>
> Princípio central: **validação pura é declarativa (metadado), aplicada pelo motor genérico**; plugins
> só entram para side-effects/cross-table/checagens vs `now` (ver [rules-engine.md](./rules-engine.md)).
> Por isso **qualquer tabela** — inclusive custom do usuário — herda toda a governança sem código.

---

## 1. Ordem de execução

### Create (`createTableData`)
| # | Etapa | O que faz |
|---|---|---|
| 1 | `validateDataAgainstSchema` | Zod dinâmico: `required`, `format`, `validation` (min/max). |
| 2 | `validateAdvancedRules` | unique · relation · compositeUnique · requiredIf · compare. |
| 3 | `enforceNoOverlap` | anti-sobreposição de períodos. |
| 4 | `runRules('beforeCreate')` | plugins (mutação de `ctx.after` **persiste**). |
| 5 | `repository.createData` | grava. |
| 6 | `runRules('afterCreate')` | plugins (side-effects pós-gravação). |

### Update (`updateTableData`)
| # | Etapa | O que faz |
|---|---|---|
| 1 | `validateDataAgainstSchema` | valida o payload. |
| 2 | **Guard 1 — readOnly** | rejeita payload que tente mudar campo `readOnly`. |
| 3 | `mergedData = {...existente, ...payload}` | estado completo do registro pós-update. |
| 4 | **Guard 2 — immutableAfter** | congela campos/registro quando a condição de estado é satisfeita. |
| 5 | **Guard 3 — lifecycle** | valida a transição do campo de status. |
| 6 | `validateAdvancedRules` | roda sobre `mergedData` (funciona em updates parciais). |
| 7 | `enforceNoOverlap` | sobre `mergedData`, excluindo o próprio registro. |
| 8 | `runRules('beforeUpdate')` | plugins (mutação de `ctx.after` **persiste** — ver §6). |
| 9 | `repository.updateData(persistedData)` | grava o estado mutado. |
| 10 | `runRules('afterUpdate')` | plugins. |

### Delete (`deleteTableData`)
`runRules('beforeDelete')` → **deleteConstraints** → soft delete → `runRules('afterDelete')`.

> **Bypass `isSystem`.** Escritas de sistema (`(data as any).__isSystem`, ou plugins escrevendo via
> `ctx.repository.*`) **pulam** Guard 1, Guard 2, Guard 3 e `enforceNoOverlap`. O sistema precisa
> ajustar campos protegidos (ex: `SalesPlugin` mexe em `stock`/`reserved`) e criar registros sem
> esbarrar nos guards. `validateAdvancedRules` e o Zod continuam valendo.

---

## 2. `validateDataAgainstSchema` (dado de linha)

`buildZodSchema(schema)` constrói um validador Zod **em runtime** a partir dos `fields`, tipando por
`field.type` e aplicando `required`, `format` (email/cpf/cnpj/phone/url), `regex`, `validation`
(minLength/maxLength/minValue/maxValue) e `options` (select). É a única etapa que chama `.parse()` sobre
o `data` do registro. **Não** conhece a governança de nível-tabela nem `readOnly`/`searchable`/
`requiredIf` — esses são aplicados nas etapas seguintes.

---

## 3. `validateAdvancedRules` — 5 blocos

Roda em create (sobre `validatedData`) e update (sobre `mergedData`, então enxerga o registro completo).
Recebe `dataIdToExclude` no update para não conflitar consigo mesmo.

| Bloco | Regra | Implementação |
|---|---|---|
| 1 | **unique** (campo) | `repository.countByFieldValue(tableId, field, value, excludeId)` — query indexada. |
| 2 | **relation** (existência do alvo) | `repository.existsByIdInTable(id, targetTable)`. |
| 3 | **compositeUnique** | varre a tabela e compara a combinação de campos (débito: full scan; melhoria futura análoga ao noOverlap). |
| 4 | **requiredIf** | para cada campo com `requiredIf`, avalia a condição (`eq`/`neq`/`in`) sobre o registro; se satisfeita e o campo está vazio → erro. |
| 5 | **compare** | para cada regra, lê `left`/`right`; **pula se algum ausente**; tipa por `field.type` (date→timestamp, number→Number, resto→string); compara conforme `op`. |

---

## 4. Os três Guards (update)

- **Guard 1 — `readOnly`** (campo): se o payload tenta alterar um campo `readOnly`, rejeita. É
  enforcement de backend (não só "esconder no front").
- **Guard 2 — `immutableAfter`** (tabela): quando `condition` (`eq`/`in`) é satisfeita pelo estado
  **atual**, bloqueia mudanças. `scope: 'all'` congela o registro inteiro; `scope: string[]` congela só
  aqueles campos. Ex: venda `Paid` não pode ter `totalAmount` alterado.
- **Guard 3 — `lifecycle`** (tabela): máquina de estados. Só roda em **update**; `prev → next` precisa
  estar em `transitions[prev]`. Estados ausentes do mapa são **terminais**. Same-state é no-op. O estado
  inicial (no create) é validado pelo `options` do select, não aqui.

`immutableAfter` + `lifecycle` se complementam: o `lifecycle` diz **para onde** o status pode ir; o
`immutableAfter` (scope `'all'`) congela o registro quando ele chega a um estado terminal.

---

## 5. `enforceNoOverlap` — anti-sobreposição

Roda em create e update; **bypass `isSystem`**. Para cada regra `noOverlap`:
- lê `startField`/`endField`; se algum ausente/inválido (`Date` NaN), **pula** (presença é papel de
  `required`/`compare`);
- monta o escopo só com `scopeFields` presentes no registro;
- chama `repository.countOverlaps(...)` — **query SQL** (`$queryRaw` + `datetime(json_extract(...))`),
  **não** full scan. Teste **half-open**: `existente.start < novo.end AND existente.end > novo.start`,
  logo intervalos adjacentes não conflitam. `datetime()` normaliza fusos/formatos ISO.

> `findRowsReferencingId` (usado no delete scan) tem `LIMIT 100` e **não** serve para lógica de
> negócio; `countOverlaps`/`findRowsByFieldValue` são sem limite. Ver [rules-engine.md](./rules-engine.md).

---

## 6. Persistência de mutações em `beforeUpdate` (bug corrigido)

No update, o contexto do plugin (`afterWithId`) é uma cópia de `mergedData` + `id`. Antes, o service
persistia `mergedData` (não a cópia mutada), então campos computados que plugins escreviam em
`ctx.after` **eram descartados em update** (funcionavam só em create). Corrigido: o service extrai
`const { id, ...persistedData } = afterWithId` e persiste `persistedData`. Assim, mutações de
`GoalsPlugin` (result), `LeadsPlugin` (score), `SalesPlugin` (status/dueDate), `CommissionsPlugin`
(paidAt) etc. agora persistem em update.

---

## 7. `deleteConstraints` (delete)

Avaliadas no delete sobre quem **referencia** o registro:

| `type` | Comportamento |
|---|---|
| `RESTRICT` | bloqueia se houver qualquer referenciador. |
| `RESTRICT_IF_AGGREGATE` | bloqueia só se a soma de `aggregate.field` dos referenciadores satisfizer `operator`+`value`. |
| `CASCADE` | soft-deleta os referenciadores (recursivo, respeitando as constraints deles). |
| `IGNORE` | não bloqueia nem cascateia. |

**Padrão:** se uma tabela referencia o registro e não há constraint declarada, aplica `RESTRICT` (protege
contra exclusão acidental). A varredura de referenciadores usa `findRowsReferencingId` (query indexada).

---

## 8. Resumo: onde cada metadado roda

| Metadado | Etapa | Operação | Bypass `isSystem`? |
|---|---|---|---|
| `required`, `format`, `validation` | `validateDataAgainstSchema` | create, update | não |
| `unique`, `relation`, `compositeUnique`, `requiredIf`, `compare` | `validateAdvancedRules` | create, update | não |
| `readOnly` | Guard 1 | update | **sim** |
| `immutableAfter` | Guard 2 | update | **sim** |
| `lifecycle` | Guard 3 | update | **sim** |
| `noOverlap` | `enforceNoOverlap` | create, update | **sim** |
| `deleteConstraints` | delete | delete | — |
| `searchable` | frontend (`getSearchableFields`) | busca textual | — |
| `ui.presentation` | roteador de views (`isNavigable`) + `canManageData` | navegação/escrita | — |
