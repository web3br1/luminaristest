import React, { useState } from 'react';
import Image from 'next/image';
import { useTranslation } from 'next-i18next';
import { useRouter } from 'next/router';
import { useTheme } from '../../lib/hooks/useTheme';
import { FiCheckCircle } from 'react-icons/fi';
import { IoLanguageOutline, IoChevronDownOutline, IoSunnyOutline, IoMoonOutline } from 'react-icons/io5';

interface AuthSplitLayoutProps {
  children: React.ReactNode;
  title: string;
  subtitle: string;
}

export const AuthSplitLayout: React.FC<AuthSplitLayoutProps> = ({ children, title, subtitle }) => {
  const { t } = useTranslation('common');
  const router = useRouter();
  const { theme, toggleTheme } = useTheme();
  const [isLangDropdownOpen, setIsLangDropdownOpen] = useState(false);

  const languages = [
    { code: 'pt', label: 'Português (BR)', flag: '🇧🇷' },
    { code: 'en', label: 'English (US)', flag: '🇺🇸' },
  ];

  const currentLang = languages.find(l => l.code === router.locale) || languages[0];

  const changeLanguage = (locale: string) => {
    setIsLangDropdownOpen(false);
    router.push(router.pathname, router.asPath, { locale });
  };

  return (
    <div className="flex min-h-screen bg-white dark:bg-neutral-950 transition-colors duration-500 relative">
      {/* Floating Controls (Language & Theme) */}
      <div className="absolute top-6 right-6 z-50 flex items-center gap-3 animate-in fade-in duration-1000">
        <div className="relative">
          <button
            onClick={() => setIsLangDropdownOpen(!isLangDropdownOpen)}
            className="h-10 px-4 flex items-center gap-2 text-xs font-bold rounded-2xl bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-slate-600 dark:text-slate-300 transition-all duration-200 border border-slate-200 dark:border-white/10"
            aria-label="Change language"
          >
            <IoLanguageOutline size={18} />
            <span className="hidden sm:inline uppercase tracking-widest">{currentLang.code}</span>
            <IoChevronDownOutline className={`transition-transform duration-200 ${isLangDropdownOpen ? 'rotate-180' : ''}`} />
          </button>

          {isLangDropdownOpen && (
            <div className="absolute right-0 lg:right-auto lg:left-0 mt-2 w-48 rounded-2xl shadow-2xl py-2 bg-white dark:bg-neutral-900 border border-slate-200 dark:border-white/10 z-50 animate-in fade-in zoom-in-95 duration-200">
              {languages.map((lang) => (
                <button
                  key={lang.code}
                  onClick={() => changeLanguage(lang.code)}
                  className={`flex items-center w-full px-4 py-2.5 text-sm transition-colors ${router.locale === lang.code ? 'bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 font-bold' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-slate-200'}`}
                >
                  <span className="mr-3 text-lg">{lang.flag}</span>
                  {lang.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <button
          onClick={toggleTheme}
          className="w-10 h-10 flex items-center justify-center rounded-2xl bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-slate-600 dark:text-slate-300 transition-all duration-200 border border-slate-200 dark:border-white/10"
          aria-label={t('toggleTheme')}
        >
          {theme === 'dark' ? <IoSunnyOutline size={18} className="text-amber-400" /> : <IoMoonOutline size={18} className="text-blue-600" />}
        </button>
      </div>
      {/* Left Column: Form */}
      <div className="flex flex-col justify-center w-full lg:w-[45%] xl:w-[40%] p-8 sm:p-12 lg:p-16 xl:p-24 overflow-y-auto">
        <div className="max-w-md w-full mx-auto">
          {/* Logo Area */}
          <div className="mb-12 flex items-center gap-3 animate-in fade-in slide-in-from-top-4 duration-700">
            <div className="relative w-10 h-10 overflow-hidden rounded-xl bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
               <Image
                src="/logo.png"
                alt="Luminaris Logo"
                width={40}
                height={40}
                className="object-contain p-1"
              />
            </div>
            <span className="text-2xl font-black tracking-tighter text-slate-900 dark:text-white">Luminaris</span>
          </div>

          {/* Header Title */}
          <div className="mb-10 animate-in fade-in slide-in-from-top-6 duration-700 delay-100">
            <h1 className="text-4xl font-extrabold text-slate-900 dark:text-white mb-3 tracking-tight">
              {title}
            </h1>
            <p className="text-slate-500 dark:text-slate-400 text-lg leading-relaxed">
              {subtitle}
            </p>
          </div>

          {/* Form Content */}
          <div className="animate-in fade-in slide-in-from-bottom-8 duration-700 delay-200">
            {children}
          </div>
        </div>
      </div>

      {/* Right Column: Visual/Inspirational Info */}
      <div className="hidden lg:flex flex-col justify-center relative w-[55%] xl:w-[60%] bg-lumi-bg-dark overflow-hidden">
        {/* Abstract Background Decoration */}
        <div className="absolute inset-0 z-0">
          <div className="absolute top-[-10%] right-[-10%] w-[60%] h-[60%] rounded-full bg-blue-600/10 blur-[120px]" />
          <div className="absolute bottom-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-purple-600/10 blur-[120px]" />
          {/* Diagonal Lines Effect */}
          <div className="absolute inset-0 opacity-[0.03] pointer-events-none" 
               style={{ backgroundImage: 'linear-gradient(45deg, #ffffff /* lumi-bg */ 1px, transparent 1px), linear-gradient(-45deg, #ffffff /* lumi-bg */ 1px, transparent 1px)', backgroundSize: '60px 60px' }}
          />
        </div>

        {/* Content Area */}
        <div className="relative z-10 p-16 xl:p-24 max-w-3xl mx-auto flex flex-col items-start">
          <div className="mb-12 p-5 rounded-3xl bg-white/5 backdrop-blur-3xl border border-white/10 shadow-2xl animate-in zoom-in duration-1000">
             <Image
                src="/logo.png"
                alt="Brand Symbol"
                width={120}
                height={120}
                className="opacity-90 brightness-110 drop-shadow-[0_0_15px_rgba(37,99,235,0.3)]"
              />
          </div>

          <div className="space-y-6 animate-in fade-in slide-in-from-right-8 duration-1000 delay-300">
            <span className="text-blue-500 font-bold uppercase tracking-[0.2em] text-sm">Experience LUMINARIS</span>
            <h2 className="text-5xl xl:text-6xl font-black text-white leading-[1.1] tracking-tight">
              Built for <span className="bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-indigo-400">efficiency</span> and elegance.
            </h2>
            <p className="text-slate-400 text-xl leading-relaxed max-w-xl">
              Centralize your operations, optimize your workflow, and grow your business with our AI-driven ERP ecosystem.
            </p>
          </div>

          {/* Floating Glass Card (like the reference image) */}
          <div className="mt-16 w-full max-w-md p-8 rounded-[2.5rem] bg-gradient-to-br from-white/[0.08] to-white/[0.02] backdrop-blur-2xl border border-white/10 shadow-2xl relative overflow-hidden group animate-in slide-in-from-bottom-12 duration-1000 delay-500">
             {/* Glossy Reflection Overlay */}
             <div className="absolute -top-[50%] -left-[50%] w-[200%] h-[200%] bg-gradient-to-br from-white/10 to-transparent rotate-45 pointer-events-none" />
             
             <div className="relative z-10">
               <h3 className="text-2xl font-bold text-white mb-4 leading-tight">
                 Empower your team with real-time analytics.
               </h3>
               <p className="text-slate-400 mb-8 leading-relaxed">
                 Join 15k+ companies that already transformed their digital management strategy.
               </p>
               
               <div className="flex items-center justify-between">
                 <div className="flex -space-x-4">
                   {[1,2,3,4].map(idx => (
                     <div key={idx} className="w-12 h-12 rounded-full border-4 border-lumi-dark-500 bg-slate-800 flex items-center justify-center overflow-hidden transition-transform hover:scale-110 hover:z-20 cursor-pointer">
                        <img src={`https://i.pravatar.cc/150?u=${idx + 10}`} alt="User" className="w-full h-full object-cover" />
                     </div>
                   ))}
                   <div className="w-12 h-12 rounded-full border-4 border-lumi-dark-500 bg-blue-600 flex items-center justify-center text-white text-xs font-bold transition-transform hover:scale-110 hover:z-20 cursor-pointer">
                     +2k
                   </div>
                 </div>
                 
                 <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm bg-emerald-400/10 px-4 py-2 rounded-full border border-emerald-400/20">
                   <FiCheckCircle />
                   <span>Enterprise Ready</span>
                 </div>
               </div>
             </div>
          </div>
        </div>
      </div>
    </div>
  );
};
