---
name: frontend-page-generator
description: Gera uma página Next.js no Pages Router (`my-app/pages/<resource>/index.tsx`) que COMPÕE um módulo de feature já existente — renderiza a View do módulo via dynamic import, com auth guard `withAuth`, i18n `serverSideTranslations` + `getServerSideProps` e dynamic imports `{ ssr: false }` para libs pesadas. A página é uma casca de rota: NÃO faz fetch, NÃO define hook de dados, NÃO importa `apiClient`/`lib/services` — esses vivem no módulo. Use ao criar uma rota nova, ao expor um módulo de dashboard como página, ou ao adicionar i18n/auth a uma tela. Domínio/arquivos: `my-app/pages/<resource>/index.tsx` + locales. NÃO use para criar a View/hooks/fetch do módulo (isso é `frontend-feature-module-generator`).
argument-hint: "[nome-do-recurso] [list|detail|create|edit]"
allowed-tools: Read, Grep, Glob, Write, Edit
compatibility: Claude Code; requer o monorepo Luminaris (my-app/ com React + Next.js Pages Router + next-i18next + tsc). Sem efeitos externos — apenas gera/edita arquivos no repositório.
metadata:
  governance-skill-id: "SKL-FE-PAGE"
  governance-version: "1.0.0"
  governance-status: "validated"
  governance-owner: "engineering"
  governance-last-evaluated: "2026-06-25"
  governance-eval-score: "1.00"
---

# Frontend Page Generator

## Purpose

Gera arquivos de página em `my-app/pages/<resource>/index.tsx` seguindo os padrões do Luminaris: Pages Router, auth guard via `withAuth` ou `useAuth`, `getServerSideProps` com i18n, dynamic imports para componentes pesados.

## Contrato obrigatório

Antes de gerar, leia `.claude/skills/_ARCHITECTURE-CONTRACT.md` — as regras cross-cutting (reuse de canônicos, service layer, paginação DynamicTable, modal-não-rota, `useMemo`, no-`any`, container full-height, design system) são **gate** e não se repetem aqui. Esta skill adiciona apenas o checklist específico de **Page**.

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

## ⭐ Exemplo de referência canônico (espelhe este arquivo)

`my-app/pages/dashboard/index.tsx` — página canônica do Pages Router: auth guard, `getServerSideProps` com `serverSideTranslations`, dynamic imports `{ ssr: false }` que **importam a View de um módulo de feature** (`features/dashboard/category-views/<name>/<Name>View`) e a renderizam dentro do shell full-height — a página NÃO faz fetch nem define hook. Para uma página de listagem CRUD mais simples, veja `my-app/pages/users/index.tsx`. Leia ANTES de gerar. (Lembre: detalhe de registro = MODAL, nunca `[id].tsx`; NUNCA espelhe as páginas do CRM `pages/crm/*` — são o anti-exemplo de `max-w-*` divergente e detalhe em rota.)

## Generation contract

Cada item marcado `[FEPAGE-*]` abaixo é uma REGRA DE GERAÇÃO auditável. Gere já em conformidade.

1. **[FEPAGE-001]** **A página COMPÕE o módulo de feature — não duplica.** A página é uma casca de rota: importa a View do módulo (`features/dashboard/category-views/<name>/<Name>View` ou `features/<module>/...View`) via `dynamic()` e a renderiza. **NUNCA** faça fetch na página, **NUNCA** importe `apiClient` ou `lib/services/*.service`, **NUNCA** defina um hook de dados (`export function use<...>`) na página — service layer, hooks (`use<Name>Data`) e fetch vivem no MÓDULO. Se a View ainda não existe, gere-a com `frontend-feature-module-generator` ANTES; esta skill apenas a expõe como rota.
2. **[FEPAGE-002]** **Pages Router + arquivo:** `my-app/pages/<resource>/index.tsx`. **Detalhe de um registro = MODAL, não rota.** O padrão dominante é abrir detalhe/edição num modal (`components/ui/Modal.tsx` + estado local na view, ex.: `KanbanCardDetailModal`), NÃO navegar para `[id].tsx`. Reserve `[id].tsx` só para páginas genuinamente standalone/deep-linkáveis. Lição do CRM: clicar num lead fazia `router.push('/crm/leads/[id]')` e trocava de tela inteira — fora do padrão.
3. **[FEPAGE-003]** **Auth guard `withAuth`:** envolva o export no HOC `withAuth` (de `lib/hoc/withAuth`) OU use `useAuth()` + redirect manual no `useEffect`. Toda rota de dashboard é autenticada.
4. **[FEPAGE-004]** **i18n via `serverSideTranslations` + `getServerSideProps`** — sem isso o i18n quebra em produção:
   ```ts
   export const getServerSideProps: GetServerSideProps = async ({ locale }) => ({
     props: { ...(await serverSideTranslations(locale ?? 'en', ['common'])) }
   })
   ```
   Imports de apoio: `useTranslation`, `Head`, `GetServerSideProps`. Se namespace i18n novo: criar `my-app/public/locales/{en,pt}/<resource>.json`.
5. **[FEPAGE-005]** **Dynamic imports `{ ssr: false }` para o que é pesado** — a View do módulo e qualquer lib pesada (FullCalendar/recharts/grid-layout) entram por `dynamic(() => import('...'), { ssr: false })`, fora do `_app`. `loading` usa `LoadingSpinner` de `components/ui/feedback/LoadingSpinner`. Head: `<Head><title>X | Luminaris</title></Head>`.
6. **[FEPAGE-006]** **Container consistente + design system:** herde o container full-height do shell (`flex h-full … flex-col`, scroll interno) — NÃO fixe `max-w-*` divergentes por página (telas irmãs "mudam de tamanho" ao navegar — defeito do CRM). Aplique `frontend-design-system` (tokens `neutral`/`lumi-*`, `neutral-*` **nunca** `zinc-*`, gradient header, `font-black`).
7. **[FEPAGE-007]** **Dados derivados memoizados:** qualquer dado DERIVADO que sobre na página (raro — quase tudo deve estar no módulo) DEVE ir em `useMemo(() => ..., [deps])`. Sem isso recalcula a cada render (inclusive em context updates) com custo O(n)/O(n log n).

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
- **Não crie `[id].tsx` para ver/editar um registro da lista** — use modal. Rota dinâmica só para páginas standalone/deep-linkáveis.
- **Não fixe `max-w-*` divergentes por página** dentro de um módulo — telas irmãs ficam de tamanhos diferentes ao navegar. Herde o container full-height do shell.
- Não calcule dados derivados (`filter`/`sort`/`group`/`find`/`reduce`/lookups) direto no render sem `useMemo([deps])` — recalcula a cada render (inclusive em context updates) com custo O(n)/O(n log n); memoize em páginas e em hooks de dados
- **Não faça fetch nem defina hook de dados na página** (`apiClient`/`lib/services`/`export function use<...>`) — a página COMPÕE a View do módulo; service layer e hooks vivem no módulo (FEPAGE-001). Criar a View/hooks/fetch é trabalho do `frontend-feature-module-generator`, não desta skill.
