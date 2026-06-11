import { useCallback, useMemo } from 'react';
import type { SortOption } from '../SortSelect';

/**
 * useColumnSort — Encapsula a lógica de sort por coluna com ciclo asc → desc → null.
 *
 * Suporta o caso em que o ID da coluna exibida difere do nome do campo no backend
 * (ex.: `service` → `name`, `contact` → `email`) via `options.colToField`.
 *
 * @param activeSortConfig Estado de sort vigente (controlado pelo pai).
 * @param onSortChange Setter do sort vigente.
 * @param options
 *   - `nonSortableTypes`: tipos de campo que NUNCA são ordenáveis. Default canônico.
 *   - `colToField`: mapeamento opcional `colId → backendField`. Sem mapeamento, colId === field.
 */
export function useColumnSort(
    activeSortConfig: SortOption | null,
    onSortChange: (sort: SortOption | null) => void,
    options?: {
        nonSortableTypes?: Set<string>;
        colToField?: Record<string, string>;
    }
) {
    const nonSortableTypes = useMemo(
        () => options?.nonSortableTypes ?? new Set(['relation', 'boolean', 'json', 'textarea', 'actions', 'object']),
        [options?.nonSortableTypes]
    );
    const colToField = options?.colToField;

    const resolveField = useCallback(
        (colId: string) => colToField?.[colId] ?? colId,
        [colToField]
    );

    const isSortable = useCallback((col: { id: string; type?: string }): boolean => {
        if (col.id === 'actions') return false;
        if (col.type && nonSortableTypes.has(col.type)) return false;
        return true;
    }, [nonSortableTypes]);

    const handleColSort = useCallback((colId: string) => {
        const field = resolveField(colId);
        const currentField = activeSortConfig?.field;
        const currentDir = activeSortConfig?.direction;

        if (currentField !== field) {
            onSortChange({ field, direction: 'asc' });
        } else if (currentDir === 'asc') {
            onSortChange({ field, direction: 'desc' });
        } else {
            onSortChange(null);
        }
    }, [activeSortConfig, onSortChange, resolveField]);

    const getColSortState = useCallback((colId: string) => {
        const field = resolveField(colId);
        if (!activeSortConfig || activeSortConfig.field !== field) return null;
        return { active: true, direction: activeSortConfig.direction };
    }, [activeSortConfig, resolveField]);

    return { isSortable, handleColSort, getColSortState };
}
