---
name: frontend-hook-generator
description: Gera custom hook React para data-fetching ou estado de UI, integrando com service layer e seguindo naming conventions
argument-hint: "[useNomeDoHook] [fetch|state|form]"
allowed-tools: Read, Grep, Glob, Write, Edit
---

# Frontend Hook Generator

## Purpose

Gera hooks React customizados em `my-app/lib/hooks/` ou `features/*/hooks/` para data-fetching com loading/error state, ou para lógica de UI compartilhada.

## Contrato obrigatório

Antes de gerar, leia `.claude/skills/_ARCHITECTURE-CONTRACT.md` — as regras cross-cutting (reuse de canônicos, service layer, paginação DynamicTable, modal-não-rota, `useMemo`, no-`any`, container full-height, design system) são **gate** e não se repetem aqui. Esta skill adiciona apenas o checklist específico de **Hook**.

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
my-app/features/crm/hooks/useCrmData.ts
my-app/features/crm/lib/crmFetch.ts
my-app/lib/services/dynamic-table.service.ts
my-app/lib/api/api-client.ts
```

## ⭐ Exemplo de referência canônico (espelhe este arquivo)

- **Paginação fetch-all (DynamicTable)** → `my-app/features/crm/lib/crmFetch.ts` (`fetchAllRows`): itera `page` até `totalPages` com `limit=200`, tipos locais (`DynamicRow`, zero `any`), via service layer. É a ÚNICA peça exemplar do CRM — use-a sempre que o hook alimentar KPIs/listas/boards.
- **Hook de dados de view (limpo)** → `my-app/features/crm/hooks/useCrmData.ts`: resolve tabelas por `internalName` (nunca índice `[0]`), memoiza lookups/derivados com `useMemo`, fetch via service, retorna estado + handlers — focado (~150 linhas). **NÃO** espelhe `category-views/leads/hooks/useLeadsView.ts`: é o hook **monolítico legacy** (251 linhas, 49 hook-calls) — anti-exemplo de decomposição.

Leia o arquivo correspondente ANTES de gerar.

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
7. **Type-safety (sem `any` local):** tipe objetos de tabela/resposta do service com interfaces locais mínimas (ex.: `interface DynTable { id: string; internalName?: string; schema?: unknown }`) em vez de `any`/`any[]`. No `catch`, use `catch (e)` (`e: unknown`) com narrowing — `e instanceof Error ? e.message : 'Falha…'`. Exceção: o `Record<string, any>` dos dados dinâmicos da DynamicTable é contrato do engine e fica.
8. **Memoize dados derivados:** `filter`/`sort`/`group`/`find`/`reduce` sobre listas no corpo do hook DEVEM ir em `useMemo([deps])` — sem isso recalculam a cada render (inclusive em updates de context não relacionados). Mesma regra do `frontend-page-generator`.

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
- Não use `any`/`any[]` para tabelas ou respostas de service — defina interfaces locais; `catch (e: any)` → `catch (e)` com narrowing por `unknown`.
- Não calcule dados derivados (`filter`/`sort`/`group`/`find`) sem `useMemo([deps])` no corpo do hook.
