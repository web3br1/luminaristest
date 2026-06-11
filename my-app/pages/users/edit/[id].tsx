import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { useAuth } from '../../../lib/context/AuthContext';
import withAuth from '../../../lib/hoc/withAuth';
import { IUser } from '../../../types/User';
import type { Role } from '../../../types/Role';
import { Roles } from '../../../types/Role';
import { useTranslation, withTranslation, WithTranslation } from 'next-i18next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import type { GetServerSidePropsContext, GetServerSidePropsResult, InferGetServerSidePropsType } from 'next';
// Using Roles constant for select options
import { getCookie } from 'cookies-next';
import { NextPage } from 'next';
import { UserService } from '../../../lib/services/user.service';
import { resolveErrorMessage } from '../../../lib/utils/error-handler';

export const getServerSideProps = async (context: GetServerSidePropsContext) => {
  const { locale } = context;
  return {
    props: {
      ...(await serverSideTranslations(locale ?? 'en', ['common'])),
    },
  };
};

interface UserEditFormData {
  name: string;
  email: string;
  username: string;
  password?: string;
  role?: Role;
}

interface UserUpdatePayload extends Partial<IUser> {
  password?: string;
}

interface ApiErrorResponse {
  message: string;
  code?: string;
  details?: any[];
}

interface EditUserPageProps extends WithTranslation {
  // Adicione outras props aqui, se necessário
}

function EditUserPageComponent({ t, i18n, ...props }: EditUserPageProps) {
  const router = useRouter();
  const { id: userIdFromQuery } = router.query;
  const userId = typeof userIdFromQuery === 'string' ? userIdFromQuery : undefined;

  const { user: actor, isLoading: authLoading } = useAuth();

  const [formData, setFormData] = useState<Partial<UserEditFormData>>({
    name: '',
    email: '',
    username: '',
    password: '',
    role: actor?.role === 'ADMIN' ? undefined : undefined
  });
  const [originalUser, setOriginalUser] = useState<IUser | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [formLoading, setFormLoading] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);
  const [pageLoading, setPageLoading] = useState(true);
  const [canEdit, setCanEdit] = useState(false);

  const fetchUserData = useCallback(async () => {
    if (!userId || !actor) {
      if (!authLoading && !actor) {
        setPageError(t("userEditAuthRequired"));
        setPageLoading(false);
      }
      return;
    }

    setPageLoading(true);
    setPageError(null);
    setSuccess(null);
    setError(null);

    try {
      const userData = await UserService.getUserById(userId);

      if (!userData) {
        throw new Error('No user data found in response');
      }

      setOriginalUser(userData);

      setFormData(prev => ({
        ...prev,
        name: userData.name || '',
        email: userData.email || '',
        username: userData.username || '',
        role: actor?.role === 'ADMIN' ? (userData.role as Role) : prev.role
      }));

      const userCanEdit = actor?.id === userData.id || actor?.role === 'ADMIN';
      setCanEdit(userCanEdit);

      if (!userCanEdit) {
        setPageError(t("userEditNotAuthorized"));
      }

    } catch (err) {
      console.error('Error fetching user data:', err);
      setPageError(resolveErrorMessage(err, t) || t('userEditUnknownFetchError'));
      setOriginalUser(null);
      setCanEdit(false);
    } finally {
      setPageLoading(false);
    }
  }, [userId, actor, authLoading, t]);

  // Efeito para carregar os dados do usuário quando o componente montar ou o userId mudar
  useEffect(() => {
    // Se não tivermos um userId, verifique se estamos esperando pelo router.query
    if (!userId) {
      if (userIdFromQuery === undefined) {
        return; // Ainda esperando pelo router.query
      }
      // Se não houver userId e não estivermos mais esperando, é um erro
      setPageError(t("userEditInvalidId"));
      setPageLoading(false);
      setCanEdit(false);
      return;
    }

    // Se chegamos até aqui, temos um userId válido
    const loadUserData = async () => {
      try {
        await fetchUserData();
      } catch (error) {
        console.error('Error loading user data:', error);
      }
    };

    loadUserData();
  }, [userId, userIdFromQuery]);

  function handleFormChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    setError(null);
    setSuccess(null);
  }

  async function handleFormSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!canEdit || !originalUser || !userId) return;

    setError(null);
    setSuccess(null);
    setFormLoading(true);

    const updatePayload: UserUpdatePayload = {};

    // Apenas adiciona ao payload se o valor for diferente do original
    if (formData.name !== undefined && formData.name !== originalUser.name) {
      updatePayload.name = formData.name;
    }

    if (formData.email !== undefined && formData.email !== originalUser.email) {
      updatePayload.email = formData.email;
    }

    if (formData.username !== undefined && formData.username !== originalUser.username) {
      updatePayload.username = formData.username;
    }

    // Verifica se há uma nova senha e se ela atende aos requisitos
    if (formData.password && formData.password.length > 0) {
      if (formData.password.length < 6) {
        setError(t("userEditPasswordTooShort"));
        setFormLoading(false);
        return;
      }
      updatePayload.password = formData.password;
    }

    // Apenas administradores podem alterar a role
    if (actor?.role === 'ADMIN' && formData.role && formData.role !== originalUser.role) {
      updatePayload.role = formData.role;
    }

    // Se não houver alterações, não faz a requisição
    if (Object.keys(updatePayload).length === 0) {
      setSuccess(t("noChangesDetected"));
      setFormLoading(false);
      return;
    }

    try {
      const updatedUser = await UserService.updateProfile(userId, updatePayload as any);

      if (!updatedUser) {
        throw new Error(t('userEditInvalidResponseData', 'Invalid data structure in API response'));
      }

      // Atualiza o estado com os novos dados
      setOriginalUser(updatedUser);
      setSuccess(t('userEditUpdateSuccess'));

      // Atualiza o formulário mantendo a senha limpa
      setFormData(prev => ({
        ...prev,
        name: updatedUser.name || '',
        email: updatedUser.email || '',
        username: updatedUser.username || '',
        password: '', // Limpa a senha após o envio
        role: actor?.role === 'ADMIN' ? (updatedUser.role || undefined) : prev.role
      }));

    } catch (err) {
      setError(resolveErrorMessage(err, t));
    } finally {
      setFormLoading(false);
    }
  }

  if (authLoading || (pageLoading && !pageError)) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <p className="text-xl text-gray-700 dark:text-gray-300">{t('userEditLoadingData')}</p>
      </div>
    );
  }

  if (pageError) {
    return (
      <div className="flex flex-col justify-center items-center min-h-screen text-center px-4">
        <p className="text-xl text-red-600 dark:text-red-400 mb-4">{t('errorLabel')} {pageError}</p>
        <Link
          href="/users"
          className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors"
        >
          {t('userEditBackToList')}
        </Link>
      </div>
    );
  }

  if (!canEdit || !originalUser) {
    return (
      <div className="flex flex-col justify-center items-center min-h-screen text-center px-4">
        <p className="text-xl text-red-600 dark:text-red-400 mb-2">{t('userEditCannotEditOrNotFound')}</p>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">{t('userEditCannotEditOrNotFoundReason')}</p>
        <Link href="/users" className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors">
          {t('userEditGoToListLink')}
        </Link>
      </div>
    );
  }

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
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white tracking-tight">{t('userEditTitle')}</h1>
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400 mt-1">
            Atualize as informações, permissões e opções de segurança.
          </p>
        </div>

        {error && (
          <div className="mb-6 flex items-center gap-3 px-4 py-3 rounded-md bg-red-50 dark:bg-red-900/10 border border-red-200/60 dark:border-red-800/30 text-red-600 dark:text-red-400 text-sm font-medium">
            <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="mb-6 flex items-center gap-3 px-4 py-3 rounded-md bg-green-50 dark:bg-green-900/10 border border-green-200/60 dark:border-green-800/30 text-green-600 dark:text-green-400 text-sm font-medium">
            <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
            <span>{success}</span>
          </div>
        )}

        <form onSubmit={handleFormSubmit} className="space-y-6">
          {/* Sessão 1: Informações Pessoais */}
          <div className="bg-white dark:bg-neutral-900 border border-gray-200/60 dark:border-gray-800/60 rounded-md overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800/60 bg-gray-50/50 dark:bg-neutral-900/50 flex justify-between items-center">
              <h3 className="text-[11px] font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400">
                Informações da Conta
              </h3>
              <span className="text-[11px] font-mono text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-neutral-800 px-2 py-0.5 rounded">
                ID: {originalUser.id}
              </span>
            </div>
            <div className="p-6 space-y-5 flex flex-col">

              <div className="flex flex-col gap-1.5 w-full">
                <label htmlFor="name" className="text-sm font-bold text-gray-700 dark:text-gray-300">
                  {t('userEditNameLabel', 'Nome Completo')} <span className="text-red-500">*</span>
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
                    placeholder={t('userEditNamePlaceholder', 'Nome completo')}
                    value={formData.name || ''}
                    onChange={handleFormChange}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 w-full">
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="username" className="text-sm font-bold text-gray-700 dark:text-gray-300">
                    {t('userEditUsernameLabel', 'Nome de Usuário')} <span className="text-red-500">*</span>
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
                      placeholder={t('userEditUsernamePlaceholder', 'nome_de_usuario')}
                      value={formData.username || ''}
                      onChange={handleFormChange}
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label htmlFor="email" className="text-sm font-bold text-gray-700 dark:text-gray-300">
                    {t('userEditEmailLabel', 'Email Institucional')} <span className="text-red-500">*</span>
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
                      placeholder={t('userEditEmailPlaceholder', 'email@luminaris.com')}
                      value={formData.email || ''}
                      onChange={handleFormChange}
                    />
                  </div>
                </div>
              </div>

              {actor?.role === 'ADMIN' && (
                <div className="flex flex-col gap-1.5 w-full">
                  <label htmlFor="role" className="text-sm font-bold text-gray-700 dark:text-gray-300">
                    {t('userEditRoleLabel', 'Nível de Permissão')} <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <select
                      id="role"
                      name="role"
                      value={formData.role || ''}
                      onChange={handleFormChange}
                      className="w-full pl-4 pr-10 py-2.5 text-sm bg-gray-50 dark:bg-neutral-800 border border-gray-200/60 dark:border-gray-700/60 rounded-md text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition-all appearance-none font-bold uppercase tracking-wide"
                    >
                      <option value={Roles.USER}>{t('userEditRoleUser', 'USER - Acesso Padrão')}</option>
                      <option value={Roles.ADMIN}>{t('userEditRoleAdmin', 'ADMIN - Acesso Total')}</option>
                    </select>
                    <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none opacity-50">
                      <svg className="h-4 w-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                    </div>
                  </div>
                </div>
              )}
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
                  {t('userEditPasswordLabel', 'Redefinir Senha')}
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none opacity-50">
                    <svg className="h-4 w-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                  </div>
                  <input
                    id="password"
                    name="password"
                    type="password"
                    className="w-full pl-9 pr-4 py-2.5 text-sm bg-gray-50 dark:bg-neutral-800 border border-gray-200/60 dark:border-gray-700/60 rounded-md text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition-all font-medium"
                    placeholder={t('userEditPasswordPlaceholder', 'Deixe em branco para não alterar')}
                    value={formData.password || ''}
                    onChange={handleFormChange}
                  />
                </div>
                <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1 font-medium">{t('userEditPasswordHelp', 'Mínimo de 6 caracteres. Só preencha se quiser mudar a senha atual.')}</p>
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
              disabled={formLoading || !canEdit}
              className="h-10 px-6 flex justify-center items-center rounded-md text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 transition-all shadow-sm active:scale-95"
            >
              {formLoading ? (
                <>
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Salvando...
                </>
              ) : (
                t('userEditSaveButton', 'Salvar Alterações')
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Tipagem para o componente de página
interface PageProps extends InferGetServerSidePropsType<typeof getServerSideProps> { }

// Aplicar withTranslation primeiro
const EditUserPageWithTranslation = withTranslation('common')(EditUserPageComponent);

// Criar um componente wrapper para o withAuth
const AuthenticatedEditUserPage: React.FC<PageProps> = (props) => {
  return <EditUserPageWithTranslation {...props} />;
};

// Configuração do withAuth
const withAuthConfig = {
  allowedRoles: [Roles.USER, Roles.ADMIN],
};

// Aplicar o HOC withAuth por último
export default withAuth(AuthenticatedEditUserPage, withAuthConfig);