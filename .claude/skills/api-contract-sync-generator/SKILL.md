---
name: api-contract-sync-generator
description: Sincroniza endpoint backend (rota + DTO) com o service frontend correspondente, garantindo tipos alinhados
argument-hint: "[nome-do-recurso] [endpoint-especifico-opcional]"
allowed-tools: Read, Grep, Glob, Write, Edit
---

# API Contract Sync Generator

## Purpose

Garante que o frontend service espelhe exatamente o contrato do backend: mesmos campos, mesmos tipos, mesma estrutura de resposta `{ success: boolean; data: T }`. Útil ao modificar DTOs ou adicionar novos endpoints.

## Contrato obrigatório

O alinhamento de contrato é uma fatia das regras cross-cutting de `.claude/skills/_ARCHITECTURE-CONTRACT.md` (frontend service layer, tipos locais, zero `any`). O contrato é o gate final desta sincronização.

## ⭐ Exemplo de referência canônico (espelhe este par)

O par DTO↔frontend-service alinhado de referência é o do `users` — verificado e exemplar:

```
server/src/features/users/dtos/UserDto.ts   ← DTO backend (Create/Update Zod schemas + type guards)
my-app/lib/services/user.service.ts         ← frontend service (apiClient, tipos LOCAIS de my-app/types/User, zero any)
```

Por que é o par perfeito: o frontend service espelha 1:1 os campos do DTO (Create/Update), usa `apiClient` (nunca `fetch`), define tipos localmente (não importa do backend) e trata a resposta `{ success, data }`. É exatamente o alinhamento que esta skill deve produzir. (O CRM tem par equivalente — `CrmPipelineDto.ts` ↔ `my-app/lib/services/crm.service.ts` — mas o frontend do CRM é anti-exemplo; use o `users` como modelo.)

## Checklist de sincronização

- [ ] Os tipos do frontend service batem **1:1** com `Create<X>Schema` / `Update<X>Schema` do DTO backend (mesmos campos, mesma opcionalidade).
- [ ] Todo campo que o frontend **envia** existe no schema do DTO (campo a mais no frontend = 400 silencioso ou drop).
- [ ] Os paths `apiClient.get/post('/api/<x>')` batem **exatamente** com a rota declarada em `routes/<resource>.ts`.
- [ ] **ZERO `any`** em tipos de retorno/payload — tipar com interfaces locais ou `unknown` + narrowing.
- [ ] Tipos definidos **localmente no frontend** — nunca importar tipos do backend (evita acoplar o bundle ao server).

## When to use

- DTO backend foi alterado e o frontend precisa refletir
- Novo endpoint adicionado e o service frontend não tem o método
- Depurando erros de tipo entre frontend e backend
- Code review identificou divergência de contrato

## Inputs

- `$ARGUMENTS[0]`: nome do recurso (ex: `appointments`)
- `$ARGUMENTS[1]`: endpoint específico (ex: `create`) — opcional

## Execution steps

1. Ler `server/src/features/<resource>/dtos/<Resource>Dto.ts`
2. Ler `server/src/routes/<resource>.ts` (confirmar endpoints existentes)
3. Ler `my-app/lib/services/<resource>.service.ts` (estado atual do frontend)
4. Identificar divergências: campos faltando, tipos errados, endpoints não implementados
5. Atualizar o frontend service com tipos corretos
6. Verificar hooks que consomem o service — atualizar se tipos mudaram

## Files usually changed

```
my-app/lib/services/<resource>.service.ts       ← EDIT
my-app/features/*/hooks/use<Resource>*.ts       ← EDIT (se tipos mudaram)
```

## Required checks

```bash
cd my-app && npx tsc --noEmit
```

## Anti-patterns

- Não copie tipos do backend para o frontend diretamente — redefina-os localmente
- Não use `any` como solução temporária — sempre tipar corretamente
- Não esqueça de verificar paginação: `{ data: T[]; pagination: { page, limit, totalCount, totalPages } }`
- Não assuma que os endpoints são simétricos — verifique `routes/<resource>.ts` explicitamente
