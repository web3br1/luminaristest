# components/ui — Primitivos de UI

Componentes de UI reutilizáveis: o tema **Galaxy**, modais, feedback e wizard. A maioria é exportada
pelo barrel `@/components/ui` (`index.ts`).

## Tema Galaxy

| Componente | Papel |
|---|---|
| `GalaxyBackground` | Fundo escuro com estrelas animadas (`animate-star-twinkle`) e efeito de nebulosa. Props: `children`, `className`. |
| `GalaxyCard` | Card translúcido sobre o tema Galaxy. |

> O modo claro/escuro é persistido em `localStorage` e aplicado por um script inline em
> `pages/_document.tsx` (evita flash de tema).

## Modais e feedback

| Componente | Export | Papel |
|---|---|---|
| `Modal` | `@/components/ui` | Modal base. |
| `ConfirmModal` + `useConfirmModal` | `@/components/ui` | Modal de confirmação (variantes via `ConfirmModalVariant`/`ConfirmModalOptions`) e o hook que o controla. |
| `Toast` | `@/components/ui` | Notificação visual (`ToastType`); o disparo global vem do `ToastContext`. |
| `Alert` | `@/components/ui` (default) | Mensagem inline (sucesso/erro/aviso). |
| `LoadingSpinner` | `./feedback/LoadingSpinner` | Indicador de carregamento (importado direto). |

## Wizard (`wizard/`)

Fluxo passo-a-passo (ex.: onboarding/setup), com barrel próprio `./wizard`:

- `WizardModal` — container do wizard em modal.
- `WizardTabBar` — barra de etapas/abas.

## Estrutura de arquivos

```
ui/
├── index.ts                 # barrel: Galaxy*, Modal, ConfirmModal, useConfirmModal, Toast, Alert
├── GalaxyBackground.tsx · GalaxyCard.tsx · Modal.tsx
├── feedback/                # Alert · ConfirmModal · useConfirmModal · Toast · LoadingSpinner
└── wizard/                  # WizardModal · WizardTabBar (+ index.ts)
```

## Uso

```tsx
import { GalaxyBackground, GalaxyCard, Modal, ConfirmModal, useConfirmModal, Toast, Alert } from '@/components/ui';
import { WizardModal, WizardTabBar } from '@/components/ui/wizard';
```
