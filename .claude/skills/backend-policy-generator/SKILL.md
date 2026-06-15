---
name: backend-policy-generator
description: Gera classe Policy + interface IPolicy com métodos canXxx de autorização baseados em role e ownership
argument-hint: "[NomeDoRecurso]"
allowed-tools: Read, Grep, Glob, Write, Edit
---

# Backend Policy Generator

## Purpose

Gera `server/src/features/<resource>/policies/<Resource>Policy.ts` e `I<Resource>Policy.ts` com regras de autorização booleanas baseadas em role e ownership.

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
