---
name: backend-dto-generator
description: Gera DTOs com Zod schemas (Create, Update, Response), tipos inferidos e type guards isXxxDto com comentários OpenAPI
argument-hint: "[NomeDoRecurso]"
allowed-tools: Read, Grep, Glob, Write, Edit
---

# Backend DTO Generator

## Purpose

Gera `server/src/features/<resource>/dtos/<Resource>Dto.ts` com schemas Zod anotados com OpenAPI, tipos TypeScript inferidos e type guards, além do domain model em `models/<Resource>.model.ts`.

## Contrato obrigatório

Antes de gerar, leia `.claude/skills/_ARCHITECTURE-CONTRACT.md` — as regras cross-cutting (camadas, DI, soft-delete, policy-first, erros tipados, no-`any`, registro de rota, money, testes) são **gate** e não se repetem aqui. Esta skill adiciona apenas o checklist específico da camada **DTO**.

## Checklist obrigatório — DTO

Cada item abaixo é uma REGRA DE GERAÇÃO (o `luminaris-reviewer` cobra exatamente isto na camada DTO). Gere já em conformidade — não deixe para o revisor pegar.

### Arquivo `<Resource>Dto.ts`

- [ ] Comentário `@openapi` JSDoc acima do schema principal (`<Resource>Schema`) — `docs.paths.ts` depende dele para os tipos de request/response.
- [ ] `Create<Resource>Schema` com `z.object({...})`.
- [ ] `Update<Resource>Schema` derivado via `.partial()` (NÃO redefinir o objeto à mão — `Create<Resource>Schema.partial()`).
- [ ] Type exportado via `z.infer`: `export type <Resource>Dto = z.infer<typeof <Resource>Schema>` (idem para Create/Update).
- [ ] Type guard `isCreate<Resource>Input(v: unknown): v is Create<Resource>Dto { return Create<Resource>Schema.safeParse(v).success }` (e `is<Resource>Dto` para o schema principal).
- [ ] **ZERO `z.any()`** — todo campo tipado. Para JSON dinâmico use `z.record(z.unknown())`, nunca `z.any()`.
- [ ] Campos de data usam `z.coerce.date()` (ou `z.string().datetime()` quando a fronteira é string ISO) — nunca `z.date()` cru sobre payload HTTP.
- [ ] Restrições de domínio: campos monetários/quantidade onde `0`/negativo é inválido usam `.positive()`/`.nonnegative()`.
- [ ] Obrigatoriedade condicional fica no schema (`.superRefine()` ou `z.discriminatedUnion()`), nunca em runtime no service.
- [ ] Nenhum campo sensível (password, tokens) no schema de resposta.

### Arquivo companion `models/<Resource>.model.ts`

- [ ] `export interface I<Resource>` com `id`, `userId`, campos do domínio, `createdAt: Date`, `updatedAt: Date`, `deletedAt?: Date`.
- [ ] Enums locais do domínio declarados aqui (não em `@prisma/client`).

## When to use

- Novo recurso precisa de validação de entrada
- Adicionando campo a um DTO existente
- Sincronizando validação com regras de negócio novas

## Inputs

- `$ARGUMENTS[0]`: nome do recurso em PascalCase (ex: `Appointment`)

## Repository patterns to inspect first

```
server/src/features/chatInstances/dtos/ChatInstanceDto.ts
server/src/features/chatInstances/models/ChatInstance.model.ts
server/src/features/users/dtos/UserDto.ts
server/src/features/users/models/User.model.ts
```

## ⭐ Exemplo de referência canônico (espelhe este arquivo)

`server/src/features/chatInstances/dtos/ChatInstanceDto.ts` — DTO perfeito da camada: `@openapi` em cada schema, `Create`/`Update`/`Response`/`Summary`, **`UpdateChatInstanceSchema = CreateChatInstanceSchema.partial()`** (a derivação `.partial()` exata que esta skill exige, em vez de redefinir o objeto à mão), `z.infer` types, type guards `is<X>` com `safeParse` para todos, zero `z.any()`, companion model `IChatInstance` em `models/`. Leia-o ANTES de gerar e siga a mesma estrutura/ordem. (Nota: `UserDto.ts` também é referência válida, mas redefine o `UpdateUserSchema` campo-a-campo em vez de usar `.partial()` — NÃO copie esse ponto dele.)

## Generation contract

### Arquivo Dto

1. Arquivo: `server/src/features/<resource>/dtos/<Resource>Dto.ts`
2. Importar `z` de `zod`
3. Três schemas: `<Resource>Schema`, `Create<Resource>Schema`, `Update<Resource>Schema`
4. OpenAPI comment acima de cada schema:
   ```ts
   /**
    * @openapi
    * components:
    *   schemas:
    *     <Resource>:
    *       type: object
    *       required: [id, userId, ...]
    *       properties: { id: { type: string }, ... }
    */
   ```
5. Tipos inferidos: `export type <Resource>Dto = z.infer<typeof <Resource>Schema>`
6. Type guards: `export function is<Resource>Dto(obj: unknown): obj is <Resource>Dto { return <Resource>Schema.safeParse(obj).success }`
7. Mensagens de erro inline (ex: `'Name cannot exceed 100 characters'`)
8. Update schema: derive de `Create<Resource>Schema.partial()` (não redefina o objeto à mão — `.partial()` já torna todos os campos `.optional()`)
9. Restrições de domínio: campos monetários/quantidade onde `0` ou negativo é inválido usam `.positive()` (ou `.nonnegative()`); não deixe o `z.number()` padrão aceitar valores sem sentido de negócio (ex.: proposta com `amount: 0`).
10. Obrigatoriedade condicional (campo exigido depende do valor de outro campo): enforce no schema, nunca no service. Duas opções:
   - `.superRefine()` quando quiser manter o shape plano (não quebra consumidores que esperam o tipo achatado):
     ```ts
     export const RescheduleSchema = z
       .object({
         option: z.enum(['confirm', 'reschedule', 'cancel']),
         rescheduleAt: z.string().datetime().optional(),
       })
       .superRefine((data, ctx) => {
         if (data.option === 'reschedule' && !data.rescheduleAt) {
           ctx.addIssue({
             code: z.ZodIssueCode.custom,
             path: ['rescheduleAt'],
             message: 'rescheduleAt is required when option is "reschedule"',
           });
         }
       });
     ```
   - `z.discriminatedUnion('option', [...])` quando quiser narrowing real do tipo por variante (o consumidor passa a discriminar via `switch`/`if` sobre o campo discriminante).
   Regra: o service NÃO deve repetir a checagem em runtime (`if (option === 'reschedule' && !rescheduleAt) throw ...`) — isso é responsabilidade do schema.

### Arquivo model

1. Arquivo: `server/src/features/<resource>/models/<Resource>.model.ts`
2. `export interface I<Resource> { id: string; userId: string; ...; createdAt: Date; updatedAt: Date; deletedAt?: Date; }`
3. Enums locais se necessário

## Files usually created or changed

```
server/src/features/<resource>/dtos/<Resource>Dto.ts        ← NEW
server/src/features/<resource>/models/<Resource>.model.ts   ← NEW
```

## Required checks

```bash
cd server && npx tsc --noEmit
```

## Anti-patterns

- Não reutilize o mesmo schema para Create e Update — Update deve ter todos os campos `.optional()`
- Não omita o comentário `@openapi` — docs.paths.ts depende dele
- Não use `z.any()` sem justificativa
- Não exponha campos sensíveis (password, tokens) no schema de resposta
- Não deixe obrigatoriedade condicional fora do schema — se um campo só é exigido quando outro tem certo valor, use `.superRefine()` ou `z.discriminatedUnion()`; não delegue essa validação ao service em runtime
- Não use `z.date()` cru para datas vindas de payload HTTP — use `z.coerce.date()` (ou `z.string().datetime()`); o body chega como string e `z.date()` rejeita
- Não redefina o objeto do Update manualmente — derive de `Create<Resource>Schema.partial()` para não divergir
- Não esqueça o type guard `is<Resource>Input` com `safeParse` — é o que o controller/service usam para narrowing seguro
- Não omita o companion `models/<Resource>.model.ts` com `interface I<Resource>` — é a fonte do tipo de domínio (`IUser`, enums) que policy/service importam
