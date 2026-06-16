---
name: backend-service-generator
description: Gera classe Service de um feature com injeção de Repository e Policy, erros tipados e registro no ApplicationFactory
argument-hint: "[NomeDoRecurso]"
allowed-tools: Read, Grep, Glob, Write, Edit
---

# Backend Service Generator

## Purpose

Gera `server/src/features/<resource>/services/<Resource>Service.ts` com padrão de injeção de dependência, erros tipados, e registra o serviço em `server/src/lib/factory.ts`.

## Contrato obrigatório

Antes de gerar, leia `.claude/skills/_ARCHITECTURE-CONTRACT.md` — as regras cross-cutting (camadas, DI, soft-delete, policy-first, erros tipados, no-`any`, registro de rota, money, testes) são **gate** e não se repetem aqui. Esta skill adiciona apenas o checklist específico da camada **Service**.

## Checklist obrigatório — Service

Cada item abaixo é uma REGRA DE GERAÇÃO (o `luminaris-reviewer` cobra exatamente isto na camada Service). Gere já em conformidade.

- [ ] **Policy-check ANTES de qualquer acesso a dados** em toda operação: `if (!this.<resource>Policy.canXxx(actor, targetId?)) throw new ForbiddenError();` — primeira linha do método, antes de tocar o repository.
- [ ] **Erros tipados de `lib/errors`:** `ForbiddenError` quando policy nega; `NotFoundError` quando recurso não existe (não `null` cru, não `throw new Error`).
- [ ] **Cross-tenant = `NotFoundError`, NÃO `ForbiddenError`** — recurso de outro usuário deve parecer inexistente (anti-enumeration).
- [ ] **DI por construtor:** `constructor(private <resource>Repository: I<Resource>Repository, private <resource>Policy: I<Resource>Policy) {}`. **Nunca** `new <Resource>Repository()`/`new <Resource>Policy()` dentro do service.
- [ ] **ZERO `prisma.*` direto** — todo acesso a dados via `this.<resource>Repository`.
- [ ] **ZERO Express / `res.json` / imports de HTTP** — o service é agnóstico a transporte.
- [ ] **Actor `actor: IUser | null`** em todo método público — importe `IUser` de `../../users/models/User.model` (NÃO `@prisma/client`).
- [ ] **Registro em `lib/factory.ts`:** repo e policy instanciados ANTES do service; getter `get<Resource>Service()` exposto.
- [ ] DTO guard (`is<Resource>Input`) antes de persistir quando o método recebe payload não validado.

### Variante: orquestra `DynamicTableService` (CRM/ERP schema-driven)

- [ ] Resolve a tabela por `internalName` (preset key): `this.repository.findTableByInternalName(user.userId, 'leads')` — **nunca** por índice `[0]`.
- [ ] **Sem policy própria** é PASS deliberado nesta variante — `DynamicTableService` já aplica `canManageData` em toda escrita.
- [ ] Continua agnóstico a HTTP; usa `NotFoundError` quando o preset/tabela não está instalado; registra no factory.
- [ ] Escritas múltiplas atômicas via `dynamicTableService.runInTransaction(...)` passando `{ tx }` em cada `createTableData`/`updateTableData`.

## When to use

- Novo domínio de negócio precisa de lógica encapsulada
- Adicionando operação complexa que envolve múltiplos repositories
- Extraindo lógica do controller para service

## Inputs

- `$ARGUMENTS[0]`: nome do recurso em PascalCase (ex: `Appointment`)

## Repository patterns to inspect first

```
server/src/features/users/services/UserService.ts
server/src/features/crm/services/CrmPipelineService.ts
server/src/lib/errors.ts
server/src/lib/factory.ts
server/src/features/users/repositories/IUserRepository.ts
server/src/features/users/policies/IUserPolicy.ts
```

## ⭐ Exemplo de referência canônico (espelhe este arquivo)

**Variante clássica (CRUD com Repository + Policy próprios):** `server/src/features/users/services/UserService.ts` — Service perfeito: **policy-check ANTES de qualquer acesso a dados** em todo método (`canCreate`/`canListAll`/`canView`/`canUpdate`/`canDelete`), erros tipados de `lib/errors` (`ForbiddenError`/`NotFoundError`/`UnauthorizedError`/`ValidationError`/`ServiceError`), DI 100% por construtor (repo + policy injetados, zero `new`), DTO guards (`isCreateUserDto`/`isUpdateUserDto`) antes de persistir, `actor: IUser | null` de `../models/User.model` (nunca `@prisma/client`), ZERO `prisma.*` direto, ZERO Express. Leia-o ANTES de gerar.

**Variante DynamicTable (orquestra `DynamicTableService`, CRM/ERP schema-driven):** `server/src/features/crm/services/CrmPipelineService.ts` — orquestração perfeita: injeta `DynamicTableService` + `IDynamicTableRepository` (só para resolver tabela), resolve por **`internalName`** (`'leads'`/`'leadProposals'`/`'leadActivities'`) nunca por `[0]`, **sem policy própria** (delega a `DynamicTableService`), `NotFoundError` quando o preset/tabela não está instalado, HTTP-agnóstico (`UserContext`), escritas múltiplas atômicas via `dynamicTableService.runInTransaction(async (tx) => …)` passando `{ tx }` em cada write. Use este exemplar quando a lógica opera sobre tabelas dinâmicas/preset; veja também `CrmAnalyticsService.ts` e `server/src/features/chat/services/LuminarisAgentService.ts`.

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
- **Atomicidade em escritas múltiplas:** operações que fazem **mais de uma escrita** (ex.: `create` numa tabela + `update` em outra) **DEVEM ser atômicas**. Use **`dynamicTableService.runInTransaction(async (tx) => { ... })`** e passe `{ tx }` como `options` em cada `createTableData`/`updateTableData` dentro do callback — o rollback é automático se qualquer passo falhar. **Nunca** deixe escrita parcial silenciosa (estado final = "tudo" ou "nada"); não reinvente compensação app-level com try/catch/delete agora que o boundary existe.
  - **Caveat (validações não-tx):** as validações de `create`/`update` rodam contra o estado **commitado** (repo não-tx), então um write posterior **não enxerga** a linha criada por um write anterior na **mesma** tx. OK para escritas independentes ou de snapshot (o padrão do CRM); **não** componha writes cujo *validação* dependa de uma linha criada antes na mesma tx.
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
- Nunca `new <Resource>Repository()`/`new <Resource>Policy()` dentro do service — dependências entram só por construtor (DI via factory)
- Nunca importe Express nem chame `res.json()` — o service é agnóstico a HTTP; quem formata resposta é o controller
- Cross-tenant retorna `NotFoundError`, não `ForbiddenError` — recurso de outro usuário deve parecer inexistente (evita enumeration attack)
- Importe `IUser` de `../../users/models/User.model`, nunca de `@prisma/client` — o `UserContext` do controller é estruturalmente atribuível a `IUser`
