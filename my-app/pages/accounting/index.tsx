import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { GetServerSideProps } from 'next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import { useTranslation } from 'next-i18next';
import { useAuth } from '../../lib/context/AuthContext';
import { AccountingView } from '../../features/accounting/AccountingView';

/**
 * /accounting — top-level page for the deterministic accounting module (first-class
 * Prisma, not a DynamicTable category). Mirrors the auth/i18n pattern of the other
 * fixed modules (users, documents).
 */
function AccountingPage() {
  const { t } = useTranslation('common');
  const { t: tAcc } = useTranslation('accounting');
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace('/users/login');
      return;
    }
    setChecking(false);
  }, [authLoading, user, router]);

  return (
    <>
      <Head>
        <title>{t('appName')} - {tAcc('view.title', 'Contabilidade')}</title>
      </Head>
      <div className="min-h-screen bg-neutral-950 text-neutral-100">
        {checking ? (
          <div className="flex min-h-screen items-center justify-center text-neutral-500">
            {t('verifyingEnvironment')}
          </div>
        ) : (
          <AccountingView />
        )}
      </div>
    </>
  );
}

export default AccountingPage;

export const getServerSideProps: GetServerSideProps = async ({ locale }) => {
  return {
    props: {
      ...(await serverSideTranslations(locale || 'pt', ['common', 'accounting'])),
    },
  };
};
