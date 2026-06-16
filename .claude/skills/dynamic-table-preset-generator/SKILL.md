---
name: dynamic-table-preset-generator
description: Gera novo módulo de preset ERP schema-driven para DynamicTables, com campos tipados, relações e registro no system preset
argument-hint: "[nome-do-sistema] [categoria/modulo-opcional]"
allowed-tools: Read, Grep, Glob, Write, Edit
---

# Dynamic Table Preset Generator

## Purpose

Gera módulos de preset para o sistema ERP schema-driven do Luminaris. Cada módulo define uma tabela virtual com campos tipados, relações entre tabelas e comportamentos especiais (obrigatoriedade, validação, valor default).

## Contrato obrigatório

Antes de gerar, leia `.claude/skills/_ARCHITECTURE-CONTRACT.md` — as regras cross-cutting (camadas, no-`any`, soft-delete, money math, testes, verificação) são **gate** e não se repetem aqui. Esta skill adiciona apenas o checklist específico de **Dynamic Table Preset**.

## Checklist obrigatório — Dynamic Table Preset

- [ ] **`export const <name>Module`** (named export, camelCase) com `schema` tipado **`as ITableSchema`** (NÃO `as const` — quebra a inferência para `PresetTableDefinition`).
- [ ] **`category` é um `DynamicTableCategory` válido** (`TableCategories.ts`) — `commercial, products, services, inventory, finance, people, leads, planning, kanban, operations, marketing, business, administrative, other`. **Não existe `crm`** — entidades de funil usam `leads`.
- [ ] **Tipos de campo válidos apenas:** `string`, `number`, `date`, `datetime`, `boolean`, `select`, `relation`, `textarea`, `json`. Nada fora desta lista.
- [ ] **Relações via `@@PRESET_TABLE_KEY::<internalName>`** — `{ type: 'relation', relation: { targetTable: '@@PRESET_TABLE_KEY::<internalName>' } }`. Nunca referenciar tabela externa sem o prefixo.
- [ ] **Reusar field presets de `presets/fields/`** (ex.: `email`, `phone` de `TextPresets`) — não redefinir campos que já existem.
- [ ] **`select` sempre com `options: string[]`**; **`number` com `numberFormat`** (`currency|percentage|integer|decimal`); validação `{ minValue, maxValue }` onde fizer sentido.
- [ ] **Registrar o suite no `<System>Preset.ts`** (objeto `PresetSuite`, `tables` é `Record<string, PresetTableDefinition>` — a **chave é o `internalName`/`presetKey`**) **E** em `tablePresetSuites` (`presets/index.ts`) se for selecionável. Suite fora de `tablePresetSuites` é órfão: compila mas não é instalável.
- [ ] **Módulo selecionável NÃO é adicionado ao `CoreSystemPreset`** — vive no seu próprio `PresetSuite` em `systems/`.

### Lição CRM — board/relação precisa de pai com etapas

Um board (Kanban/funil) só renderiza se a entidade-filha tem um **registro-pai com etapas**. No CRM: `leads` agrupam por `stageId`, que pertence a um `pipeline` (pai). Um preset que cria a tabela de `leads` **sem** também prover a tabela-pai `pipeline` + a tabela de `stages` (etapas) — e sem os campos de relação casados (`pipelineId`, `stageId`) — deixa a UI **sem colunas e sem dados**: o board não tem por onde agrupar. Portanto:

- [ ] Entidade que aparece em board/funil **inclui no suite** a tabela-pai (pipeline) e as etapas (stages), não só a folha.
- [ ] Os campos de relação da folha apontam para o pai e a etapa (`pipelineId` → pipeline, `stageId` → stages) via `@@PRESET_TABLE_KEY::`.
- [ ] O motor valida campos compostos obrigatórios casados (criar `leads` exige `unitId` + `pipelineId` + `stageId`) — reflita isso no schema e nos seeds.

## When to use

- Novo tipo de negócio precisa de tabelas ERP (ex: clínica, escola, restaurante)
- Adicionando módulo a sistema ERP existente
- Criando novo tipo de campo reutilizável em `presets/fields/`
- Adicionando preset de sistema completo

## Inputs

- `$ARGUMENTS[0]`: nome do sistema (ex: `"Clinica Estetica"`)
- `$ARGUMENTS[1]`: módulo específico (ex: `agendamentos`) — opcional

## Repository patterns to inspect first

```
server/src/features/dynamicTables/presets/modules/core/LeadsModule.ts
server/src/features/dynamicTables/presets/modules/crm/CrmContactsModule.ts   ← módulo CRM novo (referência)
server/src/features/dynamicTables/presets/fields/text/TextPresets.ts
server/src/features/dynamicTables/presets/fields/relation/RelationPresets.ts
server/src/features/dynamicTables/presets/systems/CoreSystemPreset.ts        ← suite auto-instalada
server/src/features/dynamicTables/presets/systems/CrmModulePreset.ts         ← suite SELECIONÁVEL (não auto-instalada)
server/src/features/dynamicTables/presets/index.ts                           ← type PresetSuite
server/src/features/dynamicTables/models/TableCategories.ts                  ← categorias válidas (DynamicTableCategory)
server/src/features/dynamicTables/models/DynamicTable.model.ts
```

## ⭐ Exemplo de referência canônico (espelhe este arquivo)

`server/src/features/dynamicTables/presets/modules/core/LeadsModule.ts` — módulo perfeito: named export camelCase, `schema` tipado `as ITableSchema` (não `as const`), `category: 'leads'` (válido em `DynamicTableCategory`), reusa field presets (`email`, `phone`, `notes`, `unitId`) de `presets/fields/`, relações via `@@PRESET_TABLE_KEY::` (`pipelineId`→leadPipelines, `stageId`→leadStages), `select` sempre com `options`, `number` com `numberFormat` + `validation { minValue, maxValue }`. Para o registro do suite **selecionável**, espelhe `presets/systems/CrmModulePreset.ts` (`PresetSuite` com `tables` como `Record<string, PresetTableDefinition>` onde a chave É o `internalName`, trazendo o pai `leadPipelines`/`leadStages` junto da folha `leads`) e os field presets em `presets/fields/`. Leia-os ANTES de gerar.

## Generation contract

### Módulo (arquivo principal)

1. Arquivo: `server/src/features/dynamicTables/presets/modules/<category>/<Name>Module.ts`
2. Importar field presets reutilizáveis de `../../fields/` + `import type { ITableSchema } from '../../../models/DynamicTable.model'`
3. Exportar named const — **`schema` tipado com `as ITableSchema`** (NÃO `as const`, que quebra a inferência):
   ```ts
   export const <name>Module = {
     name: 'Display Name',
     description: 'Description',
     category: '<category>',          // deve ser um DynamicTableCategory válido (ver abaixo)
     schema: {
       defaultDisplayField: '<campo-principal>',
       fields: [...]
     } as ITableSchema,
   };
   ```
4. `category` deve ser uma chave válida de `DynamicTableCategory` (`TableCategories.ts`): `commercial, products, services, inventory, finance, people, leads, planning, kanban, operations, marketing, business, administrative, other`. **Não existe categoria `crm`** — use `leads` para entidades do funil.
5. Campos tipados: cada campo tem `{ name, label, type, required, searchable }` mínimo
6. Tipos de campo válidos: `string`, `number`, `date`, `datetime`, `boolean`, `select`, `relation`, `textarea`, `json`
6. Relações: `{ type: 'relation', relation: { targetTable: '@@PRESET_TABLE_KEY::<internalName>' } }`
7. Select fields: sempre incluir `options: string[]`
8. Number fields: incluir `numberFormat: 'currency' | 'percentage' | 'integer' | 'decimal'`
9. Validation: `{ minValue, maxValue }` para numbers
10. `defaultValue` para campos com valor inicial definido

### Field presets reutilizáveis

1. Arquivo: `server/src/features/dynamicTables/presets/fields/<type>/<Name>Presets.ts`
2. Exportar named consts de campo parcial: `export const <fieldName> = { name, label, type, ... }`

### System preset (registro) — objeto `PresetSuite`, não array

Um preset suite é um `PresetSuite` (de `../index`) com `tables` sendo um **`Record<string, PresetTableDefinition>`** — a **chave do objeto vira o `internalName`/`presetKey`** referenciado por `@@PRESET_TABLE_KEY::<chave>`.

```ts
import type { PresetSuite } from '..';
import { createTableFromModule } from '../../utils/TableFactory';
import { <name>Module } from '../modules/<category>/<Name>Module';

export const <System>Preset: PresetSuite = {
  key: '<systemKey>', name: 'Nome', description: '...',
  tables: {
    <internalNameKey>: createTableFromModule(<name>Module),   // chave = internalName
  },
};
```

**Auto-instalado vs selecionável:**
- `CoreSystemPreset` é instalado para TODO usuário na criação da conta → tabelas de infraestrutura (units, employees, leads…).
- Um **módulo selecionável** (ex: `CrmModulePreset`) é um `PresetSuite` próprio em `systems/` que NÃO é adicionado ao `CoreSystemPreset` — o usuário escolhe instalar. Depende do Core para relações a `units`/`employees`.
- Para isolamento/auditoria: módulos selecionáveis ficam todos sob seu próprio namespace (`modules/<grupo>/`, `systems/<Grupo>Preset.ts`), sem mutar módulos do Core.

### ⚠️ OBRIGATÓRIO — registrar o suite selecionável em `tablePresetSuites` (`presets/index.ts`)

Definir e exportar o `PresetSuite` em `systems/` **não basta**. Todos os consumidores (`PresetService`, `AnalyticsService`, `dashboardController`) descobrem suites iterando **`tablePresetSuites`** em `presets/index.ts`. Um suite fora desse registro é um **órfão**: compila (tsc verde) mas **não é selecionável nem instalável** pelo fluxo normal — só "funciona" via seed direto. Bug silencioso que o `tsc` NÃO pega.

```ts
// presets/index.ts
import <System>Preset from './systems/<System>Preset';

export const tablePresetSuites = {
  services: { beautySalon: BeautySalonPreset },
  <categoria>: { <suiteKey>: <System>Preset },   // ← SEM isto, o suite é invisível
};
```
A `<categoria>` é uma chave livre do registro (NÃO precisa ser um `DynamicTableCategory`); os consumidores iteram via `Object.entries`/`Object.values`, então adicionar categoria nova é seguro.

## Files usually created or changed

```
server/src/features/dynamicTables/presets/modules/<category>/<Name>Module.ts    ← NEW (define a tabela)
server/src/features/dynamicTables/presets/systems/<System>Preset.ts             ← NEW (define o suite)
server/src/features/dynamicTables/presets/index.ts                              ← EDIT (registra em tablePresetSuites — OBRIGATÓRIO p/ suite selecionável)
server/src/features/dynamicTables/presets/fields/<type>/<Name>Presets.ts        ← NEW (se campo novo)
```

## Required checks

```bash
cd server && npx tsc --noEmit
# Suite selecionável: confirmar que está REGISTRADO (não basta existir o arquivo)
grep -n "<suiteKey>" server/src/features/dynamicTables/presets/index.ts   # deve aparecer dentro de tablePresetSuites
```

## Anti-patterns

- Não use tipos de campo inválidos — apenas: string, number, date, datetime, boolean, select, relation, textarea, json
- Não use `as const` no schema — use `as ITableSchema` (o `as const` quebra a atribuição a `PresetTableDefinition`)
- Não invente `category` — só as chaves de `DynamicTableCategory` (não há `crm`; use `leads`)
- Não trate `tables` como array — é um `Record<string, ...>` onde a chave É o `internalName`
- Não referencie tabelas externas sem usar o prefixo `@@PRESET_TABLE_KEY::`
- Não crie campos de relação sem definir `relation.targetTable`
- Não adicione um módulo selecionável ao `CoreSystemPreset` — crie um `PresetSuite` próprio em `systems/`
- **Não esqueça de registrar o suite selecionável em `tablePresetSuites` (`presets/index.ts`)** — definir o `PresetSuite` em `systems/` sem registrá-lo deixa o módulo órfão (tsc verde, mas não instalável). Verifique com `grep <suiteKey> presets/index.ts`.
- Não duplique campos que já existem em `presets/fields/` — reutilize os presets existentes
- **Atenção runtime (não é erro de tsc):** o motor valida campos compostos obrigatórios (ex: criar `leads` exige `unitId` + `pipelineId` + `stageId` casados) e bloqueia hard-delete de registros referenciados (ex: um lead com `leadActivities` — apague as atividades antes). Reflita isso nos seeds/clients.
- **Não crie a entidade-folha de um board sem o pai com etapas** (lição CRM): `leads` sem `pipeline` + `stages` no mesmo suite, ou sem os campos de relação `pipelineId`/`stageId` casados, deixa a UI **sem colunas e sem dados** — o board não tem por onde agrupar. Board/funil sempre traz pai (pipeline) + etapas (stages) + relações.
