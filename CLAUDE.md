# Luminaris — Orientação do Agente

Monorepo: `server/` (Express + Prisma, **camadas estritas**) e `my-app/` (Next.js Pages Router).
As regras pesadas vivem nos docs abaixo — este arquivo é só a orientação sempre-ativa que aponta pra eles:

- **Bar de qualidade / camadas:** `.claude/skills/_ARCHITECTURE-CONTRACT.md`
- **Critério reuse-vs-bespoke:** `.claude/skills/_REUSE-CRITERION.md`
- **Scaffolding (nomes/paths por camada):** `docs/claude-skills/GENERATION_CONTRACTS.md`

## Antes de escrever código — reflexo obrigatório

**1. Pergunte ao codebase-memory se o canônico já existe.** Isto é o degrau "reuse antes de recriar"
(Contrato §0) e a Etapa 1 do critério de reuso feitos por evidência, não por chute:

| Pergunta | Ferramenta cbm |
|---|---|
| Já existe algo com esse nome/forma? | `search_graph` (name/label/file_pattern) |
| Existe um quase-clone (ilha) que eu deveria reusar? | `semantic_query` + edges `SIMILAR_TO` / `SEMANTICALLY_RELATED` |
| O outro lado está vivo ou é legacy? (Etapa 2) | `trace_path` (in-degree) + `change_count` / `last_modified` |
| Qual o blast radius do meu diff antes de fechar? | `detect_changes` |

**2. Reuse o canônico** listado no §0 (GenericTable, Modal, StandardPagination, AnalyticsDashboard,
CrmPipelineService…). Bespoke só com divergência de **shape ou posse** sancionada pelo critério de reuso,
justificada no relatório. Projeto indexado como `C-Users-smurf-Downloads-Luminaris`.

## Ponytail × este projeto

O ponytail (modo lazy, sempre ativo) e este projeto **concordam** no núcleo — menos código, reuse antes de
recriar, YAGNI — e o codebase-memory é o que torna esse instinto fundamentado. Mas com uma fronteira clara:

- **Padrões de camada NÃO são over-engineering.** A cadeia `Route → Controller → Service → Repository → Prisma`
  (+ Policy), injeção via **Factory**, **DTO Zod**, **soft-delete** e **registro de rota em 3 toques** são
  *requisitos do projeto* (Contrato §2/§3). Caem na própria regra do ponytail de "nunca simplificar o que foi
  explicitamente pedido / segurança". **Não** inline uma policy, **não** pule um DTO, **não** corte o factory
  "pra ser enxuto".
- O ponytail morde no **código solto** (um helper, um fix pontual) — aí sim, seja mínimo.
- Em dúvida entre enxugar e seguir o padrão da camada → **o contrato prevalece**.

## Gates rápidos (o resto está no contrato)

- `tsc` limpo é gate: `cd server && npx tsc --noEmit` e `cd my-app && npx tsc --noEmit` — não avance vermelho.
- `neutral-*`, **nunca** `zinc-*`; cards `rounded-2xl`/`3xl`; zero `any` evitável.
- Telas atrás de `withAuth` → verifique contra **build de produção**, não `next dev`.
