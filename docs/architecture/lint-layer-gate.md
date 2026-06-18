# Spec — Lint Layer-Gate (fatia P1 · higiene determinística)

> **Status:** em implementação. **Tipo:** build-gate determinístico (núcleo rígido da metodologia reuse-vs-divergência). **Escopo:** *config de lint + CI*, **não** pagamento de dívida nem construção de wrappers.

Esta fatia transforma três regras hoje **convenção-apenas** (contrato `.claude/skills/_ARCHITECTURE-CONTRACT.md`) em **gate lintável determinístico**, sem depender de triggering de skill. O contrato continua sendo o bar de qualidade; este gate é o subconjunto *mecanizável* dele.

## Princípio que governa cada regra

O critério **shape+posse** é **detector de candidatos, não decisor**. O lint automatiza só o detector. A decisão "consolidar vs divergir" continua factual e humana — por isso cada regra abaixo declara explicitamente *qual trabalho ela faz*:

- **Barra ilha** (confinamento real): só onde o estado atual já é o correto e há destino conforme. Ex.: `recharts`.
- **Inventaria** (tripwire de visibilidade): onde o espalhamento é divergência *sancionada*; o `error` não previne ilha, só força a próxima adição a aparecer num diff onde o critério shape+posse deve ser aplicado por julgamento. Ex.: `@dnd-kit`, `@fullcalendar`.
- **Converte dívida oculta em dívida marcada**: onde há violação viva pré-existente; `error` global + supressão **inline por-linha** (não exceção no config). Ex.: `prisma.*` em controller/service.

## Regras

### R1 — `prisma` singleton confinado a Repository (server)
- **Onde:** `server/eslint.config.mjs`, `no-restricted-imports` do path `@/lib/prisma` / `*/lib/prisma` em `controllers/**` e `**/services/**`.
- **Trabalho:** barra regressão (novo `prisma` em controller/service = erro) + inventaria dívida viva.
- **Dívida viva (supressão inline `DEBT: prisma`):** `authController`, `dashboardController`, `userController`, `ChatService`, `ReportService`.
- **Exceção sancionada (supressão inline `SANCTIONED`):** `DynamicTableService` — orquestração de `prisma.$transaction` documentada no contrato §2.
- `import type` de `generated/prisma` **não** é alvo (tipo, não acesso a dados).

### R1b — Service não importa `express` (server)
- `no-restricted-imports` de `express` em `**/services/**`. Zero violação viva hoje → só barra regressão (contrato §2: "Service: Zero Express").

### R2 — `apiClient` confinado a `lib/services` (frontend)
- `no-restricted-imports` do path `**/api/api-client` fora de `lib/services/**` e `lib/api/**`.
- **Dívida viva (supressão inline `DEBT: apiClient`):** `TotalControlSetup.tsx`, `QuickSetup.tsx`.

### R3a — `recharts` confinado (frontend, **barra ilha**)
- `error`; allowlist por glob: `**/analytics/charts/**`, `**/analytics/kpi/**`, `components/widgets/analytics/GoldKpiWidgetView.tsx`. Qualquer outro import = erro.

### R3b — `@dnd-kit` / `@fullcalendar` inventariados (frontend, **tripwire**)
- `error`; allowlist reflete os usos **sancionados atuais** + comentário no config declarando o que a lista significa. Adicionar path = afirmar divergência sancionada (shape+posse diferente), **não** ilha. **Não** se constrói wrapper canônico para estas nesta fatia — os usos são legitimamente diferentes.

### R4 — CI gate
- **server**: step `npm run lint` (`eslint src`) entre typecheck e test.
- **my-app**: step `npm run lint:gate` (`eslint . --config eslint.gate.config.mjs`). Usa um config **separado** do `eslint.config.mjs` (next/dev): o frontend nunca foi lintado (`ignoreDuringBuilds: true`) e o ruleset next produz ~6000 erros pré-existentes — adotá-lo é iniciativa própria, não esta fatia. O gate roda isolado, só as regras de camada.
- **zinc-guard** (job próprio, repo-root): a base tem ~33 `zinc-` vivos (o contrato §4 dizia "base é neutral" — falso). Em vez de reprovar nelas, o job é **diff-scoped**: falha só quando a mudança INTRODUZ `zinc-` novo. Mesmo princípio do layer-gate (barra regressão, não força refactor). Backlog: `grep -rn "zinc-" my-app/{features,lib,components,pages,styles}`.

## Gate de aceitação (verificável)
1. `server`: eslint roda; flagra exatamente os 6 sites de prisma (5 DEBT suprimidos + 1 SANCTIONED suprimido) e **nada além**; `tsc` segue verde.
2. `my-app`: eslint flagra os 2 sites de apiClient (suprimidos) e **zero** import direto de recharts/dnd-kit/fullcalendar fora do allowlist; build segue verde.
3. CI: jobs `lint` adicionados; `grep zinc-` presente e verde (base atual já é `neutral`).
4. `grep "DEBT: prisma"` e `grep "DEBT: apiClient"` retornam a lista exata de dívida aberta (backlog mensurável).

## Linha que esta fatia não cruza
- Não refatora os 5 sites de dívida (isso é trabalho de domínio, fatia própria; a lista de supressões `DEBT:` é o backlog).
- Não constrói wrapper canônico para dnd-kit/fullcalendar (usos sancionados ≠ ilha).
- Não rebaixa nenhuma regra para `warn` (warn não tem dente no CI).
