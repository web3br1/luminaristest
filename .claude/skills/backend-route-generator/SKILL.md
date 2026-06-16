---
name: backend-route-generator
description: Gera arquivo de rota Express + registro em index.ts + bloco OpenAPI para um novo recurso backend
argument-hint: "[nome-do-recurso]"
allowed-tools: Read, Grep, Glob, Write, Edit
---

# Backend Route Generator

## Purpose

Gera `server/src/routes/<resource>.ts` seguindo o padrão Express Router do Luminaris.
Registra a rota em `server/src/routes/index.ts` e adiciona bloco OpenAPI em `server/src/routes/docs.paths.ts`.

## Contrato obrigatório

Antes de gerar, leia `.claude/skills/_ARCHITECTURE-CONTRACT.md` — as regras cross-cutting (camadas, DI, soft-delete, policy-first, erros tipados, no-`any`, registro de rota, money, testes) são **gate** e não se repetem aqui. Esta skill adiciona apenas o checklist específico da camada **Route**.

## Checklist obrigatório — Route

Cada item abaixo é uma REGRA DE GERAÇÃO (o `luminaris-reviewer` cobra exatamente isto na camada Route). Gere já em conformidade.

- [ ] **Registro = 3 toques** (não 2). Faltar qualquer um quebra a rota:
  1. **`server/src/routes/index.ts`** — `import <resource>Router from './<resource>'` + `router.use('/<resource>', <resource>Router)`.
  2. **`server/src/middleware/auth.ts` → array `protectedApiPaths`** — adicionar `'/api/<resource>'`. ⚠️ **DESTAQUE:** sem isso `getUserContextFromRequest` retorna `null` e a rota dá **401 com token válido** — bug silencioso que o `tsc` NÃO pega (só runtime). Pular APENAS para rota 100% pública.
  3. **`server/src/routes/docs.paths.ts`** — bloco `@openapi paths: /<resource>:` com GET/POST/PUT/DELETE para CADA endpoint, na seção `paths:` ANTES de `* components:`. O component schema do DTO NÃO substitui o bloco de path. Valide: `grep -c "/api/<resource>" server/src/routes/docs.paths.ts` deve ser `> 0`.
- [ ] **`export default router`**.
- [ ] **Zero lógica no arquivo de rota** — só `router.get/post/put/delete('/path', handler)` com handlers nomeados importados do controller. Sem auth inline, sem validação, sem try/catch.
- [ ] Controller importado por funções nomeadas existentes (verifique que o controller existe antes de importar).

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
server/src/middleware/auth.ts        ← array protectedApiPaths (allowlist de auth)
```

## ⭐ Exemplo de referência canônico (espelhe estes arquivos — o 3-toques completo)

O recurso `users` é o conjunto de referência perfeito do registro 3-toques (verificado: a rota está wired nos quatro arquivos):

- `server/src/routes/users.ts` — arquivo de rota perfeito: só `router.<verbo>('/path', handlerNomeado)` com handlers importados do controller, ZERO lógica/auth/try-catch, `export default router`.
- `server/src/routes/index.ts` — toque 1: `import userRoutes from './users'` + `router.use('/users', userRoutes)`.
- `server/src/middleware/auth.ts` — toque 2: `'/api/users'` no array `protectedApiPaths` (sem isso → 401 com token válido).
- `server/src/routes/docs.paths.ts` — toque 3: bloco `@openapi paths:` para os endpoints `/users` na seção `paths:` ANTES de `* components:`.

Leia os quatro ANTES de gerar e replique exatamente os 3 toques (o arquivo de rota + os 3 registros).

## Generation contract

1. Arquivo: `server/src/routes/<resource>.ts`
2. Importa `Router` de `express`
3. Importa funções nomeadas do controller (`../controllers/<Resource>Controller`)
4. `const router = Router()`
5. Registra: `router.get('/', listX)`, `router.get('/:id', getXById)`, `router.post('/', createX)`, `router.put('/:id', updateX)`, `router.delete('/:id', deleteX)`
6. `export default router`
7. Em `routes/index.ts`: `import <resource>Router from './<resource>'` + `router.use('/<resource>', <resource>Router)`
8. **Em `middleware/auth.ts`: adicionar `'/api/<resource>'` ao array `protectedApiPaths`** — **PASSO OBRIGATÓRIO.** O middleware de auth só popula o user context (`getUserContextFromRequest`) para prefixos nessa allowlist. Sem isso, a rota retorna **401 mesmo com token válido** (o controller recebe `user = null`). Erro silencioso que o `tsc` NÃO pega — só aparece em runtime.
9. **Em `docs.paths.ts`: adicionar bloco de PATH `@openapi paths: /<resource>:` com GET/POST/PUT/DELETE para CADA endpoint** — **PASSO OBRIGATÓRIO.** O bloco vai DENTRO do grande comentário `@openapi` de `docs.paths.ts`, na seção `paths:`, **ANTES da linha `* components:`**. NÃO basta o `@openapi` de component schema declarado no DTO — component schema só define os *tipos* (request/response body); o bloco de path é o que registra o *endpoint* (método + URL) na documentação. Faltar o bloco de path é um **bug silencioso**: o `tsc` passa verde (é só um comentário JSDoc `@openapi`, não código tipado) mas a doc OpenAPI fica incompleta — o endpoint simplesmente não aparece. (Verificado no build do módulo CRM: os 4 endpoints tinham component schemas nos DTOs mas os blocos de path foram esquecidos.)

## Registro = 3 toques (não 2)

```
1. routes/<resource>.ts           ← cria o router
2. routes/index.ts                ← router.use('/<resource>', ...)
3. middleware/auth.ts             ← '/api/<resource>' em protectedApiPaths  ← FÁCIL DE ESQUECER
```

A exceção é rota 100% pública (sem auth) — aí NÃO adicione ao allowlist.

## Files usually created or changed

```
server/src/routes/<resource>.ts          ← NEW
server/src/routes/index.ts               ← EDIT (add import + router.use)
server/src/middleware/auth.ts            ← EDIT (add '/api/<resource>' to protectedApiPaths)
server/src/routes/docs.paths.ts          ← EDIT (add OpenAPI PATH block p/ cada endpoint, na seção paths: antes de * components:)
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

- **Não esqueça de adicionar `/api/<resource>` ao `protectedApiPaths` em `middleware/auth.ts`** — o middleware NÃO autentica automaticamente rotas novas; sem o registro, `getUserContextFromRequest(req)` retorna `null` e a rota dá 401 com qualquer token. (Verificado em runtime no build do módulo CRM — `tsc` passou verde mas a rota dava 401.)
- Não adicione lógica de autenticação dentro da rota — quem autentica é o middleware; seu papel é só registrar o prefixo na allowlist
- Não use `express.Router` com `{ mergeParams: true }` a menos que necessário
- Não crie rotas sem registrar em `routes/index.ts` E `middleware/auth.ts`
- Não invente nomes de controller — verifique se o controller existe antes de importar
- **Não confie só no component schema do DTO para documentar o endpoint** — component schema (no DTO) define os *tipos*; o bloco de PATH em `docs.paths.ts` registra o *endpoint*. Sem o bloco de path, o endpoint NÃO aparece na doc OpenAPI. Bug silencioso: `tsc` verde, doc incompleta. Valide com `grep -c "/api/<recurso>" server/src/routes/docs.paths.ts` (deve ser > 0). (Verificado no build do CRM: os 4 endpoints tinham schema mas faltava o path.)

## Output format

1. Arquivo de rota criado com os verbos HTTP corretos
2. `routes/index.ts` atualizado com import e `router.use`
3. `docs.paths.ts` atualizado com bloco OpenAPI
