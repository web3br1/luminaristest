---
name: frontend-context-provider-generator
description: Gera o trio React Context + Provider + hook de consumo `use<Name>()` em my-app/lib/context/, espelhando o padrão dos contexts existentes (Auth, Currency, Dashboard, Toast): createContext tipado, Provider que envolve children, hook que lança erro se usado fora do Provider, e registro no _app.tsx. Use quando um novo estado global precisa ser compartilhado entre componentes, ao substituir prop-drilling por context, ou ao adicionar provider ao _app.tsx. Domínio/arquivos: my-app/lib/context/<Name>Context.tsx e pages/_app.tsx.
argument-hint: "[NomeDoContexto]"
allowed-tools: Read, Grep, Glob, Write, Edit
compatibility: Claude Code; requer o monorepo Luminaris (my-app/ com React + Next.js Pages Router + tsc). Sem efeitos externos — apenas gera/edita arquivos no repositório.
metadata:
  governance-skill-id: "SKL-FE-CONTEXT"
  governance-version: "1.0.0"
  governance-status: "validated"
  governance-owner: "engineering"
  governance-last-evaluated: "2026-06-25"
  governance-eval-score: "1.00"
---

# Frontend Context Provider Generator

## Purpose

Gera `my-app/lib/context/<Name>Context.tsx` com Context, Provider component e hook de consumo `use<Name>()`, seguindo o padrão dos contextos existentes do Luminaris (Auth, Currency, Dashboard, Toast).

## Contrato obrigatório

Antes de gerar, leia `.claude/skills/_ARCHITECTURE-CONTRACT.md` — as regras cross-cutting (reuse de canônicos, service layer, paginação DynamicTable, modal-não-rota, `useMemo`, no-`any`, container full-height, design system) são **gate** e não se repetem aqui. Esta skill adiciona apenas o checklist específico de **Frontend Context**.

## When to use

- Novo estado global precisa ser compartilhado entre componentes
- Substituindo prop-drilling por context
- Adicionando provider ao `_app.tsx`

## Inputs

- `$ARGUMENTS[0]`: nome em PascalCase (ex: `Notifications`)

## Repository patterns to inspect first

```
my-app/lib/context/AuthContext.tsx
my-app/lib/context/ToastContext.tsx
my-app/lib/context/CurrencyContext.tsx
my-app/lib/context/DashboardDataContext.tsx
my-app/pages/_app.tsx
```

## ⭐ Exemplo de referência canônico (espelhe este arquivo)

`my-app/lib/context/AuthContext.tsx` — provider de gate global de referência: expõe `isLoading`/`isAuthenticated` no value, faz o check inicial em `useEffect` com `checkAuthState({ silent })` (re-validação de rota não pisca o loading), resolve o gate de forma incondicional, usa `useRef` para guard anti-loop do locale-sync e fallback de `API_BASE_URL`. Leia ANTES de gerar — e memoize o `value` com `useMemo` + handlers estáveis (`useCallback`).

## Generation contract

Cada item marcado `[FECTX-*]` abaixo é uma REGRA DE GERAÇÃO auditável (espelha o padrão dos 4 contexts existentes — Auth/Currency/Dashboard/Toast — em `my-app/lib/context/`). Gere já em conformidade.

1. Arquivo: `my-app/lib/context/<Name>Context.tsx`
2. Interface do estado: `interface <Name>ContextType { ... }`
3. **[FECTX-001]** Context criado com `createContext` (importado de `react`) e **tipado** com a interface do estado, inicializado como `undefined` para habilitar o guard do hook:
   ```ts
   const <Name>Context = createContext<<Name>ContextType | undefined>(undefined)
   ```
4. **[FECTX-002]** Provider exportado que recebe `children` e os envolve com `<<Name>Context.Provider>`:
   ```ts
   export function <Name>Provider({ children }: { children: ReactNode }) {
     // state + logic here
     return <<Name>Context.Provider value={...}>{children}</<Name>Context.Provider>
   }
   ```
5. **[FECTX-003]** Hook de consumo `use<Name>()` que lê o context via `useContext`. **[FECTX-004]** O hook DEVE lançar erro se usado fora do Provider (`ctx === undefined`):
   ```ts
   export function use<Name>() {
     const ctx = useContext(<Name>Context)
     if (!ctx) throw new Error('use<Name> must be used within <Name>Provider')
     return ctx
   }
   ```
6. Registrar em `pages/_app.tsx`: adicionar `<<Name>Provider>` no wrapper de providers
7. **[FECTX-005]** **Memoize o objeto `value` com `useMemo`** — `const value = useMemo(() => ({ ...state, ...handlers }), [deps])`. Um objeto-literal novo a cada render força **todos** os consumidores a re-renderizar mesmo sem mudança real de estado. Handlers passados no value devem ser estáveis (`useCallback`).
8. **Estado de loading/error explícito no value** quando o provider faz fetch: exponha `isLoading: boolean` e `error: string | null` para os consumidores reagirem — não esconda o estado de carregamento dentro do provider.
9. **Não faça fetch no corpo do render** — todo fetch de inicialização vai em `useEffect` (com cleanup/cancelamento), e fetch via service layer (`lib/services/*.service.ts`), nunca `apiClient`/`fetch` direto no provider.

## Providers com `isLoading` (auth/gate global) — regras críticas

Se o provider expõe um `isLoading` que **bloqueia o render** (ex: `AuthContext` + `withAuth` mostrando "Authenticating…"), ele DEVE garantir que o loading sempre resolve, senão **toda a app trava**:

- **Resolva `isLoading` de forma incondicional** no `finally` do check inicial — nunca atrás de um guard (`if (mounted)`/`if (!isChecking)`) que possa pular o reset. Um guard mal posicionado deixa o gate preso para sempre.
- **Re-validação em mudança de rota deve ser SILENCIOSA** — `checkAuthState({ silent: true })` no `routeChangeComplete` NÃO pode tocar o `isLoading` global, senão cada navegação pisca "Authenticating…" (e, junto com efeitos de redirect, mantém o spinner para sempre).
- **Efeitos de side-effect com redirect (ex: locale-sync) precisam de guard anti-loop** — `router.replace` que não muda o estado (no-op) re-dispara `routeChangeComplete` → re-render → `replace` de novo. Use um `useRef` para tentar **uma vez por mismatch**.
- **Backstop de timeout** em qualquer `fetch` de inicialização: `AbortController` + `setTimeout(() => controller.abort(), 8000)` para que um request travado não congele a UI.
- **URL da API com fallback**, igual ao `apiClient` (e como o `next.config.js` já faz via `env`).
- Referência da correção: `my-app/lib/context/AuthContext.tsx`.

## Files usually created or changed

```
my-app/lib/context/<Name>Context.tsx    ← NEW
my-app/pages/_app.tsx                   ← EDIT (add provider wrapper)
```

## Required checks

```bash
cd my-app && npx tsc --noEmit
```

## Anti-patterns

- Não use context para estado local de componente — use useState
- Não esqueça o guard no hook: `if (!ctx) throw new Error(...)`
- Não registre o Provider fora do `_app.tsx` — senão fica inacessível em páginas filhas
- Não crie context sem o hook de consumo correspondente
- **Nunca deixe um `isLoading` de gate global poder ficar preso** — resolva incondicionalmente no `finally` + timeout backstop. Um spinner travado bloqueia a app inteira (bug real do `AuthContext`).
- Não leia `process.env.NEXT_PUBLIC_*` direto para URL de API — use fallback como o `apiClient`
- **Não passe um objeto `value` literal sem `useMemo`** — `<Ctx.Provider value={{ ... }}>` recria o objeto a cada render e re-renderiza todos os consumidores. Memoize o value e estabilize handlers com `useCallback`.
- Não faça fetch no corpo do render — só em `useEffect` (com cleanup), e via service layer (não `apiClient`/`fetch` direto).
- Não esconda loading/error — exponha `isLoading`/`error` no value quando o provider busca dados.
