import React, { useState, useEffect, FormEvent } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { useAuth } from '../../lib/context/AuthContext';
import withAuth from '../../lib/hoc/withAuth';
import { IUser, UpdateUserDto } from '../../types/User';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import type { GetServerSideProps, InferGetServerSidePropsType } from 'next';
import { useTranslation } from 'next-i18next';
import { getCookie } from 'cookies-next';
import {
  IoPersonOutline,
  IoMailOutline,
  IoKeyOutline,
  IoShieldCheckmarkOutline,
  IoCheckmarkCircleOutline,
  IoCloseCircleOutline,
  IoWarningOutline,
  IoAtOutline,
  IoCalendarOutline,
  IoFingerPrintOutline,
  IoSparklesOutline,
  IoChevronForwardOutline,
  IoDiamondOutline,
  IoGlobeOutline,
  IoCashOutline,
} from 'react-icons/io5';
import { SUPPORTED_CURRENCIES } from '../../lib/context/CurrencyContext';

export const getServerSideProps: GetServerSideProps = async ({ locale }) => ({
  props: {
    ...(await serverSideTranslations(locale ?? 'en', ['common'])),
  },
});

interface UserProfileFormData {
  name: string;
  email: string;
  username: string;
  password?: string;
}

type UserProfileUpdatePayload = Partial<Omit<UpdateUserDto, 'role'> & { username?: string; email?: string }>;

interface ApiErrorResponse {
  message: string;
  code?: string;
  details?: any[];
}

// Mock subscription data
const PLAN_LABELS: Record<string, string> = {
  free: 'Gratuito',
  basic: 'Básico',
  pro: 'Pro',
  enterprise: 'Enterprise',
};

const PLAN_COLORS: Record<string, { bg: string; text: string; border: string; glow: string }> = {
  free: {
    bg: 'bg-gray-100 dark:bg-gray-800/40',
    text: 'text-gray-600 dark:text-gray-400',
    border: 'border-gray-200 dark:border-gray-700/50',
    glow: '',
  },
  basic: {
    bg: 'bg-blue-50 dark:bg-blue-500/10',
    text: 'text-blue-600 dark:text-blue-400',
    border: 'border-blue-200 dark:border-blue-500/20',
    glow: '',
  },
  pro: {
    bg: 'bg-violet-50 dark:bg-violet-500/10',
    text: 'text-violet-600 dark:text-violet-400',
    border: 'border-violet-200 dark:border-violet-500/20',
    glow: 'shadow-violet-500/5',
  },
  enterprise: {
    bg: 'bg-amber-50 dark:bg-amber-500/10',
    text: 'text-amber-600 dark:text-amber-400',
    border: 'border-amber-200 dark:border-amber-500/20',
    glow: 'shadow-amber-500/5',
  },
};

import { resolveErrorMessage } from '../../lib/utils/error-handler';
import { UserService } from '../../lib/services/user.service';

function UserProfilePage(props: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const { t } = useTranslation('common');
  const router = useRouter();
  const { user: actor, isLoading: authLoading, login: updateAuthContext } = useAuth();

  // Mock current plan — purely visual
  const [currentPlan] = useState<string>('free');

  const [formData, setFormData] = useState<Partial<UserProfileFormData>>({
    name: actor?.name || '',
    email: actor?.email || '',
    username: actor?.username || '',
    password: ''
  });

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [formLoading, setFormLoading] = useState(false);
  const [adminLoading, setAdminLoading] = useState(false);

  // Preferences state
  const [preferencesLocale, setPreferencesLocale] = useState(actor?.locale || 'en');
  const [preferencesCurrency, setPreferencesCurrency] = useState(actor?.currency || 'BRL');
  const [prefLoading, setPrefLoading] = useState(false);
  const [prefSuccess, setPrefSuccess] = useState<string | null>(null);
  const [prefError, setPrefError] = useState<string | null>(null);

  // Sync form data when actor loads
  useEffect(() => {
    if (actor) {
      setFormData({
        name: actor.name || '',
        email: actor.email || '',
        username: actor.username || '',
        password: ''
      });
      setPreferencesLocale(actor.locale || 'en');
      setPreferencesCurrency(actor.currency || 'BRL');
    }
  }, [actor]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value || '' }));
    setError(null);
    setSuccess(null);
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!actor) return;

    setError(null);
    setSuccess(null);
    setFormLoading(true);

    const payload: UserProfileUpdatePayload = {};

    if (formData.name && formData.name !== actor.name) payload.name = formData.name;
    if (formData.email && formData.email !== actor.email) payload.email = formData.email;
    if (formData.username && formData.username !== actor.username) payload.username = formData.username;

    if (formData.password && formData.password.length > 0) {
      if (formData.password.length < 6) {
        setError(t('passwordTooShortErrorProfile', 'New password must be at least 6 characters long.'));
        setFormLoading(false);
        return;
      }
      payload.password = formData.password;
    }

    if (Object.keys(payload).length === 0) {
      setSuccess(t('noChangesDetected', "No changes detected."));
      setFormLoading(false);
      return;
    }

    try {
      // Use centralized UserService
      const updatedUser = await UserService.updateProfile(actor.id, payload);

      setSuccess(t('profileUpdatedSuccess', 'Profile updated successfully!'));

      const newFormData = { ...formData };
      if (updatedUser.name !== undefined) newFormData.name = updatedUser.name ?? '';
      if (updatedUser.email !== undefined) newFormData.email = updatedUser.email;
      if (updatedUser.username !== undefined) newFormData.username = updatedUser.username;
      newFormData.password = '';
      setFormData(newFormData);

      if (updatedUser && updateAuthContext) {
        updateAuthContext({
          ...actor,
          id: updatedUser.id || actor?.id,
          name: updatedUser.name || actor?.name,
          email: updatedUser.email || actor?.email,
          username: updatedUser.username || actor?.username,
          role: updatedUser.role || actor?.role,
        });
      }
    } catch (err) {
      setError(resolveErrorMessage(err, t));
    } finally {
      setFormLoading(false);
    }
  };

  const handleSavePreferences = async () => {
    if (!actor) return;
    setPrefLoading(true);
    setPrefSuccess(null);
    setPrefError(null);

    try {
      // Save to DB
      await UserService.updatePreferences({ locale: preferencesLocale, currency: preferencesCurrency });

      // Update auth context
      if (updateAuthContext) {
        updateAuthContext({ ...actor, locale: preferencesLocale, currency: preferencesCurrency });
      }

      // Sync locale if changed
      if (preferencesLocale !== router.locale) {
        router.replace(router.asPath, router.asPath, { locale: preferencesLocale });
      }

      setPrefSuccess(t('preferencesSaved', 'Preferências salvas com sucesso!'));
    } catch (err) {
      setPrefError(resolveErrorMessage(err, t));
    } finally {
      setPrefLoading(false);
    }
  };

  // ⚠️ TEMPORARY: Make user an admin for testing
  const handleMakeAdmin = async () => {
    if (!actor) return;
    setAdminLoading(true);
    setError(null);
    setSuccess(null);

    try {
      // Use centralized UserService
      const updatedUser = await UserService.changeRole(actor.id, 'ADMIN');
      setSuccess('Role updated to ADMIN! Refreshing...');

      if (updateAuthContext) {
        updateAuthContext({
          ...actor,
          role: updatedUser.role || 'ADMIN',
        });
      }

      setTimeout(() => router.reload(), 1000);
    } catch (err) {
      setError(resolveErrorMessage(err, t));
    } finally {
      setAdminLoading(false);
    }
  };

  if (authLoading || !actor) {
    return (
      <div className="flex justify-center items-center min-h-screen bg-gray-50 dark:bg-neutral-950">
        <div className="flex items-center gap-3 text-gray-500 dark:text-gray-400">
          <div className="w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
          {t('loadingProfile', 'Loading profile...')}
        </div>
      </div>
    );
  }

  const memberSince = (actor as any).createdAt
    ? new Date((actor as any).createdAt).toLocaleDateString(router.locale, { year: 'numeric', month: 'long', day: 'numeric' })
    : '—';

  const planStyle = PLAN_COLORS[currentPlan] || PLAN_COLORS.free;

  return (
    <div className="min-h-[calc(100vh-60px)] bg-gray-50 dark:bg-neutral-950 relative">

      <div className="relative z-10 max-w-[1920px] mx-auto px-6 lg:px-12 py-10">
        {/* Page Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white tracking-tight">{t('myProfile')}</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {t('profileDescription', 'Manage your account information and security settings.')}
          </p>
        </div>

        {/* Alerts */}
        {error && (
          <div className="mb-6 flex items-center gap-3 px-4 py-3 rounded-xl bg-red-50 dark:bg-red-900/10 border border-red-200/60 dark:border-red-800/30 text-red-600 dark:text-red-400 text-sm font-medium transition-all duration-300">
            <IoCloseCircleOutline size={18} className="shrink-0" />
            {error}
          </div>
        )}
        {success && (
          <div className="mb-6 flex items-center gap-3 px-4 py-3 rounded-xl bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-200/60 dark:border-emerald-800/30 text-emerald-600 dark:text-emerald-400 text-sm font-medium transition-all duration-300">
            <IoCheckmarkCircleOutline size={18} className="shrink-0" />
            {success}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-8">
          {/* ═══════════════════════════════════════════════════════ */}
          {/* LEFT SIDEBAR                                            */}
          {/* ═══════════════════════════════════════════════════════ */}
          <div className="space-y-6">
            {/* Profile Card */}
            <div className="bg-white dark:bg-neutral-900 border border-gray-200 dark:border-gray-800 rounded-lg shadow-sm overflow-hidden">
              {/* Solid top accent */}
              <div className="h-20 bg-gray-100 dark:bg-neutral-800 border-b border-gray-200 dark:border-gray-800 relative" />

              <div className="px-6 pb-6">
                {/* Avatar */}
                <div className="flex flex-col items-center text-center -mt-10">
                  <div className="relative">
                    <div className="w-20 h-20 rounded bg-indigo-600 dark:bg-indigo-500 flex items-center justify-center text-white text-2xl font-bold ring-4 ring-white dark:ring-neutral-900 shadow">
                      {actor.username?.charAt(0).toUpperCase()}
                    </div>
                    <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-emerald-500 border-[3px] border-white dark:border-neutral-900 rounded-full" />
                  </div>

                  <h2 className="text-lg font-bold text-gray-900 dark:text-white mt-4 tracking-tight">{actor.name}</h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">@{actor.username}</p>

                  <span className="mt-3 inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-500/10 px-3 py-1.5 rounded-sm border border-indigo-100 dark:border-indigo-500/20">
                    <IoShieldCheckmarkOutline size={12} />
                    {actor.role}
                  </span>
                </div>

                {/* Info rows */}
                <div className="mt-6 pt-5 border-t border-gray-100 dark:border-gray-800/60 space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-gray-100 dark:bg-neutral-800 flex items-center justify-center shrink-0">
                      <IoMailOutline size={15} className="text-gray-500 dark:text-gray-400" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Email</p>
                      <p className="text-sm text-gray-700 dark:text-gray-300 truncate font-medium" title={actor.email}>{actor.email}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-gray-100 dark:bg-neutral-800 flex items-center justify-center shrink-0">
                      <IoFingerPrintOutline size={15} className="text-gray-500 dark:text-gray-400" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">ID</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 font-mono truncate" title={actor.id}>{actor.id}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-gray-100 dark:bg-neutral-800 flex items-center justify-center shrink-0">
                      <IoCalendarOutline size={15} className="text-gray-500 dark:text-gray-400" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">{t('memberSince', 'Membro desde')}</p>
                      <p className="text-sm text-gray-700 dark:text-gray-300 font-medium">{memberSince}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* ─── Subscription Card ─── */}
            <div className="bg-white dark:bg-neutral-900 border border-gray-200 dark:border-gray-800 rounded-lg shadow-sm overflow-hidden">
              <div className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className={`w-8 h-8 rounded shrink-0 ${planStyle.bg} flex items-center justify-center`}>
                      <IoDiamondOutline size={15} className={planStyle.text} />
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Plano Atual</p>
                      <p className={`text-sm font-bold ${planStyle.text}`}>{PLAN_LABELS[currentPlan] || 'Gratuito'}</p>
                    </div>
                  </div>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
                  Gerencie sua assinatura e aproveite mais recursos.
                </p>
                <Link
                  href="/users/subscription"
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-bold text-white dark:text-gray-900 bg-gray-900 dark:bg-white hover:bg-gray-800 dark:hover:bg-gray-100 rounded transition-colors active:scale-[0.98]"
                >
                  <IoSparklesOutline size={16} />
                  Gerenciar Assinatura
                  <IoChevronForwardOutline size={14} />
                </Link>
              </div>
            </div>

            {/* ⚠️ TEMP: Make Admin Button */}
            {actor.role !== 'ADMIN' && (
              <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-200/60 dark:border-amber-800/30 rounded-2xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <IoWarningOutline size={16} className="text-amber-500" />
                  <span className="text-[10px] font-bold uppercase tracking-widest text-amber-600 dark:text-amber-400">
                    {t('makeAdminDevOnly')}
                  </span>
                </div>
                <p className="text-xs text-amber-700 dark:text-amber-300/80 mb-3">
                  {t('makeAdminWarning')}
                </p>
                <button
                  onClick={handleMakeAdmin}
                  disabled={adminLoading}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-[11px] font-bold text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-900/20 hover:bg-amber-200 dark:hover:bg-amber-900/30 rounded-xl transition-all disabled:opacity-50"
                >
                  {adminLoading ? t('makeAdminUpdating') : t('makeAdminButtonText')}
                </button>
              </div>
            )}
          </div>

          {/* ═══════════════════════════════════════════════════════ */}
          {/* RIGHT CONTENT — Form Sections                          */}
          {/* ═══════════════════════════════════════════════════════ */}
          <div className="space-y-6">
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* ─── Section 1: Personal Information ─── */}
              <div className="bg-white dark:bg-neutral-900 border border-gray-200 dark:border-gray-800 rounded-lg shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-neutral-800/10">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded shrink-0 bg-indigo-50 dark:bg-indigo-500/10 flex items-center justify-center">
                      <IoPersonOutline size={16} className="text-indigo-600 dark:text-indigo-400" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-gray-900 dark:text-white">{t('personalInfoSection', 'Informações Pessoais')}</h3>
                      <p className="text-xs text-gray-500 mt-0.5">{t('personalInfoDescription', 'Atualize seu nome, nome de usuário e email.')}</p>
                    </div>
                  </div>
                </div>

                <div className="p-6 space-y-5">
                  {/* ── Name Input ── */}
                  <div>
                    <label htmlFor="name" className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                      {t('fullNameLabel', 'Nome Completo')}
                    </label>
                    <input
                      type="text"
                      name="name"
                      id="name"
                      required
                      autoComplete="name"
                      className="block w-full px-4 py-2.5 bg-white dark:bg-neutral-900 border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-white rounded focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all placeholder:text-gray-400"
                      placeholder={t('userEditNamePlaceholder', 'Nome completo')}
                      value={formData.name}
                      onChange={handleChange}
                    />
                  </div>

                  {/* ── Username Input ── */}
                  <div>
                    <label htmlFor="username" className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                      {t('usernameLabel', 'Nome de Usuário')}
                    </label>
                    <input
                      type="text"
                      name="username"
                      id="username"
                      required
                      minLength={3}
                      autoComplete="username"
                      className="block w-full px-4 py-2.5 bg-white dark:bg-neutral-900 border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-white rounded focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all placeholder:text-gray-400"
                      placeholder={t('userEditUsernamePlaceholder', 'nome_de_usuario')}
                      value={formData.username}
                      onChange={handleChange}
                    />
                  </div>

                  {/* ── Email Input ── */}
                  <div>
                    <label htmlFor="email" className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                      {t('emailLabel', 'Email')}
                    </label>
                    <input
                      type="email"
                      name="email"
                      id="email"
                      required
                      autoComplete="email"
                      className="block w-full px-4 py-2.5 bg-white dark:bg-neutral-900 border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-white rounded focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all placeholder:text-gray-400"
                      placeholder={t('userEditEmailPlaceholder', 'email@luminaris.com')}
                      value={formData.email}
                      onChange={handleChange}
                    />
                  </div>
                </div>
              </div>

              {/* ─── Section 2: Security ─── */}
              <div className="bg-white dark:bg-neutral-900 border border-gray-200 dark:border-gray-800 rounded-lg shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-neutral-800/10">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded shrink-0 bg-amber-50 dark:bg-amber-500/10 flex items-center justify-center">
                      <IoKeyOutline size={16} className="text-amber-600 dark:text-amber-400" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-gray-900 dark:text-white">{t('securitySection', 'Segurança')}</h3>
                      <p className="text-xs text-gray-500 mt-0.5">{t('securityDescription', 'Altere sua senha. Deixe em branco para manter a atual.')}</p>
                    </div>
                  </div>
                </div>

                <div className="p-6">
                  <div>
                    <label htmlFor="password" className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                      {t('newPasswordOptionalLabel', 'Nova Senha (opcional)')}
                    </label>
                    <input
                      type="password"
                      name="password"
                      id="password"
                      autoComplete="new-password"
                      className="block w-full px-4 py-2.5 bg-white dark:bg-neutral-900 border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-white rounded focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all placeholder:text-gray-400"
                      placeholder={t('passwordPlaceholderProfile', 'Deixe em branco para manter a senha atual')}
                      value={formData.password}
                      onChange={handleChange}
                    />
                    <p className="mt-2 text-[11px] text-gray-400 font-medium">
                      {t('passwordHelpTextProfile', 'Mínimo de 6 caracteres para alterar a senha.')}
                    </p>
                  </div>
                </div>
              </div>

              {/* ─── Section 3: Region Preferences ─── */}
              <div className="bg-white dark:bg-neutral-900 border border-gray-200 dark:border-gray-800 rounded-lg shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-neutral-800/10">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded shrink-0 bg-emerald-50 dark:bg-emerald-500/10 flex items-center justify-center">
                      <IoGlobeOutline size={16} className="text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-gray-900 dark:text-white">{t('regionPreferencesSection', 'Preferências de Região')}</h3>
                      <p className="text-xs text-gray-500 mt-0.5">{t('regionPreferencesDescription', 'Idioma da interface e moeda padrão para valores financeiros.')}</p>
                    </div>
                  </div>
                </div>

                <div className="p-6 space-y-5">
                  {/* Feedback alerts for preferences */}
                  {prefError && (
                    <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-red-50 dark:bg-red-900/10 border border-red-200/60 dark:border-red-800/30 text-red-600 dark:text-red-400 text-sm font-medium">
                      <IoCloseCircleOutline size={16} className="shrink-0" />
                      {prefError}
                    </div>
                  )}
                  {prefSuccess && (
                    <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-200/60 dark:border-emerald-800/30 text-emerald-600 dark:text-emerald-400 text-sm font-medium">
                      <IoCheckmarkCircleOutline size={16} className="shrink-0" />
                      {prefSuccess}
                    </div>
                  )}

                  {/* Language dropdown */}
                  <div>
                    <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                      {t('languageLabel', 'Idioma')}
                    </label>
                    <div className="relative">
                      <IoGlobeOutline size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                      <select
                        value={preferencesLocale}
                        onChange={(e) => setPreferencesLocale(e.target.value)}
                        className="block w-full pl-9 pr-4 py-2.5 bg-white dark:bg-neutral-900 border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-white rounded focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-sm"
                      >
                        <option value="pt">🇧🇷 Português (BR)</option>
                        <option value="en">🇺🇸 English (US)</option>
                      </select>
                    </div>
                  </div>

                  {/* Currency dropdown */}
                  <div>
                    <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                      {t('currencyLabel', 'Moeda')}
                    </label>
                    <div className="relative">
                      <IoCashOutline size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                      <select
                        value={preferencesCurrency}
                        onChange={(e) => setPreferencesCurrency(e.target.value)}
                        className="block w-full pl-9 pr-4 py-2.5 bg-white dark:bg-neutral-900 border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-white rounded focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-sm"
                      >
                        {SUPPORTED_CURRENCIES.map((c) => (
                          <option key={c.code} value={c.code}>
                            {c.flag} {c.label} ({c.symbol})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Save preferences button */}
                  <div className="flex justify-end pt-1">
                    <button
                      type="button"
                      onClick={handleSavePreferences}
                      disabled={prefLoading}
                      className="h-10 px-5 flex items-center gap-2 rounded text-sm font-bold focus:ring-2 focus:ring-emerald-500/20 disabled:opacity-50 transition-colors bg-emerald-600 hover:bg-emerald-700 text-white active:scale-[0.98]"
                    >
                      {prefLoading && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                      {prefLoading ? t('savingChangesButton', 'Salvando...') : t('savePreferencesButton', 'Salvar Preferências')}
                    </button>
                  </div>
                </div>
              </div>

              {/* ─── Action Buttons ─── */}

              <div className="flex items-center justify-end gap-3 pt-2">
                <Link
                  href="/"
                  className="h-10 px-4 flex items-center rounded text-sm font-bold text-gray-700 dark:text-gray-300 bg-white dark:bg-neutral-900 hover:bg-gray-50 dark:hover:bg-neutral-800 border border-gray-300 dark:border-gray-700 transition-colors"
                >
                  {t('cancelButton', 'Cancelar')}
                </Link>
                <button
                  type="submit"
                  disabled={formLoading || authLoading}
                  className="h-10 px-5 flex items-center gap-2 rounded text-sm font-bold focus:ring-2 focus:ring-indigo-500/20 disabled:opacity-50 transition-colors bg-gray-900 dark:bg-white text-white dark:text-gray-900 hover:bg-gray-800 dark:hover:bg-gray-100 active:scale-[0.98]"
                >
                  {formLoading && (
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  )}
                  {formLoading ? t('savingChangesButton', 'Salvando...') : t('saveChangesButton', 'Salvar Alterações')}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

export default withAuth(UserProfilePage, {
  allowedRoles: ['AUTHENTICATED_USER'],
});
