# components — UI reutilizável

Componentes compartilhados, fora da lógica de feature. Divididos em **primitivos de UI**, **widgets**
de dashboard, e alguns componentes estruturais.

| Área | O que é | Doc |
|---|---|---|
| `ui/` | Primitivos: tema Galaxy, Modal, feedback (Alert/Toast/Confirm), wizard. | [README](./ui/README.md) |
| `widgets/` | Widgets do dashboard (grid, chat, analytics, erp-view, generic-chat). | [README](./widgets/README.md) |
| `layout/` | Estruturas de página (abaixo). | — |
| `floating-chat/` | Chat flutuante global (abaixo). | — |
| `error-boundaries/` | Captura de erros de render (abaixo). | — |

---

## `layout/`
- **`Navbar.tsx`** — barra de navegação principal (ocultada em `/users/*` pelo `_app.tsx`).
- **`AuthSplitLayout.tsx`** — layout em duas colunas das telas de autenticação (login/signup).

## `floating-chat/`
Chat flutuante disponível nas páginas de dashboard (montado pelo `_app.tsx` em `/dashboard/*`):
- `FloatingChatProvider.tsx` — provider/estado do chat flutuante.
- `FloatingChatContainer.tsx` — orquestra a UI flutuante.
- `FloatingChatBubble.tsx` — a bolha/atalho.
- `FloatingChatWindow.tsx` — a janela de conversa.

## `error-boundaries/`
- **`ErrorBoundary.tsx`** — error boundary React que envolve a app (no `_app.tsx`) e evita que um erro
  de render derrube a página inteira.
