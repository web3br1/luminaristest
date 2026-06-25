---
name: frontend-api-service-generator
description: Gera frontend service em `my-app/lib/services/<resource>.service.ts` que envolve `apiClient` com métodos estáticos tipados (getAll/getById/create/update/delete) espelhando os endpoints do backend e desempacotando o envelope `{ success, data }`. Use ao criar o client frontend de um endpoint novo, ao sincronizar tipos após mudança de DTO, ou ao adicionar método a um service existente. Termos de gatilho: "frontend service", "lib/services", "apiClient wrapper", "client tipado", "espelhar endpoint". Domínio/arquivos: `my-app/lib/services/`.
argument-hint: "[nome-do-recurso]"
allowed-tools: Read, Grep, Glob, Write, Edit
compatibility: Claude Code; requer o monorepo Luminaris (`my-app/` com TypeScript + tsc e `lib/api/api-client.ts`). Sem efeitos externos — apenas gera/edita arquivos no repositório.
metadata:
  governance-skill-id: "SKL-FE-API-SERVICE"
  governance-version: "1.0.0"
  governance-status: "validated"
  governance-owner: "engineering"
  governance-last-evaluated: "2026-06-25"
  governance-eval-score: "1.00"
---

# Frontend API Service Generator

## Purpose

Gera `my-app/lib/services/<resource>.service.ts` como wrapper tipado em torno de `apiClient`, espelhando os endpoints do backend para o recurso. É o contrato entre frontend e backend para um domínio.

## Contrato obrigatório

Antes de gerar, leia `.claude/skills/_ARCHITECTURE-CONTRACT.md` — as regras cross-cutting (reuse de canônicos, service layer, paginação DynamicTable, modal-não-rota, `useMemo`, no-`any`, container full-height, design system) são **gate** e não se repetem aqui. Esta skill adiciona apenas o checklist específico de **Frontend Service**.

## Checklist obrigatório — Frontend Service

Cada item abaixo é uma REGRA DE GERAÇÃO (o `luminaris-reviewer` cobra exatamente isto na camada de service frontend). Gere já em conformidade — não deixe para o revisor pegar.

- [ ] **[FEAPI-001]** Toda chamada HTTP passa por `apiClient` importado de `../api/api-client` — **nunca** `fetch` direto nem leitura de `process.env.NEXT_PUBLIC_API_BASE_URL` para montar URL (o `apiClient` já resolve a base com fallback).
- [ ] **[FEAPI-002]** `export class <Resource>Service` com métodos `static async` tipados (parâmetros e retorno) que espelham os endpoints do backend — `getAll`/`getById`/`create`/`update`/`delete`.
- [ ] **[FEAPI-003]** Os métodos desempacotam/expõem o envelope `{ success, data }` retornado pelo backend (tipo de retorno `Promise<{ success: boolean; data: ... }>`), incluindo `pagination` nas listagens.
- [ ] **[FEAPI-004]** Tipos definidos **localmente** no service (`type <Resource>`, `type Create<Resource>Dto`, `type Update<Resource>Dto`) — **nunca** importados de `server/` / `@server`. Espelhe o `Response` DTO campo a campo, mesmo nome, sem sub-especificar.
- [ ] **[FEAPI-005]** **ZERO `any`** — todo parâmetro e retorno tipado; campo faltante força `as any` no consumidor e é sintoma de tipo divergente.
- [ ] **[FEAPI-006]** Cada path bate **exatamente** com a rota registrada no backend (`/api/<x>/...` montado em `routes/index.ts`); divergência é 404 silencioso que o `tsc` não pega.

## When to use

- Novo endpoint backend precisa de client frontend
- Sincronizando tipos após mudança de DTO
- Adicionando método a service existente

## Inputs

- `$ARGUMENTS[0]`: nome do recurso em kebab-case (ex: `appointments`)

## Repository patterns to inspect first

```
my-app/lib/services/dynamic-table.service.ts
my-app/lib/services/user.service.ts
my-app/lib/services/analytics.service.ts
my-app/lib/api/api-client.ts
```

## ⭐ Exemplo de referência canônico (espelhe este arquivo)

`my-app/lib/services/dynamic-table.service.ts` — service limpo: importa só `apiClient` (+ `notify` para sucesso), tipa cada método com interfaces locais mínimas (`TableMeta`/`TableDataResponse`, zero `any`), paths batem exatamente com as rotas backend e o sucesso é notificado opcionalmente via `options.successMessage`. Para um service de CRUD paginado com `{ data, pagination }`, veja também `my-app/lib/services/user.service.ts`. Leia ANTES de gerar.

## Generation contract

1. Arquivo: `my-app/lib/services/<resource>.service.ts`
2. **[FEAPI-001]** Importar: `import { apiClient } from '../api/api-client'`
3. **[FEAPI-004]** Tipos locais: definir `type <Resource>`, `type Create<Resource>Dto`, `type Update<Resource>Dto`. Decoupling sem drift — não importe tipos do backend, mas espelhe-os fielmente:
   - **(a) Mesmo nome do backend**: quando o tipo local representa a mesma entidade que um tipo de retorno do backend, use o **nome idêntico** ao do DTO/tipo de resposta (ex.: `ChartDataPoint`, não `ChartPoint`; `Lead`, não `LeadItem`). Confira o nome real no DTO antes de definir.
   - **(b) Todos os campos retornados**: inclua **todos** os campos que a API realmente retorna e que o frontend acessa — inclusive os de sistema (`id`, `createdAt`, `updatedAt` e quaisquer timestamps/relacionamentos). Sub-especificar força `as any` nos consumidores. Espelhe o `Response` DTO do backend campo a campo.
4. **[FEAPI-002]** Classe: `export class <Resource>Service` com métodos `static async`
5. **[FEAPI-002]/[FEAPI-003]** Métodos espelham o backend e expõem o envelope `{ success, data }`:
   ```ts
   static async getAll(params?: { page?: number; limit?: number }): Promise<{ success: boolean; data: Resource[]; pagination?: Pagination }>
   static async getById(id: string): Promise<{ success: boolean; data: Resource }>
   static async create(data: CreateResourceDto): Promise<{ success: boolean; data: Resource }>
   static async update(id: string, data: UpdateResourceDto): Promise<{ success: boolean; data: Resource }>
   static async delete(id: string): Promise<{ success: boolean }>
   ```
6. **[FEAPI-006] Paths batem com as rotas do backend:** cada chamada usa `apiClient.get/post/put/patch/delete('/api/<x>/...')` no path **exato** registrado em `server/src/routes/<resource>.ts` + montado em `routes/index.ts` (`app.use('/api/<x>', ...)`). Confira o path real no backend antes — divergência (ex.: `/api/lead` vs `/api/leads`) é 404 silencioso que o `tsc` NÃO pega.
7. `apiClient` já chama `notify()` em erros — o service só precisa fazer re-throw se necessário

## Files usually created or changed

```
my-app/lib/services/<resource>.service.ts    ← NEW
```

## Required checks

```bash
cd my-app && npx tsc --noEmit
```

## Anti-patterns

- **[FEAPI-001]** Não use `fetch` diretamente — sempre via `apiClient`. **Nunca leia `process.env.NEXT_PUBLIC_API_BASE_URL` direto** para montar a URL: o `apiClient` já resolve a base com fallback (`|| 'http://localhost:3001/api'`); código que lê a env direto quebra quando ela não está setada (foi exatamente o bug pré-existente do `AuthContext`, que travava o login com a env ausente).
- Não chame `notify()` no service se for só repassar erro — `apiClient` já notifica em erros. (Chamar `notify` para mensagem de **sucesso** é aceitável, como em `dynamic-table.service.ts`/`crm.service.ts`.)
- **[FEAPI-005]** Não omita tipos nem use `any` — sempre tipar os parâmetros e retorno
- **[FEAPI-004]** **Não importe tipos do backend** (`server/`, `@server`) — defina-os localmente no service. **Não cause drift de nome**: o tipo local deve ter o **mesmo nome** do tipo de retorno do backend para a mesma entidade (ex.: `ChartDataPoint`, não `ChartPoint`)
- **[FEAPI-004]** **Não sub-especifique o tipo de retorno**: incluir todos os campos que a API retorna e o frontend lê (incl. `id`/`createdAt`/`updatedAt`). Campo faltante força `as any` no consumidor — sintoma de que o tipo local divergiu do `Response` DTO
- **[FEAPI-003]** Não esqueça a paginação nas respostas de listagem: `{ data: T[]; pagination: { page, limit, totalCount, totalPages } }`
- Para consumir tabelas dinâmicas, reuse `DynamicTableService` (frontend) e resolva a tabela por `internalName` (`tables.find(t => t.internalName === 'leads')`) — não hardcode IDs de tabela
- `GET /dynamic-tables/:id/data` retorna **só 50 linhas por padrão** (cap 200). Para alimentar KPIs/listas/boards, **pagine** (fetch-all até `totalPages`, `limit=200`) — não confie no default. Ref: `features/crm/lib/crmFetch.ts`
- **[FEAPI-006]** **Não chute o path da rota** — bata exatamente com o backend (`/api/<x>` montado em `routes/index.ts`). Path errado = 404 que o `tsc` não acusa.
