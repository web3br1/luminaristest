---
name: frontend-design-system
description: Aplica a linguagem visual real do Luminaris (tokens, superfícies dark, tipografia e componentes-assinatura) para que telas geradas fiquem on-brand, não genéricas
argument-hint: "[componente ou tela a estilizar]"
allowed-tools: Read, Grep, Glob, Write, Edit
---

# Frontend Design System

## Purpose

As regras estruturais cross-cutting vivem em `.claude/skills/_ARCHITECTURE-CONTRACT.md`; esta skill detalha a camada visual.

As outras skills de frontend garantem a **estrutura** correta (auth, i18n, hooks, dark mode, paginação) mas NÃO a **identidade visual**. Esta skill encoda a linguagem de design real do Luminaris para que as telas geradas pareçam parte do produto — não Tailwind genérico (`zinc`, `rounded-xl`, `font-semibold`). Aplique-a sempre que estilizar qualquer componente/tela.

## When to use

- Toda vez que uma skill de frontend (`frontend-component-generator`, `frontend-page-generator`, `frontend-widget-generator`, `frontend-feature-module-generator`) for criar UI
- Reestilizar telas que ficaram "genéricas"
- Construir componentes-assinatura (gauge de score, barras BANT, header com gradiente)

## Repository patterns to inspect first

```
my-app/tailwind.config.js                                                         ← tokens (lumi-*, palette)
my-app/features/crm/components/ui/                                                 ← ⭐ kit on-brand PRIMÁRIO (GradientHeader/ScoreGauge/StatusBadge/BantBars) — extraído, fora de legacy
my-app/features/dashboard/category-views/leads/components/ManageHeader.tsx        ← header gradiente + KPI tiles (visualmente limpo, 0 zinc — mas módulo legacy: copie só o visual)
my-app/features/dashboard/category-views/leads/components/KanbanView.tsx           ← score gauge SVG (idem — legacy)
my-app/features/dashboard/category-views/leads/components/LeadInfoSidebar.tsx      ← barras BANT (idem — legacy)
```

## ⭐ Exemplo de referência canônico (espelhe este arquivo)

**Primário — `my-app/features/crm/components/ui/`**: o kit on-brand extraído e reusável, **fora de módulo legacy** — `GradientHeader` (hero gradiente + blur blobs), `ScoreGauge` (gauge SVG circular), `StatusBadge` (pill `color/10`+`color/20`), `BantBars` (barras de progresso). Espelhe estes para os componentes-assinatura. (Reuse o **kit visual** do CRM; tabela/analytics/layout do CRM, não.)

Os **mesmos padrões** aparecem visualmente limpos (0 zinc, `rounded-2xl`, KPI tiles com label `text-[10px] font-black uppercase tracking-widest`) em `category-views/leads/components/` — `ManageHeader.tsx` (hero), `KanbanView.tsx` (gauge), `LeadInfoSidebar.tsx` (BANT). Mas esse é o **módulo legacy**: leia-os só para ver o padrão em contexto e **copie o visual, NUNCA a estrutura do módulo**. Leia ANTES de estilizar.

## Tokens e superfícies (não use `zinc` cru)

| Uso | Light | Dark |
|---|---|---|
| Fundo de página | `bg-white` | `dark:bg-neutral-900` |
| Card/superfície elevada | `bg-white` / `bg-gray-50/50` | `dark:bg-neutral-900` / `dark:bg-white/[0.03]` |
| Superfície interna (tile) | `bg-gray-50/50` | `dark:bg-white/[0.03]` |
| Borda (padrão) | `border-gray-200` / `border-gray-100` | `dark:border-neutral-800` (o token de borda dominante — 27 arquivos) |
| Borda (flourish de hero) | `border-gray-200` | `dark:border-white/5` (opcional; usado nos heros tipo `ManageHeader`, não obrigatório) |
| Texto primário | `text-gray-900` | `dark:text-white` |
| Texto muted | `text-gray-500` / `text-gray-400` | `dark:text-gray-400` |
| Acento primário | `text-blue-600` / `bg-blue-600` | `dark:text-blue-400` |

Tokens nomeados existem no `tailwind.config` (`lumi-primary #3b82f6`, `lumi-accent #10b981`, `lumi-bg-dark #0B0D11`, paleta `lumi.primary.50-900`, `lumi.dark.*`, `lumi.accent.*`). Prefira `neutral-*` para superfícies dark (charcoal, **sem undertone azul**).

## Tipografia-assinatura

- **`font-semibold` é o peso de corpo padrão do app** (151 usos — o mais comum). Use à vontade em texto, linhas de tabela, labels normais.
- **`font-black`** é reservado para **ênfase**: títulos/heros (`tracking-tight`), valores grandes de KPI e labels uppercase de seção. Não troque todo `font-semibold` por `font-black`.
- **Labels de seção/KPI**: `text-[10px] font-black uppercase tracking-widest text-gray-400`
- Valores de KPI: `text-2xl font-black`
- **Cantos:** **cards** = `rounded-2xl`/`rounded-3xl`; tiles = `rounded-2xl`; pills = `rounded-full`; **inputs/botões/filtros = `rounded-xl`/`rounded-lg`** (o raio mais comum do app — 74 arquivos; NÃO é off-brand). Off-brand é só usar `rounded-xl` num *card* que deveria ser `2xl`.

## Componentes-assinatura (copie estes padrões)

### Card / superfície
```tsx
<div className="rounded-2xl bg-white dark:bg-neutral-900 border border-gray-200 dark:border-white/5 p-5 shadow-sm">…</div>
```

### Header com gradiente + blur blobs (heros de tela/detalhe)
```tsx
<div className="relative overflow-hidden rounded-3xl bg-white dark:bg-neutral-900 border border-gray-200 dark:border-white/5 p-6 shadow-sm">
  <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/5 rounded-full blur-3xl -mr-32 -mt-32" />
  <div className="absolute bottom-0 left-0 w-48 h-48 bg-purple-500/5 rounded-full blur-3xl -ml-24 -mb-24" />
  <div className="relative …">
    <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center text-white font-black text-2xl shadow-xl shadow-blue-500/20">A</div>
    …
  </div>
</div>
```

### Badge de status (pill color/10 + color/20)
```tsx
<span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest border bg-emerald-500/10 text-emerald-600 border-emerald-500/20">Won</span>
// Lost → rose-500/10 text-rose-600 border-rose-500/20 · Open → blue-500/10 text-blue-600 border-blue-500/20
```

### Score gauge (SVG circular, score 0-100)
```tsx
<svg viewBox="0 0 40 40" className="-rotate-90">
  <circle cx="20" cy="20" r="16" stroke="currentColor" strokeWidth="3" fill="transparent" className="text-gray-100 dark:text-neutral-800 opacity-20" />
  <circle cx="20" cy="20" r="16" stroke="currentColor" strokeWidth="3" fill="transparent"
    strokeDasharray={100} strokeDashoffset={100 - score}
    className={`${score>=80?'text-emerald-500':score>=50?'text-amber-500':'text-gray-400'} transition-all duration-1000`} />
</svg>
// r=16 → circunferência ≈ 100, então dashoffset = 100 - score mapeia direto a %
```

### Barra BANT / progress
```tsx
<div className="w-full bg-gray-200 dark:bg-neutral-800 h-2 rounded-full overflow-hidden shadow-inner">
  <div className="h-2 rounded-full bg-blue-500" style={{ width: `${pct}%` }} />
</div>
```

### KPI tile
```tsx
<div className="p-4 rounded-2xl bg-gray-50/50 dark:bg-white/[0.03] border border-gray-100 dark:border-white/5">
  <div className="flex items-center gap-2 mb-2">
    <div className="p-1.5 rounded-lg bg-white dark:bg-neutral-800 shadow-sm border border-gray-100 dark:border-white/5 text-blue-500">{icon}</div>
    <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">{label}</span>
  </div>
  <div className="text-sm font-black text-gray-900 dark:text-white">{value}</div>
</div>
```

## Files usually created or changed

```
my-app/features/<module>/components/ui/*.tsx    ← NEW (kit on-brand do módulo)
(componentes/telas do módulo reestilizados com os tokens acima)
```

## Required checks

```bash
cd my-app && npx tsc --noEmit
```
Verificação visual: subir o preview e navegar a tela. **Use um build de produção** (`cd my-app && npx next build && npx next start`) — o `next dev` tem hidratação não-determinística e pode travar telas atrás de `withAuth` no gate "Authenticating…" (ver `frontend-page-generator`). Confirme as superfícies por **estilos computados** com `preview_inspect`, não por screenshot: superfície dark on-brand = `backgroundColor: rgb(23,23,23)` (neutral-900), borda `rgb(38,38,38)` (neutral-800), card `borderRadius: 16px` (rounded-2xl). `zinc-900` renderiza `rgb(24,24,27)` — se aparecer esse valor, é off-brand.

## Anti-patterns

- **Não use `zinc-*` para superfícies dark** — o app usa `neutral-*` (charcoal sem undertone azul). `zinc-*` é o sinal nº1 de "Tailwind genérico" e deve ser **zero** no código gerado. O grep de verificação é `grep -rn "zinc-" <pasta-do-modulo>` e **deve retornar nada**. (Borda dark padrão = `dark:border-neutral-800`.)
- Não use `rounded-xl` **em cards** — cards são `rounded-2xl/3xl`. (Mas `rounded-xl/lg` em inputs/botões/filtros é correto — não confunda.)
- **Wrappers de bibliotecas de UI (FullCalendar, react-grid-layout, editores) e containers de LISTA/TIMELINE TAMBÉM são cards** — caso não-óbvio que vazou na revisão do CRM. Aplique a mesma regra de superfície: superfície = `bg-white dark:bg-neutral-900`, borda = `border-gray-200 dark:border-neutral-800`, raio = `rounded-2xl`. NUNCA `zinc-*` nem `rounded-lg/xl` para esses containers.
- Não troque `font-semibold` por `font-black` em todo lugar — `font-semibold` é o peso de corpo normal; `font-black` é só para ênfase (títulos/valores/labels uppercase)
- Não escreva labels em case normal — labels de KPI/seção são `text-[10px] uppercase tracking-widest`
- Não faça badges sólidos — use o padrão `color/10` (fundo) + `color/20` (borda) + `color-600` (texto)
- Não invente cores fora da paleta — acento primário é blue, positivo é emerald, negativo é rose, warning é amber
- Não pule a verificação visual — comparar com uma tela existente é a única forma de garantir paridade
