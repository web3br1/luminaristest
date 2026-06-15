---
name: frontend-page-generator
description: Gera página Next.js no Pages Router com auth guard, i18n serverSideTranslations, getServerSideProps e dynamic imports
argument-hint: "[nome-do-recurso] [list|detail|create|edit]"
allowed-tools: Read, Grep, Glob, Write, Edit
---

# Frontend Page Generator

## Purpose

Gera arquivos de página em `my-app/pages/<resource>/index.tsx` seguindo os padrões do Luminaris: Pages Router, auth guard via `withAuth` ou `useAuth`, `getServerSideProps` com i18n, dynamic imports para componentes pesados.

## When to use

- Nova rota de página precisa ser criada
- Adicionando rota dinâmica `[id].tsx`
- Criando página de listagem + detalhe para novo recurso

## Inputs

- `$ARGUMENTS[0]`: nome do recurso em kebab-case (ex: `appointments`)
- `$ARGUMENTS[1]`: tipo opcional: `list` | `detail` | `create` | `edit`

## Repository patterns to inspect first

```
my-app/pages/dashboard/index.tsx
my-app/pages/users/index.tsx
my-app/pages/_app.tsx
my-app/lib/context/AuthContext.tsx
my-app/lib/hoc/withAuth.tsx
my-app/public/locales/en/common.json
```

## Generation contract

1. Arquivo: `my-app/pages/<resource>/index.tsx` (ou `[id].tsx` para detalhe)
2. Imports: `useRouter`, `useAuth`, `useTranslation`, `Head`, `serverSideTranslations`, `GetServerSideProps`
3. Auth check: usar `withAuth` HOC no export OU `useAuth()` + redirect manual no `useEffect`
4. i18n:
   ```ts
   export const getServerSideProps: GetServerSideProps = async ({ locale }) => ({
     props: { ...(await serverSideTranslations(locale ?? 'en', ['common'])) }
   })
   ```
5. Dynamic imports: `dynamic(() => import('...'), { ssr: false })` para componentes pesados
6. Loading state: usar `LoadingSpinner` de `components/ui/feedback/LoadingSpinner`
7. Head: `<Head><title>X | Luminaris</title></Head>`
8. Se namespace i18n novo: criar `my-app/public/locales/en/<resource>.json` e `pt/<resource>.json`
9. **Estilização: aplicar a skill `frontend-design-system`** (tokens `neutral`/`lumi-*`, gradient header, font-black) — não deixe a página com Tailwind genérico
10. **Dados derivados memoizados:** todo dado DERIVADO no corpo do render (`filter`/`sort`/`group`/`find`/`reduce` sobre listas, lookups repetidos, agregações) DEVE ser envolvido em `useMemo(() => ..., [deps])` com as dependências corretas. Sem isso, recalcula a cada render — inclusive em updates de context não relacionados — com custo O(n) ou O(n log n). Vale tanto para páginas quanto para hooks de dados.

## Files usually created or changed

```
my-app/pages/<resource>/index.tsx              ← NEW
my-app/public/locales/en/<resource>.json       ← NEW (se namespace novo)
my-app/public/locales/pt/<resource>.json       ← NEW (se namespace novo)
```

## Required checks

```bash
cd my-app && npx tsc --noEmit
cd my-app && npx next lint
```

## Verificação no preview/dev — gotchas de hidratação

Páginas atrás de `withAuth` mostram um gate "Authenticating…" até o `AuthContext` resolver no cliente. Se a tela **fica presa nesse gate** ao verificar:

1. **`tsc` verde + build/SSR 200 não garantem render** — o que renderiza é a **hidratação** do cliente. Cheque o console do browser.
2. **Crash do dev-overlay do Next 15.x** (`handleStaticIndicator` em msg `isrManifest` do HMR) aborta o bootstrap antes da hidratação. `devIndicators: false` no `next.config.js` **mitiga, mas NÃO resolve** — a hidratação do `next dev` continua não-determinística (já observado: a tela trava "Authenticating…" em TODAS as rotas, inclusive `/`, com `reactMounted:false` e ZERO erro no console — os `useEffect` nunca disparam).
3. **Bundle de dev pesado** (`_app` puxa FullCalendar/recharts/dnd-kit/grid-layout) pode travar o renderer headless. Mantenha libs pesadas em `dynamic(ssr:false)` no caminho da página, fora do `_app`.
4. **✅ CORREÇÃO definitiva — verifique contra um BUILD DE PRODUÇÃO, não o dev:** `cd my-app && npx next build && npx next start`. A produção (sem HMR/dev-overlay) **hidrata de forma limpa e confiável** onde o `next dev` falha — comprovado: a mesma tela que travava no dev renderizou 192 atividades / 36 reuniões reais, com `pageCalledAuthMe:true` e locale-sync (`/pt/...`) funcionando. Prefira prod para qualquer prova visual de tela atrás de `withAuth`.
5. **Auth no headless (prod ou dev):** as páginas leem o cookie **não-httpOnly** `auth_token`. Minte um JWT com o `JWT_SECRET` do `server/.env` para o usuário da seed (`testuser@luminaris.test`) — payload `{ id, username, role }`, HS256 — e faça `document.cookie='auth_token=<jwt>; path=/'` antes de navegar. Dispensa senha/login UI.
6. **Verifique por `preview_inspect`/`preview_snapshot`, NÃO por `preview_screenshot`:** estilos computados (`backgroundColor: rgb(23,23,23)` = neutral-900; `borderRadius: 16px` = rounded-2xl) e a árvore de acessibilidade são **prova mais precisa** de cor/raio/conteúdo do que um bitmap — e a captura bitmap pode estourar timeout no headless. Use o screenshot só como complemento.

> Hierarquia de verificação: `tsc < build/SSR (200) < hidratação (use PROD) < interatividade`. Cada nível esconde defeitos do anterior. Para hidratação confiável, `next build && next start` — nunca conclua "trava" só com base no `next dev`.

## Anti-patterns

- Não use `getStaticProps` — o projeto usa `getServerSideProps` ou fetch no cliente
- Não acesse `localStorage` ou `document` no SSR — guard com `typeof window !== 'undefined'`
- Não esqueça `serverSideTranslations` — sem isso i18n quebra em produção
- Não importe componentes pesados diretamente — use `dynamic()` com `ssr: false`
- Não calcule dados derivados (`filter`/`sort`/`group`/`find`/`reduce`/lookups) direto no render sem `useMemo([deps])` — recalcula a cada render (inclusive em context updates) com custo O(n)/O(n log n); memoize em páginas e em hooks de dados
