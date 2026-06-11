import React from 'react';
import { useTranslation } from 'next-i18next';
import { LocationService } from '../../../../../lib/services/location.service';

type CepAddressFieldProps = {
  name: string;
  /** Accepts any incoming value — coerced to string internally via `normalizeCepInput`. */
  value: unknown;
  onChange: (name: string, value: unknown) => void;
  applyPatch?: (patch: Record<string, unknown>) => void;
  className?: string;
  disabled?: boolean;
};

export default function CepAddressField({ name, value, onChange, applyPatch, className, disabled }: CepAddressFieldProps) {
  const { t } = useTranslation(['common']);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const lastFetchedRef = React.useRef<string>('');

  function normalizeCepInput(raw: string) {
    const digits = String(raw || '').replace(/\D/g, '').slice(0, 8);
    if (digits.length <= 5) return digits;
    return `${digits.slice(0,5)}-${digits.slice(5)}`;
  }

  // Auto-lookup on CEP complete (8 digits). Debounce basic by ignoring same value.
  React.useEffect(() => {
    const cepDigits = String(value || '').replace(/\D/g, '');
    if (cepDigits.length !== 8) { setError(null); return; }
    if (lastFetchedRef.current === cepDigits) return;
    let cancelled = false;
    (async () => {
      try {
        setError(null);
        setLoading(true);
        const data = await LocationService.fetchCepData(cepDigits);
        if (data?.erro) throw new Error(t('cep_not_found', 'ZIP code not found'));
        if (cancelled) return;
        lastFetchedRef.current = cepDigits;
        const patch: Record<string, unknown> = {};
        // Set CEP in multiple common field names
        const cepNorm = normalizeCepInput(data.cep || cepDigits);
        [name, 'zipCode', 'cep', 'zip', 'zip_code'].forEach((key) => { patch[key] = cepNorm; });
        // Street
        if (data.logradouro) patch.street = data.logradouro;
        // Neighborhood
        if (data.bairro) { patch.neighborhood = data.bairro; patch.bairro = data.bairro; }
        // City
        if (data.localidade) { patch.city = data.localidade; }
        // State
        if (data.uf) { patch.state = data.uf; patch.stateUF = data.uf; patch.uf = data.uf; }
        if (applyPatch) applyPatch(patch);
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : t('cep_lookup_failed', 'Failed to look up ZIP code');
        if (!cancelled) setError(message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [value, name, applyPatch]);

  return (
    <div className="relative space-y-1">
      <input
        id={name}
        type="text"
        inputMode="numeric"
        pattern="[0-9-]*"
        value={normalizeCepInput(String(value ?? ''))}
        onChange={(e) => onChange(name, normalizeCepInput(e.target.value))}
        className={`${className} pr-10`}
        disabled={disabled}
        placeholder="00000-000"
      />
      {loading && (
        <div className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
      )}
      {error && <div className="text-xs text-red-600">{error}</div>}
    </div>
  );
}


