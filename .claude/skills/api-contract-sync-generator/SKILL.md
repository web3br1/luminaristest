---
name: api-contract-sync-generator
description: Sincroniza o contrato de um endpoint backend (rota Express + DTO Zod) com o service frontend correspondente em my-app/lib/services/, garantindo que path/verbo, campos e opcionalidade fiquem alinhados 1:1 e que os tipos sejam espelhados localmente (nunca importados do backend). Use quando um DTO backend mudou e o frontend precisa refletir, quando um novo endpoint foi adicionado e o service frontend ainda não tem o método, ao depurar erros de tipo frontend↔backend, ou quando um code review aponta divergência de contrato (campo a mais no frontend, path errado, `any` no payload, type drift). Domínio/arquivos: server/src/features/<resource>/dtos/, server/src/routes/<resource>.ts e my-app/lib/services/<resource>.service.ts.
argument-hint: "[nome-do-recurso] [endpoint-especifico-opcional]"
allowed-tools: Read, Grep, Glob, Write, Edit
compatibility: Claude Code; requer o monorepo Luminaris (server/ com zod + express e my-app/ com apiClient + tsc). Sem efeitos externos — apenas gera/edita arquivos no repositório.
metadata:
  governance-skill-id: "SKL-API-SYNC"
  governance-version: "1.0.0"
  governance-status: "validated"
  governance-owner: "engineering"
  governance-last-evaluated: "2026-06-25"
  governance-eval-score: "1.00"
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

## Contrato normativo — regras de sincronização

Cada item abaixo é uma REGRA DE GERAÇÃO auditável (o `luminaris-reviewer` cobra exatamente isto na fronteira de contrato). Gere já em conformidade.

- [ ] **[SYNC-001]** Os tipos do frontend service batem **1:1** com `Create<X>Schema` / `Update<X>Schema` do DTO backend (mesmos campos, mesma opcionalidade) — nenhum campo do DTO fica de fora nem é renomeado no frontend.
- [ ] **[SYNC-002]** Todo campo que o frontend **envia** existe no schema do DTO; campo a mais no frontend = 400 silencioso ou drop. Não introduza no payload nenhuma chave que o DTO não declare.
- [ ] **[SYNC-003]** O **path E o verbo** de cada `apiClient.get/post/put/patch/delete('/<x>')` batem **exatamente** com a rota declarada em `routes/<resource>.ts` (mesmo método HTTP, mesmo caminho) — sem inventar endpoint nem trocar o verbo.
- [ ] **[SYNC-004]** **ZERO `any`** em tipos de retorno/payload — tipar com interfaces locais ou `unknown` + narrowing.
- [ ] **[SYNC-005]** Tipos definidos/importados **localmente no frontend** (`my-app/types/...`) — nunca importar tipos do `server/` (espelhar, não duplicar a fonte: o frontend não acopla o bundle ao backend).
- [ ] **[SYNC-006]** A forma da resposta é respeitada: leitura única/escrita desempacotam `{ success, data }` e listas desempacotam `{ data: T[]; pagination: {...} }` — não trate a resposta como `T` cru quando o backend envelopa.

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

## Gotchas / Anti-patterns

- (**SYNC-005**) Não importe tipos do `server/` no frontend nem copie o arquivo do backend — espelhe-os localmente em `my-app/types/`.
- (**SYNC-004**) Não use `any` como solução temporária — sempre tipar corretamente (`unknown` + narrowing quando o shape é incerto).
- (**SYNC-006**) Não esqueça de desempacotar paginação: `{ data: T[]; pagination: { page, limit, totalCount, totalPages } }`; nem trate uma resposta envelopada `{ success, data }` como `T` cru.
- (**SYNC-003**) Não assuma que os endpoints são simétricos nem que o verbo é óbvio — verifique path **e** método HTTP em `routes/<resource>.ts` explicitamente.
- (**SYNC-001 / SYNC-002**) Não deixe o frontend e o DTO divergirem — campo a mais (ou a menos), tipo errado ou opcionalidade diferente é drift de contrato.
