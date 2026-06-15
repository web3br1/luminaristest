---
name: backend-dto-generator
description: Gera DTOs com Zod schemas (Create, Update, Response), tipos inferidos e type guards isXxxDto com comentários OpenAPI
argument-hint: "[NomeDoRecurso]"
allowed-tools: Read, Grep, Glob, Write, Edit
---

# Backend DTO Generator

## Purpose

Gera `server/src/features/<resource>/dtos/<Resource>Dto.ts` com schemas Zod anotados com OpenAPI, tipos TypeScript inferidos e type guards, além do domain model em `models/<Resource>.model.ts`.

## When to use

- Novo recurso precisa de validação de entrada
- Adicionando campo a um DTO existente
- Sincronizando validação com regras de negócio novas

## Inputs

- `$ARGUMENTS[0]`: nome do recurso em PascalCase (ex: `Appointment`)

## Repository patterns to inspect first

```
server/src/features/users/dtos/UserDto.ts
server/src/features/users/models/User.model.ts
```

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
8. Update schema: todos os campos com `.optional()`
9. Obrigatoriedade condicional (campo exigido depende do valor de outro campo): enforce no schema, nunca no service. Duas opções:
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
