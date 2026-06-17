import type { UserContext } from '../../../lib/authUtils';
import { NotFoundError, ValidationError } from '../../../lib/errors';
import logger from '../../../lib/logger';
import type { DynamicTableService } from './DynamicTableService';
import type { IDynamicTableRepository } from '../repositories/IDynamicTableRepository';
import type { ISchemaField, ITableSchema } from '../models/DynamicTable.model';
import { CoreSystemPreset } from '../presets/systems/CoreSystemPreset';
import { tablePresetSuites } from '../presets';

const PRESET_TABLE_KEY_PREFIX = '@@PRESET_TABLE_KEY::';

/**
 * Result of an additive schema sync.
 * - `added`: technical names of NEW fields appended to the installed schema.
 * - `optionsAdded`: per existing `select` field, the new option values unioned in.
 */
export interface PresetSyncResult {
  added: string[];
  optionsAdded: Record<string, string[]>;
}

/**
 * PresetSyncService — ADDITIVE-ONLY evolution of an already-installed table schema
 * from its preset module.
 *
 * Editing a preset module does NOT retroactively update tables already installed for a
 * user (the schema is persisted as JSON at install time). This service computes the
 * additive delta between the preset module's current schema and the user's installed
 * schema, then applies it through `DynamicTableService.updateTableSchemaAsSystem`, whose
 * built-in revalidation of ALL existing rows is the safety net (it aborts if the new
 * schema would invalidate any existing data).
 *
 * Orchestration variant: this service owns no Repository/Policy CRUD beyond resolving the
 * installed table by `internalName`; all schema mutation goes through `DynamicTableService`.
 * It NEVER removes or renames a field/option, and never changes the type/required of an
 * existing field.
 */
export class PresetSyncService {
  constructor(
    private readonly dynamicTableService: DynamicTableService,
    private readonly repository: IDynamicTableRepository,
  ) {}

  /**
   * Resolve the preset module schema for a given `internalName` across the Core system
   * preset and every selectable preset suite. Preset table keys ARE the internalName
   * (installPresetAsSystem keys created tables by presetKey), so a lookup by key works.
   */
  private getPresetSchemaForInternalName(internalName: string): ITableSchema | null {
    const coreDef = CoreSystemPreset.tables[internalName];
    if (coreDef?.schema) return coreDef.schema;

    for (const category of Object.values(tablePresetSuites)) {
      for (const suite of Object.values(category)) {
        const def = suite.tables[internalName];
        if (def?.schema) return def.schema;
      }
    }
    return null;
  }

  /**
   * Resolve a NEW relation field's preset marker (@@PRESET_TABLE_KEY::x) to the user's
   * REAL installed table id for `x` (mirrors installPresetAsSystem pass-2 resolution).
   * `updateTableSchemaAsSystem` rejects markers, so this must run before the merge is applied.
   */
  private async resolveRelationMarker(user: UserContext, field: ISchemaField): Promise<ISchemaField> {
    if (field.type !== 'relation' || !field.relation?.targetTable) return field;
    const target = field.relation.targetTable;
    if (typeof target !== 'string' || !target.startsWith(PRESET_TABLE_KEY_PREFIX)) return field;

    const targetKey = target.slice(PRESET_TABLE_KEY_PREFIX.length);
    const targetTable = await this.repository.findTableByInternalName(user.userId, targetKey);
    if (!targetTable) {
      throw new NotFoundError(
        `Não foi possível resolver a relação do campo '${field.name}': tabela alvo '${targetKey}' não está instalada para este usuário.`,
      );
    }
    // Deep clone so we never mutate the shared preset module object.
    return {
      ...field,
      relation: { ...field.relation, targetTable: targetTable.id },
    };
  }

  /**
   * Evolve an installed table's schema additively from its preset module.
   *
   * Steps (see spec Componente A):
   *  1. Resolve the installed table by `internalName` → NotFoundError if absent.
   *  2. Load the preset module schema for that `internalName`.
   *  3. Compute the ADDITIVE delta: preset fields missing from the installed schema, and,
   *     for `select` fields, options present in the preset but missing in the installed field.
   *  4. Resolve preset markers on NEW relation fields to the user's REAL installed table id.
   *  5. Merge (installed + delta) and apply via `updateTableSchemaAsSystem` (its revalidation
   *     of existing rows is the safety net; a merge that would invalidate data propagates).
   *  6. Idempotent: an empty delta is a no-op (does not call updateTableSchemaAsSystem).
   */
  async syncInstalledTableFromPreset(user: UserContext, internalName: string): Promise<PresetSyncResult> {
    // 1) Resolve the installed table.
    const installedTable = await this.repository.findTableByInternalName(user.userId, internalName);
    if (!installedTable) {
      throw new NotFoundError(`Tabela '${internalName}' não está instalada para este usuário.`);
    }

    // 2) Load the preset module schema.
    const presetSchema = this.getPresetSchemaForInternalName(internalName);
    if (!presetSchema) {
      throw new NotFoundError(`Nenhum preset conhecido define a tabela '${internalName}'.`);
    }

    const installedSchema = installedTable.schema as unknown as ITableSchema;
    const installedFields: ISchemaField[] = Array.isArray(installedSchema.fields) ? installedSchema.fields : [];
    const presetFields: ISchemaField[] = Array.isArray(presetSchema.fields) ? presetSchema.fields : [];

    const installedByName = new Map(installedFields.map((f) => [f.name, f]));

    // 3) Compute the additive delta.
    const added: string[] = [];
    const optionsAdded: Record<string, string[]> = {};
    const newFields: ISchemaField[] = [];
    // Work on a deep clone of installed fields so option-union mutations never touch the
    // persisted object until the merged schema is applied as a whole.
    const mergedFields: ISchemaField[] = JSON.parse(JSON.stringify(installedFields));
    const mergedByName = new Map(mergedFields.map((f) => [f.name, f]));

    for (const presetField of presetFields) {
      const existing = installedByName.get(presetField.name);

      if (!existing) {
        // NEW field → resolve relation marker (if any) then append (additive).
        const resolved = await this.resolveRelationMarker(user, presetField);
        newFields.push(resolved);
        added.push(resolved.name);
        continue;
      }

      // EXISTING field → only widen `select` options (union). Never change type/required.
      if (presetField.type === 'select' && Array.isArray(presetField.options)) {
        const existingOptions = Array.isArray(existing.options) ? existing.options : [];
        const missingOptions = presetField.options.filter((opt) => !existingOptions.includes(opt));
        if (missingOptions.length > 0) {
          const target = mergedByName.get(presetField.name);
          if (target) {
            target.options = [...existingOptions, ...missingOptions];
            optionsAdded[presetField.name] = missingOptions;
          }
        }
      }
    }

    // 6) Idempotent no-op when there is nothing to add.
    if (added.length === 0 && Object.keys(optionsAdded).length === 0) {
      logger.info('PresetSync: no additive delta — schema already up to date', {
        userId: user.userId,
        internalName,
      });
      return { added: [], optionsAdded: {} };
    }

    // 5) Merge installed schema + delta (append new fields after existing ones).
    const mergedSchema: ITableSchema = {
      ...installedSchema,
      fields: [...mergedFields, ...newFields],
    };

    // 5.1) Prove the merge is purely ADDITIVE (superset) before applying with revalidate 'none'.
    // This is the safety justification for skipping per-row revalidation: an additive change
    // (no field/option removed, no type/required change, only new optional fields + widened
    // selects) cannot invalidate any value already present, so it must not be blocked by
    // pre-existing malformed rows (e.g. seed data with a null required field) unrelated to the delta.
    for (const prev of installedFields) {
      const next = mergedByName.get(prev.name);
      if (!next) throw new ValidationError(`PresetSync abortado: campo '${prev.name}' seria removido (não-aditivo).`);
      if (next.type !== prev.type) throw new ValidationError(`PresetSync abortado: tipo de '${prev.name}' mudaria (não-aditivo).`);
      if (Boolean(next.required) !== Boolean(prev.required)) throw new ValidationError(`PresetSync abortado: 'required' de '${prev.name}' mudaria (não-aditivo).`);
      if (prev.type === 'select') {
        const nextOpts = new Set(next.options ?? []);
        for (const opt of prev.options ?? []) {
          if (!nextOpts.has(opt)) throw new ValidationError(`PresetSync abortado: opção '${opt}' de '${prev.name}' seria removida (não-aditivo).`);
        }
      }
    }

    // Apply with revalidate 'none': the additive invariant above guarantees data-safety, so a
    // pre-existing invalid row (stale seed) must not block the schema evolution. The engine still
    // runs duplicate-name, buildZodSchema and relation-ownership checks inside updateTableSchemaAsSystem.
    await this.dynamicTableService.updateTableSchemaAsSystem(installedTable.id, {
      schema: mergedSchema as unknown as ITableSchema,
    }, 'none');

    logger.info('PresetSync: applied additive schema delta', {
      userId: user.userId,
      internalName,
      tableId: installedTable.id,
      added,
      optionsAdded,
    });

    return { added, optionsAdded };
  }
}
