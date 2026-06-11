'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { MdClose, MdSearch } from 'react-icons/md';
import { useTranslation } from 'next-i18next';

interface RelationCellProps {
  value: unknown;
  lookup?: Map<string, string>;
}

export function RelationCell({ value, lookup }: RelationCellProps) {
  const { t } = useTranslation('common');
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const badgeRef = useRef<HTMLSpanElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Resolve ID -> label
  const resolve = (v: unknown): string => {
    const s = String(v);
    return lookup?.get(s) ?? s;
  };

  const items: string[] = Array.isArray(value)
    ? value.map(resolve)
    : value != null && value !== ''
    ? [resolve(value)]
    : [];

  // Calcular posicao do popover ao abrir
  const handleOpen = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();

    if (!badgeRef.current) return;
    const rect = badgeRef.current.getBoundingClientRect();
    const POPOVER_WIDTH = 240;
    const POPOVER_APPROX_HEIGHT = 280;

    let top = rect.bottom + 6;
    let left = rect.left;

    if (left + POPOVER_WIDTH > window.innerWidth - 12) {
      left = window.innerWidth - POPOVER_WIDTH - 12;
    }

    if (top + POPOVER_APPROX_HEIGHT > window.innerHeight - 12) {
      top = rect.top - POPOVER_APPROX_HEIGHT - 6;
    }

    setPos({ top, left });
    setSearch('');
    setOpen(true);
  }, []);

  // Fechar ao clicar fora ou pressionar Escape
  useEffect(() => {
    if (!open) return;

    const handleMouseDown = (e: MouseEvent) => {
      if (
        popoverRef.current && !popoverRef.current.contains(e.target as Node) &&
        badgeRef.current && !badgeRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  // Vazio
  if (items.length === 0) {
    return <span className="text-gray-400 dark:text-gray-600">&#8212;</span>;
  }

  // Valor unico
  if (items.length === 1) {
    return (
      <span
        className="truncate max-w-full inline-block text-xs text-gray-700 dark:text-gray-300"
        title={items[0]}
      >
        {items[0]}
      </span>
    );
  }

  // Multiplos
  const showSearch = items.length > 10;
  const filtered = search.trim()
    ? items.filter(i => i.toLowerCase().includes(search.toLowerCase()))
    : items;

  const popover = open ? (
    <div
      ref={popoverRef}
      style={{ position: 'fixed', top: pos.top, left: pos.left, width: 240, zIndex: 9999 }}
      className="bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-700 rounded-xl shadow-2xl overflow-hidden"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 dark:border-neutral-800">
        <span className="text-[11px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-wider">
          {t('relation_cell_items', '{{count}} items', { count: items.length })}
        </span>
        <button
          onClick={(e) => { e.stopPropagation(); setOpen(false); }}
          className="p-0.5 rounded text-gray-400 hover:text-gray-700 dark:hover:text-white transition-colors"
        >
          <MdClose size={14} />
        </button>
      </div>

      {/* Busca - so aparece com 11+ itens */}
      {showSearch && (
        <div className="px-2 py-1.5 border-b border-gray-100 dark:border-neutral-800">
          <div className="flex items-center gap-1.5 bg-gray-50 dark:bg-neutral-800 rounded-lg px-2 py-1">
            <MdSearch size={13} className="text-gray-400 shrink-0" />
            <input
              autoFocus
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={t('search_placeholder', 'Search...')}
              className="w-full bg-transparent text-xs text-gray-700 dark:text-gray-300 placeholder-gray-400 outline-none"
            />
          </div>
        </div>
      )}

      {/* Lista */}
      <ul className="overflow-y-auto" style={{ maxHeight: 224 }}>
        {filtered.length === 0 ? (
          <li className="px-3 py-4 text-xs text-gray-400 text-center">{t('no_results', 'No results found')}</li>
        ) : (
          filtered.map((item, i) => (
            <li
              key={i}
              className="px-3 py-2 text-xs text-gray-700 dark:text-gray-300 border-b border-gray-50 dark:border-neutral-800/50 last:border-0 hover:bg-gray-50 dark:hover:bg-neutral-800/50 truncate"
              title={item}
            >
              {item}
            </li>
          ))
        )}
      </ul>
    </div>
  ) : null;

  return (
    <>
      <span
        ref={badgeRef}
        onClick={open ? (e) => { e.stopPropagation(); setOpen(false); } : handleOpen}
        className="cursor-pointer inline-flex items-center px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 text-[10px] font-bold select-none whitespace-nowrap hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors"
      >
        {t('relation_cell_items', '{{count}} items', { count: items.length })}
      </span>

      {/* Portal - renderiza fora da tabela, evita overflow clipping */}
      {open && typeof document !== 'undefined' && createPortal(popover, document.body)}
    </>
  );
}
