# Feature: Interview (Onboarding guiado por IA)

Conduz o usuário, por conversa com IA, do **entendimento do negócio** até um **sistema pronto para
criar**: descobre o ramo, casa com um preset, e (opcionalmente) permite **customizar tabelas e campos**
antes de instanciar. É uma feature de **capacidade** (sem entidade própria no banco) — o contrato são
os **métodos públicos** dos seus serviços singleton.

> Consumida pelo frontend (não há controller/rota no servidor). O estado de customização é mantido
> **em memória** por sessão (`StateManager` singleton).

---

## Pipeline (3 serviços, do macro ao micro)

```
InterviewService          → orquestra a entrevista por ESTÁGIOS (descoberta → match de preset → criação/customização)
  └─ CustomizationService → customização no nível de TABELAS (adicionar/remover tabelas do preset)
       └─ FieldCustomizationService → customização no nível de CAMPOS de uma tabela
```

1. **`InterviewService`** — máquina de estágios da conversa. Descobre o negócio, casa com um preset
   (`PresetMatcher`) e decide entre criar direto ou customizar. [README](./InterviewService/README.md)
2. **`CustomizationService`** — gerencia a sessão de customização de **tabelas** do preset escolhido
   (apresentação, adicionar/remover tabelas). [README](./CustomizationService/README.md)
3. **`FieldCustomizationService`** — processa pedidos de customização de **campos** de uma tabela
   específica (adicionar/remover/modificar), reusando field presets. [README](./FieldCustomizationService/README.md)

Tipos compartilhados (estágios, `IInterviewTurnResult`, `ICustomizationState`, ...) vivem em
[`models/`](./models/README.md).

---

## Estrutura de arquivos

```
interview/
├── README.md                     # este índice
├── models/
│   ├── InterviewTypes.ts         # tipos compartilhados (InterviewStage, IMessage, ICustomizationState, ...)
│   └── README.md
├── InterviewService/
│   ├── InterviewService.ts       # orquestrador (singleton)
│   ├── PresetMatcher.ts          # casa a descrição do negócio com um preset
│   ├── StageHandlers.ts          # respostas de IA por estágio / confirmação de criação
│   ├── PromptConfig.ts           # stageConfig (prompts por estágio processável)
│   └── README.md
├── CustomizationService/
│   ├── CustomizationService.ts   # customização de tabelas (singleton)
│   ├── StateManager.ts           # estado da sessão EM MEMÓRIA (singleton)
│   ├── TableExtractor.ts         # extrai tabelas do preset real
│   ├── AIInteractions.ts         # interações de IA da customização de tabelas
│   └── README.md
└── FieldCustomizationService/
    ├── index.ts                  # a classe FieldCustomizationService (singleton)
    ├── FieldIntentParser.ts      # interpreta a intenção do usuário (add/remove/modify campo)
    ├── FieldUpdater.ts           # aplica as modificações na tabela
    ├── FieldPresetMatcher.ts     # casa um campo pedido com um field preset
    ├── PromptConfig.ts / Types.ts
    └── README.md
```

> ⚠️ Componentes **não existem** (eram citados em docs antigas): `AIFieldInteraction`, `FieldExtractor`,
> `RedisStateManager`. O estado é só em memória; a IA de campos usa `FieldIntentParser` + chamadas
> diretas ao `OpenAIService`.

---

## Interação com outras features

- **[`dynamicTables`](../dynamicTables/README.md):** fonte dos presets. `CustomizationService` usa
  `presetService.getPresetByKey` + `presetKnowledgeBase` (`presets/ai/`); ao concluir, o sistema é
  instanciado como tabelas dinâmicas. `FieldCustomizationService` reusa **field presets** ao adicionar
  campos.
- **`lib/openai`:** todas as etapas de IA passam pelo `OpenAIService` singleton.
