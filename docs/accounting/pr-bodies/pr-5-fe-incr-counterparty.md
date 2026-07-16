## Título
`feat(accounting): FE-INCR-COUNTERPARTY — aba Contrapartes + seleção nos modais AP/AR`

## Corpo

### Resumo
UI da contraparte first-class (backend em `#119` / `INCR-COUNTERPARTY`). Adiciona a aba **Contrapartes** (lista/criar/arquivar) e a seleção opcional de contraparte nos modais de create de Contas a Pagar e Contas a Receber. **FE only.**

Empilhado sobre `claude/incr-counterparty-a1` (backend A1). `81093dc` → `claude/fe-incr-counterparty` (`383cf1c`) — **13 arquivos, +941**.

### O que muda
- `lib/services/counterparties.service.ts` — service tipado sobre `/api/counterparties` (list/create/archive), tipos alinhados ao DTO backend (`type` SUPPLIER|CUSTOMER, `name`, `ref?`, soft-delete).
- Aba **Contrapartes** (`CounterpartiesPanel` + `CreateCounterpartyModal`) — filtro por tipo + incluir-arquivadas, criar, arquivar (com confirmação). Clona o padrão visual AP/AR.
- Dropdown **opcional** de contraparte nos `CreatePayableModal`/`CreateReceivableModal` (SUPPLIER no AP, CUSTOMER no AR) → popula `counterpartyId`; "— sem contraparte —" mantém opcional; sem cadastro → link para a aba.
- Fetch best-effort de contrapartes no `openCreate` (não bloqueia o modal se falhar); i18n pt/en.

### Segurança (coerente com o backend)
O FE só envia `counterpartyId`; a validação de escopo + tipo é 100% backend (`resolveCounterpartyId` faz `findById` escopado, rejeita cross-tenant = SEC-A1-1, exige type correto). A UI não tenta burlar nada.

### Gates
`tsc` limpo; `npm run build` (produção) OK; 72 testes accounting (3 novos); **i18n paridade real 727=727** (key-paths, não só contagem); sem `zinc-*`, cards `rounded-2xl`, zero `any` evitável.

### Review
Review independente = **PASS — pronto p/ merge após o backend A1**. Sem correção obrigatória. Opcional (não bloqueia): teste de comportamento do filtro SUPPLIER/CUSTOMER e do fluxo de archive.

### Merge / residual
- **Base = `claude/incr-counterparty-a1`** (empilhado). GitHub re-aponta para `main` quando o backend A1 mergear. Mergear **depois** do backend A1.
- Residual: browser sign-off humano (telas atrás de `withAuth` — validadas por build de produção, não `next dev`).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
