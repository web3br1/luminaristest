import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useAuth } from '../../lib/context/AuthContext';
import withAuth from '../../lib/hoc/withAuth';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import type { GetServerSideProps, InferGetServerSidePropsType } from 'next';
import { useTranslation } from 'next-i18next';
import { setCookie } from 'cookies-next';
import { resolveErrorMessage } from '../../lib/utils/error-handler';
import { AuthService } from '../../lib/services/auth.service';
import { AuthSplitLayout } from '../../components/layout/AuthSplitLayout';
import { FiMail, FiLock, FiAlertCircle, FiCheckCircle } from 'react-icons/fi';

export const getServerSideProps: GetServerSideProps = async ({ locale }) => ({
  props: {
    ...(await serverSideTranslations(locale ?? 'en', ['common'])),
  },
});

function LoginPage(props: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const { t } = useTranslation('common');
  const router = useRouter();
  const { login, isLoading: authLoading } = useAuth();
  const [formData, setFormData] = useState({ identifier: '', password: '' });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showCreatedMessage, setShowCreatedMessage] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

  useEffect(() => {
    if (router.query.created === 'true') {
      setShowCreatedMessage(true);
      const { pathname, query } = router;
      delete query.created;
      router.replace({ pathname, query }, undefined, { shallow: true });
    }
  }, [router]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prevState => ({ ...prevState, [name]: value }));
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    setShowCreatedMessage(false);

    try {
      const result = await AuthService.login(formData);

      setCookie('auth_token', result.data.token, {
        maxAge: rememberMe ? 60 * 60 * 24 * 30 : 60 * 60 * 24, // 30 dias se lembrar, senão 24h
        path: '/',
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict'
      });

      login({
        ...result.data.user,
        name: result.data.user.name ?? '',
        locale: result.data.user.locale ?? 'en',
        currency: result.data.user.currency ?? 'BRL',
      });
      router.push('/');

    } catch (err) {
      setError(resolveErrorMessage(err, t));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthSplitLayout 
      title={t('signInToYourAccount')} 
      subtitle={t('welcomeMessage', { appName: 'Luminaris' })}
    >
      {showCreatedMessage && (
        <div className="mb-6 p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-100 dark:border-emerald-500/20 text-emerald-700 dark:text-emerald-400 flex items-start gap-3 animate-in fade-in zoom-in duration-300">
          <FiCheckCircle className="mt-1 flex-shrink-0" size={18} />
          <div className="text-sm">
            <strong className="block font-bold">{t('accountCreatedSuccess')}</strong> 
            {t('pleaseLogIn')}
          </div>
        </div>
      )}

      {error && (
        <div className="mb-6 p-4 rounded-2xl bg-red-50 dark:bg-red-500/10 border border-red-100 dark:border-red-500/20 text-red-700 dark:text-red-400 flex items-start gap-3 animate-in shake duration-500">
          <FiAlertCircle className="mt-1 flex-shrink-0" size={18} />
          <p className="text-sm font-medium">{error}</p>
        </div>
      )}

      <form className="space-y-5" onSubmit={handleSubmit}>
        <div className="space-y-4">
          <div className="group">
            <label htmlFor="identifier" className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2 group-focus-within:text-blue-600 transition-colors">
              {t('usernameOrEmailPlaceholder')}
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-6 flex items-center pointer-events-none text-slate-400 group-focus-within:text-blue-500 transition-colors">
                <FiMail size={20} />
              </div>
              <input
                id="identifier"
                name="identifier"
                type="text"
                autoComplete="username"
                required
                className="block w-full !pl-16 pr-4 py-4 bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 text-slate-900 dark:text-white rounded-2xl focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all placeholder:text-slate-400"
                placeholder={t('emailInputPlaceholder')}
                value={formData.identifier}
                onChange={handleChange}
              />
            </div>
          </div>

          <div className="group">
            <div className="flex items-center justify-between mb-2">
              <label htmlFor="password" className="block text-sm font-bold text-slate-700 dark:text-slate-300 group-focus-within:text-blue-600 transition-colors">
                {t('passwordPlaceholder')}
              </label>
              <Link href="#" className="text-xs font-bold text-blue-600 hover:text-blue-700 transition-colors">
                {t('forgotPassword', 'Esqueceu a senha?')}
              </Link>
            </div>
            <div className="relative">
              <div className="absolute inset-y-0 left-6 flex items-center pointer-events-none text-slate-400 group-focus-within:text-blue-500 transition-colors">
                <FiLock size={20} />
              </div>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                className="block w-full !pl-16 pr-4 py-4 bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 text-slate-900 dark:text-white rounded-2xl focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all placeholder:text-slate-400"
                placeholder="••••••••"
                value={formData.password}
                onChange={handleChange}
              />
            </div>
          </div>
        </div>

        <div className="flex items-center">
          <label className="flex items-center gap-3 cursor-pointer group">
            <div className="relative flex items-center h-5 w-5">
              <input
                type="checkbox"
                className="peer h-5 w-5 cursor-pointer appearance-none rounded-lg border border-slate-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 checked:bg-blue-600 checked:border-blue-600 transition-all focus:ring-4 focus:ring-blue-500/10"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
              />
              <svg className="absolute w-3.5 h-3.5 text-white opacity-0 peer-checked:opacity-100 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none transition-opacity" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
            </div>
            <span className="text-sm font-medium text-slate-600 dark:text-slate-400 group-hover:text-slate-900 dark:group-hover:text-slate-200 transition-colors">
              {t('rememberMe', 'Lembrar-me por 30 dias')}
            </span>
          </label>
        </div>

        <button
          type="submit"
          disabled={loading || authLoading}
          className="w-full flex justify-center items-center py-4 px-6 bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-base font-bold rounded-2xl hover:bg-slate-800 dark:hover:bg-slate-100 focus:ring-4 focus:ring-blue-500/20 active:scale-[0.98] transition-all disabled:opacity-50 disabled:active:scale-100 mt-2 shadow-xl shadow-slate-900/10 dark:shadow-none"
        >
          {loading ? (
            <div className="flex items-center gap-3">
              <div className="w-5 h-5 border-2 border-white/30 border-t-white dark:border-slate-900/30 dark:border-t-slate-900 rounded-full animate-spin" />
              <span>{t('signingInButton')}</span>
            </div>
          ) : t('signInButton')}
        </button>

        <div className="pt-8 text-center border-t border-slate-100 dark:border-neutral-900">
          <p className="text-slate-500 dark:text-slate-500">
            {t('dontHaveAccount')}{' '}
            <Link href="/users/signup" className="font-bold text-blue-600 hover:text-blue-700 transition-colors">
              {t('signUpLink')}
            </Link>
          </p>
        </div>
      </form>
    </AuthSplitLayout>
  );
}

export default withAuth(LoginPage, {
  allowedRoles: ['PUBLIC'],
  redirectIfAuthenticated: '/',
});
 