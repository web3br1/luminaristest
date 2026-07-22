import { useState } from 'react';
import { useTranslation } from 'next-i18next';
import { Modal } from '../../../components/ui/Modal';
import {
  counterpartiesService,
  COUNTERPARTY_TYPES,
  type CounterpartyType,
  type CreateCounterpartyPayload,
} from '../../../lib/services/counterparties.service';
import { resolveError } from '../lib/resolveError';

export interface CreateCounterpartyModalProps {
  isOpen: boolean;
  onClose: () => void;
  unitId: string;
  /** Optional fixed type — when set, the type selector is locked (e.g. inline create from AP → SUPPLIER). */
  fixedType?: CounterpartyType;
  onSuccess: () => void;
}


/**
 * CreateCounterpartyModal — cadastra uma contraparte (fornecedor/cliente). Espelha o
 * padrão dos modais de Contas a Pagar/Receber, porém sem dinheiro nem datas: uma
 * contraparte é apenas identidade (tipo + nome + ref opcional).
 */
export function CreateCounterpartyModal({
  isOpen,
  onClose,
  unitId,
  fixedType,
  onSuccess,
}: CreateCounterpartyModalProps) {
  const { t } = useTranslation('accounting');
  const [type, setType] = useState<CounterpartyType>(fixedType ?? 'SUPPLIER');
  const [name, setName] = useState('');
  const [ref, setRef] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const effectiveType = fixedType ?? type;
  const isValid = name.trim() !== '';
  const isDirty = name !== '' || ref !== '';

  const TYPE_LABEL: Record<CounterpartyType, string> = {
    SUPPLIER: t('contrapartes.type.SUPPLIER', 'Fornecedor'),
    CUSTOMER: t('contrapartes.type.CUSTOMER', 'Cliente'),
  };

  function reset() {
    setType(fixedType ?? 'SUPPLIER');
    setName('');
    setRef('');
    setError(null);
  }

  function handleClose() {
    if (isSubmitting) return;
    reset();
    onClose();
  }

  async function handleSubmit() {
    setError(null);
    if (!isValid) {
      setError(t('contrapartes.createModal.error.invalid', 'Informe o nome da contraparte.'));
      return;
    }

    const payload: CreateCounterpartyPayload = {
      unitId,
      type: effectiveType,
      name: name.trim(),
      ...(ref.trim() ? { ref: ref.trim() } : {}),
    };

    setIsSubmitting(true);
    try {
      await counterpartiesService.createCounterparty(payload);
      reset();
      onSuccess();
      onClose();
    } catch (err: unknown) {
      setError(resolveError(err, t('contrapartes.createModal.error.failed', 'Erro ao cadastrar a contraparte.')));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={t('contrapartes.createModal.title', 'Nova Contraparte')}
      maxWidth="max-w-lg"
      isDirty={isDirty}
      themeColor="bg-emerald-600"
      footer={
        <>
          <button
            type="button"
            onClick={handleClose}
            disabled={isSubmitting}
            className="rounded-xl border border-neutral-700 bg-neutral-800 px-4 py-2 text-sm font-medium text-neutral-300 transition-colors hover:bg-neutral-700 hover:text-neutral-100 disabled:opacity-50"
          >
            {t('contrapartes.createModal.cancel', 'Cancelar')}
          </button>
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={!isValid || isSubmitting}
            className="rounded-xl bg-emerald-600 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSubmitting
              ? t('contrapartes.createModal.saving', 'Cadastrando…')
              : t('contrapartes.createModal.submit', 'Cadastrar')}
          </button>
        </>
      }
    >
      <div className="space-y-5 px-6 py-5">
        <div className="grid grid-cols-1 gap-4">
          {/* Type */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold uppercase tracking-widest text-neutral-400">
              {t('contrapartes.createModal.field.type', 'Tipo')}
            </label>
            {fixedType ? (
              <div className="rounded-xl border border-neutral-700 bg-neutral-800/60 px-3 py-2 text-sm text-neutral-300">
                {TYPE_LABEL[fixedType]}
              </div>
            ) : (
              <select
                value={type}
                onChange={(e) => setType(e.target.value as CounterpartyType)}
                className="rounded-xl border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-neutral-100 focus:border-emerald-500 focus:outline-none"
              >
                {COUNTERPARTY_TYPES.map((ct) => (
                  <option key={ct} value={ct}>
                    {TYPE_LABEL[ct]}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Name */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold uppercase tracking-widest text-neutral-400">
              {t('contrapartes.createModal.field.name', 'Nome')}
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('contrapartes.createModal.field.namePlaceholder', 'Nome da contraparte…')}
              className="rounded-xl border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-neutral-100 placeholder-neutral-600 focus:border-emerald-500 focus:outline-none"
            />
          </div>

          {/* Ref (optional) */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold uppercase tracking-widest text-neutral-400">
              {t('contrapartes.createModal.field.ref', 'Referência')}
              <span className="ml-1 normal-case text-neutral-600">{t('contrapartes.createModal.optional', '(opcional)')}</span>
            </label>
            <input
              type="text"
              value={ref}
              onChange={(e) => setRef(e.target.value)}
              placeholder={t('contrapartes.createModal.field.refPlaceholder', 'CNPJ, código externo…')}
              className="rounded-xl border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-neutral-100 placeholder-neutral-600 focus:border-emerald-500 focus:outline-none"
            />
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="rounded-xl border border-red-900/50 bg-red-950/30 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}
      </div>
    </Modal>
  );
}
