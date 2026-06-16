import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { IUser } from '../../types/User';
import withAuth from '../../lib/hoc/withAuth';
import { Roles } from '../../types/Role';
import { useAuth } from '../../lib/context/AuthContext';
import { useTranslation, Trans } from 'next-i18next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import type { GetServerSideProps, GetServerSidePropsContext, GetServerSidePropsResult } from 'next';
import { getCookie } from 'cookies-next';
import { UserService } from '../../lib/services/user.service';
import { resolveErrorMessage } from '../../lib/utils/error-handler';

// MODIFIED: getServerSideProps refactored
export async function getServerSideProps(context: GetServerSidePropsContext): Promise<GetServerSidePropsResult<Record<string, unknown>>> {
  const { locale } = context;
  return {
    props: {
      ...(await serverSideTranslations(locale ?? 'en', ['common'])),
    },
  };
}

interface UserListPageProps { }

interface PaginationInfo {
  page: number;
  limit: number;
  totalCount: number;
  totalPages: number;
}

function UserListPage({ }: UserListPageProps) {
  const { t } = useTranslation('common');
  const router = useRouter();
  const { user: actor } = useAuth();

  const [users, setUsers] = useState<IUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [pagination, setPagination] = useState<PaginationInfo | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const limit = 6;

  // MODIFIED: fetchUsersCallback for useCallback
  async function fetchUsersCallback(pageToFetch: number) {
    setLoading(true);
    setError(null);
    try {
      const data = await UserService.getUsers(pageToFetch, limit);
      setUsers(data.data);
      setPagination(data.pagination as PaginationInfo);
      setCurrentPage(data.pagination?.page || 1);
    } catch (err) {
      setError(resolveErrorMessage(err, t));
      setUsers([]);
      setPagination(null);
    } finally {
      setLoading(false);
    }
  }
  const fetchUsers = useCallback(fetchUsersCallback, [limit, t]);

  // MODIFIED: useEffect callback extracted
  function userListEffect() {
    fetchUsers(currentPage);
  }
  useEffect(userListEffect, [fetchUsers, currentPage]);

  // MODIFIED: handleEditUser refactored
  function handleEditUser(userId: string) {
    router.push(`/users/edit/${userId}`);
  }

  // MODIFIED: handleDeleteUser refactored
  async function handleDeleteUser(userId: string) {
    if (actor && actor.id === userId) {
      setActionMessage({ type: 'error', text: t('userListAdminDeleteSelfError') });
      return;
    }
    if (window.confirm(t('userListConfirmDelete'))) {
      setLoading(true);
      setActionMessage(null);
      try {
        await UserService.deleteUser(userId);
        setActionMessage({ type: 'success', text: t('userListDeleteSuccess') });
        const newCurrentPage = (pagination?.totalPages === currentPage && users.length === 1 && currentPage > 1)
          ? currentPage - 1
          : currentPage;
        fetchUsers(newCurrentPage);
      } catch (err) {
        setActionMessage({ type: 'error', text: resolveErrorMessage(err, t) });
      } finally {
        setLoading(false);
      }
    }
  }

  // MODIFIED: setCurrentPage updaters and handlers for pagination
  function updateCurrentPageToPrev(prevPage: number): number {
    return Math.max(prevPage - 1, 1);
  }
  function handlePrevPage() {
    setCurrentPage(updateCurrentPageToPrev);
  }

  function updateCurrentPageToNext(prevPage: number): number {
    if (pagination) {
      return Math.min(prevPage + 1, pagination.totalPages);
    }
    return prevPage; // Should not happen if button is appropriately disabled
  }
  function handleNextPage() {
    if (pagination) {
      setCurrentPage(updateCurrentPageToNext);
    }
  }

  // MODIFIED: Extracted function for clearing action message
  function clearActionMessage() {
    setActionMessage(null);
  }

  return (
    <div className="min-h-[calc(100vh-64px)] mt-[64px] bg-gray-50/50 dark:bg-neutral-950 relative overflow-hidden custom-scrollbar">
      {/* Ambient glows */}
      <div className="absolute top-[-10%] left-[-5%] w-[40%] h-[40%] bg-indigo-500/10 dark:bg-indigo-500/5 blur-[100px] rounded-full pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-5%] w-[40%] h-[40%] bg-purple-500/10 dark:bg-purple-500/5 blur-[100px] rounded-full pointer-events-none" />

      <div className="relative z-10 max-w-[1920px] mx-auto px-6 lg:px-12 py-10">

      {/* Early Returns handled gracefully inside the wrapper */}
      {(loading && users.length === 0 && !actionMessage) ? (
        <div className="flex justify-center items-center py-40">
          <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (error && !actionMessage) ? (
        <div className="flex flex-col justify-center items-center py-40">
          <div className="bg-white/70 dark:bg-neutral-900/60 backdrop-blur-xl border border-gray-200/60 dark:border-white/10 rounded-3xl p-10 shadow-2xl shadow-indigo-500/5 max-w-lg text-center flex flex-col items-center">
            <div className="w-16 h-16 bg-red-50 dark:bg-red-500/10 rounded-full flex items-center justify-center mb-6">
              <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
            </div>
            <p className="text-xl font-bold mb-2 text-gray-900 dark:text-white tracking-tight">{t('userListErrorPrefix')}</p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-8">{error}</p>
            <Link href="/" className="px-6 py-3 rounded-2xl text-sm font-bold shadow-xl shadow-gray-900/10 hover:shadow-gray-900/20 bg-gray-900 dark:bg-white text-white dark:text-gray-900 hover:bg-gray-800 dark:hover:bg-gray-100 transition-all active:scale-95">
              {t('userListGoHomepage')}
            </Link>
          </div>
        </div>
      ) : (
        <>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white tracking-tight">{t('userManagement')}</h1>
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400 mt-1">
            {t('userListSubtitle')}
          </p>
        </div>
        <Link
          href="/users/create"
          className="flex items-center gap-2 rounded-2xl text-sm font-bold focus:ring-4 focus:ring-gray-900/10 dark:focus:ring-white/10 transition-all shadow-xl shadow-gray-900/10 hover:shadow-gray-900/20 bg-gray-900 dark:bg-white text-white dark:text-gray-900 hover:bg-gray-800 dark:hover:bg-gray-100 active:scale-[0.98] py-3 px-6"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
          {t('userListCreateNew')}
        </Link>
      </div>

      {actionMessage && (
        <div className={`mb-6 flex items-center justify-between px-4 py-3 rounded-md text-sm font-medium ${actionMessage.type === 'success' ? 'bg-green-50 dark:bg-green-900/10 border border-green-200/60 dark:border-green-800/30 text-green-600 dark:text-green-400' : 'bg-red-50 dark:bg-red-900/10 border border-red-200/60 dark:border-red-800/30 text-red-600 dark:text-red-400'}`}>
          <span>{actionMessage.text}</span>
          <button onClick={clearActionMessage} className="p-1 hover:bg-black/5 dark:hover:bg-white/5 rounded-md transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
      )}

      {users.length === 0 && !loading && (
        <div className="flex flex-col items-center justify-center py-20 bg-white dark:bg-neutral-900 border border-gray-200/60 dark:border-gray-800/60 rounded-md">
          <div className="w-16 h-16 bg-gray-50 dark:bg-neutral-800 rounded-full flex items-center justify-center mb-4">
            <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
          </div>
          <p className="text-sm font-bold text-gray-900 dark:text-white mb-1">{t('userListNoUsersFound')}</p>
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-6">
            {t('userListNoUsersDesc')}
          </p>
          <Link href="/users/create" className="text-sm font-bold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors">
            {t('userListAddFirst')}
          </Link>
        </div>
      )}

      {users.length > 0 && (
        <div className="bg-white/70 dark:bg-neutral-900/60 backdrop-blur-xl border border-gray-200/60 dark:border-white/10 rounded-3xl overflow-hidden shadow-2xl shadow-indigo-500/5 flex flex-col">
          {/* Table Header Controls */}
          <div className="px-6 py-5 border-b border-gray-100 dark:border-gray-800/60 flex items-center justify-between bg-gray-50/50 dark:bg-neutral-800/20">
            <p className="text-[11px] font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400">
              <Trans
                t={t}
                i18nKey="userListShowingCount"
                values={{ count: users.length, total: pagination?.totalCount ?? 0 }}
                components={{
                  1: <span className="text-indigo-600 dark:text-indigo-400" />,
                  3: <span className="text-indigo-600 dark:text-indigo-400" />
                }}
              />
            </p>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-gray-50/50 dark:bg-neutral-800/20 text-[11px] uppercase tracking-wider font-bold text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-800/60">
                <tr>
                  <th scope="col" className="px-6 py-4">{t('userListTableUser')}</th>
                  <th scope="col" className="px-6 py-4">{t('userListTableEmail')}</th>
                  <th scope="col" className="px-6 py-4">{t('userListTableStatusRole')}</th>
                  <th scope="col" className="px-6 py-4 text-right">{t('userListTableActions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800/60">
                {users.map((userOnCard) => {
                  const isAdminActor = actor?.role === Roles.ADMIN;
                  const canEditUser = isAdminActor;
                  const canDeleteUser = isAdminActor && actor?.id !== userOnCard.id;

                  return (
                    <tr key={userOnCard.id} className="hover:bg-gray-50 dark:hover:bg-white/[0.02] transition-colors group">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 flex-shrink-0 rounded-md bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center text-indigo-700 dark:text-indigo-300 font-bold border border-indigo-200/50 dark:border-indigo-800/30">
                            {userOnCard.username ? userOnCard.username.charAt(0).toUpperCase() : '?'}
                          </div>
                          <div className="flex flex-col">
                            <span className="font-bold text-gray-900 dark:text-white max-w-[200px] truncate" title={userOnCard.name || userOnCard.username}>
                              {userOnCard.name || userOnCard.username}
                            </span>
                            <span className="text-[11px] font-medium text-gray-500 dark:text-gray-400 max-w-[200px] truncate">
                              @{userOnCard.username}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2 text-gray-600 dark:text-gray-300">
                          <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                          <span className="max-w-[200px] truncate" title={userOnCard.email}>{userOnCard.email}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-widest ${userOnCard.role === Roles.ADMIN
                          ? 'bg-indigo-50 text-indigo-700 border border-indigo-200/50 dark:bg-indigo-500/10 dark:text-indigo-300 dark:border-indigo-500/20'
                          : 'bg-gray-100 text-gray-700 border border-gray-200/50 dark:bg-white/5 dark:text-gray-300 dark:border-white/10'
                          }`}>
                          {userOnCard.role}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2 opacity-50 group-hover:opacity-100 transition-opacity">
                          {canEditUser && (
                            <button
                              onClick={() => handleEditUser(userOnCard.id)}
                              className="p-1.5 text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 dark:text-gray-400 dark:hover:text-indigo-400 dark:hover:bg-indigo-500/10 rounded-md transition-colors"
                              title={t('userCardEditUser')}
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                            </button>
                          )}
                          {canDeleteUser && (
                            <button
                              onClick={() => handleDeleteUser(userOnCard.id)}
                              disabled={loading}
                              className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 dark:text-gray-400 dark:hover:text-red-400 dark:hover:bg-red-500/10 rounded-md transition-colors disabled:opacity-50"
                              title={t('userCardDeleteUser')}
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination Footer */}
          {pagination && pagination.totalPages > 1 && (
            <div className="px-6 py-5 border-t border-gray-100 dark:border-gray-800/60 bg-gray-50/50 dark:bg-neutral-800/20 flex justify-between items-center">
              <button
                onClick={handlePrevPage}
                disabled={currentPage === 1 || loading}
                className="px-5 py-2.5 text-xs font-bold bg-white dark:bg-neutral-800 border border-gray-200/60 dark:border-gray-700/60 text-gray-700 dark:text-gray-300 rounded-xl hover:bg-gray-50 dark:hover:bg-neutral-700 disabled:opacity-50 transition-colors shadow-sm"
              >
                ← {t('paginationPrevious', { defaultValue: 'Anterior' })}
              </button>
              <span className="text-xs font-bold text-gray-500 dark:text-gray-400">
                {t('paginationPageInfo', { currentPage: currentPage, totalPages: pagination.totalPages })}
              </span>
              <button
                onClick={handleNextPage}
                disabled={currentPage === pagination.totalPages || loading}
                className="px-5 py-2.5 text-xs font-bold bg-white dark:bg-neutral-800 border border-gray-200/60 dark:border-gray-700/60 text-gray-700 dark:text-gray-300 rounded-xl hover:bg-gray-50 dark:hover:bg-neutral-700 disabled:opacity-50 transition-colors shadow-sm"
              >
                {t('paginationNext', { defaultValue: 'Próxima' })} →
              </button>
            </div>
          )}
        </div>
      )}
      </>
      )}
    </div>
    </div>
  );
}

export default withAuth(UserListPage, {
  allowedRoles: [Roles.ADMIN],
}); 