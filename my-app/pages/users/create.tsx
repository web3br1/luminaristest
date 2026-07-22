import React, { useState } from 'react';
import { useRouter } from 'next/router';
import withAuth from '../../lib/hoc/withAuth';
import { Roles } from '../../types/Role';
import { useAuth } from '../../lib/context/AuthContext';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import type { GetServerSidePropsContext, GetServerSidePropsResult, InferGetServerSidePropsType } from 'next';
import { useTranslation } from 'next-i18next';
import { getCookie } from 'cookies-next';
import { UserService } from '../../lib/services/user.service';
import { resolveErrorMessage } from '../../lib/utils/error-handler';

export async function getServerSideProps(context: GetServerSidePropsContext): Promise<GetServerSidePropsResult<Record<string, unknown>>> {
  const { locale } = context;
  return {
    props: {
      ...(await serverSideTranslations(locale ?? 'en', ['common'])),
    },
  };
}

function CreateUserPage(props: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const router = useRouter();
  const { t } = useTranslation('common');
  const { user: actor } = useAuth();

  const initialFormData = {
    name: '',
    username: '',
    email: '',
    password: '',
    role: Roles.USER,
  };

  const [formData, setFormData] = useState(initialFormData);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function handleFormChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
    const { name, value } = e.target;
    function updateFormData(prevState: typeof initialFormData) {
      return { ...prevState, [name]: value };
    }
    setFormData(updateFormData);
    setError(null);
    setSuccessMessage(null);
  }

  async function handleFormSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);
    setLoading(true);

    const payload = {
      name: formData.name,
      username: formData.username,
      email: formData.email,
      password: formData.password,
      role: formData.role,
    };

    try {
      await UserService.createUser(payload);
      setSuccessMessage(t('userCreatedSuccessAdmin', { name: formData.name, role: formData.role }));
      setFormData(initialFormData);
    } catch (err) {
      setError(resolveErrorMessage(err, t));
    } finally {
      setLoading(false);
    }
  }

  const pageTitle = t('adminPanelCreateUserTitle');
  const submitButtonText = loading ? t('creatingUserButtonAdmin') : t('createUserButtonAdmin');

  return (
    <div className="max-w-[1920px] mx-auto px-6 lg:px-12 py-8 mt-[64px]">
      <div className="max-w-2xl mx-auto">
        <div className="mb-6">
          <button
            onClick={() => router.push('/users')}
            className="flex items-center text-sm font-bold text-gray-500 hover:text-indigo-600 dark:text-gray-400 dark:hover:text-indigo-400 transition-colors mb-2"
          >
            ← Voltar para lista
          </button>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white tracking-tight">{pageTitle}</h1>
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400 mt-1">
            Preencha os dados abaixo para cadastrar um novo integrante.
          </p>
        </div>

        {error && (
          <div className="mb-6 flex items-center gap-3 px-4 py-3 rounded-md bg-red-50 dark:bg-red-900/10 border border-red-200/60 dark:border-red-800/30 text-red-600 dark:text-red-400 text-sm font-medium">
            <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
            <span>{error}</span>
          </div>
        )}

        {successMessage && (
          <div className="mb-6 flex items-center gap-3 px-4 py-3 rounded-md bg-green-50 dark:bg-green-900/10 border border-green-200/60 dark:border-green-800/30 text-green-600 dark:text-green-400 text-sm font-medium">
            <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
            <span>{successMessage}</span>
          </div>
        )}

        <form onSubmit={handleFormSubmit} className="space-y-6">
          {/* Sessão 1: Informações Pessoais */}
          <div className="bg-white dark:bg-neutral-900 border border-gray-200/60 dark:border-gray-800/60 rounded-md overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800/60 bg-gray-50/50 dark:bg-neutral-900/50">
              <h3 className="text-[11px] font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400">
                Informações da Conta
              </h3>
            </div>
            <div className="p-6 space-y-5 flex flex-col">

              <div className="flex flex-col gap-1.5 w-full">
                <label htmlFor="name" className="text-sm font-bold text-gray-700 dark:text-gray-300">
                  {t('fullNamePlaceholder')} <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none opacity-50">
                    <svg className="h-4 w-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                  </div>
                  <input
                    id="name"
                    name="name"
                    type="text"
                    required
                    className="w-full pl-9 pr-4 py-2.5 text-sm bg-gray-50 dark:bg-neutral-800 border border-gray-200/60 dark:border-gray-700/60 rounded-md text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition-all font-medium"
                    placeholder="Ex: João da Silva"
                    value={formData.name}
                    onChange={handleFormChange}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 w-full">
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="username" className="text-sm font-bold text-gray-700 dark:text-gray-300">
                    {t('usernamePlaceholder')} <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-400 text-sm font-bold pointer-events-none">
                      @
                    </span>
                    <input
                      id="username"
                      name="username"
                      type="text"
                      required
                      minLength={3}
                      className="w-full pl-8 pr-4 py-2.5 text-sm bg-gray-50 dark:bg-neutral-800 border border-gray-200/60 dark:border-gray-700/60 rounded-md text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition-all font-medium"
                      placeholder="joaosilva"
                      value={formData.username}
                      onChange={handleFormChange}
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label htmlFor="email" className="text-sm font-bold text-gray-700 dark:text-gray-300">
                    {t('emailAddressPlaceholder')} <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none opacity-50">
                      <svg className="h-4 w-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                    </div>
                    <input
                      id="email"
                      name="email"
                      type="email"
                      required
                      className="w-full pl-9 pr-4 py-2.5 text-sm bg-gray-50 dark:bg-neutral-800 border border-gray-200/60 dark:border-gray-700/60 rounded-md text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition-all font-medium"
                      placeholder="joao@luminaris.com"
                      value={formData.email}
                      onChange={handleFormChange}
                    />
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-1.5 w-full">
                <label htmlFor="role" className="text-sm font-bold text-gray-700 dark:text-gray-300">
                  {t('roleLabel', 'Nível de Permissão')} <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <select
                    id="role"
                    name="role"
                    required
                    value={formData.role}
                    onChange={handleFormChange}
                    className="w-full pl-4 pr-10 py-2.5 text-sm bg-gray-50 dark:bg-neutral-800 border border-gray-200/60 dark:border-gray-700/60 rounded-md text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition-all appearance-none font-bold uppercase tracking-wide"
                  >
                    <option value={Roles.USER}>{t('roleOptionUser', 'USER - Acesso Padrão')}</option>
                    <option value={Roles.ADMIN}>{t('roleOptionAdmin', 'ADMIN - Acesso Total')}</option>
                  </select>
                  <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none opacity-50">
                    <svg className="h-4 w-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                  </div>
                </div>
              </div>

            </div>
          </div>

          {/* Sessão 2: Segurança */}
          <div className="bg-white dark:bg-neutral-900 border border-gray-200/60 dark:border-gray-800/60 rounded-md overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800/60 bg-gray-50/50 dark:bg-neutral-900/50">
              <h3 className="text-[11px] font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400">
                Segurança
              </h3>
            </div>
            <div className="p-6 space-y-5 flex flex-col">

              <div className="flex flex-col gap-1.5 w-full">
                <label htmlFor="password" className="text-sm font-bold text-gray-700 dark:text-gray-300">
                  Senha Inicial <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none opacity-50">
                    <svg className="h-4 w-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                  </div>
                  <input
                    id="password"
                    name="password"
                    type="password"
                    required
                    minLength={6}
                    className="w-full pl-9 pr-4 py-2.5 text-sm bg-gray-50 dark:bg-neutral-800 border border-gray-200/60 dark:border-gray-700/60 rounded-md text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition-all font-medium"
                    placeholder={t('passwordMin6CharsPlaceholder')}
                    value={formData.password}
                    onChange={handleFormChange}
                  />
                </div>
                <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1 font-medium">O usuário poderá alterar sua senha depois através da página &quot;Meu Perfil&quot;.</p>
              </div>

            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => router.push('/users')}
              className="h-10 px-5 flex justify-center items-center rounded-md text-sm font-bold text-gray-600 dark:text-gray-400 hover:bg-black/5 dark:hover:bg-white/5 transition-all"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="h-10 px-6 flex justify-center items-center rounded-md text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 transition-all shadow-sm active:scale-95"
            >
              {loading ? (
                <>
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Salvando...
                </>
              ) : (
                submitButtonText
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default withAuth(CreateUserPage, {
  allowedRoles: [Roles.ADMIN],
});