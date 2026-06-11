/** Minimal schema shape required by this utility. */
interface SchemaLike {
    fields?: Array<{ name: string; type?: string; searchable?: boolean }>;
}

/**
 * Retorna os campos do schema que fazem sentido para ordenação.
 * Aceita `unknown` porque os callers têm schemas de tipos variados.
 * Usado pelas FilterBars de todas as views.
 */
export function getSchemaAllowedSortFields(
    schema: unknown,
    nonSortable = new Set(['boolean', 'json', 'textarea'])
): string[] {
    if (!schema || typeof schema !== 'object') return [];
    const fields = (schema as SchemaLike).fields;
    if (!fields) return [];
    return fields
        .filter(f => f.type == null || !nonSortable.has(f.type))
        .map(f => f.name);
}

/**
 * Retorna os nomes dos campos que podem ser pesquisados na busca textual.
 * Se o schema não existir, retorna undefined (indicando fallback para JSON stringify total).
 * Exclui campos onde `searchable === false`.
 */
export function getSearchableFields(schema: unknown): string[] | undefined {
    if (!schema || typeof schema !== 'object') return undefined;
    const fields = (schema as SchemaLike).fields;
    if (!fields) return undefined;

    return fields
        .filter(f => f.searchable !== false)
        .map(f => f.name);
}
