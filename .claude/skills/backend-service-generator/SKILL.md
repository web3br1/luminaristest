---
name: backend-service-generator
description: Gera classe Service de um feature com injeção de Repository e Policy, erros tipados e registro no ApplicationFactory
argument-hint: "[NomeDoRecurso]"
allowed-tools: Read, Grep, Glob, Write, Edit
---

# Backend Service Generator

## Purpose

Gera `server/src/features/<resource>/services/<Resource>Service.ts` com padrão de injeção de dependência, erros tipados, e registra o serviço em `server/src/lib/factory.ts`.

## When to use

- Novo domínio de negócio precisa de lógica encapsulada
- Adicionando operação complexa que envolve múltiplos repositories
- Extraindo lógica do controller para service

## Inputs

- `$ARGUMENTS[0]`: nome do recurso em PascalCase (ex: `Appointment`)

## Repository patterns to inspect first

```
server/src/features/users/services/UserService.ts
server/src/lib/errors.ts
server/src/lib/factory.ts
server/src/features/users/repositories/IUserRepository.ts
server/src/features/users/policies/IUserPolicy.ts
```

## Generation contract

1. Arquivo: `server/src/features/<resource>/services/<Resource>Service.ts`
2. Constructor: `constructor(private <resource>Repository: I<Resource>Repository, private <resource>Policy: I<Resource>Policy) {}`
3. Métodos públicos: `create<Resource>`, `get<Resource>ById`, `getAll<Resource>s`, `update<Resource>`, `delete<Resource>`
4. Cada método: verificar policy ANTES de acessar repository
5. Erros tipados de `lib/errors`: `ServiceError`, `ForbiddenError`, `NotFoundError`, `UnauthorizedError`, `ValidationError`
6. Actor: sempre aceitar `actor: IUser | null` como parâmetro — importe `IUser` de `../../users/models/User.model` (NÃO de `@prisma/client`). O controller passa o retorno de `getUserContextFromRequest(req)` (um `UserContext`), que é estruturalmente atribuível a `IUser` — sem cast.
7. Registrar em `lib/factory.ts`:
   - Adicionar import do Repository, Policy e Service
   - Instanciar no constructor de `ApplicationFactory`
   - Adicionar getter: `public get<Resource>Service = (): <Resource>Service => this.services.<resource>`
8. DTO validation: chamar `is<Resource>Dto(data)` antes de persistir

## Variante: Orchestration Service (sobre DynamicTableService)

Variante legítima de Service que **NÃO segue o checklist CRUD padrão**. Não tem `policy.canX()` próprio nem Repository CRUD dedicado: orquestra lógica multi-passo **delegando** todas as leituras/escritas ao `DynamicTableService` (que já aplica policy e validação). Ex.: `CrmPipelineService` e `CrmAnalyticsService`.

**Quando usar:** lógica multi-passo que opera sobre tabelas dinâmicas/preset (CRM, ERP schema-driven), em vez de um model Prisma próprio.

**Regras:**

- Constructor injeta `DynamicTableService` (+ `IDynamicTableRepository` **apenas** para resolver a tabela por `internalName`, escopado a `user.userId`: `await this.repository.findTableByInternalName(user.userId, 'leads')` — presets têm `internalName = presetKey`).
- **NÃO duplica policy**: o `DynamicTableService` já aplica autorização (ex.: `canManageData`) em toda leitura/escrita — o orchestration service delega a ele. A **ausência de `policy.canX()` próprio NÃO é violação** nesta variante (é correto e deliberado).
- Ainda é **agnóstico a HTTP** (recebe `actor: IUser | null`, nunca `req`/`res`).
- Ainda usa **`NotFoundError`** quando a tabela/preset não está instalado (ex.: `findTableByInternalName` retorna `null`).
- Escreve via `dynamicTableService.createTableData(user, tableId, { data })` / `updateTableData(user, dataId, { data })`. **Atenção:** `updateTableData`/`deleteTableData` recebem o **`dataId` do registro** (resolvem a tabela internamente), enquanto `createTableData`/`getTableData` recebem o **`tableId`**.
- Registra no factory normalmente (mas sem repo/policy próprios).

Referência: `server/src/features/crm/services/CrmPipelineService.ts`, `CrmAnalyticsService.ts`.

## Files usually created or changed

```
server/src/features/<resource>/services/<Resource>Service.ts    ← NEW
server/src/lib/factory.ts                                        ← EDIT (register)
```

## Required checks

```bash
cd server && npx tsc --noEmit
```

## Anti-patterns

- Nunca importe `prisma` diretamente no Service — sempre via Repository
- Não pule a verificação de policy
- Não lance erros genéricos — use os tipos de `lib/errors.ts`
- Não esqueça de registrar no factory — o controller não consegue instanciar sem ele
