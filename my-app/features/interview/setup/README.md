# Setup (onboarding / criação do sistema)

Módulo de **setup** da feature `interview` (`features/interview/setup/`). Oferece os caminhos pelos
quais o usuário cria seu sistema (conjunto de tabelas) na primeira configuração. Renderizado pela
página [`pages/dashboard/setup.tsx`](../../../pages/dashboard/setup.tsx).

> Os componentes/hooks da entrevista por IA vivem **fora** desta pasta, em
> `features/interview/components/` e `features/interview/hooks/` (ver abaixo). O backend correspondente
> é a feature [`interview`](../../../../server/src/features/interview/README.md) (entrevista →
> customização de tabelas → campos).

## Os três caminhos de criação (`setup/index.ts`)

| Componente | Caminho | Fluxo |
|---|---|---|
| **`QuickSetup`** | `setup/QuickSetup.tsx` | **Rápido, baseado em preset.** Carrega os presets via API, agrupa por categoria, o usuário escolhe um e o sistema é criado direto — **sem IA**. |
| **`TotalControlSetup`** | `setup/TotalControlSetup.tsx` | **Controle manual.** Seleção de preset + customização das tabelas antes de criar. |
| **`AiInterviewSetup`** | `components/AiInterviewSetup/` (reexportado pelo `setup/index.ts`) | **Entrevista por IA.** Conversa para descobrir o negócio, casar com um preset e customizar; usa o hook `hooks/useAiInterview.ts` e as sidebars (`components/LeftSidebar`, `RightSidebar`). |

`CreatingAnimation` (`setup/CreatingAnimation.tsx`) é a animação exibida durante a criação do sistema.

## Estrutura real

```
features/interview/
├── setup/
│   ├── QuickSetup.tsx          # criação rápida por preset
│   ├── TotalControlSetup.tsx   # seleção + customização manual
│   ├── CreatingAnimation.tsx   # animação de criação
│   ├── index.ts                # reexporta os 3 acima + AiInterviewSetup
│   └── README.md
├── components/
│   ├── AiInterviewSetup/       # UI da entrevista por IA
│   ├── LeftSidebar/ · RightSidebar/
├── hooks/
│   └── useAiInterview.ts       # lógica central da entrevista por IA
└── types/
```

## Dados

- **Presets:** `QuickSetup`/`TotalControlSetup` carregam os presets via `apiClient` (backend
  `dynamicTables` / `presets`).
- **Criação:** dispara a criação do sistema (instala as tabelas do preset, possivelmente customizadas)
  e redireciona para o dashboard.
- **i18n:** namespace `common`.

> ⚠️ Caminho corrigido: este módulo vive em `features/interview/setup/`, **não** em
> `/components/dashboard/setup` (referência de doc antiga).
