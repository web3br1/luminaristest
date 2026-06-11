/**
 * Analytics Validator
 * 
 * Validates analytics configurations against templates and table schemas.
 * Ensures that all required fields are mapped and have correct types.
 */

import type { AnalyticsConfiguration } from '../core/models/AnalyticsConfiguration';
import type { ITableSchema, ISchemaField } from '@/features/dynamicTables/models/DynamicTable.model';
import { getTemplate } from '../core';

export type ValidationError = {
  field: string;
  message: string;
};

export type ValidationResult = {
  valid: boolean;
  errors: ValidationError[];
};

/**
 * Validates an analytics configuration against its template and table schema.
 * 
 * @param config The analytics configuration to validate
 * @param tableSchema The schema of the table being analyzed
 * @returns Validation result with errors if any
 */
export function validateConfiguration(
  config: AnalyticsConfiguration,
  tableSchema: ITableSchema
): ValidationResult {
  const errors: ValidationError[] = [];

  // 1. Check if template exists
  const template = getTemplate(config.templateKey);
  if (!template) {
    errors.push({
      field: 'templateKey',
      message: `Template '${config.templateKey}' not found`,
    });
    return { valid: false, errors };
  }

  // 2. Check if all required fields are mapped
  for (const requiredField of template.requiredFields) {
    if (!config.fieldMapping[requiredField.key]) {
      errors.push({
        field: requiredField.key,
        message: `Required field '${requiredField.key}' (${requiredField.label}) is not mapped`,
      });
    }
  }

  // 3. Validate that mapped fields exist in schema and have correct types
  if (!config.fieldMapping || typeof config.fieldMapping !== 'object') {
    return {
      valid: false,
      errors: [{ field: 'fieldMapping', message: 'Field mapping must be an object' }],
    };
  }

  for (const [fieldKey, fieldName] of Object.entries(config.fieldMapping)) {
    const fieldRequirement = [
      ...template.requiredFields,
      ...(template.optionalFields || []),
    ].find(f => f.key === fieldKey);

    if (!fieldRequirement) {
      // Field is mapped but not required/optional - might be a custom param, skip
      continue;
    }

    // Find the field in the schema
    const schemaField = tableSchema.fields.find((f: ISchemaField) => f.name === fieldName);
    if (!schemaField) {
      errors.push({
        field: fieldKey,
        message: `Mapped field '${fieldName}' does not exist in table schema`,
      });
      continue;
    }

    // Check if field type matches requirement
    const schemaFieldType = mapSchemaFieldTypeToTemplateType(schemaField.type);
    if (!fieldRequirement.types.includes(schemaFieldType)) {
      errors.push({
        field: fieldKey,
        message: `Field '${fieldName}' has type '${schemaField.type}' but template requires one of: ${fieldRequirement.types.join(', ')}`,
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Maps schema field types to template field types.
 * Handles type compatibility (e.g., 'datetime' -> 'date').
 */
function mapSchemaFieldTypeToTemplateType(schemaType: string): 'string' | 'number' | 'select' | 'date' | 'boolean' {
  switch (schemaType) {
    case 'number':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'date':
    case 'datetime':
      return 'date';
    case 'select':
      return 'select';
    case 'string':
    case 'textarea':
    case 'json':
    default:
      return 'string';
  }
}

/**
 * Validates multiple configurations at once.
 * Useful during preset installation.
 */
export function validateConfigurations(
  configs: AnalyticsConfiguration[],
  tableSchemas: Map<string, ITableSchema>
): ValidationResult {
  const errors: ValidationError[] = [];

  if (!tableSchemas || !(tableSchemas instanceof Map)) {
    return {
      valid: false,
      errors: [{ field: 'tableSchemas', message: 'Table schemas map is required' }],
    };
  }

  for (const config of configs) {
    // Resolve table key to get schema
    const tableKey = config.tableKey.replace('@@PRESET_TABLE_KEY::', '');
    const schema = tableSchemas.get(tableKey);

    if (!schema) {
      errors.push({
        field: config.key,
        message: `Table '${tableKey}' not found in preset tables`,
      });
      continue;
    }

    const result = validateConfiguration(config, schema);
    if (!result.valid) {
      errors.push(...result.errors.map(e => ({
        field: `${config.key}.${e.field}`,
        message: e.message,
      })));
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

