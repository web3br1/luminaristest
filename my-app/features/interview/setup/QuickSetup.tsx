import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/router';
import { getCookie } from 'cookies-next';
import { useAuth } from '../../../lib/context/AuthContext';
import { useTranslation } from 'next-i18next';
import { FiCheck, FiCpu, FiMonitor, FiActivity } from 'react-icons/fi';
import { apiClient } from '../../../lib/api/api-client';

interface PresetsResponse { [key: string]: unknown }

interface Preset {
  category: string;
  key: string;
  name: string;
  description: string;
}

export default function QuickSetup() {
  const { t } = useTranslation('common');
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();

  const [presets, setPresets] = useState<Preset[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const groupedPresets = useMemo(() => {
    return presets.reduce((acc, preset) => {
      const category = preset.category || 'Outros';
      if (!acc[category]) {
        acc[category] = [];
      }
      acc[category].push(preset);
      return acc;
    }, {} as Record<string, Preset[]>);
  }, [presets]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push('/users/login');
      return;
    }

    async function verifyAndLoad() {
      setIsLoading(true);
      try {
        const body = (await apiClient.get('/dashboard/presets')) as PresetsResponse;
        setPresets(body.data || []);

      } catch (err) {
        setError((err instanceof Error ? err.message : String(err)) || 'Ocorreu um erro inesperado ao carregar os modelos.');
      } finally {
        setIsLoading(false);
      }
    }

    verifyAndLoad();
  }, [user, authLoading, router]);

  async function handleCreateDashboard() {
    if (!selectedPreset) return;

    setIsCreating(true);
    setError(null);
    try {
      await apiClient.post('/dashboard/create', { mode: 'quick', suiteKey: selectedPreset });

      router.push('/dashboard');

    } catch (err) {
      setError((err instanceof Error ? err.message : String(err)) || 'Ocorreu um erro inesperado ao criar a dashboard.');
    } finally {
      setIsCreating(false);
    }
  }

  if (authLoading || isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
        <p className="text-slate-500">{t('loading')}</p>
      </div>
    );
  }

  if (error && !isCreating) {
    return <div className="p-6 rounded-2xl bg-red-50 dark:bg-red-950/20 text-red-600 text-center border border-red-100 dark:border-red-900">{error}</div>;
  }

  return (
    <div className="w-full">
      <div className="space-y-12">
        {Object.entries(groupedPresets).map(([category, categoryPresets]) => (
          <section key={category}>
            <div className="flex items-center gap-3 mb-6">
              <div className="h-8 w-1 bg-blue-600 rounded-full"></div>
              <h3 className="text-xl font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">{category}</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {categoryPresets.map((preset) => (
                <button
                  key={preset.key}
                  onClick={() => setSelectedPreset(preset.key)}
                  className={`group relative flex flex-col items-start p-6 rounded-2xl transition-all duration-300 text-left border-2 ${selectedPreset === preset.key
                      ? 'bg-blue-50/50 dark:bg-blue-900/10 border-blue-500 shadow-lg shadow-blue-500/5'
                      : 'bg-white dark:bg-neutral-800 border-slate-100 dark:border-slate-800 hover:border-slate-200 dark:hover:border-slate-700'
                    }`}
                >
                  <div className={`p-3 rounded-xl mb-4 transition-colors ${selectedPreset === preset.key ? 'bg-blue-600 text-white' : 'bg-slate-100 dark:bg-neutral-700 text-slate-500'
                    }`}>
                    {preset.key.includes('retail') ? <FiCpu size={20} /> : preset.key.includes('service') ? <FiActivity size={20} /> : <FiMonitor size={20} />}
                  </div>
                  <h4 className="text-xl font-bold text-slate-900 dark:text-white mb-2">{preset.name}</h4>
                  <p className="text-slate-500 dark:text-slate-400 text-sm leading-relaxed mb-4">{preset.description}</p>

                  {selectedPreset === preset.key && (
                    <div className="mt-auto flex items-center text-blue-600 dark:text-blue-400 font-bold text-xs uppercase tracking-widest">
                      <FiCheck className="mr-2" /> Selecionado
                    </div>
                  )}
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>

      <footer className="mt-16 flex flex-col items-center">
        {error && isCreating && (
          <div className="mb-6 p-4 rounded-xl bg-red-50 dark:bg-red-950/20 text-red-600 border border-red-100 dark:border-red-900 text-sm">
            {error}
          </div>
        )}
        <button
          onClick={handleCreateDashboard}
          disabled={!selectedPreset || isCreating}
          className="group relative w-full max-w-sm overflow-hidden rounded-2xl bg-blue-600 p-px font-bold text-white shadow-xl shadow-blue-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all hover:scale-[1.02] active:scale-[0.98]"
        >
          <div className="relative flex items-center justify-center gap-2 rounded-2xl bg-blue-600 px-8 py-4 transition-colors group-hover:bg-blue-700">
            {isCreating ? (
              <>
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white"></div>
                <span>Criando Sistema...</span>
              </>
            ) : (
              <span>{t('createDashboard')}</span>
            )}
          </div>
        </button>
        {!selectedPreset && (
          <p className="mt-4 text-slate-400 text-sm font-medium italic">
            {t('selectModelToEnable')}
          </p>
        )}
      </footer>
    </div>
  );
}