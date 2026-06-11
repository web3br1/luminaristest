'use client';

import React from 'react';

/**
 * ViewModeToggle — segmented icon-only toggle for two or more view modes.
 *
 * Genérico via `options` para servir qualquer view com troca de visualização
 * (Planning: solid/explorer, People: grid/list, etc.). Sem labels visuais —
 * apenas ícones. Mantém estado controlado pelo pai.
 */
interface ViewModeOption<M extends string> {
    mode: M;
    icon: React.ReactNode;
}

interface ViewModeToggleProps<M extends string> {
    mode: M;
    onChange: (mode: M) => void;
    options: ReadonlyArray<ViewModeOption<M>>;
}

export default function ViewModeToggle<M extends string>({
    mode,
    onChange,
    options,
}: ViewModeToggleProps<M>) {
    const activeClass = "bg-white dark:bg-neutral-700 text-blue-600 dark:text-blue-400 shadow-sm ring-1 ring-gray-200 dark:ring-neutral-600";
    const inactiveClass = "text-gray-400 hover:text-gray-600 dark:hover:text-gray-300";

    return (
        <div className="flex items-center gap-1 bg-gray-100 dark:bg-neutral-800/80 rounded-lg p-1 border border-gray-200/50 dark:border-neutral-700/50">
            {options.map((opt) => (
                <button
                    key={opt.mode}
                    type="button"
                    onClick={() => onChange(opt.mode)}
                    className={`p-1.5 rounded-md transition-all ${mode === opt.mode ? activeClass : inactiveClass}`}
                >
                    {opt.icon}
                </button>
            ))}
        </div>
    );
}
