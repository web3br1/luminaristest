# features/interview — Onboarding / criação do sistema (frontend)

A UI de **onboarding**: leva o usuário da primeira configuração até um sistema (conjunto de tabelas)
criado. Oferece criação rápida por preset, controle manual, e uma **entrevista guiada por IA**.
Renderizada pela página [`pages/dashboard/setup.tsx`](../../pages/dashboard/setup.tsx).

> Contraparte do backend: feature [`interview`](../../../server/src/features/interview/README.md)
> (entrevista → customização de tabelas → campos).

## Mapa interno

| Área | O que é | Doc |
|---|---|---|
| `setup/` | Os 3 caminhos de criação: `QuickSetup`, `TotalControlSetup`, `AiInterviewSetup` + `CreatingAnimation`. | [README](./setup/README.md) |
| `components/AiInterviewSetup/` | UI da **entrevista por IA** (chat de onboarding). | — |
| `components/LeftSidebar/` · `RightSidebar/` | Painéis laterais da entrevista (ex: preview das tabelas durante a customização). | — |
| `hooks/useAiInterview.ts` | Estado e fluxo da entrevista por IA (abaixo). | — |
| `types/` | `InterviewTypes`, `RightSidebarTypes`. | — |

## `useAiInterview` (o cérebro da entrevista por IA)

Hook que mantém o estado da conversa (`messages`, `currentStage`, `presetKey`, `sessionId`,
`customizationState`, painéis de customização) e dirige o fluxo por **estágios** — espelhando o
`InterviewService.processTurn` do backend (começa em `GREETING`).

- Chama o backend em **`POST /dashboard/ai/ChatInterview`** com `{ messages, stage }` e avança para
  `data.nextStage`.
- Conforme a entrevista evolui (match de preset → customização), gerencia o `customizationState` e os
  painéis (`LeftSidebar`/`RightSidebar`) e, ao final, dispara a criação do sistema e redireciona ao
  dashboard.

## Fluxo (resumo)

`pages/dashboard/setup` → escolha do caminho (`QuickSetup` direto por preset, `TotalControlSetup`
manual, ou `AiInterviewSetup`) → na via de IA, `useAiInterview` conduz a conversa por estágios →
criação do sistema (instala as tabelas, possivelmente customizadas) → dashboard.
