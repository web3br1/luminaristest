---
name: frontend-api-service-generator
description: Gera frontend service em lib/services/ que envolve apiClient com métodos tipados espelhando endpoints do backend
argument-hint: "[nome-do-recurso]"
allowed-tools: Read, Grep, Glob, Write, Edit
---

# Frontend API Service Generator

## Purpose

Gera `my-app/lib/services/<resource>.service.ts` como wrapper tipado em torno de `apiClient`, espelhando os endpoints do backend para o recurso. É o contrato entre frontend e backend para um domínio.

## When to use

- Novo endpoint backend precisa de client frontend
- Sincronizando tipos após mudança de DTO
- Adicionando método a service existente

## Inputs

- `$ARGUMENTS[0]`: nome do recurso em kebab-case (ex: `appointments`)

## Repository patterns to inspect first

```
my-app/lib/services/dynamic-table.service.ts
my-app/lib/services/analytics.service.ts
my-app/lib/api/api-client.ts
```

## Generation contract

1. Arquivo: `my-app/lib/services/<resource>.service.ts`
2. Importar: `import { apiClient } from '../api/api-client'`
3. Tipos locais: definir `type <Resource>`, `type Create<Resource>Dto`, `type Update<Resource>Dto`. Decoupling sem drift — não importe tipos do backend, mas espelhe-os fielmente:
   - **(a) Mesmo nome do backend**: quando o tipo local representa a mesma entidade que um tipo de retorno do backend, use o **nome idêntico** ao do DTO/tipo de resposta (ex.: `ChartDataPoint`, não `ChartPoint`; `Lead`, não `LeadItem`). Confira o nome real no DTO antes de definir.
   - **(b) Todos os campos retornados**: inclua **todos** os campos que a API realmente retorna e que o frontend acessa — inclusive os de sistema (`id`, `createdAt`, `updatedAt` e quaisquer timestamps/relacionamentos). Sub-especificar força `as any` nos consumidores. Espelhe o `Response` DTO do backend campo a campo.
4. Classe: `export class <Resource>Service`
5. Métodos espelham o backend:
   ```ts
   static async getAll(params?: { page?: number; limit?: number }): Promise<{ success: boolean; data: Resource[]; pagination?: Pagination }>
   static async getById(id: string): Promise<{ success: boolean; data: Resource }>
   static async create(data: CreateResourceDto): Promise<{ success: boolean; data: Resource }>
   static async update(id: string, data: UpdateResourceDto): Promise<{ success: boolean; data: Resource }>
   static async delete(id: string): Promise<{ success: boolean }>
   ```
6. `apiClient` já chama `notify()` em erros — o service só precisa fazer re-throw se necessário

## Files usually created or changed

```
my-app/lib/services/<resource>.service.ts    ← NEW
```

## Required checks

```bash
cd my-app && npx tsc --noEmit
```

## Anti-patterns

- Não use `fetch` diretamente — sempre via `apiClient`. **Nunca leia `process.env.NEXT_PUBLIC_API_BASE_URL` direto** para montar a URL: o `apiClient` já resolve a base com fallback (`|| 'http://localhost:3001/api'`); código que lê a env direto quebra quando ela não está setada (foi exatamente o bug pré-existente do `AuthContext`, que travava o login com a env ausente).
- Não chame `notify()` no service se for só repassar erro — `apiClient` já notifica em erros. (Chamar `notify` para mensagem de **sucesso** é aceitável, como em `dynamic-table.service.ts`/`crm.service.ts`.)
- Não omita tipos — sempre tipar os parâmetros e retorno
- **Não cause drift de nome**: o tipo local deve ter o **mesmo nome** do tipo de retorno do backend para a mesma entidade (ex.: `ChartDataPoint`, não `ChartPoint`)
- **Não sub-especifique o tipo de retorno**: incluir todos os campos que a API retorna e o frontend lê (incl. `id`/`createdAt`/`updatedAt`). Campo faltante força `as any` no consumidor — sintoma de que o tipo local divergiu do `Response` DTO
- Não esqueça a paginação nas respostas de listagem: `{ data: T[]; pagination: { page, limit, totalCount, totalPages } }`
- Para consumir tabelas dinâmicas, reuse `DynamicTableService` (frontend) e resolva a tabela por `internalName` (`tables.find(t => t.internalName === 'leads')`) — não hardcode IDs de tabela
- `GET /dynamic-tables/:id/data` retorna **só 50 linhas por padrão** (cap 200). Para alimentar KPIs/listas/boards, **pagine** (fetch-all até `totalPages`, `limit=200`) — não confie no default. Ref: `features/crm/lib/crmFetch.ts`
