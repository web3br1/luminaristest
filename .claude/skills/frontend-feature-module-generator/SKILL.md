---
name: frontend-feature-module-generator
description: Cria scaffold de módulo de feature no dashboard com View principal, hooks de dados e registro em pages/dashboard/index.tsx
argument-hint: "[nome-do-modulo] [categoria-erp]"
allowed-tools: Read, Grep, Glob, Write, Edit
---

# Frontend Feature Module Generator

## Purpose

Cria a estrutura de um novo módulo de categoria no dashboard (`features/dashboard/category-views/<name>/`) com View principal, hooks de dados, e registra o dynamic import em `pages/dashboard/index.tsx`.

## When to use

- Novo módulo de negócio precisa de visualização no dashboard
- Adicionando categoria ao sidebar de navegação
- Criando view específica para novo preset de tabela dinâmica

## Inputs

- `$ARGUMENTS[0]`: nome do módulo em kebab-case (ex: `appointments`)
- `$ARGUMENTS[1]`: categoria ERP (ex: `planning`, `finance`, `people`)

## Repository patterns to inspect first

```
my-app/features/dashboard/category-views/leads/
my-app/features/dashboard/category-views/finance/FinanceView.tsx
my-app/pages/dashboard/index.tsx
my-app/features/dashboard/DashboardSidebar.tsx
```

## Generation contract

1. Diretório: `my-app/features/dashboard/category-views/<name>/`
2. View principal: `<Name>View.tsx` — FC exportada como **named export**
3. Sub-pastas: `components/`, `hooks/`
4. Hook de dados: `hooks/use<Name>Data.ts` — retorna `{ data, isLoading, error, refetch }`
5. Dynamic import em `pages/dashboard/index.tsx`:
   ```ts
   const <Name>View = dynamic(
     () => import('../../features/dashboard/category-views/<name>/<Name>View')
       .then(m => ({ default: m.<Name>View })),
     { ssr: false, loading: viewLoading }
   )
   ```
6. Registrar no switch de renderização do dashboard
7. Adicionar ao sidebar em `DashboardSidebar.tsx` se necessário
8. **Views agrupadas (Kanban/board/grouped-by-relação):** as colunas/grupos devem ser filtrados pelo **registro-pai ativo** (ex: etapas DO pipeline selecionado), nunca renderizar todos os registros da tabela-pai. Com múltiplos pais (2 pipelines, várias units) renderizar tudo gera **colunas duplicadas e vazias**. Defaulte para o pai com mais filhos e ofereça um seletor quando houver mais de um. Referência da correção: `my-app/pages/crm/pipeline.tsx`.

## Files usually created or changed

```
my-app/features/dashboard/category-views/<name>/<Name>View.tsx    ← NEW
my-app/features/dashboard/category-views/<name>/hooks/            ← NEW
my-app/features/dashboard/category-views/<name>/components/       ← NEW
my-app/pages/dashboard/index.tsx                                   ← EDIT (dynamic import + switch)
```

## Required checks

```bash
cd my-app && npx tsc --noEmit
```

## Anti-patterns

- Não importe a View diretamente na página — sempre via `dynamic()` com `ssr: false`
- Não coloque lógica de fetch na View — extraia para hook
- Não esqueça de registrar no switch do dashboard
- Não use default export na View se o módulo exporta múltiplas coisas — use named export
- **Não renderize um board agrupando por TODAS as etapas/relações** — filtre pelo pai ativo, senão múltiplos pais (pipelines/units) produzem colunas duplicadas. Sempre teste a view com >1 registro-pai.
- **Estilize as telas aplicando `frontend-design-system`** (tokens reais + componentes-assinatura) — Tailwind genérico (`zinc`/`rounded-xl`/`semibold`) deixa o módulo off-brand, fora do padrão do app.
