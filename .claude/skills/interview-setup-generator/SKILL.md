---
name: interview-setup-generator
description: Estende o wizard de onboarding AI (InterviewService + CustomizationService + FieldCustomizationService) — adiciona estágios, prompts, lógica de preset matching ou customização de campos
argument-hint: "[acao: novo-estagio|novo-prompt|field-customization|preset-matcher] [nome]"
allowed-tools: Read, Grep, Glob, Write, Edit
metadata:
  governance-skill-id: "SKL-INTERVIEW-SETUP"
  governance-version: "1.0.0"
  governance-status: "validated"
  governance-owner: "engineering"
  governance-last-evaluated: "2026-06-25"
  governance-eval-score: "1.00"
---

# Interview Setup Generator

## Purpose

Documenta e guia extensões do wizard de setup AI do Luminaris: máquina de estados com 11 estágios, 3 serviços (InterviewService, CustomizationService, FieldCustomizationService) e in-memory StateManager. É a skill correta quando o usuário pede "quero que o onboarding faça X" ou "adicionar pergunta/etapa ao wizard".

## Contrato obrigatório

Toda extensão (backend de serviços e qualquer UI de wizard/onboarding) deve cumprir `.claude/skills/_ARCHITECTURE-CONTRACT.md` (camadas, no-`any`, frontend service layer, reuse de canônicos, design system, i18n). O contrato é o gate final.

## ⭐ Exemplo de referência canônico (espelhe este slice)

O wizard de onboarding real vive nos dois lados — leia ambos antes de estender:

```
server/src/features/interview/InterviewService/InterviewService.ts   ← dispatcher principal (máquina de estados)
server/src/features/interview/InterviewService/PromptConfig.ts        ← system prompts por estágio
server/src/features/interview/models/InterviewTypes.ts                ← enums InterviewStage / ProcessableStage e tipos
my-app/features/interview/components/AiInterviewSetup/index.tsx        ← UI do wizard (entry point do chat de setup)
my-app/features/interview/hooks/useAiInterview.ts                     ← hook que orquestra o fluxo de turnos no frontend
```

Por que é o slice perfeito: `InterviewService.processTurn()` + `PromptConfig` + `InterviewTypes` são o backend canônico da máquina de estados (singletons via `getInstance()`), e `AiInterviewSetup/index.tsx` + `useAiInterview.ts` são o par de UI/hook que consome esse fluxo. Estender um estágio toca este conjunto exato.

## Checklist de wizard/onboarding (frontend)

- [ ] A tela do wizard/onboarding tem auth guard (`withAuth`/`useAuth`) e i18n (`serverSideTranslations` + strings em `public/locales/{en,pt}/<namespace>.json`; nada hardcoded).
- [ ] **[INTV-007] DOMAIN-BOUNDARY** — a UI do wizard chama a **service layer** (`lib/services/*.service.ts` via `apiClient`), nunca `fetch`/`apiClient` direto no componente; e o **backend** da máquina de estados (`InterviewService`/`PromptConfig`/`StageHandlers`/`CustomizationService`) é camada de servidor pura — zero React/JSX/hooks. Os dois lados nunca se misturam.
- [ ] **Reusa componentes canônicos** (`Modal`, `GenericTable`, etc.) — não recria modal/tabela próprios.
- [ ] **Pagina** se ler DynamicTable (fetch-all até `totalPages`, `limit=200`) — a API retorna só 50 por padrão.
- [ ] Trata estados de **loading/error** (não só happy path).
- [ ] Resolve DynamicTables por **`internalName`** (preset key), nunca por posição `[0]`.

## When to use

- Adicionar novo estágio ao wizard de onboarding
- Modificar prompt de sistema de um estágio existente
- Adicionar lógica de customização de tabela (nível CustomizationService)
- Adicionar lógica de customização de campo (nível FieldCustomizationService)
- Implementar novo preset matcher baseado em palavras-chave do negócio

## Inputs

- `$ARGUMENTS[0]`: ação — `novo-estagio` | `novo-prompt` | `field-customization` | `preset-matcher`
- `$ARGUMENTS[1]`: nome descritivo (ex: `CollectingIndustry`, `TaxConfigPrompt`)

## Architecture — máquina de estados e 3 serviços

```
InterviewService.processTurn(stage, messages, presetKey?, sessionId?)
  │
  ├── GREETING              → mensagem estática, avança para DISCOVERING_BUSINESS
  ├── DISCOVERING_BUSINESS  → AI com history; detecta "SUMMARY:" no texto → CONFIRMING_BUSINESS
  ├── CONFIRMING_BUSINESS   → AI verifica se user confirmou → MATCHING_PRESET
  ├── MATCHING_PRESET       → PresetMatcher.findMatchingPreset(messages) → AWAITING_CREATION_TYPE_CONFIRMATION
  ├── AWAITING_CREATION_TYPE_CONFIRMATION → StageHandlers.handleCreationTypeConfirmation()
  │     ├── direto   → COMPLETED
  │     └── customiz → CUSTOMIZATION_IN_PROGRESS (sessionId gerado)
  ├── CUSTOMIZATION_IN_PROGRESS → CustomizationService.processCustomizationStep(sessionId, messages)
  │     ├── add table    → CUSTOMIZATION_IN_PROGRESS (loop)
  │     ├── remove table → CUSTOMIZATION_IN_PROGRESS (loop)
  │     └── done         → CUSTOMIZATION_COMPLETED
  ├── CUSTOMIZATION_COMPLETED → FieldCustomizationService por tabela (opcional)
  ├── IDENTIFYING_ENTITIES → AI identifica entidades principais do negócio
  └── CANNOT_PROCEED / COMPLETED → terminais
```

**[INTV-001] Todos os serviços são singletons** — sempre acessar via `getInstance()`, nunca `new`.

## Repository patterns to inspect first

```
server/src/features/interview/InterviewService/InterviewService.ts     ← dispatcher principal
server/src/features/interview/InterviewService/PromptConfig.ts          ← system prompts por estágio
server/src/features/interview/InterviewService/StageHandlers.ts         ← AI response helpers
server/src/features/interview/InterviewService/PresetMatcher.ts         ← matching de preset
server/src/features/interview/CustomizationService/CustomizationService.ts ← table customization
server/src/features/interview/CustomizationService/StateManager.ts      ← in-memory session state
server/src/features/interview/CustomizationService/AIInteractions.ts    ← intent analysis
server/src/features/interview/FieldCustomizationService/index.ts        ← field customization
server/src/features/interview/FieldCustomizationService/FieldIntentParser.ts ← Zod JSON validator
server/src/features/interview/models/InterviewTypes.ts                  ← todos os tipos e enums
```

## Generation contract — adicionar novo estágio

### 1. Adicionar à enum `InterviewStage` em `models/InterviewTypes.ts`

```typescript
export type InterviewStage =
  | 'GREETING'
  | 'DISCOVERING_BUSINESS'
  // ... estágios existentes ...
  | 'COLLECTING_INDUSTRY'    // ← novo estágio
  | 'COMPLETED';
```

Se o novo estágio recebe resposta AI com history, adicioná-lo também em `ProcessableStage`:

```typescript
export type ProcessableStage =
  | 'DISCOVERING_BUSINESS'
  | 'CONFIRMING_BUSINESS'
  | 'IDENTIFYING_ENTITIES'
  | 'COLLECTING_INDUSTRY';   // ← se usa AI com history
```

### 2. Adicionar a config do estágio em `InterviewService/PromptConfig.ts`

O canônico é `stageConfig: Record<ProcessableStage, IStageConfig>` — **não** um `Record<…, string>`. Cada entrada é um
`IStageConfig` = `{ systemPrompt, completionCheckPrompt, nextStage }`. Como o `Record` cobre **todo** `ProcessableStage`,
adicionar o estágio à enum `ProcessableStage` (passo 1) obriga a adicionar a entrada aqui:

```typescript
export interface IStageConfig {
  systemPrompt: string;
  completionCheckPrompt: string;
  nextStage: InterviewStage;
}

export const stageConfig: Record<ProcessableStage, IStageConfig> = {
  DISCOVERING_BUSINESS: { systemPrompt: `...`, completionCheckPrompt: '', nextStage: 'CONFIRMING_BUSINESS' },
  CONFIRMING_BUSINESS:  { systemPrompt: `...`, completionCheckPrompt: `...`, nextStage: 'MATCHING_PRESET' },
  IDENTIFYING_ENTITIES: { systemPrompt: `...`, completionCheckPrompt: `...`, nextStage: 'COMPLETED' },
  COLLECTING_INDUSTRY: {
    systemPrompt: `
      Você está coletando informações sobre o setor/segmento da empresa.
      Faça UMA pergunta clara sobre o ramo de atuação.
      Quando o usuário responder com um setor específico, encerre com "INDUSTRY_CONFIRMED: <setor>".
    `,
    completionCheckPrompt: `O usuário informou um setor específico? Responda apenas 'true' ou 'false'.`,
    nextStage: 'MATCHING_PRESET',
  },
};
```

### 3. Implementar o handler em `InterviewService.processTurn()`

`getAiResponseWithHistory` é **método de instância** (`this.stageHandlers.…`) e recebe `(systemPrompt, messages)`
**nessa ordem** — leia a config via `stageConfig[stage]` e detecte o marcador no texto da resposta:

```typescript
case 'COLLECTING_INDUSTRY': {
  const config = stageConfig['COLLECTING_INDUSTRY'];
  const response = await this.stageHandlers.getAiResponseWithHistory(config.systemPrompt, messages);
  // Detectar marcador de conclusão no texto da resposta
  const industryMatch = response?.match(/INDUSTRY_CONFIRMED:\s*(.+)/);
  const nextStage: InterviewStage = industryMatch
    ? config.nextStage           // avançar quando confirmado (MATCHING_PRESET)
    : 'COLLECTING_INDUSTRY';      // continuar loop se não confirmou
  return { response: response ?? '', nextStage };
}
```

### 4. Inserir o novo estágio na sequência correta

Verificar em qual `case` do switch o estágio anterior deve avançar para o novo:

```typescript
case 'CONFIRMING_BUSINESS': {
  // ...
  return { response, nextStage: 'COLLECTING_INDUSTRY' }; // ← era MATCHING_PRESET
}
```

## Generation contract — customização de tabela (CustomizationService)

O `CustomizationService` gerencia sessões via `StateManager` (in-memory). Para adicionar nova ação de customização:

```typescript
// CustomizationService/AIInteractions.ts — adicionar novo intent
type UserIntent = 'add' | 'remove' | 'rename' | 'done'; // ← add 'rename'

// Prompt do analyzeUserIntent deve reconhecer o novo intent
const intentPrompt = `
  ...
  Se o usuário quer renomear uma tabela → responda apenas: rename
`;

// CustomizationService.ts — tratar o novo intent
if (intent === 'rename') {
  return await this.processRenamingTable(sessionId, messages);
}
```

**StateManager**: Armazena `ICustomizationState` por `sessionId` em Map in-memory:

```typescript
// ICustomizationState — estrutura que pode ser estendida
interface ICustomizationState {
  presetKey: string;
  presetName: string;
  tables: ICustomizableTable[];
  customMessages: string[];
  currentAction: 'adding' | 'removing' | 'renaming' | null; // ← add ao tipo
  isCompleted: boolean;
}
```

⚠️ **Atenção**: `StateManager` perde estado ao reiniciar o servidor. Aceitável para MVP, mas futuras extensões devem migrar para Redis com TTL ou tabela `InterviewSession` no Prisma.

## Generation contract — customização de campo (FieldCustomizationService)

```typescript
// FieldIntentParser — modificações com Zod:
const ModificationSchema = z.object({
  type: z.enum(['add', 'remove', 'update']),
  fieldName: z.string(),
  fieldLabel: z.string().optional(),
  fieldType: z.enum(['string', 'number', 'date', 'select', 'boolean']).optional(),
  options: z.array(z.string()).optional(),
});
// Adicionar novo tipo de modificação: 'reorder'
```

O `FieldPresetMatcher` tenta match semântico antes de criar campo custom:
1. Busca por nome/sinônimo exato
2. Se confiança > 70%: usa preset com label customizado
3. Se < 70%: cria campo personalizado sem preset

## Files usually created or changed

```
server/src/features/interview/models/InterviewTypes.ts             ← EDIT (novo stage na enum)
server/src/features/interview/InterviewService/PromptConfig.ts     ← EDIT (novo prompt)
server/src/features/interview/InterviewService/InterviewService.ts ← EDIT (novo case no switch)
server/src/features/interview/InterviewService/StageHandlers.ts    ← EDIT (se novo handler AI)
server/src/features/interview/CustomizationService/AIInteractions.ts ← EDIT (novo intent)
server/src/features/interview/CustomizationService/CustomizationService.ts ← EDIT (novo handler)
server/src/features/interview/FieldCustomizationService/index.ts   ← EDIT (novo modification type)
```

## Required checks

```bash
cd server && npx tsc --noEmit
```

## Anti-patterns

- **[INTV-001] Não instanciar serviços com `new`** — sempre `getInstance()`. Todos são singletons; `new` cria instância isolada sem estado compartilhado.
- **[INTV-004] Não adicionar estágio sem atualizar a sequência** — o switch do estágio anterior deve apontar para o novo `nextStage`, senão o wizard fica preso.
- **[INTV-005] Não confiar que StateManager persiste** — estado de customização é in-memory. Nunca depender de ele existir em requests subsequentes de sessões antigas sem verificar se a sessão ainda está ativa.
- **[INTV-003] Não criar AI prompts sem marcador de conclusão** — stages em loop (DISCOVERING_BUSINESS, COLLECTING_INDUSTRY) precisam de um marcador detectável no texto ("SUMMARY:", "INDUSTRY_CONFIRMED:") para avançar. Sem marcador, o wizard nunca avança.
- **[INTV-006] Não pular o `FieldPresetMatcher`** — ao adicionar campos custom, sempre tentar match primeiro. Campos sem preset têm menos validação de schema.
- **[INTV-002] Não modificar `InterviewStage` sem atualizar `ProcessableStage`** — se o novo estágio usa AI com history, precisa estar em ambas as types.
