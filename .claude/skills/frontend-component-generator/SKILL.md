---
name: frontend-component-generator
description: Gera React component funcional tipado com props interface, cobrindo Modals, Form fields e Cards seguindo o Galaxy theme
argument-hint: "[NomeDoComponente] [modal|form-field|card|default]"
allowed-tools: Read, Grep, Glob, Write, Edit
---

# Frontend Component Generator

## Purpose

Gera componentes React funcionais tipados em `my-app/components/` ou dentro de `features/`, seguindo o Galaxy theme do Luminaris com Tailwind CSS. Cobre modals, form fields, cards e componentes genéricos.

## When to use

- Novo componente de UI reutilizável
- Modal para ação (criar/editar/confirmar)
- Form field customizado
- Card de listagem com dados

## Inputs

- `$ARGUMENTS[0]`: nome do componente em PascalCase (ex: `AppointmentCard`)
- `$ARGUMENTS[1]`: tipo: `modal` | `form-field` | `card` | `default`

## Repository patterns to inspect first

```
my-app/components/ui/GalaxyCard.tsx
my-app/components/ui/Modal.tsx
my-app/components/ui/feedback/
my-app/tailwind.config.js
```

## Generation contract

1. Props interface: `interface <Name>Props { ... }` no mesmo arquivo
2. FC: `export const <Name>: React.FC<<Name>Props> = ({ ... }) => { ... }`
3. **Estilização: aplicar a skill `frontend-design-system`** — tokens reais: superfícies `bg-white dark:bg-neutral-900` (NÃO `zinc`), borda dark `dark:border-neutral-800`, **cards** `rounded-2xl`, labels de seção `text-[10px] uppercase tracking-widest`, `font-black` em títulos/valores. `font-semibold` e `rounded-xl` são corretos para corpo/inputs/botões. Componentes-assinatura (gauge, BANT bars, gradient header, badges) para heros/detalhe.
4. Sempre incluir variantes dark mode: superfícies `dark:bg-neutral-900/800`, texto `dark:text-white`/`dark:text-gray-400`
5. Modal pattern: props `isOpen: boolean`, `onClose: () => void`, `onConfirm?: () => void`
6. Loading state: exibir `LoadingSpinner` quando `isLoading`
7. Empty state: mensagem descritiva quando sem dados

## Files usually created or changed

```
my-app/components/<category>/<Name>.tsx    ← NEW
```

## Required checks

```bash
cd my-app && npx tsc --noEmit
```

## Anti-patterns

- Não use `style={{}}` inline — sempre Tailwind classes
- Não esqueça dark mode: sempre incluir variantes `dark:`
- **Não use `zinc-*` para superfícies dark** — o app usa `neutral-*` (único sinal confiável de Tailwind genérico). Cards devem ser `rounded-2xl` (não `rounded-xl`), mas `rounded-xl`/`font-semibold` são corretos em inputs/botões/corpo — não os trate como off-brand. Ver `frontend-design-system`.
- Não omita a interface de props — sem tipos o componente não é seguro
- Não use `any` nos tipos de props
