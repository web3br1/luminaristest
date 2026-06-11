import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'next-i18next';
import { fetchRelatedTableData, formatRelatedDisplayValue } from '../shared/relation-utils.client';

interface RelationSelectorProps {
  name: string;
  value: string | string[];
  onChange: (name: string, value: string | string[]) => void;
  targetTable: string;
  required?: boolean;
  className?: string;
  disabled?: boolean;
  multiple?: boolean;
}

/**
 * Componente para selecionar registros de tabelas relacionadas utilizando Portals para evitar problemas de overflow.
 */
function RelationSelector({
  name,
  value,
  onChange,
  targetTable,
  required = false,
  className = '',
  disabled = false,
  multiple = false
}: RelationSelectorProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [options, setOptions] = useState<{ value: string; label: string }[]>([]);
  const [search, setSearch] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const { t } = useTranslation(['common']);

  const containerRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState({ top: 0, left: 0, width: 0 });

  const filteredOptions = useMemo(() => {
    if (!search.trim()) return options;
    const term = search.toLowerCase();
    return options.filter(opt => opt.label.toLowerCase().includes(term));
  }, [options, search]);

  const loadRelatedData = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const relatedData = await fetchRelatedTableData(targetTable);
      if (!relatedData) {
        setError(t('common:errorLoading', 'Failed to load data.'));
        setIsLoading(false);
        return;
      }
      setOptions(relatedData.map(record => ({
        value: record.id,
        label: formatRelatedDisplayValue(record)
      })));
    } catch (err) {
      setError(t('common:errorLoading', 'Failed to load data.'));
    } finally {
      setIsLoading(false);
    }
  }, [targetTable, t]);

  useEffect(() => {
    loadRelatedData();
  }, [loadRelatedData]);

  // Update position when opening
  useEffect(() => {
    if (isOpen && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setCoords({
        top: rect.bottom + window.scrollY,
        left: rect.left + window.scrollX,
        width: rect.width
      });
    }
  }, [isOpen]);

  // Handle click outside to close
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const portalDropdown = document.getElementById(`portal-dropdown-${name}`);
      if (isOpen &&
        containerRef.current && !containerRef.current.contains(e.target as Node) &&
        portalDropdown && !portalDropdown.contains(e.target as Node)) {
        setIsOpen(false);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, name]);

  const toggleOption = useCallback((val: string) => {
    if (multiple) {
      const current = Array.isArray(value) ? value : [];
      const next = current.includes(val) ? current.filter(v => v !== val) : [...current, val];
      onChange(name, next);
    } else {
      onChange(name, val);
      setIsOpen(false);
      setSearch('');
    }
  }, [multiple, value, onChange, name]);

  // IMPORTANT: openDropdown must be declared here — BEFORE the early returns for
  // isLoading/error — because useCallback is a hook and hooks must be called in the
  // same order on every render (Rules of Hooks). Moving it after a conditional return
  // would cause "Rendered more hooks than during the previous render".
  const openDropdown = useCallback(() => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setCoords({
        top: rect.bottom + window.scrollY,
        left: rect.left + window.scrollX,
        width: rect.width
      });
    }
    setIsOpen(prev => !prev);
  }, []);

  if (isLoading) {
    return (
      <div className={`${className} flex items-center gap-2 opacity-50 cursor-wait`}>
        <div className="animate-spin h-3 w-3 border-2 border-blue-500 rounded-full border-t-transparent"></div>
        <span className="text-xs">{t('common:loading', 'Loading...')}</span>
      </div>
    );
  }

  if (error) {
    return <div className="text-red-500 text-[10px] mt-1 font-bold uppercase">{error}</div>;
  }

  const selectedLabels = multiple
    ? (Array.isArray(value) ? value.map(v => options.find(o => o.value === v)?.label).filter(Boolean) : [])
    : [options.find(o => o.value === value)?.label].filter(Boolean);

  const dropdownContent = (
    <div
      id={`portal-dropdown-${name}`}
      data-modal-portal="true"
      onMouseDown={(e) => e.stopPropagation()}
      className="fixed z-[9999] bg-white dark:bg-neutral-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-1 duration-200"
      style={{
        top: coords.top + 4,
        left: coords.left,
        width: coords.width,
      }}
    >
      <div className="p-2 border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-neutral-800/20">
        <input
          autoFocus
          type="text"
          placeholder={t('common:search_placeholder', 'Search...')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full px-3 py-1.5 bg-white dark:bg-neutral-900 border border-gray-200 dark:border-gray-700 rounded-xl text-xs focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
        />
      </div>
      <div className="max-h-60 overflow-y-auto custom-scrollbar dark:custom-scrollbar p-1">
        {filteredOptions.length === 0 ? (
          <div className="px-3 py-4 text-center text-xs text-gray-400 italic">
            {t('common:no_results', 'No results found')}
          </div>
        ) : (
          filteredOptions.map((opt) => {
            const isSelected = multiple
              ? (Array.isArray(value) && value.includes(opt.value))
              : value === opt.value;

            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => toggleOption(opt.value)}
                className={`w-full text-left px-3 py-2 rounded-xl text-sm mb-0.5 transition-all flex items-center justify-between group/opt ${isSelected
                  ? 'bg-blue-600 text-white font-bold'
                  : 'hover:bg-blue-50 dark:hover:bg-blue-900/40 text-gray-700 dark:text-gray-300'
                  }`}
              >
                <span>{opt.label}</span>
                {isSelected && (
                  <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                  </svg>
                )}
              </button>
            );
          })
        )}
      </div>
      {multiple && options.length > 0 && (
        <div className="p-2 border-t border-gray-100 dark:border-gray-800 flex justify-end">
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            className="text-[10px] uppercase font-black text-blue-600 dark:text-blue-400 hover:underline"
          >
            {t('common:done', 'Done')}
          </button>
        </div>
      )}
    </div>
  );

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        disabled={disabled}
        onClick={openDropdown}
        className={`${className} w-full text-left flex items-center justify-between group transition-all duration-200 ${isOpen ? 'ring-2 ring-blue-500/20 border-blue-500 shadow-md' : ''}`}
      >
        <div className="truncate flex-1 pr-2">
          {selectedLabels.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {multiple ? (
                <span className="text-gray-900 dark:text-white text-sm font-medium">
                  {selectedLabels.length === 1
                    ? t('selected_count_one', '{{count}} selected', { count: 1 })
                    : t('selected_count_other', '{{count}} selected', { count: selectedLabels.length })}
                </span>
              ) : (
                <span className="text-gray-900 dark:text-white text-sm font-medium">{selectedLabels[0]}</span>
              )}
            </div>
          ) : (
            <span className="text-gray-400 text-sm">{t('common:select_placeholder', 'Select...')}</span>
          )}
        </div>
        <svg
          className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${isOpen ? 'rotate-180 text-blue-500' : ''}`}
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.06l3.71-3.83a.75.75 0 111.08 1.04l-4.25 4.4a.75.75 0 01-1.08 0l-4.25-4.4a.75.75 0 01.02-1.06z" clipRule="evenodd" />
        </svg>
      </button>

      {isOpen && typeof document !== 'undefined' && createPortal(dropdownContent, document.body)}
    </div>
  );
}

export default RelationSelector;
