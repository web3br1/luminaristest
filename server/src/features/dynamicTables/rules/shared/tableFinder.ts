import type { RuleContext } from '../RuleTypes';
import type { IDynamicTable, ISchemaField, ITableSchema } from '../../models/DynamicTable.model';

/**
 * Single source of truth for "does this table belong to plugin X?".
 * A table matches when its category is allowed (if `categories` given) AND it matches
 * either a stable `internalName` (preset tables) or one of the known display `names`
 * (custom tables). Used by every plugin's `supports()` and by `resolveTable`'s fallback.
 */
export function tableMatches(
  table: { category: string; internalName?: string | null; name: string },
  opts: { internalNames: string[]; categories?: string[]; names?: string[] },
): boolean {
  if (opts.categories?.length && !opts.categories.includes(table.category)) return false;
  if (table.internalName && opts.internalNames.includes(table.internalName)) return true;
  return (opts.names ?? []).includes(table.name);
}

/**
 * Resolves a workspace table for a plugin using an indexed-first strategy.
 *
 * 1. Fast path: preset-installed tables have `internalName = presetKey`, so a single
 *    indexed query (`findTableByInternalName`) resolves them without loading every table.
 * 2. Fallback: user-created tables may lack `internalName` — load all tables once and
 *    match by name or a schema-shape heuristic (same criteria the legacy finders used).
 *
 * Returns the full IDynamicTable so callers can read `.id`, `.schema`, etc.
 */
export async function resolveTable(
  ctx: RuleContext,
  opts: {
    internalName: string;
    category?: string;
    names?: string[];
    schemaMatch?: (fields: ISchemaField[]) => boolean;
  },
): Promise<IDynamicTable | null> {
  // 1. Indexed fast path (preset tables).
  const byInternal = await ctx.repository.findTableByInternalName(ctx.userId, opts.internalName);
  if (byInternal && (!opts.category || byInternal.category === opts.category)) {
    return byInternal;
  }

  // 2. Heuristic fallback (custom tables without internalName).
  const categories = opts.category ? [opts.category] : undefined;
  const all = await ctx.repository.findTablesByUserId(ctx.userId);
  return (
    all.find(t => {
      if (tableMatches(t, { internalNames: [opts.internalName], categories, names: opts.names })) return true;
      // Category still gates the schema-shape heuristic.
      if (opts.category && t.category !== opts.category) return false;
      const fields = ((t.schema as ITableSchema)?.fields ?? []) as ISchemaField[];
      return opts.schemaMatch?.(fields) ?? false;
    }) ?? null
  );
}
