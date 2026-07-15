# my-app/ — regras de frontend (path-scoped)

Este arquivo carrega **só quando o agente mexe em `my-app/`** (Next.js Pages Router).
Equivalente Claude Code ao `paths:` do Cursor: escopo por diretório, via CLAUDE.md aninhado.

Docs de referência (leia sob demanda — não carregam sozinhos):

- Design system / tokens: [frontend-design-system/SKILL.md](../.claude/skills/frontend-design-system/SKILL.md)
- Scaffolding por camada (nomes/paths): [GENERATION_CONTRACTS.md](../docs/claude-skills/GENERATION_CONTRACTS.md)
- Critério reuse-vs-bespoke: [_REUSE-CRITERION.md](../.claude/skills/_REUSE-CRITERION.md)

## Gates rápidos ao editar my-app/

1. **Reuse o canônico** antes de recriar: `GenericTable`, `Modal`, `StandardPagination`, `AnalyticsDashboard`. Bespoke só com divergência de shape/posse justificada.
2. Cores `neutral-*`, **nunca** `zinc-*`; cards `rounded-2xl`/`3xl`; zero `any` evitável.
3. `tsc` limpo é gate: `cd my-app && npx tsc --noEmit` — não avance vermelho.
4. Telas atrás de `withAuth` → verifique contra **build de produção**, não `next dev`.
5. Composição JSX não é aresta `CALLS` no grafo — para liveness de componente React, use existência + `SIMILAR_TO`, não in-degree.
