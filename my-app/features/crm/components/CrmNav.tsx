import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useTranslation } from 'next-i18next';

const ITEMS: { href: string; key: string; fallback: string }[] = [
  { href: '/crm', key: 'nav.overview', fallback: 'Visão Geral' },
  { href: '/crm/pipeline', key: 'nav.pipeline', fallback: 'Pipeline' },
  { href: '/crm/opportunities', key: 'nav.opportunities', fallback: 'Oportunidades' },
  { href: '/crm/contacts', key: 'nav.contacts', fallback: 'Contatos' },
  { href: '/crm/accounts', key: 'nav.accounts', fallback: 'Contas' },
  { href: '/crm/proposals', key: 'nav.proposals', fallback: 'Propostas' },
  { href: '/crm/activities', key: 'nav.activities', fallback: 'Atividades' },
  { href: '/crm/meetings', key: 'nav.meetings', fallback: 'Reuniões' },
  { href: '/crm/analytics', key: 'nav.analytics', fallback: 'Analytics' },
];

/** Shared CRM module navigation — links every CRM screen and highlights the active one. */
export function CrmNav() {
  const router = useRouter();
  const { t } = useTranslation('crm');
  return (
    <nav className="mb-6 flex flex-wrap gap-1 border-b border-gray-200 dark:border-white/5">
      {ITEMS.map((item) => {
        const active = router.pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`-mb-px border-b-2 px-3 py-2.5 text-[11px] font-black uppercase tracking-widest transition ${
              active
                ? 'border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400'
                : 'border-transparent text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
            }`}
          >
            {t(item.key, item.fallback)}
          </Link>
        );
      })}
    </nav>
  );
}
