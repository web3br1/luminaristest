import { z } from 'zod';
import { isValidCpf, isValidCnpj, isValidPhone } from '../utils/ValidationUtils';
import { ITableSchema } from '../models/DynamicTable.model';
import { ValidationError } from '../../../lib/errors';
import logger from '../../../lib/logger';

/**
 * Pure schema-validation engine for dynamic tables.
 *
 * Builds a Zod schema from an `ITableSchema` and validates record payloads against it.
 * Has NO dependency on the repository or policy — extracted verbatim from DynamicTableService
 * (Phase C decomposition) so the field-level validation can be reasoned about and unit-tested
 * in isolation. Behavior is unchanged.
 */
export class SchemaValidator {
  /**
   * Validates a data payload against the table schema. When `isPartial` is true (updates),
   * every field becomes optional so only the provided fields are checked.
   */
  public validateDataAgainstSchema(data: Record<string, any>, tableSchema: ITableSchema, isPartial = false) {
    try {
      let schema = this.buildZodSchema(tableSchema);
      if (isPartial) schema = schema.partial();
      return schema.parse(data);
    } catch (error) {
      if (error instanceof z.ZodError) {
        logger.debug('[SchemaValidator] Validation failed', { data, fieldErrors: error.flatten().fieldErrors });
        throw new ValidationError('Invalid data provided.', error.flatten().fieldErrors);
      }
      throw new ValidationError('Data validation failed.');
    }
  }

  /**
   * Compiles an `ITableSchema` into a Zod object schema, applying per-field type, format,
   * range and required/default/nullable rules.
   */
  public buildZodSchema(tableSchema: ITableSchema): z.ZodObject<any> {
    const shape: { [key: string]: z.ZodType<any, any> } = {};
    if (!tableSchema || !Array.isArray(tableSchema.fields)) {
      throw new ValidationError('Invalid table schema definition.');
    }

    for (const field of tableSchema.fields) {
      let zodField: z.ZodType<any, any>;
      // Normaliza tipos equivalentes
      const fieldType = (field.type === 'datetime') ? 'date' : field.type;

      switch (fieldType) {
        case 'textarea':
        case 'string': {
          let stringField = z.string();

          // First, apply generic validations that return a ZodString
          if (field.validation?.minLength !== undefined) {
            stringField = stringField.min(field.validation.minLength);
          }
          if (field.validation?.maxLength !== undefined) {
            stringField = stringField.max(field.validation.maxLength);
          }

          // Now, apply format-based validations which may return a ZodEffects
          let finalStringValidation: z.ZodTypeAny = stringField;
          if (field.format) {
            switch (field.format) {
              case 'email':
                finalStringValidation = stringField.email({ message: 'Formato de email inválido.' });
                break;
              case 'url':
                finalStringValidation = stringField.url({ message: 'Formato de URL inválido.' });
                break;
              case 'cpf':
                finalStringValidation = stringField.refine(isValidCpf, { message: 'CPF/CNPJ inválido. CPF deve ter 11 dígitos ou CNPJ deve ter 14 dígitos.' });
                break;
              case 'cnpj':
                finalStringValidation = stringField.refine(isValidCnpj, { message: 'CNPJ inválido. Deve conter 14 dígitos numéricos.' });
                break;
              case 'phone':
                finalStringValidation = stringField.refine(isValidPhone, { message: 'Telefone inválido. Deve conter 10 ou 11 dígitos numéricos.' });
                break;
              case 'custom':
                if (field.regex) {
                  try {
                    const customRegex = new RegExp(field.regex);
                    finalStringValidation = stringField.regex(customRegex, { message: `O valor não corresponde ao formato exigido para o campo '${field.label || field.name}'.` });
                  } catch (e) {
                    throw new ValidationError(`Regex inválida fornecida para o campo '${field.name}'.`);
                  }
                }
                break;
            }
          }

          zodField = finalStringValidation;
          break;
        }
        case 'number': {
          let numberField = z.coerce.number();
          if (field.validation?.minValue !== undefined) {
            numberField = numberField.min(field.validation.minValue);
          }
          if (field.validation?.maxValue !== undefined) {
            numberField = numberField.max(field.validation.maxValue);
          }
          zodField = numberField;
          break;
        }
        case 'boolean':
          zodField = z.boolean();
          break;
        case 'date':
          zodField = z.coerce.date();
          break;
        // 'datetime' é normalizado para 'date' acima
        case 'relation': {
          const base = z.string().cuid({ message: 'ID de relação inválido.' });
          if (field.relation?.allowMultiple) {
            zodField = z.array(base).min(1, { message: 'Selecione ao menos um item na relação.' });
          } else {
            zodField = base;
          }
          break;
        }
        case 'select':
          if (!field.options || field.options.length === 0) {
            throw new ValidationError(`O campo de seleção '${field.name}' não possui opções definidas no schema.`);
          }
          // Garante que o array de opções não esteja vazio para o z.enum
          zodField = z.enum(field.options as [string, ...string[]]);
          break;
        case 'json': {
          // Accept any JSON-compatible object
          zodField = z.any();
          break;
        }
        default:
          throw new ValidationError(`Tipo de campo desconhecido: ${field.type}`);
      }

      if (field.defaultValue !== undefined) {
        zodField = zodField.default(field.defaultValue);
      }

      if (!field.required) {
        if (field.defaultValue === undefined) {
          zodField = zodField.optional();
        }
        zodField = zodField.nullable();
      }

      shape[field.name] = zodField;
    }
    return z.object(shape);
  }
}
