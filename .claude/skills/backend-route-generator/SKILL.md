---
name: backend-route-generator
description: Gera arquivo de rota Express (express.Router com handlers nomeados do controller) + o registro 2-toques (routes/index.ts, docs.paths.ts bloco @openapi) para um novo recurso backend. Auth é deny-by-default — rota sob /api/* já nasce protegida; rota pública é exceção explícita em publicApiRoutes no middleware. Use ao expor um novo endpoint REST, ao adicionar sub-rotas a um recurso existente, ou ao sincronizar a doc OpenAPI com uma rota nova. Termos-gatilho: rota, router, endpoint, REST, registrar rota, rota pública, publicApiRoutes, @openapi path. Domínio/arquivos: server/src/routes/ (e server/src/middleware/auth.ts só para exceção pública).
argument-hint: "[nome-do-recurso]"
allowed-tools: Read, Grep, Glob, Write, Edit
compatibility: Claude Code; requer o monorepo Luminaris (server/ com express + tsc). Sem efeitos externos — apenas gera/edita arquivos no repositório.
metadata:
  governance-skill-id: "SKL-BACKEND-ROUTE"
  governance-version: "1.1.0"
  governance-status: "validated"
  governance-owner: "engineering"
  governance-last-evaluated: "2026-06-25"
  governance-eval-score: "1.00"
---

# Backend Route Generator

## Purpose

Gera `server/src/routes/<resource>.ts` seguindo o padrão Express Router do Luminaris.
Registra a rota em `server/src/routes/index.ts` e adiciona bloco OpenAPI em `server/src/routes/docs.paths.ts`.

## Contrato obrigatório

Antes de gerar, leia `.claude/skills/_ARCHITECTURE-CONTRACT.md` — as regras cross-cutting (camadas, DI, soft-delete, policy-first, erros tipados, no-`any`, registro de rota, money, testes) são **gate** e não se repetem aqui. Esta skill adiciona apenas o checklist específico da camada **Route**.

## Checklist obrigatório — Route

Cada item abaixo é uma REGRA DE GERAÇÃO (o `luminaris-reviewer` cobra exatamente isto na camada Route). Gere já em conformidade.

- [ ] **Registro = 2 toques.** Faltar qualquer um quebra a rota:
  1. **[ROUTE-001]** **`server/src/routes/index.ts`** — `import <resource>Router from './<resource>'` + `router.use('/<resource>', <resource>Router)`.
  2. **[ROUTE-003]** **`server/src/routes/docs.paths.ts`** — bloco `@openapi paths: /<resource>:` com GET/POST/PUT/DELETE para CADA endpoint, na seção `paths:` ANTES de `* components:`. O component schema do DTO NÃO substitui o bloco de path. Valide: `grep -c "/api/<resource>" server/src/routes/docs.paths.ts` deve ser `> 0`.
- [ ] **[ROUTE-002]** **Auth é deny-by-default — NÃO edite `middleware/auth.ts` para proteger a rota.** Toda rota sob `/api/*` já nasce exigindo JWT válido (o array `protectedApiPaths` não existe mais; esquecer registro falha **fechado** em 401, nunca aberto). Rota **pública** é a única exceção: adicionar regra `{ path, method, match: 'exact' | 'prefix' }` ao array `publicApiRoutes` no próprio `server/src/middleware/auth.ts`. O matching espelha o Express (case-insensitive, whole-segment, SEM percent-decode, HEAD→GET) — não invente matcher próprio.
- [ ] **[ROUTE-004]** **`export default router`** — o arquivo de rota cria `const router = Router()` (de `express`) e exporta como default; `routes/index.ts` importa exatamente esse default.
- [ ] **[ROUTE-005]** **Zero lógica no arquivo de rota** — só `router.get/post/put/delete('/path', handler)` com handlers nomeados importados do controller. Sem auth inline, sem validação, sem try/catch.
- [ ] **[ROUTE-006]** Controller importado por funções nomeadas existentes (verifique que o controller existe antes de importar).

## When to use

- Novo endpoint REST precisa ser exposto
- Adicionando sub-rotas a um recurso existente
- Sincronizando documentação OpenAPI com uma rota nova

## Inputs

- `$ARGUMENTS[0]`: nome do recurso em kebab-case (ex: `appointments`)

## Repository patterns to inspect first

```
server/src/routes/users.ts
server/src/routes/index.ts
server/src/routes/docs.paths.ts
server/src/middleware/auth.ts        ← deny-by-default; array publicApiRoutes (exceções públicas)
```

## ⭐ Exemplo de referência canônico (espelhe estes arquivos — o 2-toques completo)

O recurso `users` é o conjunto de referência do registro 2-toques:

- `server/src/routes/users.ts` — arquivo de rota perfeito: só `router.<verbo>('/path', handlerNomeado)` com handlers importados do controller, ZERO lógica/auth/try-catch, `export default router`.
- `server/src/routes/index.ts` — toque 1: `import userRoutes from './users'` + `router.use('/users', userRoutes)`.
- `server/src/routes/docs.paths.ts` — toque 2: bloco `@openapi paths:` para os endpoints `/users` na seção `paths:` ANTES de `* components:`.
- `server/src/middleware/auth.ts` — nenhuma edição para rota protegida (deny-by-default cobre); a exceção pública de `users` (`POST /api/users` = registro público) vive como regra em `publicApiRoutes`.

Leia os três primeiros ANTES de gerar e replique exatamente os 2 toques (o arquivo de rota + os 2 registros).

## Generation contract

1. Arquivo: `server/src/routes/<resource>.ts`
2. Importa `Router` de `express`
3. Importa funções nomeadas do controller (`../controllers/<Resource>Controller`)
4. `const router = Router()`
5. Registra: `router.get('/', listX)`, `router.get('/:id', getXById)`, `router.post('/', createX)`, `router.put('/:id', updateX)`, `router.delete('/:id', deleteX)`
6. `export default router`
7. Em `routes/index.ts`: `import <resource>Router from './<resource>'` + `router.use('/<resource>', <resource>Router)`
8. **`middleware/auth.ts`: NÃO editar para rota protegida.** O middleware é deny-by-default — qualquer `/api/*` exige JWT válido sem registro nenhum. Só toque em `auth.ts` se a rota precisa ser **pública**: adicione `{ path: '/api/<resource>/<sub>', method: '<VERBO>', match: 'exact' | 'prefix' }` ao array `publicApiRoutes` (esquecer = 401 fail-closed, visível no primeiro request).
9. **Em `docs.paths.ts`: adicionar bloco de PATH `@openapi paths: /<resource>:` com GET/POST/PUT/DELETE para CADA endpoint** — **PASSO OBRIGATÓRIO.** O bloco vai DENTRO do grande comentário `@openapi` de `docs.paths.ts`, na seção `paths:`, **ANTES da linha `* components:`**. NÃO basta o `@openapi` de component schema declarado no DTO — component schema só define os *tipos* (request/response body); o bloco de path é o que registra o *endpoint* (método + URL) na documentação. Faltar o bloco de path é um **bug silencioso**: o `tsc` passa verde (é só um comentário JSDoc `@openapi`, não código tipado) mas a doc OpenAPI fica incompleta — o endpoint simplesmente não aparece. (Verificado no build do módulo CRM: os 4 endpoints tinham component schemas nos DTOs mas os blocos de path foram esquecidos.)

## Registro = 2 toques (auth é deny-by-default)

```
1. routes/<resource>.ts           ← cria o router
2. routes/index.ts                ← router.use('/<resource>', ...)
   (+ docs.paths.ts               ← bloco @openapi — doc, não acesso)
```

Auth NÃO é um toque: o middleware nega por padrão qualquer `/api/*` sem JWT válido. A exceção é rota 100% pública — aí sim edite `middleware/auth.ts` e adicione a regra `{ path, method, match }` ao array `publicApiRoutes`.

## Files usually created or changed

```
server/src/routes/<resource>.ts          ← NEW
server/src/routes/index.ts               ← EDIT (add import + router.use)
server/src/routes/docs.paths.ts          ← EDIT (add OpenAPI PATH block p/ cada endpoint, na seção paths: antes de * components:)
server/src/middleware/auth.ts            ← SÓ se houver rota pública (regra em publicApiRoutes); rota protegida = zero edição
```

## Required checks

```bash
cd server && npx tsc --noEmit
```

Para CADA recurso novo, confirme que o bloco de PATH OpenAPI foi adicionado (o `tsc` NÃO pega isso — é só um comentário `@openapi`):

```bash
# deve retornar > 0; se der 0, o bloco de path em docs.paths.ts foi esquecido
grep -c "/api/<recurso>" server/src/routes/docs.paths.ts
```

## Anti-patterns

- **Não re-adicione um allowlist de proteção por rota** (`protectedApiPaths` foi removido — deny-by-default): editar `auth.ts` para "proteger" rota nova é regressão de modelo; a proteção já é o default. Só rota **pública** entra em `publicApiRoutes`.
- Não adicione lógica de autenticação dentro da rota — quem autentica é o middleware (deny-by-default)
- Não use `express.Router` com `{ mergeParams: true }` a menos que necessário
- Não crie rotas sem registrar em `routes/index.ts`
- Não invente nomes de controller — verifique se o controller existe antes de importar
- **Não confie só no component schema do DTO para documentar o endpoint** — component schema (no DTO) define os *tipos*; o bloco de PATH em `docs.paths.ts` registra o *endpoint*. Sem o bloco de path, o endpoint NÃO aparece na doc OpenAPI. Bug silencioso: `tsc` verde, doc incompleta. Valide com `grep -c "/api/<recurso>" server/src/routes/docs.paths.ts` (deve ser > 0). (Verificado no build do CRM: os 4 endpoints tinham schema mas faltava o path.)

## Output format

1. Arquivo de rota criado com os verbos HTTP corretos
2. `routes/index.ts` atualizado com import e `router.use`
3. `docs.paths.ts` atualizado com bloco OpenAPI
