---
name: api-contract-sync-generator
description: Sincroniza endpoint backend (rota + DTO) com o service frontend correspondente, garantindo tipos alinhados
argument-hint: "[nome-do-recurso] [endpoint-especifico-opcional]"
allowed-tools: Read, Grep, Glob, Write, Edit
---

# API Contract Sync Generator

## Purpose

Garante que o frontend service espelhe exatamente o contrato do backend: mesmos campos, mesmos tipos, mesma estrutura de resposta `{ success: boolean; data: T }`. Útil ao modificar DTOs ou adicionar novos endpoints.

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
