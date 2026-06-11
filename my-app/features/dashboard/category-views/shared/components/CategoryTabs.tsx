'use client';

import React from 'react';

export interface CategoryTabItem {
    id: string;
    label: string;
    icon?: React.ElementType;
    count?: number;
}

export type CategoryThemeColor = 'purple' | 'blue' | 'indigo' | 'gray';

interface CategoryTabsProps {
    tabs: CategoryTabItem[];
    activeTabId: string;
    onTabChange: (id: string) => void;
    colorTheme?: CategoryThemeColor;
}

export default function CategoryTabs({
    tabs,
    activeTabId,
    onTabChange,
    colorTheme = 'purple'
}: CategoryTabsProps) {
    const themeMap = {
        purple: {
            activeBorder: 'border-purple-600',
            activeText: 'text-purple-600 dark:text-purple-400',
            activeCountBg: 'bg-purple-100 dark:bg-purple-900/30',
            activeCountText: 'text-purple-700 dark:text-purple-300',
        },
        blue: {
            activeBorder: 'border-blue-600',
            activeText: 'text-blue-600 dark:text-blue-400',
            activeCountBg: 'bg-blue-100 dark:bg-blue-900/30',
            activeCountText: 'text-blue-700 dark:text-blue-300',
        },
        indigo: {
            activeBorder: 'border-indigo-600',
            activeText: 'text-indigo-600 dark:text-indigo-400',
            activeCountBg: 'bg-indigo-100 dark:bg-indigo-900/30',
            activeCountText: 'text-indigo-700 dark:text-indigo-300',
        },
        gray: {
            activeBorder: 'border-gray-600',
            activeText: 'text-gray-800 dark:text-gray-200',
            activeCountBg: 'bg-gray-200 dark:bg-neutral-800',
            activeCountText: 'text-gray-800 dark:text-gray-300',
        }
    };

    const theme = themeMap[colorTheme];

    return (
        <div className="bg-white dark:bg-neutral-900 border-b border-gray-200 dark:border-gray-800 px-4 sticky top-0 z-10 transition-colors">
            <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
                {tabs.map(tab => {
                    const isActive = activeTabId === tab.id;
                    const Icon = tab.icon;
                    return (
                        <button
                            key={tab.id}
                            onClick={() => onTabChange(tab.id)}
                            className={`
                                flex items-center gap-2 px-4 py-3 text-sm font-medium transition-all border-b-2 whitespace-nowrap tracking-tight
                                ${isActive
                                    ? `${theme.activeBorder} ${theme.activeText}`
                                    : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:border-gray-200 dark:hover:border-gray-700'
                                }
                            `}
                        >
                            {Icon && <Icon size={18} />}
                            {tab.label}
                            {tab.count !== undefined && (
                                <span className={`
                                    ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold
                                    ${isActive
                                        ? `${theme.activeCountBg} ${theme.activeCountText}`
                                        : 'bg-gray-100 dark:bg-neutral-800 text-gray-500 dark:text-gray-400 group-hover:bg-gray-200 dark:group-hover:bg-neutral-700'
                                    }
                                `}>
                                    {tab.count}
                                </span>
                            )}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
