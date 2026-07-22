import { z } from 'zod';
import { DYNAMIC_TABLE_CATEGORIES } from '../models/TableCategories';

// Objeto para regras de validação específicas por tipo
const FieldValidationSchema = z.object({
  minLength: z.number().optional(),
  maxLength: z.number().optional(),
  minValue: z.number().optional(),
  maxValue: z.number().optional(),
}).optional();

// Objeto para definir uma relação com outra tabela
const FieldRelationSchema = z.object({
  targetTable: z.string(),
  allowMultiple: z.boolean().optional(),
}).optional();

// O novo e poderoso FieldSchema
const AdvancedFieldSchema = z.object({
  name: z.string().trim().min(1, { message: 'O nome técnico do campo é obrigatório.' })
    .regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/, { message: 'O nome do campo deve começar com letra ou _ e conter apenas letras, números e _.' })
    .refine((v) => !['id','createdAt','updatedAt','userId'].includes(v), { message: 'Nome de campo reservado. Escolha outro.' }),
  label: z.string().trim().min(1, { message: 'O rótulo de exibição do campo é obrigatório.' }),
  type: z.enum(['string', 'number', 'boolean', 'date', 'datetime', 'relation', 'select', 'textarea', 'json']),
  required: z.boolean(),
  unique: z.boolean().optional(),
  defaultValue: z.any().optional(),
  validation: FieldValidationSchema,
  relation: FieldRelationSchema,
  options: z
    .array(z.string().transform((s) => s.trim()).pipe(z.string().min(1)))
    .transform((arr) => Array.from(new Set(arr)))
    .optional(),
  format: z.enum(['email', 'phone', 'cpf', 'cnpj', 'url', 'custom']).optional(),
  numberFormat: z.enum(['currency', 'percentage', 'integer', 'decimal']).optional(),
  description: z.string().optional(),
  regex: z.string().optional(),
  hidden: z.boolean().optional(),
  // --- Field-level governance (mirrors ISchemaField) ---
  readOnly: z.boolean().optional(),
  searchable: z.boolean().optional(),
  requiredIf: z.object({
    field: z.string(),
    op: z.enum(['eq', 'neq', 'in']),
    value: z.union([
      z.string(),
      z.number(),
      z.boolean(),
      z.array(z.union([z.string(), z.number(), z.boolean()])),
    ]),
  }).optional(),
})
.refine(data => {
  if (data.type === 'select' && (!data.options || data.options.length === 0)) {
    return false;
  }
  return true;
}, {
  message: 'Campos do tipo "select" devem ter a propriedade "options" com pelo menos uma opção.',
  path: ['options'],
})
.refine(data => {
  if (data.type === 'select' && Array.isArray(data.options)) {
    // After transforms, options are trimmed and unique already; ensure no empty strings remain
    return data.options.length > 0 && data.options.every(opt => opt.length > 0);
  }
  return true;
}, {
  message: 'Opções do campo select devem ser não vazias e únicas.',
  path: ['options'],
})
.refine(data => {
  if (data.type === 'relation' && !data.relation) {
    return false;
  }
  return true;
}, {
  message: 'Campos do tipo "relation" devem ter a propriedade "relation" definida.',
  path: ['relation'],
})
.refine(data => {
  if (data.type !== 'relation' && data.relation) {
    return false;
  }
  return true;
}, {
  message: 'A propriedade "relation" só é permitida para campos do tipo "relation".',
  path: ['relation'],
})
.refine(data => {
  // Um campo obrigatório não pode ter um valor padrão.
  if (data.required && data.defaultValue !== undefined) {
    return false;
  }
  return true;
}, {
  message: 'Campos obrigatórios não podem ter um valor padrão (defaultValue).',
  path: ['defaultValue'],
});

// --- Table-level governance metadata (mirrors ITableSchema) ---

const DeleteConstraintSchema = z.object({
  type: z.enum(['RESTRICT', 'CASCADE', 'RESTRICT_IF_AGGREGATE', 'IGNORE']),
  targetTable: z.string(),
  aggregate: z.object({
    field: z.string(),
    operator: z.enum(['gt', 'lt', 'eq', 'neq']),
    value: z.number(),
  }).optional(),
  cascadeCondition: z.enum(['ALWAYS', 'IF_AGGREGATE_MATCH']).optional(),
  errorMessage: z.string().optional(),
});

const CompositeUniqueSchema = z.object({
  fields: z.array(z.string()).min(1),
  errorMessage: z.string().optional(),
});

const ImmutableAfterSchema = z.object({
  condition: z.object({
    field: z.string(),
    op: z.enum(['eq', 'in']),
    value: z.union([z.string(), z.array(z.string())]),
  }),
  scope: z.union([z.literal('all'), z.array(z.string())]),
  errorMessage: z.string().optional(),
});

const CompareSchema = z.object({
  left: z.string(),
  op: z.enum(['gt', 'gte', 'lt', 'lte', 'eq', 'neq']),
  right: z.string(),
  errorMessage: z.string().optional(),
});

const LifecycleSchema = z.object({
  field: z.string(),
  transitions: z.record(z.string(), z.array(z.string())),
  errorMessage: z.string().optional(),
});

const NoOverlapSchema = z.object({
  startField: z.string(),
  endField: z.string(),
  scopeFields: z.array(z.string()).optional(),
  errorMessage: z.string().optional(),
});

const UiPresentationSchema = z.object({
  presentation: z.enum(['standalone', 'embedded', 'system']).optional(),
});

// O schema da tabela agora usa o schema avançado de campo + governança de nível-tabela
const TableSchema = z.object({
  defaultDisplayField: z.string().optional(),
  fields: z.array(AdvancedFieldSchema).min(1, { message: 'A tabela deve ter pelo menos um campo.' }),
  deleteConstraints: z.array(DeleteConstraintSchema).optional(),
  compositeUnique: z.array(CompositeUniqueSchema).optional(),
  immutableAfter: z.array(ImmutableAfterSchema).optional(),
  compare: z.array(CompareSchema).optional(),
  lifecycle: z.array(LifecycleSchema).optional(),
  noOverlap: z.array(NoOverlapSchema).optional(),
  ui: UiPresentationSchema.optional(),
});

// DTO for creating a new dynamic table.
export const CreateDynamicTableDto = z.object({
  name: z.string().trim().min(2, { message: 'O nome da tabela deve ter pelo menos 2 caracteres.' }),
  category: z.enum(DYNAMIC_TABLE_CATEGORIES as [string, ...string[]], {
    message: 'Invalid category provided.',
  }),
  internalName: z.string().optional(),
  schema: TableSchema,
});
export type CreateDynamicTableDtoType = z.infer<typeof CreateDynamicTableDto>;

// DTO for updating a dynamic table's metadata (e.g., its name).
export const UpdateDynamicTableDto = z.object({
  name: z.string().trim().min(2, { message: 'O nome da tabela deve ter pelo menos 2 caracteres.' }).optional(),
  // Note: Updating the schema is a complex migration task and is handled separately.
});
export type UpdateDynamicTableDtoType = z.infer<typeof UpdateDynamicTableDto>;

// DTO for updating a dynamic table's schema.
export const UpdateDynamicTableSchemaDto = z.object({
  schema: TableSchema,
});
export type UpdateDynamicTableSchemaDtoType = z.infer<typeof UpdateDynamicTableSchemaDto>;

// DTO for creating a new data entry in a dynamic table.
// The 'data' field is a generic object here. The actual validation against the
// table's specific schema will be performed dynamically in the service layer.
export const CreateDynamicTableDataDto = z.object({
  data: z.record(z.string(), z.any()),
});
export type CreateDynamicTableDataDtoType = z.infer<typeof CreateDynamicTableDataDto>;

// DTO for updating an existing data entry.
// Similar to creation, the actual validation is dynamic.
export const UpdateDynamicTableDataDto = z.object({
  data: z.record(z.string(), z.any()),
});
export type UpdateDynamicTableDataDtoType = z.infer<typeof UpdateDynamicTableDataDto>;
