---
name: backend-route-generator
description: Gera arquivo de rota Express (express.Router com handlers nomeados do controller) + o registro 2-toques (routes/index.ts, docs.paths.ts bloco @openapi) para um novo recurso backend. Auth é deny-by-default — a rota nasce protegida e o gerador não edita middleware/auth.ts. Use ao expor um novo endpoint REST, ao adicionar sub-rotas a um recurso existente, ou ao sincronizar a doc OpenAPI com uma rota nova. Termos-gatilho: rota, router, endpoint, REST, registrar rota, rota pública, @openapi path. Domínio/arquivos: server/src/routes/.
argument-hint: "[nome-do-recurso]"
allowed-tools: Read, Grep, Glob, Write, Edit
compatibility: Claude Code; requer o monorepo Luminaris (server/ com express + tsc). Sem efeitos externos — apenas gera/edita arquivos no repositório.
metadata:
  governance-skill-id: "SKL-BACKEND-ROUTE"
  governance-version: "1.1.0"
  governance-status: "validated"
  governance-owner: "engineering"
  governance-last-evaluated: "2026-07-16"
  governance-eval-score: "1.00"
---

# Backend Route Generator

## Purpose

Gera `server/src/routes/<resource>.ts` seguindo o padrão Express Router do Luminaris.
Registra a rota em `server/src/routes/index.ts` e adiciona bloco OpenAPI em `server/src/routes/docs.paths.ts`.
A rota nasce autenticada — `middleware/auth.ts` é deny-by-default e não faz parte do registro.

## Contrato obrigatório

Antes de gerar, leia `.claude/skills/_ARCHITECTURE-CONTRACT.md` — as regras cross-cutting (camadas, DI, soft-delete, policy-first, erros tipados, no-`any`, registro de rota, money, testes) são **gate** e não se repetem aqui. Esta skill adiciona apenas o checklist específico da camada **Route**.

## Checklist obrigatório — Route

Cada item abaixo é uma REGRA DE GERAÇÃO (o `luminaris-reviewer` cobra exatamente isto na camada Route). Gere já em conformidade.

- [ ] **Registro = 2 toques.** Faltar qualquer um quebra a rota:
  1. **[ROUTE-001]** **`server/src/routes/index.ts`** — `import <resource>Router from './<resource>'` + `router.use('/<resource>', <resource>Router)`.
  2. **[ROUTE-003]** **`server/src/routes/docs.paths.ts`** — bloco `@openapi paths: /<resource>:` com GET/POST/PUT/DELETE para CADA endpoint, na seção `paths:` ANTES de `* components:`. O component schema do DTO NÃO substitui o bloco de path. Valide: `grep -c "/api/<resource>" server/src/routes/docs.paths.ts` deve ser `> 0`.
- [ ] **[ROUTE-002] Não editar `server/src/middleware/auth.ts`.** Auth é **deny-by-default**: tudo sob `/api` exige JWT no instante em que a rota é montada, e o user context vem populado sozinho. Não existe allowlist de rotas protegidas — instruções antigas mandando adicionar `'/api/<resource>'` a um array de prefixos são anteriores ao `RISK-SEC-AUTH-001` e estão obsoletas. **Rota pública** é a exceção: exige regra em `publicApiRoutes` + justificativa (decisão de segurança, não scaffolding). Fonte única: [GENERATION_CONTRACTS.md](../../../docs/claude-skills/GENERATION_CONTRACTS.md) § Backend Route Contract.
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
```

## ⭐ Exemplo de referência canônico (espelhe estes arquivos — o 2-toques completo)

O recurso `users` é o conjunto de referência do registro 2-toques (verificado: a rota está wired nos três arquivos):

- `server/src/routes/users.ts` — arquivo de rota perfeito: só `router.<verbo>('/path', handlerNomeado)` com handlers importados do controller, ZERO lógica/auth/try-catch, `export default router`.
- `server/src/routes/index.ts` — toque 1: `import userRoutes from './users'` + `router.use('/users', userRoutes)`.
- `server/src/routes/docs.paths.ts` — toque 2: bloco `@openapi paths:` para os endpoints `/users` na seção `paths:` ANTES de `* components:`.

Leia os três ANTES de gerar e replique exatamente os 2 toques (o arquivo de rota + os 2 registros).

> `users` é atípico num ponto: `POST /api/users` é **público** (registro de usuário), então tem regra em
> `publicApiRoutes`. Isso é exceção do recurso, não parte do padrão — não copie esse detalhe.

## Generation contract

1. Arquivo: `server/src/routes/<resource>.ts`
2. Importa `Router` de `express`
3. Importa funções nomeadas do controller (`../controllers/<Resource>Controller`)
4. `const router = Router()`
5. Registra: `router.get('/', listX)`, `router.get('/:id', getXById)`, `router.post('/', createX)`, `router.put('/:id', updateX)`, `router.delete('/:id', deleteX)`
6. `export default router`
7. Em `routes/index.ts`: `import <resource>Router from './<resource>'` + `router.use('/<resource>', <resource>Router)`
8. **Em `docs.paths.ts`: adicionar bloco de PATH `@openapi paths: /<resource>:` com GET/POST/PUT/DELETE para CADA endpoint** — **PASSO OBRIGATÓRIO.** O bloco vai DENTRO do grande comentário `@openapi` de `docs.paths.ts`, na seção `paths:`, **ANTES da linha `* components:`**. NÃO basta o `@openapi` de component schema declarado no DTO — component schema só define os *tipos* (request/response body); o bloco de path é o que registra o *endpoint* (método + URL) na documentação. Faltar o bloco de path é um **bug silencioso**: o `tsc` passa verde (é só um comentário JSDoc `@openapi`, não código tipado) mas a doc OpenAPI fica incompleta — o endpoint simplesmente não aparece. (Verificado no build do módulo CRM: os 4 endpoints tinham component schemas nos DTOs mas os blocos de path foram esquecidos.)

## Registro = 2 toques

```
   routes/<resource>.ts           ← o artefato (não é toque — é a rota em si)
1. routes/index.ts                ← toque 1: router.use('/<resource>', ...)
2. routes/docs.paths.ts           ← toque 2: bloco @openapi de PATH  ← FÁCIL DE ESQUECER (tsc-cego)
```

> Conte só os **registros**, nunca o arquivo de rota. A contagem ambígua ("3 toques" listando 3 itens
> dos quais um era o próprio artefato) foi o que gerou a divergência histórica 3-toques × 4-toques
> entre as skills e o `REPORT.md`.

**[ROUTE-002] Auth não é toque de registro — a rota nasce protegida.** `middleware/auth.ts` é
deny-by-default: tudo sob `/api` exige JWT a partir do momento em que a rota é montada, e o user
context vem populado sozinho. **Não** existe allowlist de rotas protegidas para atualizar; não edite
`middleware/auth.ts` ao gerar uma rota. Rota **pública** é a exceção, é decisão de segurança (não
scaffolding) e exige regra explícita em `publicApiRoutes` — contrato completo em
[GENERATION_CONTRACTS.md](../../../docs/claude-skills/GENERATION_CONTRACTS.md) § Backend Route
Contract, que é a fonte única desta regra.

## Files usually created or changed

```
server/src/routes/<resource>.ts          ← NEW
server/src/routes/index.ts               ← EDIT (add import + router.use)
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

- **Não edite `middleware/auth.ts` para "proteger" a rota** — ela já nasce protegida (deny-by-default). Um array `protectedApiPaths` não existe mais; instruções antigas que mandam adicionar o prefixo lá estão obsoletas. Tocar nesse arquivo só se a rota for **pública**, e aí a regra vai em `publicApiRoutes`.
- Não adicione lógica de autenticação dentro da rota — quem autentica é o middleware
- Não use `express.Router` com `{ mergeParams: true }` a menos que necessário
- Não crie rotas sem registrar em `routes/index.ts` E `routes/docs.paths.ts`
- Não invente nomes de controller — verifique se o controller existe antes de importar
- **Não confie só no component schema do DTO para documentar o endpoint** — component schema (no DTO) define os *tipos*; o bloco de PATH em `docs.paths.ts` registra o *endpoint*. Sem o bloco de path, o endpoint NÃO aparece na doc OpenAPI. Bug silencioso: `tsc` verde, doc incompleta. Valide com `grep -c "/api/<recurso>" server/src/routes/docs.paths.ts` (deve ser > 0). (Verificado no build do CRM: os 4 endpoints tinham schema mas faltava o path.)

## Output format

1. Arquivo de rota criado com os verbos HTTP corretos
2. `routes/index.ts` atualizado com import e `router.use`
3. `docs.paths.ts` atualizado com bloco OpenAPI
