---
name: frontend-context-provider-generator
description: Gera React Context + Provider + useX hook seguindo o padrão dos 4 contexts existentes do Luminaris
argument-hint: "[NomeDoContexto]"
allowed-tools: Read, Grep, Glob, Write, Edit
---

# Frontend Context Provider Generator

## Purpose

Gera `my-app/lib/context/<Name>Context.tsx` com Context, Provider component e hook de consumo `use<Name>()`, seguindo o padrão dos contextos existentes do Luminaris (Auth, Currency, Dashboard, Toast).

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
my-app/pages/_app.tsx
```

## Generation contract

1. Arquivo: `my-app/lib/context/<Name>Context.tsx`
2. Interface do estado: `interface <Name>ContextType { ... }`
3. Context:
   ```ts
   const <Name>Context = createContext<<Name>ContextType | undefined>(undefined)
   ```
4. Provider:
   ```ts
   export function <Name>Provider({ children }: { children: ReactNode }) {
     // state + logic here
     return <<Name>Context.Provider value={...}>{children}</<Name>Context.Provider>
   }
   ```
5. Hook de consumo com guard:
   ```ts
   export function use<Name>() {
     const ctx = useContext(<Name>Context)
     if (!ctx) throw new Error('use<Name> must be used within <Name>Provider')
     return ctx
   }
   ```
6. Registrar em `pages/_app.tsx`: adicionar `<<Name>Provider>` no wrapper de providers

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
