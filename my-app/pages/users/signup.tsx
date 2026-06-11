import React, { useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import withAuth from '../../lib/hoc/withAuth';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import type { GetServerSideProps, InferGetServerSidePropsType } from 'next';
import { useTranslation } from 'next-i18next';
import { resolveErrorMessage } from '../../lib/utils/error-handler';
import { AuthService } from '../../lib/services/auth.service';
import { AuthSplitLayout } from '../../components/layout/AuthSplitLayout';
import { FiUser, FiMail, FiLock, FiAlertCircle, FiArrowRight } from 'react-icons/fi';

export const getServerSideProps: GetServerSideProps = async ({ locale }) => ({
  props: {
    ...(await serverSideTranslations(locale ?? 'en', ['common'])),
  },
});

function SignupPage(props: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const { t } = useTranslation('common');
  const router = useRouter();
  const [formData, setFormData] = useState({
    name: '',
    username: '',
    email: '',
    password: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [queryLoading, setQueryLoading] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prevState => ({ ...prevState, [name]: value }));
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setQueryLoading(true);

    try {
      await AuthService.signup(formData);
      router.push('/users/login?created=true');
    } catch (err: unknown) {
      setError(resolveErrorMessage(err, t));
    } finally {
      setQueryLoading(false);
    }
  };

  return (
    <AuthSplitLayout 
      title={t('createYourAccountTitle')} 
      subtitle={t('joinCommunity')}
    >
      {error && (
        <div className="mb-6 p-4 rounded-2xl bg-red-50 dark:bg-red-500/10 border border-red-100 dark:border-red-500/20 text-red-700 dark:text-red-400 flex items-start gap-3 animate-in shake duration-500">
          <FiAlertCircle className="mt-1 flex-shrink-0" size={18} />
          <p className="text-sm font-medium">{error}</p>
        </div>
      )}

      <form className="space-y-4" onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 gap-4">
          <div className="group">
            <label htmlFor="name" className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1.5 group-focus-within:text-blue-600 transition-colors">
              {t('fullNamePlaceholder')}
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-6 flex items-center pointer-events-none text-slate-400 group-focus-within:text-blue-500 transition-colors">
                <FiUser size={20} />
              </div>
              <input
                id="name"
                name="name"
                type="text"
                autoComplete="name"
                required
                className="block w-full !pl-16 pr-4 py-3 bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 text-slate-900 dark:text-white rounded-2xl focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all placeholder:text-slate-400"
                placeholder={t('nameInputPlaceholder')}
                value={formData.name}
                onChange={handleChange}
              />
            </div>
          </div>

          <div className="group">
            <label htmlFor="username" className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1.5 group-focus-within:text-blue-600 transition-colors">
              {t('usernamePlaceholder')}
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-6 flex items-center pointer-events-none text-slate-400 group-focus-within:text-blue-500 transition-colors">
                <FiUser size={20} className="opacity-50" />
              </div>
              <input
                id="username"
                name="username"
                type="text"
                autoComplete="username"
                required
                minLength={3}
                className="block w-full !pl-16 pr-4 py-3 bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 text-slate-900 dark:text-white rounded-2xl focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all placeholder:text-slate-400"
                placeholder={t('usernameInputPlaceholder')}
                value={formData.username}
                onChange={handleChange}
              />
            </div>
          </div>

          <div className="group">
            <label htmlFor="email" className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1.5 group-focus-within:text-blue-600 transition-colors">
              {t('emailAddressPlaceholder')}
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-6 flex items-center pointer-events-none text-slate-400 group-focus-within:text-blue-500 transition-colors">
                <FiMail size={20} />
              </div>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                className="block w-full !pl-16 pr-4 py-3 bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 text-slate-900 dark:text-white rounded-2xl focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all placeholder:text-slate-400"
                placeholder={t('emailInputPlaceholder')}
                value={formData.email}
                onChange={handleChange}
              />
            </div>
          </div>

          <div className="group">
            <label htmlFor="password" className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1.5 group-focus-within:text-blue-600 transition-colors">
              {t('passwordPlaceholder')}
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-6 flex items-center pointer-events-none text-slate-400 group-focus-within:text-blue-500 transition-colors">
                <FiLock size={20} />
              </div>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                required
                minLength={6}
                className="block w-full !pl-16 pr-4 py-3 bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 text-slate-900 dark:text-white rounded-2xl focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all placeholder:text-slate-400"
                placeholder="••••••••"
                value={formData.password}
                onChange={handleChange}
              />
            </div>
            <p className="mt-1.5 text-[11px] text-slate-500 leading-tight">
              {t('passwordMin6CharsPlaceholder')}
            </p>
          </div>
        </div>

        <button
          type="submit"
          disabled={queryLoading}
          className="w-full flex justify-center items-center gap-3 py-4 px-6 bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-base font-bold rounded-2xl hover:bg-slate-800 dark:hover:bg-slate-100 focus:ring-4 focus:ring-blue-500/20 active:scale-[0.98] transition-all disabled:opacity-50 disabled:active:scale-100 mt-4 shadow-xl shadow-slate-900/10 dark:shadow-none"
        >
          {queryLoading ? (
            <div className="w-5 h-5 border-2 border-white/30 border-t-white dark:border-slate-900/30 dark:border-t-slate-900 rounded-full animate-spin" />
          ) : (
            <>
              <span>{t('signUpButtonText')}</span>
              <FiArrowRight />
            </>
          )}
        </button>

        <div className="pt-6 text-center border-t border-slate-100 dark:border-neutral-900 mt-4">
          <p className="text-slate-500 dark:text-slate-500">
            {t('alreadyHaveAccount')}{' '}
            <Link href="/users/login" className="font-bold text-blue-600 hover:text-blue-700 transition-colors">
              {t('loginLinkText')}
            </Link>
          </p>
        </div>
      </form>
    </AuthSplitLayout>
  );
}

export default withAuth(SignupPage, {
  allowedRoles: ['PUBLIC'],
  redirectIfAuthenticated: '/',
});
 