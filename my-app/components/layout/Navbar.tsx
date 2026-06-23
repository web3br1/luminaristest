import React, { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useTheme } from '../../lib/hooks/useTheme';
import { useAuth } from '../../lib/context/AuthContext';
import { useTranslation } from 'next-i18next';
import { useRouter } from 'next/router';
import {
  IoMoonOutline,
  IoSunnyOutline,
  IoLanguageOutline,
  IoChevronDownOutline,
  IoPersonOutline,
  IoLogOutOutline,
  IoSettingsOutline,
  IoDocumentTextOutline,
  IoGridOutline,
  IoChatbubbleEllipsesOutline,
  IoReceiptOutline
} from 'react-icons/io5';

import { UserService } from '../../lib/services/user.service';

export function Navbar() {
  const { t } = useTranslation('common');
  const router = useRouter();
  const { theme, toggleTheme } = useTheme();
  const { isAuthenticated, user, logout, isLoading } = useAuth();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isLangDropdownOpen, setIsLangDropdownOpen] = useState(false);

  const handleLogout = () => {
    setIsDropdownOpen(false);
    logout();
  };

  const changeLanguage = async (locale: string) => {
    setIsLangDropdownOpen(false);
    // 1. Update Next.js router (writes NEXT_LOCALE cookie)
    router.push(router.pathname, router.asPath, { locale });
    // 2. Persist to DB in the background (only when authenticated)
    if (isAuthenticated && user) {
      try {
        await UserService.updatePreferences({ locale });
      } catch {
        // Silently ignore — language still changes locally
      }
    }
  };

  const languages = [
    { code: 'pt', label: 'Português (BR)', flag: '🇧🇷' },
    { code: 'en', label: 'English (US)', flag: '🇺🇸' },
  ];

  const currentLang = languages.find(l => l.code === router.locale) || languages[0];

  if (isLoading) {
    return (
      <nav className="bg-white/80 dark:bg-neutral-900/80 backdrop-blur-md border-b border-gray-200/50 dark:border-gray-800/50 shadow-sm fixed top-0 left-0 right-0 z-50 h-[64px]">
        <div className="max-w-[1920px] mx-auto px-6 lg:px-12 flex justify-between items-center h-full">
          <Link href="/" className="flex items-center space-x-2">
            <div className="w-9 h-9 bg-gray-200 dark:bg-neutral-800 rounded-lg animate-pulse" />
            <div className="w-24 h-6 bg-gray-200 dark:bg-neutral-800 rounded animate-pulse" />
          </Link>
        </div>
      </nav>
    );
  }

  return (
    <nav className="bg-white/70 dark:bg-neutral-900/70 backdrop-blur-xl border-b border-gray-200/40 dark:border-gray-800/40 shadow-[0_2px_15px_-3px_rgba(0,0,0,0.07),0_10px_20px_-2px_rgba(0,0,0,0.04)] fixed top-0 left-0 right-0 z-50 h-[64px]">
      <div className="max-w-[1920px] mx-auto px-6 lg:px-12 flex justify-between items-center h-full">
        {/* Logo Section */}
        <Link href="/" className="flex items-center space-x-3 group">
          <div className="relative overflow-hidden rounded-xl transition-all duration-300 group-hover:scale-105 group-hover:rotate-2 group-hover:shadow-lg group-hover:shadow-indigo-500/20">
            <Image
              src="/logo.png"
              alt="Luminaris Logo"
              width={38}
              height={38}
              className="w-9 h-9 object-contain"
            />
          </div>
          <span className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-gray-900 via-indigo-900 to-gray-700 dark:from-white dark:via-indigo-200 dark:to-gray-300 tracking-tight transition-all duration-300 group-hover:tracking-normal">
            {t('appName')}
          </span>
        </Link>

        <div className="flex items-center gap-2">
          {/* Language Dropdown */}
          <div className="relative">
            <button
              onClick={() => setIsLangDropdownOpen(!isLangDropdownOpen)}
              className="h-9 px-3 flex items-center gap-2 text-[11px] font-bold rounded-lg hover:bg-black/5 dark:hover:bg-white/5 text-gray-600 dark:text-gray-400 transition-all duration-200"
              aria-label="Change language"
            >
              <span className="text-base">{currentLang.flag}</span>
              <span className="hidden sm:inline uppercase tracking-widest">{currentLang.code}</span>
              <IoChevronDownOutline className={`transition-transform duration-200 ${isLangDropdownOpen ? 'rotate-180' : ''}`} />
            </button>

            {isLangDropdownOpen && (
              <div className="origin-top-right absolute right-0 mt-2 w-48 rounded-2xl shadow-2xl py-2 bg-white/80 dark:bg-neutral-900/80 backdrop-blur-2xl border border-gray-200/50 dark:border-white/10 z-50 animate-in fade-in zoom-in-95 duration-200">
                {languages.map((lang) => (
                  <button
                    key={lang.code}
                    onClick={() => changeLanguage(lang.code)}
                    className={`flex items-center w-full px-4 py-2.5 text-sm transition-colors ${router.locale === lang.code ? 'bg-indigo-50/50 dark:bg-white/5 text-indigo-600 dark:text-white font-bold' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100/50 dark:hover:bg-white/5 hover:text-gray-900 dark:hover:text-gray-200'}`}
                  >
                    <span className="mr-3 text-base">{lang.flag}</span>
                    {lang.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Theme Toggle Button */}
          <button
            onClick={toggleTheme}
            className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-black/5 dark:hover:bg-white/5 text-gray-500 dark:text-gray-400 transition-all duration-200"
            aria-label={t('toggleTheme')}
          >
            {theme === 'dark' ? <IoSunnyOutline size={18} className="text-amber-400" /> : <IoMoonOutline size={18} className="text-indigo-600" />}
          </button>

          <div className="h-4 w-[1px] bg-gray-200/50 dark:bg-gray-700/50 mx-1" />

          {/* Auth Section */}
          {isAuthenticated ? (
            <div className="relative">
              <button
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                className="flex items-center gap-2.5 p-1 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 transition-all duration-200"
                aria-label="User menu"
                aria-haspopup="true"
                aria-expanded={isDropdownOpen}
              >
                <div className="flex flex-col items-end hidden sm:flex px-1">
                  <span className="text-[11px] font-bold text-gray-700 dark:text-gray-300 leading-none">
                    {user?.username}
                  </span>
                </div>
                <div className="w-8 h-8 rounded-md bg-indigo-600/10 dark:bg-indigo-400/10 flex items-center justify-center text-indigo-600 dark:text-indigo-400 text-xs font-bold border border-indigo-600/20 dark:border-indigo-400/20">
                  {user?.username ? user.username.charAt(0).toUpperCase() : <IoPersonOutline size={16} />}
                </div>
              </button>

              {isDropdownOpen && (
                <div className="origin-top-right absolute right-0 mt-2 w-64 rounded shadow-lg bg-white dark:bg-neutral-900 border border-gray-200 dark:border-gray-800 z-50 animate-in fade-in zoom-in-95 duration-100">
                  <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-800">
                    <div className="flex items-center gap-3 mb-1">
                      <div className="w-9 h-9 rounded bg-indigo-600 dark:bg-indigo-500 flex items-center justify-center text-white font-bold text-sm">
                        {user?.username?.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex flex-col">
                        <p className="text-sm font-semibold text-gray-900 dark:text-white truncate max-w-[170px]" title={user?.name}>{user?.name}</p>
                        <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 mt-0.5 uppercase tracking-wide">
                          {user?.role}
                        </span>
                      </div>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate" title={user?.email}>{user?.email}</p>
                  </div>

                  <div className="py-1">
                    <Link
                      href="/users/profile"
                      className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-neutral-800 transition-colors"
                      onClick={() => setIsDropdownOpen(false)}
                    >
                      <IoPersonOutline size={16} />
                      {t('myProfile')}
                    </Link>

                    <Link
                      href="/dashboard"
                      className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-neutral-800 transition-colors"
                      onClick={() => setIsDropdownOpen(false)}
                    >
                      <IoGridOutline size={16} />
                      Minha Dashboard
                    </Link>

                    <Link
                      href="/documents"
                      className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-neutral-800 transition-colors"
                      onClick={() => setIsDropdownOpen(false)}
                    >
                      <IoDocumentTextOutline size={16} />
                      {t('myDocuments', { defaultValue: 'My Documents' })}
                    </Link>

                    <Link
                      href="/accounting"
                      className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-neutral-800 transition-colors"
                      onClick={() => setIsDropdownOpen(false)}
                    >
                      <IoReceiptOutline size={16} />
                      Contabilidade
                    </Link>

                    {user?.role === 'ADMIN' && (
                      <Link
                        href="/users"
                        className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-neutral-800 transition-colors"
                        onClick={() => setIsDropdownOpen(false)}
                      >
                        <IoSettingsOutline size={16} />
                        {t('userManagement')}
                      </Link>
                    )}
                  </div>

                  <div className="border-t border-gray-200 dark:border-gray-800 py-1">
                    <button
                      onClick={handleLogout}
                      className="flex items-center gap-2 w-full px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors text-left"
                    >
                      <IoLogOutOutline size={16} />
                      {t('logout')}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <Link
              href="/users/login"
              className="h-10 px-6 flex items-center rounded-xl text-sm font-bold text-gray-900 dark:text-white hover:bg-black/5 dark:hover:bg-white/5 border border-gray-200/50 dark:border-white/10 transition-all duration-200"
            >
              {t('login')}
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
} 