---
name: backend-policy-generator
description: Gera a camada Policy (classe `<Resource>Policy` + interface `I<Resource>Policy`) com métodos `canXxx` de autorização puramente booleanos, baseados em role (`Role.ADMIN`) e ownership (`actor.id === ownerId`). Use ao criar um recurso que precisa de controle de acesso, ao adicionar regra de autorização a recurso existente, ou ao diferenciar permissões ADMIN vs USER vs proprietário. Trigger terms: policy, autorização, authorization, canCreate/canView/canUpdate/canDelete/canListAll, role, ownership, ForbiddenError. Domínio/arquivos: server/src/features/<resource>/policies/.
argument-hint: "[NomeDoRecurso]"
allowed-tools: Read, Grep, Glob, Write, Edit
compatibility: Claude Code; requer o monorepo Luminaris (server/ com tsc + Role/IUser em users/models/User.model). Sem efeitos externos — apenas gera/edita arquivos no repositório.
metadata:
  governance-skill-id: "SKL-BACKEND-POL"
  governance-version: "1.0.0"
  governance-status: "validated"
  governance-owner: "engineering"
  governance-last-evaluated: "2026-06-25"
  governance-eval-score: "1.00"
---

# Backend Policy Generator

## Purpose

Gera `server/src/features/<resource>/policies/<Resource>Policy.ts` e `I<Resource>Policy.ts` com regras de autorização booleanas baseadas em role e ownership.

## Contrato obrigatório

Antes de gerar, leia `.claude/skills/_ARCHITECTURE-CONTRACT.md` — as regras cross-cutting (camadas, DI, soft-delete, policy-first, erros tipados, no-`any`, registro de rota, money, testes) são **gate** e não se repetem aqui. Esta skill adiciona apenas o checklist específico da camada **Policy**.

## Checklist obrigatório — Policy

Cada item abaixo é uma REGRA DE GERAÇÃO (o `luminaris-reviewer` cobra exatamente isto na camada Policy). Gere já em conformidade.

- [ ] **[POL-001]** **Todo método `can*` retorna `boolean`** — nenhum retorna `void`, `Promise`, ou lança exceção.
- [ ] **[POL-002]** **Métodos obrigatórios presentes:** `canCreate`, `canView`, `canUpdate`, `canDelete`, `canListAll`.
- [ ] **[POL-003]** **`canListAll` checa `actor?.role === Role.ADMIN`** (listar todos os registros do tenant é privilégio admin).
- [ ] **[POL-004]** **Ownership em `canView`/`canUpdate`/`canDelete`:** `actor?.id === ownerId || actor?.role === Role.ADMIN`.
- [ ] **[POL-005]** **`implements I<Resource>Policy`** — a interface declara as mesmas assinaturas booleanas.
- [ ] **[POL-001]** **ZERO `throw`** dentro de qualquer método `can*` — quem lança `ForbiddenError` é o service, depois de checar a policy.
- [ ] **[POL-007]** **Actor `IUser | null`** — `null` = não autenticado; retorna `false` (exceto signup público explícito).
- [ ] **[POL-006]** **Zero acesso a dados** — a policy só inspeciona campos do `actor` já carregado; nunca consulta o banco.
- [ ] **[POL-008]** Imports: `import type { IUser } from '../../users/models/User.model'` + `import { Role } from '../../users/models/User.model'`.

## When to use

- Novo recurso precisa de controle de acesso
- Adicionando regra de autorização a recurso existente
- Diferenciando permissões ADMIN vs USER vs proprietário do recurso

## Inputs

- `$ARGUMENTS[0]`: nome do recurso em PascalCase (ex: `Appointment`)

## Repository patterns to inspect first

```
server/src/features/users/policies/UserPolicy.ts
server/src/features/users/policies/IUserPolicy.ts
server/src/features/dynamicTables/policies/DynamicTablePolicy.ts
server/src/features/users/models/User.model.ts
```

## ⭐ Exemplo de referência canônico (espelhe este arquivo)

`server/src/features/users/policies/UserPolicy.ts` — Policy perfeita da camada: todo `can*` (`canCreate`/`canView`/`canUpdate`/`canDelete`/`canListAll`) retorna **só `boolean`**, ZERO `throw`, ZERO acesso a dados (inspeciona apenas campos do `actor`), `canListAll` exige `Role.ADMIN`, ownership via `actor.id === targetUserId || actor.role === Role.ADMIN`, `actor: IUser | null` com `null` → `false` (exceto `canCreate(null)` = signup público), `implements IUserPolicy`, imports de `../models/User.model` (`IUser` + `Role` local, nunca `@prisma/client`). Leia-o ANTES de gerar e siga a mesma estrutura/ordem.

## Generation contract

1. Interface: `I<Resource>Policy.ts` com assinaturas booleanas
2. Classe: `export class <Resource>Policy implements I<Resource>Policy`
3. Import obrigatório: `import type { IUser } from '../../users/models/User.model'` + `import { Role } from '../../users/models/User.model'`
4. Actor: sempre `actor: IUser | null` — null = não autenticado
5. Métodos obrigatórios: `canCreate`, `canView`, `canUpdate`, `canDelete`, `canListAll`
6. Padrão de ownership: `actor.id === targetOwnerId`
7. Padrão admin: `actor.role === Role.ADMIN`
8. Retorna `false` quando actor é null (exceto casos de signup público)
9. Nunca lança exceção — apenas retorna boolean

## Files usually created or changed

```
server/src/features/<resource>/policies/I<Resource>Policy.ts    ← NEW
server/src/features/<resource>/policies/<Resource>Policy.ts     ← NEW
```

## Required checks

```bash
cd server && npx tsc --noEmit
```

## Anti-patterns

- Não lance erros na Policy — erros são lançados pelo Service após checar a Policy
- Não acesse banco de dados na Policy — apenas cheque campos do actor já carregado
- Não omita tratamento de `actor === null`
- Não use lógica complexa — se a regra é complexa, documente com comentário inline
- Não retorne nada além de `boolean` de um método `can*` — sem `void`, sem `Promise`, sem `throw`
- Não omita `canListAll` nem deixe de checar `Role.ADMIN` nele — listar todos do tenant é privilégio admin
- Não esqueça o ramo admin no ownership: `actor?.id === ownerId || actor?.role === Role.ADMIN` (só dono OU admin)
- Não deixe a classe sem `implements I<Resource>Policy` — a interface é o contrato injetado no service
