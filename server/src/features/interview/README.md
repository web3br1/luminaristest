# Feature: Interview (AI-guided onboarding)

Walks the user, via an AI conversation, from **understanding the business** to a **system ready to
create**: it discovers the industry, matches a preset, and (optionally) lets the user **customize tables
and fields** before instantiating. It is a **capability feature** (no entity of its own in the
database) — the contract is the **public methods** of its singleton services.

> Consumed by the frontend (there is no controller/route on the server). The customization state is kept
> **in memory** per session (`StateManager` singleton).

> **Architecture decision (non-CRUD feature):** this feature organizes folders **by service name**
> (`InterviewService/`, `FieldCustomizationService/`, `CustomizationService/`) instead of the canonical
> layout — an **accepted exception**, recorded in `server/ARCHITECTURE.md` §9. Authorization is by
> **scope** (`UserContext`/`userId`); there is no `Policy` object.

> ⚠️ **Status: NOT WIRED on the server.** No controller, route or other feature references these services
> (verified by searching all of `server/src`). The active onboarding logic currently lives in the
> **frontend**; this server copy is orphaned. That is why it is **outside the gold-standard scope** (e.g.
> it has no `dtos/` — adding validation to unreachable code would be wasted effort). **Before exposing it
> via a route**, add `dtos/` with Zod schemas on the inputs and review the state persistence (today
> in-memory per session, it does not survive a restart nor scale horizontally).

---

## Pipeline (3 services, macro to micro)

```
InterviewService          → orchestrates the interview by STAGES (discovery → preset match → creation/customization)
  └─ CustomizationService → customization at the TABLE level (add/remove tables from the preset)
       └─ FieldCustomizationService → customization at the FIELD level of a table
```

1. **`InterviewService`** — the conversation's stage machine. Discovers the business, matches a preset
   (`PresetMatcher`) and decides between creating directly or customizing. [README](./InterviewService/README.md)
2. **`CustomizationService`** — manages the **table** customization session of the chosen preset
   (presentation, add/remove tables). [README](./CustomizationService/README.md)
3. **`FieldCustomizationService`** — processes **field** customization requests for a specific table
   (add/remove/modify), reusing field presets. [README](./FieldCustomizationService/README.md)

Shared types (stages, `IInterviewTurnResult`, `ICustomizationState`, ...) live in
[`models/`](./models/README.md).

---

## File structure

```
interview/
├── README.md                     # this index
├── models/
│   ├── InterviewTypes.ts         # shared types (InterviewStage, IMessage, ICustomizationState, ...)
│   └── README.md
├── InterviewService/
│   ├── InterviewService.ts       # orchestrator (singleton)
│   ├── PresetMatcher.ts          # matches the business description with a preset
│   ├── StageHandlers.ts          # AI responses per stage / creation confirmation
│   ├── PromptConfig.ts           # stageConfig (prompts per processable stage)
│   └── README.md
├── CustomizationService/
│   ├── CustomizationService.ts   # table customization (singleton)
│   ├── StateManager.ts           # IN-MEMORY session state (singleton)
│   ├── TableExtractor.ts         # extracts tables from the real preset
│   ├── AIInteractions.ts         # AI interactions for table customization
│   └── README.md
└── FieldCustomizationService/
    ├── index.ts                  # the FieldCustomizationService class (singleton)
    ├── FieldIntentParser.ts      # interprets the user's intent (add/remove/modify field)
    ├── FieldUpdater.ts           # applies the modifications to the table
    ├── FieldPresetMatcher.ts     # matches a requested field with a field preset
    ├── PromptConfig.ts / Types.ts
    └── README.md
```

> ⚠️ Components that **do not exist** (they were mentioned in old docs): `AIFieldInteraction`,
> `FieldExtractor`, `RedisStateManager`. The state is in-memory only; the field AI uses
> `FieldIntentParser` + direct calls to `OpenAIService`.

---

## Interaction with other features

- **[`dynamicTables`](../dynamicTables/README.md):** the source of presets. `CustomizationService` uses
  `presetService.getPresetByKey` + `presetKnowledgeBase` (`presets/ai/`); on completion, the system is
  instantiated as dynamic tables. `FieldCustomizationService` reuses **field presets** when adding fields.
- **`lib/openai`:** all AI steps go through the `OpenAIService` singleton.
