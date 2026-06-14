---
name: frontend-hook-generator
description: Gera custom hook React para data-fetching ou estado de UI, integrando com service layer e seguindo naming conventions
argument-hint: "[useNomeDoHook] [fetch|state|form]"
allowed-tools: Read, Grep, Glob, Write, Edit
---

# Frontend Hook Generator

## Purpose

Gera hooks React customizados em `my-app/lib/hooks/` ou `features/*/hooks/` para data-fetching com loading/error state, ou para lógica de UI compartilhada.

## When to use

- Novo endpoint precisa de hook de fetch reutilizável
- Extraindo lógica de estado de componente para hook compartilhado
- Hook de formulário com validação

## Inputs

- `$ARGUMENTS[0]`: nome começando com `use` (ex: `useAppointments`)
- `$ARGUMENTS[1]`: tipo: `fetch` | `state` | `form`

## Repository patterns to inspect first

```
my-app/lib/hooks/useTheme.ts
my-app/features/dashboard/category-views/leads/hooks/
my-app/lib/services/dynamic-table.service.ts
my-app/lib/api/api-client.ts
```

## Generation contract

### Fetch hook

1. Arquivo: `my-app/features/<module>/hooks/<hookName>.ts`
2. State:
   ```ts
   const [data, setData] = useState<T | null>(null)
   const [isLoading, setIsLoading] = useState(false)
   const [error, setError] = useState<string | null>(null)
   ```
3. Fetch via service — não chamar `apiClient` diretamente no hook
4. useEffect com cleanup:
   ```ts
   useEffect(() => {
     let cancelled = false
     fetchData().then(r => { if (!cancelled) setData(r) })
     return () => { cancelled = true }
   }, [deps])
   ```
5. Retornar: `{ data, isLoading, error, refetch }`
6. **Paginação (DynamicTable):** `GET /dynamic-tables/:id/data` retorna **no máximo 50 linhas por padrão** (cap 200). Hooks que alimentam KPIs/listas/boards precisam buscar **todas as páginas** — senão a view trunca silenciosamente em 50 (KPIs e contagens erradas com volume). Use um helper de fetch-all que itera `page` até `totalPages` (`limit=200`). Referência: `my-app/features/crm/lib/crmFetch.ts` (`fetchAllRows`).

### State hook

1. Encapsular estado complexo de UI com handlers nomeados
2. Retornar objeto com estado e handlers: `{ isOpen, open, close, toggle }`

## Files usually created or changed

```
my-app/features/<module>/hooks/<hookName>.ts    ← NEW
```

## Required checks

```bash
cd my-app && npx tsc --noEmit
```

## Anti-patterns

- Não chame `apiClient` diretamente no hook — use o service layer
- Não esqueça de limpar efeitos (`return () => { cancelled = true }`)
- Não faça fetch no render — sempre dentro de `useEffect` ou handler
- Não nomeie o hook sem o prefixo `use`
- **Não confie no page-size default ao ler DynamicTable** — a API retorna só 50 linhas; pagine (fetch-all) ou os KPIs/contagens ficam errados com volume. Sempre teste a view com >50 registros.
