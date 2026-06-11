import { useRouter } from 'next/router';
import { getCookie, deleteCookie } from 'cookies-next';
import { useAuth } from '../../lib/context/AuthContext';
import type { IDynamicTable } from '../../features/dashboard/components/shared/dynamic-tables.client';
import { useEffect, useState } from 'react';
import { DynamicTableService } from '../../lib/services/dynamic-table.service';
import { DashboardSidebar } from '../../features/dashboard/DashboardSidebar';
import { PeopleView } from '../../features/dashboard/category-views/people/PeopleView';
import PlanningView from '../../features/dashboard/category-views/planning/PlanningView';
import KanbanView from '../../features/dashboard/category-views/kanban/KanbanView';
import InternalProductsView from '../../features/dashboard/category-views/products/InternalProductsView';
import ServicesView from '../../features/dashboard/category-views/services/ServicesView';
import LeadsView from '../../features/dashboard/category-views/leads/LeadsView';
import InventoryView from '../../features/dashboard/category-views/inventory/InventoryView';
import FinanceView from '../../features/dashboard/category-views/finance/FinanceView';
// Usar o novo CategoryView (Tabbed) para visualizações genéricas
import GenericTabbedView from '../../features/dashboard/category-views/shared/GenericTabbedView';
import { isNavigable } from '../../features/dashboard/category-views/shared/utils/presentationUtils';
import DashboardOverview from '../../features/dashboard/components/DashboardOverview';
import { GetServerSideProps } from 'next';
import { runDevSeed } from '../../features/dev/seed';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import { useTranslation } from 'next-i18next';
import Head from 'next/head';

interface DashboardPageProps {
  allTables: IDynamicTable[];
}

function DashboardPage({ allTables }: DashboardPageProps) {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const { t } = useTranslation('common');

  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  useEffect(() => {
    if (router.isReady && router.query.category) {
      setSelectedCategory(router.query.category as string);
    }
  }, [router.isReady, router.query.category]);
  const [tables, setTables] = useState<IDynamicTable[]>(allTables || []);
  const [seeding, setSeeding] = useState(false);
  const [enableDevSeed, setEnableDevSeed] = useState(false);

  // Decide se o botão de seed deve aparecer sem precisar rebuild:
  useEffect(() => {
    let enabled = process.env.NEXT_PUBLIC_ENABLE_DEV_SEED === 'true';
    if (typeof window !== 'undefined') {
      try {
        const url = new URL(window.location.href);
        if (url.searchParams.get('devSeed') === '1') {
          window.localStorage.setItem('enable_dev_seed', 'true');
          enabled = true;
        }
        if (window.localStorage.getItem('enable_dev_seed') === 'true') {
          enabled = true;
        }
      } catch { }
    }
    setEnableDevSeed(enabled);
  }, []);

  // Optional auto-run seed once per session when enabled
  useEffect(() => {
    const autorun = (process.env.NEXT_PUBLIC_ENABLE_DEV_SEED_AUTORUN === 'true') && enableDevSeed;
    if (!autorun || seeding) return;
    if (!user || !tables || tables.length === 0) return;
    if (typeof window === 'undefined') return;
    if (window.sessionStorage.getItem('dev_seed_ran') === '1') return;
    (async () => {
      try {
        setSeeding(true);
        await runDevSeed(tables, () => { });
        window.sessionStorage.setItem('dev_seed_ran', '1');
        const j = await DynamicTableService.getTables().catch(() => ({}));
        if (Array.isArray(j?.data)) setTables(j.data);
      } catch (e: unknown) {
        console.error('Seed failed:', e);
      } finally {
        setSeeding(false);
      }
    })();
  }, [user, tables, seeding, enableDevSeed]);

  useEffect(() => {
    async function fetchTables() {
      try {
        if (!user) return;
        const body = await DynamicTableService.getTables();
        if (Array.isArray(body?.data)) {
          setTables(body.data);
        }
      } catch { }
    }
    fetchTables();
  }, [user]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push('/users/login');
    }
  }, [user, authLoading, router]);

  const filteredTables = selectedCategory
    ? tables.filter(table => table.category === selectedCategory)
    : [];

  function handleSelectCategory(category: string | null) {
    setSelectedCategory(category);
  }

  if (authLoading) {
    return (
      <div className="flex h-[calc(100vh-60px)] items-center justify-center">
        <p className="text-lg text-gray-500 dark:text-gray-400">{t('loading')}...</p>
      </div>
    );
  }

  const renderByCategory = (categoryKey: string, filtered: IDynamicTable[], all: IDynamicTable[]) => {
    switch (categoryKey) {
      case 'people':
        return <PeopleView tables={all} />;
      case 'planning': {
        const planningTables = all.filter(table => table.category === 'planning');
        return <PlanningView tables={planningTables} />;
      }
      case 'leads':
        return <LeadsView tables={filtered} />;
      case 'kanban':
        return <KanbanView tables={all} />;
      case 'products':
        return <InternalProductsView tables={all} />;
      case 'services':
        return <ServicesView tables={filtered} />;
      case 'inventory':
        return <InventoryView tables={all} />;
      case 'finance':
        return <FinanceView tables={all} />;
      default:
        return null;
    }
  };

  function renderContent() {
    if (!selectedCategory) {
      return <DashboardOverview onSelectCategory={handleSelectCategory} />;
    }

    if (selectedCategory && filteredTables.length === 0 && selectedCategory.toLowerCase() !== 'sales') {
      return (
        <div className="text-center py-10">
          <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200">{t('emptyCategoryTitle')}</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">{t('emptyCategoryMessage')}</p>
        </div>
      );
    }

    const rendered = renderByCategory(selectedCategory.toLowerCase(), filteredTables, tables);
    if (rendered) return rendered;

    // Default Fallback: Use Standard Tabbed View for any category not explicitly handled above
    // (Commercial, Marketing, Business, Administrative, etc.)
    // Filter out embedded and system tables — only standalone tables are navigable.
    return (
      <GenericTabbedView
        tables={filteredTables.filter(isNavigable)}
        title={t('tablesInCategory', { category: selectedCategory })}
        description={t('tablesInCategoryDesc')}
      />
    );
  }

  return (
    <>
      <Head>
        <title>{t('appName')} - Dashboard</title>
      </Head>
      <div className="flex h-[calc(100vh-60px)] overflow-hidden bg-neutral-50 dark:bg-neutral-950">
        <DashboardSidebar
          onSelectCategory={handleSelectCategory}
          selectedCategory={selectedCategory}
          enableDevSeed={enableDevSeed}
          seeding={seeding}
          onSeed={async () => {
            try {
              setSeeding(true);
              await runDevSeed(tables, () => { });
              const j = await DynamicTableService.getTables().catch(() => ({}));
              if (Array.isArray(j?.data)) setTables(j.data);
            } catch (e: unknown) {
              console.error('Manual seed failed:', e);
            } finally {
              setSeeding(false);
            }
          }}
          seedingText={t('seeding')}
          seedDataText={t('seedData')}
        />
        <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
            {renderContent()}
          </div>
        </main>
      </div>
    </>
  );
}

export default DashboardPage;

export const getServerSideProps: GetServerSideProps = async (context) => {
  const { req, res } = context;
  const locale = context.locale || 'pt';

  // Extract token directly from raw cookie header to avoid getCookie returning an object
  let token: string | undefined;
  const cookieHeader = req.headers.cookie || '';
  const cookies = cookieHeader.split(';').map(c => c.trim());
  const authCookie = cookies.find(c => c.startsWith('auth_token='));
  if (authCookie) {
    token = decodeURIComponent(authCookie.split('=')[1] || '').trim();
    // Strip quotes if present
    if (token.startsWith('"') && token.endsWith('"')) {
      token = token.substring(1, token.length - 1);
    }
    if (!token) token = undefined;
  }

  console.log('[Dashboard SSR] Checking auth status...', { hasToken: !!token, tokenLength: token?.length });

  const translations = await serverSideTranslations(locale, [
    'common',
    'database',
    'inventory_view',
    'products_view',
    'finance_view',
    'analytics',
    'chatMessages'
  ]);

  if (!token) {
    console.log('[Dashboard SSR] No token found, redirecting to login');
    return {
      redirect: {
        destination: `/users/login`,
        permanent: false,
      },
    };
  }

  const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3001';
  console.log('[Dashboard SSR] Validating token...', { tokenPreview: token.substring(0, 20), tokenLength: token.length });

  const response = await fetch(`${baseUrl}/dynamic-tables`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Cookie': req.headers.cookie || '',
    },
  });

  console.log('[Dashboard SSR] API response status:', response.status);

  if (response.status === 401 || response.status === 403) {
    console.log('[Dashboard SSR] Auth failed (401/403), deleting cookie and redirecting');
    deleteCookie('auth_token', { req, res });
    return {
      redirect: {
        destination: `/users/login`,
        permanent: false,
      },
    };
  }

  if (!response.ok) {
    console.log('[Dashboard SSR] API request failed (not ok), redirecting');
    return {
      redirect: {
        destination: `/users/login`,
        permanent: false,
      },
    };
  }

  const body = await response.json().catch(() => ({ data: [] }));
  const tables = body.data || [];

  console.log('[Dashboard SSR] Found tables count:', tables.length);

  if (!tables || tables.length === 0) {
    console.log('[Dashboard SSR] No tables, redirecting to setup');
    return {
      redirect: {
        destination: `/dashboard/setup`,
        permanent: false,
      },
    };
  }

  console.log('[Dashboard SSR] Auth success, rendering dashboard');
  return {
    props: {
      allTables: tables,
      ...translations,
    },
  };
};
