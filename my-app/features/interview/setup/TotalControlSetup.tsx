import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/router';
import { getCookie } from 'cookies-next';
import { useAuth } from '../../../lib/context/AuthContext';
import { apiClient } from '../../../lib/api/api-client';
interface PresetsResponse { [key: string]: unknown }

// Local lightweight types for frontend-only usage
interface ISchemaField { name: string; label?: string; type: string; required?: boolean }
interface ITableSchema { fields: ISchemaField[] }
interface IPresetDependencyMap { dependencies: Record<string, string[]>; dependents: Record<string, string[]> }
interface IPresetDetails { tables: Record<string, { name?: string; schema: ITableSchema | null }> }

function analyzePresetDependencies(preset: IPresetDetails): IPresetDependencyMap {
  const keys = Object.keys(preset.tables);
  const emptyListMap = keys.reduce<Record<string, string[]>>((acc, key) => { acc[key] = []; return acc; }, {});
  return { dependencies: emptyListMap, dependents: emptyListMap };
}

// --- Interfaces ---
interface Preset {
  category: string;
  key: string;
  name: string;
  description: string;
}


// Estrutura do preset completo, incluindo metadados
// Using local IPresetDetails defined above

// Estado para customização
type SelectedTablesState = Record<string, boolean>;
type CustomFieldsState = Record<string, ISchemaField[]>;

type SetupStep = 'selecting_preset' | 'customizing_preset' | 'finalizing';

// --- Componente ---
export default function TotalControlSetup() {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();

  // Estado geral do fluxo
  const [currentStep, setCurrentStep] = useState<SetupStep>('selecting_preset');
  const [presets, setPresets] = useState<Preset[]>([]);
  const [selectedPreset, setSelectedPreset] = useState<Preset | null>(null);
  const [presetDetails, setPresetDetails] = useState<IPresetDetails | null>(null);
  const [dependencyMap, setDependencyMap] = useState<IPresetDependencyMap | null>(null);
  const [selectedTables, setSelectedTables] = useState<SelectedTablesState>({});
  const [customFields, setCustomFields] = useState<CustomFieldsState>({});

  // Estados de UI
  const [isLoading, setIsLoading] = useState(true); // Loading inicial de presets
  const [isFetchingDetails, setIsFetchingDetails] = useState(false);
  const [isCreating, setIsCreating] = useState(false); // Loading para criação final
  const [error, setError] = useState<string | null>(null);

  const groupedPresets = useMemo(() => {
    return presets.reduce((acc, preset) => {
      const category = preset.category || 'Outros';
      if (!acc[category]) acc[category] = [];
      acc[category].push(preset);
      return acc;
    }, {} as Record<string, Preset[]>);
  }, [presets]);



  useEffect(() => {
    if (authLoading || !user) return;

    async function fetchPresets() {
      setIsLoading(true);
      try {
        const body = (await apiClient.get('/dashboard/presets')) as PresetsResponse;
        setPresets((body.data as Preset[]) || []);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setIsLoading(false);
      }
    }

    fetchPresets();
  }, [user, authLoading]);

  function handleSelectPreset(preset: Preset) {
    setSelectedPreset(preset);
    setPresetDetails(null); // Reseta detalhes ao trocar de preset
    setError(null);
  }

  async function handleNextStep() {
    if (!selectedPreset) return;

    setIsFetchingDetails(true);
    setError(null);
    try {
      const body = (await apiClient.get(`/dashboard/presets/${selectedPreset.key}`).catch((err: unknown) => {
          const e = err as Record<string, unknown>;
          throw new Error((e?.['error'] as string) || (e?.['message'] as string) || 'Não foi possível carregar os detalhes do preset.');
      })) as PresetsResponse;
      const presetData: IPresetDetails = body.data as IPresetDetails;
      setPresetDetails(presetData);

      // Analisa as dependências e inicializa os estados de customização
      const dependencies = analyzePresetDependencies(presetData as IPresetDetails);
      setDependencyMap(dependencies);

      const initialSelectedTables: SelectedTablesState = {};
      const initialCustomFields: CustomFieldsState = {};
      for (const tableKey of Object.keys((presetData as IPresetDetails).tables)) {
        initialSelectedTables[tableKey] = true; // Todas as tabelas selecionadas por padrão
        initialCustomFields[tableKey] = []; // Nenhum campo customizado inicialmente
      }
      setSelectedTables(initialSelectedTables);
      setCustomFields(initialCustomFields);

      setCurrentStep('customizing_preset');

    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsFetchingDetails(false);
    }
  }

  const handleTableSelection = (tableKey: string, isSelected: boolean) => {
    if (!dependencyMap) return;

    const newSelectedTables = { ...selectedTables };
    newSelectedTables[tableKey] = isSelected;

    if (isSelected) {
      // Auto-select dependencies
      const dependencies = dependencyMap.dependencies[tableKey] || [];
      dependencies.forEach(dep => {
        newSelectedTables[dep] = true;
      });
    } else {
      // Alert and auto-deselect dependents
      const dependents = dependencyMap.dependents[tableKey] || [];
      if (dependents.length > 0) {
        const dependentNames = dependents.map(d => presetDetails?.tables[d]?.name || d).join(', ');
        const confirmed = window.confirm(
          `Ao desmarcar esta tabela, as seguintes tabelas que dependem dela também serão desmarcadas: ${dependentNames}. Deseja continuar?`
        );

        if (confirmed) {
          dependents.forEach(dep => {
            newSelectedTables[dep] = false;
          });
        } else {
          return; // Abort the change
        }
      }
    }

    setSelectedTables(newSelectedTables);
  };

  const handleCreateCustomDashboard = async () => {
    if (!presetDetails || !selectedPreset) {
      setError('Os detalhes do preset não foram carregados.');
      return;
    }

    setIsCreating(true);
    setError(null);

    try {
      // 1. Construir o payload com as instruções de customização para a API unificada
      const removedTableKeys = Object.entries(selectedTables)
        .filter(([, isSelected]) => !isSelected)
        .map(([key]) => key);

      const newCustomFields = customFields; // A UI ainda não adiciona campos, mas a estrutura está pronta

      const payload = {
        mode: 'custom',
        presetKey: selectedPreset.key,
        removedTables: removedTableKeys,
        addedFields: newCustomFields,
      };

      await apiClient.post('/dashboard/create', payload).catch((err) => {
        const errRec = err as Record<string, unknown>;
        throw new Error((errRec?.error as string) || (err instanceof Error ? err.message : String(err)) || 'Falha ao criar o dashboard customizado.');
      });

      // 2. Redirecionar para o dashboard em caso de sucesso
      router.push('/dashboard');

    } catch (err) {
      setError((err instanceof Error ? err.message : String(err)) || 'Ocorreu um erro inesperado.');
    } finally {
      setIsCreating(false);
    }
  };

  // --- Renderização ---

  if (authLoading || isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
        <p className="text-slate-500">Carregando modelos...</p>
      </div>
    );
  }

  if (error && !isFetchingDetails) {
    return <div className="p-6 rounded-2xl bg-red-50 text-red-600 text-center border border-red-100">{error}</div>;
  }

  if (currentStep === 'selecting_preset') {
    return (
      <div className="w-full">
        <div className="flex items-center gap-4 mb-10">
          <div className="flex items-center justify-center w-10 h-10 rounded-full bg-blue-600 text-white font-bold shadow-lg shadow-blue-500/20">1</div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Escolha um Modelo Base</h2>
        </div>

        <div className="space-y-12">
          {Object.entries(groupedPresets).map(([category, categoryPresets]) => (
            <section key={category}>
              <div className="flex items-center gap-3 mb-6">
                <div className="h-8 w-1 bg-slate-300 dark:bg-slate-700 rounded-full"></div>
                <h3 className="text-lg font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">{category}</h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                {categoryPresets.map((preset) => (
                  <button
                    key={preset.key}
                    onClick={() => handleSelectPreset(preset)}
                    className={`group relative flex flex-col items-start p-6 rounded-2xl transition-all duration-300 text-left border-2 ${selectedPreset?.key === preset.key
                        ? 'bg-blue-50/50 dark:bg-blue-900/10 border-blue-500 shadow-lg shadow-blue-500/5'
                        : 'bg-white dark:bg-neutral-800 border-slate-100 dark:border-slate-800 hover:border-slate-200 dark:hover:border-slate-700'
                      }`}
                  >
                    <h4 className="text-xl font-bold text-slate-900 dark:text-white mb-2">{preset.name}</h4>
                    <p className="text-slate-500 dark:text-slate-400 text-sm leading-relaxed mb-4">{preset.description}</p>

                    {selectedPreset?.key === preset.key && (
                      <div className="mt-auto flex items-center text-blue-600 dark:text-blue-400 font-bold text-xs uppercase tracking-widest">
                        Selecionado
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>

        <footer className="mt-16 pt-8 border-t border-slate-100 dark:border-slate-800">
          <div className="flex flex-col items-center">
            <button
              onClick={handleNextStep}
              disabled={!selectedPreset || isFetchingDetails}
              className="w-full max-w-sm bg-blue-600 text-white font-bold py-4 px-8 rounded-2xl shadow-xl shadow-blue-500/20 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all hover:scale-[1.02] active:scale-[0.98]"
            >
              {isFetchingDetails ? 'Carregando detalhes...' : 'Próximo: Customizar Tabelas'}
            </button>
            {!selectedPreset && (
              <p className="mt-4 text-slate-400 text-sm italic">Selecione um modelo para continuar.</p>
            )}
          </div>
        </footer>
      </div>
    );
  }

  if (currentStep === 'customizing_preset' && presetDetails) {
    return (
      <div className="w-full">
        <div className="flex items-center gap-4 mb-10">
          <div className="flex items-center justify-center w-10 h-10 rounded-full bg-emerald-500 text-white font-bold shadow-lg shadow-emerald-500/20">2</div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Selecione as Tabelas</h2>
        </div>

        <div className="p-6 bg-slate-100 dark:bg-neutral-800/50 rounded-2xl mb-8 border border-slate-200 dark:border-slate-800">
          <p className="text-slate-600 dark:text-slate-400">
            Personalizando para o sistema de: <strong className="text-slate-900 dark:text-white">{selectedPreset?.name}</strong>. Desmarque as tabelas que não deseja utilizar no seu fluxo de trabalho.
          </p>
        </div>

        <div className="space-y-6">
          {Object.entries(presetDetails.tables).map(([tableKey, tableData]) => {
            const schema = tableData.schema as ITableSchema | null;
            if (!schema) return null;

            const isSelected = selectedTables[tableKey] ?? false;

            return (
              <div
                key={tableKey}
                className={`p-6 rounded-2xl transition-all border-2 ${isSelected
                    ? 'bg-white dark:bg-neutral-900 border-blue-500 shadow-xl shadow-slate-200/50 dark:shadow-none'
                    : 'bg-slate-50/50 dark:bg-neutral-100/5 border-slate-200 dark:border-slate-800 opacity-60'
                  }`}
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className="relative flex items-center">
                      <input
                        type="checkbox"
                        disabled={isCreating}
                        id={`table-toggle-${tableKey}`}
                        checked={isSelected}
                        onChange={(e) => handleTableSelection(tableKey, e.target.checked)}
                        className="h-6 w-6 rounded-lg border-slate-300 dark:border-slate-700 bg-white dark:bg-neutral-800 text-blue-600 focus:ring-blue-500 cursor-pointer"
                      />
                    </div>
                    <div>
                      <label htmlFor={`table-toggle-${tableKey}`} className="text-xl font-bold text-slate-900 dark:text-white capitalize cursor-pointer">
                        {tableData.name || tableKey.replace(/_/g, ' ')}
                      </label>
                      <div className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">ID: {tableKey}</div>
                    </div>
                  </div>
                  <div className="hidden sm:block">
                    {isSelected ? (
                      <span className="px-3 py-1 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 text-xs font-bold rounded-full">Ativado</span>
                    ) : (
                      <span className="px-3 py-1 bg-slate-200 dark:bg-slate-800 text-slate-500 text-xs font-bold rounded-full">Ignorado</span>
                    )}
                  </div>
                </div>

                {isSelected && (
                  <div className="mt-6 pt-6 border-t border-slate-100 dark:border-slate-800">
                    <h4 className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-4">Campos desta tabela</h4>
                    <div className="flex flex-wrap gap-2">
                      {schema.fields.map((field) => (
                        <div key={field.name} className="bg-slate-50 dark:bg-neutral-800 text-slate-600 dark:text-slate-400 py-1.5 px-3 rounded-lg text-xs border border-slate-200 dark:border-slate-700">
                          {field.label || field.name}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <footer className="mt-16 flex flex-col sm:flex-row justify-center items-center gap-4">
          <button
            onClick={() => setCurrentStep('selecting_preset')}
            disabled={isCreating}
            className="w-full sm:w-auto px-8 py-4 bg-slate-100 dark:bg-neutral-800 text-slate-600 dark:text-slate-400 font-bold rounded-2xl hover:bg-slate-200 dark:hover:bg-neutral-700 transition-all disabled:opacity-50"
          >
            Voltar
          </button>
          <button
            onClick={handleCreateCustomDashboard}
            disabled={isCreating}
            className="w-full sm:w-auto px-12 py-4 bg-blue-600 text-white font-bold rounded-2xl shadow-xl shadow-blue-500/20 hover:bg-blue-700 transition-all disabled:opacity-50 flex items-center justify-center gap-3"
          >
            {isCreating ? (
              <>
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white"></div>
                <span>Criando Sistema Personalizado...</span>
              </>
            ) : (
              <span>Finalizar e Criar Sistema</span>
            )}
          </button>
        </footer>
      </div>
    );
  }

  return null;
}