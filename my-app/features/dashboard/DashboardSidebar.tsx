'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { DynamicTableService } from '../../lib/services/dynamic-table.service';
import { IconType } from 'react-icons';
import {
  MdStorefront,
  MdInventory,
  MdAccountBalance,
  MdPeople,
  MdEvent,
  MdSettings,
  MdDescription,
  MdFolder,
  MdOutlineFileOpen,
  MdChevronLeft,
  MdChevronRight,
  MdCampaign,
  MdBusinessCenter,
  MdWork,
  MdAdminPanelSettings,
  MdMoreHoriz
} from 'react-icons/md';
import { HiOutlineTrash } from 'react-icons/hi';
import { useTranslation } from 'next-i18next';

// Define o tipo de dados que esperamos da nossa API
interface SidebarCategory {
  key: string;
  displayName: string;
  i18nKey?: string;
  icon?: string;
  count: number;
}

// Define as props que o componente receberá
interface DashboardSidebarProps {
  onSelectCategory: (categoryKey: string | null) => void;
  selectedCategory: string | null;
  // Seed props (dev only)
  enableDevSeed?: boolean;
  seeding?: boolean;
  onSeed?: () => void;
  seedingText?: string;
  seedDataText?: string;
}

// Categorias padrão que sempre devem aparecer
const DEFAULT_CATEGORIES: SidebarCategory[] = [
  { key: 'commercial', displayName: 'Comercial', i18nKey: 'categories.commercial', icon: 'store', count: 0 },
  { key: 'operations', displayName: 'Operações', i18nKey: 'categories.operations', icon: 'settings', count: 0 },
  { key: 'marketing', displayName: 'Marketing', i18nKey: 'categories.marketing', icon: 'campaign', count: 0 },
  { key: 'business', displayName: 'Negócios', i18nKey: 'categories.business', icon: 'business', count: 0 },
  { key: 'administrative', displayName: 'Administrativo', i18nKey: 'categories.administrative', icon: 'admin', count: 0 },
];

/**
 * Uma barra lateral dinâmica para o dashboard que exibe as categorias de tabelas
 * e permite ao usuário filtrar as tabelas visíveis.
 */
export function DashboardSidebar({
  onSelectCategory,
  selectedCategory,
  enableDevSeed = false,
  seeding = false,
  onSeed,
  seedingText,
  seedDataText
}: DashboardSidebarProps) {
  const { t } = useTranslation('common');
  const [categories, setCategories] = useState<SidebarCategory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);

  // Fallback for props if they are not provided (already using t in parent usually, but safer here)
  const displaySeedingText = seedingText || t('sidebar.seeding', 'Populando...');
  const displaySeedBtnText = seedDataText || t('sidebar.seed_data', 'Popular dados');

  // Load collapse state from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('sidebar_collapsed');
    if (saved === 'true') setIsCollapsed(true);
  }, []);

  const toggleCollapse = useCallback(() => {
    setIsCollapsed(prev => {
      const newState = !prev;
      localStorage.setItem('sidebar_collapsed', String(newState));
      return newState;
    });
  }, []);

  useEffect(() => {
    async function fetchSidebarData() {
      try {
        setIsLoading(true);
        const result = await DynamicTableService.getSidebar();

        // Merge API categories with Defaults
        const apiCategories = result.data as SidebarCategory[];
        const existingKeys = new Set(apiCategories.map(c => c.key));

        // Add defaults only if they don't exist in API response
        const newCategories = [...apiCategories];
        DEFAULT_CATEGORIES.forEach(def => {
          if (!existingKeys.has(def.key)) {
            newCategories.push(def);
          }
        });

        setCategories(newCategories);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to load sidebar');
      } finally {
        setIsLoading(false);
      }
    }

    fetchSidebarData();
  }, []);

  const handleDeleteSystem = useCallback(async () => {
    if (isDeleting) return;
    if (!confirm(t('confirmDeleteSystem', 'Are you sure you want to delete the system? This action cannot be undone.'))) return;
    try {
      setIsDeleting(true);
      await DynamicTableService.deleteSystem();
      window.location.href = '/dashboard/setup';
    } catch {
      // Error already handled automatically by apiClient.
    } finally {
      setIsDeleting(false);
    }
  }, [isDeleting, t]);

  if (isLoading) {
    return <div className={`p-4 ${isCollapsed ? 'w-20' : 'w-64'} transition-all text-gray-500 dark:text-gray-400`}>{t('loading')}...</div>;
  }

  if (error) {
    return <div className={`p-4 ${isCollapsed ? 'w-20' : 'w-64'} transition-all text-red-500`}>{t('errorLoading')}</div>;
  }

  const getIcon = (icon?: string): IconType => {
    const iconMap: Record<string, IconType> = {
      'store': MdStorefront,
      'inventory': MdInventory,
      'account_balance': MdAccountBalance,
      'people': MdPeople,
      'event': MdEvent,
      'settings': MdSettings,
      'description': MdDescription,
      'folder': MdFolder,
      'receipt_long': MdDescription,
      'campaign': MdCampaign,
      'business': MdBusinessCenter,
      'admin': MdAdminPanelSettings,
      'work': MdWork
    };
    return icon ? iconMap[icon] || MdOutlineFileOpen : MdOutlineFileOpen;
  };

  return (
    <aside className={`${isCollapsed ? 'w-20' : 'w-64'} bg-gray-50 dark:bg-neutral-900/50 flex flex-col border-r border-gray-200 dark:border-gray-700/50 transition-all duration-300 ease-in-out`}>
      {/* Sidebar Header */}
      <div className={`p-4 flex items-center ${isCollapsed ? 'justify-center' : 'justify-between'} border-b border-gray-100 dark:border-gray-800/50`}>
        {!isCollapsed && <h2 className="text-lg font-semibold text-gray-900 dark:text-white truncate">{t('sidebar.categories_title', 'Categories')}</h2>}
        <button
          onClick={toggleCollapse}
          className="p-1.5 rounded-lg bg-gray-100 dark:bg-neutral-800 text-gray-500 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
          title={isCollapsed ? t('sidebar.expand', 'Expand') : t('sidebar.collapse', 'Collapse')}
        >
          {isCollapsed ? <MdChevronRight size={20} /> : <MdChevronLeft size={20} />}
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto overflow-x-hidden p-2 custom-scrollbar">
        <ul>
          <li className="mb-1">
            <button
              onClick={() => onSelectCategory(null)}
              title={isCollapsed ? t('allTables') : undefined}
              className={`flex items-center w-full px-3 py-2.5 text-left rounded-xl transition-all duration-200 ${selectedCategory === null
                ? 'bg-blue-600 text-white font-semibold'
                : 'text-gray-600 dark:text-gray-400 hover:bg-white dark:hover:bg-neutral-800 shadow-sm border border-transparent hover:border-gray-200 dark:hover:border-neutral-700'
                } ${isCollapsed ? 'justify-center' : ''}`}
            >
              <MdFolder size={20} className={isCollapsed ? '' : 'mr-3'} />
              {!isCollapsed && <span className="truncate">{t('allTables')}</span>}
            </button>
          </li>

          {categories.map(category => {
            const isActive = selectedCategory === category.key;
            return (
              <li key={category.key} className="mb-1">
                <button
                  onClick={() => onSelectCategory(category.key)}
                  title={isCollapsed ? (category.i18nKey ? t(category.i18nKey, category.displayName) : category.displayName) : undefined}
                  className={`
                    flex items-center w-full px-3 py-2.5 rounded-xl transition-all duration-200
                    focus:outline-none focus:ring-2 focus:ring-blue-500
                    ${isActive
                      ? 'bg-blue-600 text-white font-semibold'
                      : 'text-gray-600 dark:text-gray-400 hover:bg-white dark:hover:bg-neutral-800 shadow-sm border border-transparent hover:border-gray-200 dark:hover:border-neutral-700'
                    } ${isCollapsed ? 'justify-center' : ''}
                  `}
                >
                  <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'justify-between w-full'}`}>
                    <div className="flex items-center">
                      {React.createElement(getIcon(category.icon), {
                        size: 20,
                        className: isCollapsed ? '' : 'mr-3'
                      })}
                      {!isCollapsed && <span className="truncate">{category.i18nKey ? t(category.i18nKey, category.displayName) : category.displayName}</span>}
                    </div>
                    {!isCollapsed && category.count > 0 && (
                      <span className={`ml-2 text-xs font-bold px-2 py-0.5 rounded-full ${isActive ? 'bg-white/20 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-500'}`}>
                        {category.count}
                      </span>
                    )}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className={`p-4 border-t border-gray-100 dark:border-gray-800/50 mt-auto space-y-2`}>
        {/* Seed Button - Dev Only */}
        {enableDevSeed && (
          <button
            onClick={onSeed}
            disabled={seeding}
            title={isCollapsed ? (seeding ? seedingText : seedDataText) : undefined}
            className={`
              flex items-center justify-center w-full px-3 py-2.5 rounded-xl text-sm font-bold text-white transition-all duration-200
              ${seeding ? 'bg-blue-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'}
            `}
          >
            {isCollapsed ? (
              seeding ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : '🌱'
            ) : (
              seeding ? seedingText : seedDataText
            )}
          </button>
        )}
        {/* Delete System Button */}
        <button
          onClick={handleDeleteSystem}
          title={isCollapsed ? t('deleteSystem', 'Delete System') : undefined}
          disabled={isDeleting}
          className={`
            flex items-center justify-center w-full px-3 py-2.5 rounded-xl text-sm font-bold text-white transition-all duration-200
            ${isDeleting ? 'bg-red-400' : 'bg-red-500 hover:bg-red-600'}
          `}
        >
          {isCollapsed ? <HiOutlineTrash size={20} /> : (isDeleting ? t('deleting', 'Deleting') + '…' : t('deleteSystem', 'Delete System'))}
        </button>
      </div>
    </aside>
  );
}
