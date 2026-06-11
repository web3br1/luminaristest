'use client';

import React from 'react';

// =============================================================================
// TYPES
// =============================================================================

export interface WizardTab {
    id: string;
    label: string;
    icon?: React.ReactNode;
    badge?: string | number;
    disabled?: boolean;
    hidden?: boolean;
}

interface WizardTabBarProps {
    tabs: WizardTab[];
    activeTab: string;
    onTabChange: (tabId: string) => void;
    className?: string;
}

// =============================================================================
// WIZARD TAB BAR COMPONENT
// =============================================================================

/**
 * A modern tab bar for wizard-style modals.
 * Features smooth animations, optional badges, and icon support.
 */
export function WizardTabBar({
    tabs,
    activeTab,
    onTabChange,
    className = '',
}: WizardTabBarProps) {
    const visibleTabs = tabs.filter(tab => !tab.hidden);
    const activeIndex = visibleTabs.findIndex(tab => tab.id === activeTab);

    return (
        <div className={`border-b border-gray-200 dark:border-gray-700 ${className}`}>
            <nav className="flex gap-1 px-1 overflow-x-auto hide-scrollbar" aria-label="Wizard steps">
                {visibleTabs.map((tab, index) => {
                    const isActive = tab.id === activeTab;
                    const isPast = index < activeIndex;

                    return (
                        <button
                            key={tab.id}
                            type="button"
                            onClick={() => !tab.disabled && onTabChange(tab.id)}
                            disabled={tab.disabled}
                            className={`
                                relative flex items-center gap-2 px-4 py-3 text-sm font-medium
                                transition-all duration-200 whitespace-nowrap
                                focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
                                dark:focus:ring-offset-gray-900 rounded-t-lg
                                ${isActive
                                    ? 'text-blue-600 dark:text-blue-400'
                                    : isPast
                                        ? 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                                        : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-400'
                                }
                                ${tab.disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                            `}
                            aria-current={isActive ? 'step' : undefined}
                        >
                            {/* Step Number or Icon */}
                            {tab.icon ? (
                                <span className="shrink-0">{tab.icon}</span>
                            ) : (
                                <span
                                    className={`
                                        flex items-center justify-center w-6 h-6 rounded-full text-xs font-semibold
                                        transition-colors duration-200
                                        ${isActive
                                            ? 'bg-blue-600 text-white'
                                            : isPast
                                                ? 'bg-emerald-500 text-white'
                                                : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                                        }
                                    `}
                                >
                                    {isPast ? (
                                        <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                        </svg>
                                    ) : (
                                        index + 1
                                    )}
                                </span>
                            )}

                            {/* Label */}
                            <span>{tab.label}</span>

                            {/* Badge */}
                            {tab.badge !== undefined && (
                                <span
                                    className={`
                                        ml-1 px-1.5 py-0.5 text-xs rounded-full
                                        ${isActive
                                            ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300'
                                            : 'bg-gray-100 dark:bg-neutral-800 text-gray-600 dark:text-gray-400'
                                        }
                                    `}
                                >
                                    {tab.badge}
                                </span>
                            )}

                            {/* Active Indicator */}
                            {isActive && (
                                <span
                                    className="absolute inset-x-0 -bottom-px h-0.5 bg-blue-600 dark:bg-blue-400 rounded-full"
                                    style={{ transform: 'translateY(1px)' }}
                                />
                            )}
                        </button>
                    );
                })}
            </nav>
        </div>
    );
}

export default WizardTabBar;
