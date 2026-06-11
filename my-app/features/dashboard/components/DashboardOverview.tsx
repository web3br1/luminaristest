import React, { useMemo } from 'react';
import { useTranslation } from 'next-i18next';
import { useAuth } from '../../../lib/context/AuthContext';
import {
    FiLayout,
    FiBarChart2,
    FiUsers,
    FiPackage,
    FiArrowRight
} from 'react-icons/fi';

interface DashboardOverviewProps {
    onSelectCategory: (category: string) => void;
}

export default function DashboardOverview({ onSelectCategory }: DashboardOverviewProps) {
    const { t, i18n } = useTranslation('common');
    const { user } = useAuth();

    // Localized "weekday, day of month" — locale follows i18n active language with
    // a graceful fallback to the browser language so SSR/first-paint stays correct.
    const formattedDate = useMemo(() => {
        const locale = i18n.language || (typeof navigator !== 'undefined' ? navigator.language : 'en-US');
        return new Date().toLocaleDateString(locale, {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
        });
    }, [i18n.language]);

    const quickStats = [
        { label: t('categories.finance'), icon: FiBarChart2, category: 'finance', color: 'text-emerald-600', bg: 'bg-emerald-50 dark:bg-emerald-500/10' },
        { label: t('categories.people'), icon: FiUsers, category: 'people', color: 'text-blue-600', bg: 'bg-blue-50 dark:bg-blue-500/10' },
        { label: t('categories.commercial'), icon: FiPackage, category: 'commercial', color: 'text-amber-600', bg: 'bg-amber-50 dark:bg-amber-500/10' },
        { label: t('categories.planning'), icon: FiLayout, category: 'planning', color: 'text-purple-600', bg: 'bg-purple-50 dark:bg-purple-500/10' },
    ];

    return (
        <div className="flex-1 p-6 overflow-y-auto bg-white dark:bg-neutral-950">
            <div className="w-full">
                <header className="mb-8 border-b border-neutral-100 dark:border-neutral-800 pb-6">
                    <h1 className="text-2xl font-bold text-neutral-900 dark:text-white mb-1">
                        {t('welcome', 'Welcome')}, {user?.name || user?.username || t('anonymous', 'User')}
                    </h1>
                    <div className="flex items-center gap-3 mt-2">
                        <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-500">
                            <span className="relative flex h-1.5 w-1.5">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75" />
                                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
                            </span>
                            {t('dashboard.overview.status_online', 'Online')}
                        </span>
                        <span className="text-neutral-300 dark:text-neutral-700">·</span>
                        <span className="text-[11px] font-medium text-neutral-500 dark:text-neutral-400 capitalize">
                            {formattedDate}
                        </span>
                    </div>
                </header>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {quickStats.map((stat) => (
                        <button
                            key={stat.category}
                            onClick={() => onSelectCategory(stat.category)}
                            className="flex items-center p-4 rounded-xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 hover:border-blue-500 dark:hover:border-blue-500 hover:shadow-md hover:-translate-y-0.5 transition-all group text-left shadow-sm"
                        >
                            <div className={`p-3 rounded-lg ${stat.bg} ${stat.color} mr-4 transition-transform group-hover:scale-105`}>
                                <stat.icon size={20} />
                            </div>
                            <div className="flex-1 min-w-0">
                                <h3 className="text-sm font-bold text-neutral-900 dark:text-white truncate">{stat.label}</h3>
                                <div className="flex items-center text-[11px] font-medium text-neutral-400 dark:text-neutral-500 group-hover:text-blue-500 transition-colors mt-0.5">
                                    <span className="opacity-0 group-hover:opacity-100 transition-opacity">
                                        {t('dashboard.overview.open', 'Open')}
                                    </span>
                                    <FiArrowRight size={12} className="ml-1 group-hover:translate-x-1 transition-transform" />
                                </div>
                            </div>
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}
