import { IDynamicTable, ITableSchema } from '../models/DynamicTable.model';
import { IDynamicTableRepository } from '../repositories/IDynamicTableRepository';
import { ValidationError } from '../../../lib/errors';

/**
 * Declarative governance engine for dynamic tables.
 *
 * Holds the schema-driven rule enforcement extracted verbatim from DynamicTableService
 * (Phase C decomposition): the three update guards (readOnly / immutableAfter / lifecycle),
 * the advanced rules (unique / relation / compositeUnique / requiredIf / compare) and the
 * anti-overlap check. The guards are pure; the advanced/overlap checks take a (tx-bound)
 * repository explicitly. Behavior is unchanged.
 */
export class GovernanceEngine {
  /** Guard 1: reject payloads that try to modify a readOnly field directly. */
  assertReadOnly(schema: ITableSchema, incomingData: Record<string, any>): void {
    const readOnlyFields = schema.fields.filter(f => f.readOnly).map(f => f.name);
    const violations = readOnlyFields.filter(name => (incomingData as any)?.[name] !== undefined);
    if (violations.length > 0) {
      throw new ValidationError(`Field(s) [${violations.join(', ')}] are read-only and cannot be modified directly.`);
    }
  }

  /** Guard 2: once an immutability condition is met, block changes (whole record or named fields). */
  assertImmutableAfter(
    schema: ITableSchema,
    currentData: Record<string, unknown>,
    incomingData: Record<string, any>,
  ): void {
    const immutableRules = schema.immutableAfter ?? [];
    if (immutableRules.length === 0) return;
    for (const rule of immutableRules) {
      const currentFieldValue = currentData[rule.condition.field];
      const conditionMet = rule.condition.op === 'eq'
        ? currentFieldValue === rule.condition.value
        : Array.isArray(rule.condition.value) && rule.condition.value.includes(String(currentFieldValue));

      if (conditionMet) {
        if (rule.scope === 'all') {
          const changedFields = Object.keys(incomingData || {}).filter(
            key => JSON.stringify(currentData[key]) !== JSON.stringify((incomingData as any)[key])
          );
          if (changedFields.length > 0) {
            throw new ValidationError(
              rule.errorMessage ?? `This record cannot be edited in its current state (${rule.condition.field}: ${currentFieldValue}).`
            );
          }
        } else {
          const blockedAndChanged = (rule.scope as string[]).filter(
            fieldName => (incomingData as any)?.[fieldName] !== undefined
              && JSON.stringify(currentData[fieldName]) !== JSON.stringify((incomingData as any)[fieldName])
          );
          if (blockedAndChanged.length > 0) {
            throw new ValidationError(
              rule.errorMessage ?? `Fields [${blockedAndChanged.join(', ')}] cannot be changed in this state.`
            );
          }
        }
      }
    }
  }

  /** Guard 3: enforce the declared status state machine (only explicitly-allowed transitions). */
  assertLifecycle(
    schema: ITableSchema,
    currentData: Record<string, unknown>,
    mergedData: Record<string, unknown>,
  ): void {
    const lifecycleRules = schema.lifecycle ?? [];
    for (const rule of lifecycleRules) {
      const prev = currentData[rule.field];
      const next = mergedData[rule.field];
      // No state change (or field not present in this update) → nothing to validate.
      if (next === undefined || next === prev) continue;
      const prevKey = String(prev);
      const nextKey = String(next);
      const allowedTargets = rule.transitions[prevKey];
      // Source state absent from transitions map ⇒ terminal: no outgoing change allowed.
      if (!allowedTargets || !allowedTargets.includes(nextKey)) {
        throw new ValidationError(
          rule.errorMessage ?? `Invalid status transition: '${prevKey}' → '${nextKey}'.`
        );
      }
    }
  }

  /**
   * Enforces schema-declared anti-overlap rules (e.g. appointment scheduling conflicts).
   * Bypassed for system-originated writes. Each bound must be a valid date; otherwise the rule
   * is skipped (presence is enforced elsewhere by `required`/`compare`).
   */
  async enforceNoOverlap(
    table: IDynamicTable,
    schema: ITableSchema,
    data: Record<string, any>,
    isSystem: boolean,
    repo: IDynamicTableRepository,
    excludeId?: string,
  ): Promise<void> {
    if (isSystem) return;
    const rules = schema.noOverlap ?? [];
    for (const rule of rules) {
      const startValue = data[rule.startField];
      const endValue = data[rule.endField];
      if (startValue === undefined || startValue === null || endValue === undefined || endValue === null) continue;
      if (!isFinite(new Date(startValue).getTime()) || !isFinite(new Date(endValue).getTime())) continue;

      const scope: Array<{ field: string; value: string }> = [];
      for (const f of rule.scopeFields ?? []) {
        const v = data[f];
        if (v !== undefined && v !== null && String(v).trim() !== '') {
          scope.push({ field: f, value: String(v) });
        }
      }

      // Normalize to ISO: validated date fields arrive as Date objects (z.coerce.date), and
      // `String(date)` yields a non-ISO form (e.g. "Thu Jan 01 2026 ...") that SQLite's
      // datetime() cannot parse → it returns NULL and the overlap is silently never detected.
      const count = await repo.countOverlaps(
        table.id,
        rule.startField,
        rule.endField,
        new Date(startValue).toISOString(),
        new Date(endValue).toISOString(),
        scope,
        excludeId,
      );
      if (count > 0) {
        throw new ValidationError(rule.errorMessage ?? 'This record overlaps an existing one in the same period.');
      }
    }
  }

  /**
   * Advanced, repository-backed validation: field uniqueness, relation existence (single/multi),
   * compositeUnique, requiredIf and cross-field compare rules.
   */
  async validateAdvancedRules(
    table: IDynamicTable,
    data: Record<string, any>,
    repo: IDynamicTableRepository,
    dataIdToExclude?: string,
  ): Promise<void> {
    const schema = table.schema as unknown as ITableSchema;

    for (const field of schema.fields) {
      const value = data[field.name];
      if (value === undefined || value === null) continue;

      // 1. Validate Uniqueness
      if (field.unique) {
        const count = await repo.countByFieldValue(table.id, field.name, value, dataIdToExclude);
        if (count > 0) {
          throw new ValidationError(`The value '${value}' for field '${field.label}' already exists and must be unique.`);
        }
      }

      // 2. Validate Relation
      if (field.type === 'relation' && field.relation) {
        if (field.relation.allowMultiple) {
          if (!Array.isArray(value)) {
            throw new ValidationError(`Field '${field.label}' expects a list of IDs.`);
          }
          const unique = new Set(value);
          if (unique.size !== value.length) {
            throw new ValidationError(`Field '${field.label}' contains duplicate IDs.`);
          }
          // Batch existence check (single query) instead of N serial lookups.
          const targetTable = field.relation.targetTable;
          const rows = await repo.findDataByIds(value);
          const validIds = new Set(rows.filter(r => r.dynamicTableId === targetTable).map(r => r.id));
          const missing = value.find(id => !validIds.has(id));
          if (missing !== undefined) {
            throw new ValidationError(`Related record with ID '${missing}' in the target table for field '${field.label}' was not found.`);
          }
        } else {
          const relatedExists = await repo.existsByIdInTable(value, field.relation.targetTable);
          if (!relatedExists) {
            throw new ValidationError(`Related record with ID '${value}' in the target table for field '${field.label}' was not found.`);
          }
        }
      }
    }

    // 3. Validate compositeUnique rules
    const compositeRules = schema.compositeUnique ?? [];
    for (const rule of compositeRules) {
      // Only check if ALL fields in the composite key are present in the payload
      const allPresent = rule.fields.every(f => data[f] !== undefined && data[f] !== null);
      if (!allPresent) continue;

      const count = await repo.countByCompositeFieldValues(
        table.id,
        rule.fields.map(f => ({ name: f, value: data[f] })),
        dataIdToExclude,
      );

      if (count > 0) {
        throw new ValidationError(
          rule.errorMessage ?? `Duplicate entry: the combination of [${rule.fields.join(', ')}] must be unique.`
        );
      }
    }

    // 4. Validate requiredIf — conditional required fields
    for (const field of schema.fields) {
      if (!field.requiredIf) continue;

      const { field: condField, op, value: condValue } = field.requiredIf;
      const actualCondValue = data[condField];

      let conditionMet = false;
      if (op === 'eq') {
        conditionMet = actualCondValue === condValue;
      } else if (op === 'neq') {
        conditionMet = actualCondValue !== condValue;
      } else if (op === 'in') {
        const arr = Array.isArray(condValue) ? condValue : [condValue];
        conditionMet = arr.includes(actualCondValue as any);
      }

      if (conditionMet) {
        const fieldValue = data[field.name];
        const isEmpty = fieldValue === null || fieldValue === undefined || fieldValue === '';
        if (isEmpty) {
          throw new ValidationError(
            `Field '${field.label || field.name}' is required when '${condField}' is '${Array.isArray(condValue) ? condValue.join(' | ') : condValue}'.`,
            { [field.name]: [`Required when ${condField} = ${condValue}`] }
          );
        }
      }
    }

    // 5. Validate compare — cross-field comparison rules
    const compareRules = schema.compare ?? [];
    for (const rule of compareRules) {
      const leftRaw = data[rule.left];
      const rightRaw = data[rule.right];

      // Skip if either field is absent (presence is enforced by required/requiredIf)
      if (leftRaw === undefined || leftRaw === null || rightRaw === undefined || rightRaw === null) continue;

      // Resolve typed values for comparison
      const leftField = schema.fields.find(f => f.name === rule.left);
      const rightField = schema.fields.find(f => f.name === rule.right);
      const fieldType = leftField?.type ?? rightField?.type ?? 'string';

      let leftVal: number | string;
      let rightVal: number | string;

      if (fieldType === 'date' || fieldType === 'datetime') {
        leftVal = new Date(leftRaw as string).getTime();
        rightVal = new Date(rightRaw as string).getTime();
      } else if (fieldType === 'number') {
        leftVal = Number(leftRaw);
        rightVal = Number(rightRaw);
      } else {
        leftVal = String(leftRaw);
        rightVal = String(rightRaw);
      }

      let passed = true;
      switch (rule.op) {
        case 'gt':  passed = leftVal > rightVal;  break;
        case 'gte': passed = leftVal >= rightVal; break;
        case 'lt':  passed = leftVal < rightVal;  break;
        case 'lte': passed = leftVal <= rightVal; break;
        case 'eq':  passed = leftVal === rightVal; break;
        case 'neq': passed = leftVal !== rightVal; break;
      }

      if (!passed) {
        const defaultMsg = `Field '${rule.left}' must be ${rule.op} '${rule.right}'.`;
        throw new ValidationError(rule.errorMessage ?? defaultMsg);
      }
    }
  }
}
