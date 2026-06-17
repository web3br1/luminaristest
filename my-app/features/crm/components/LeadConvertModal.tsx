import React, { useEffect, useState } from 'react';
import { useTranslation } from 'next-i18next';
import { Modal } from '../../../components/ui/Modal';
import { CrmService, type ConvertLeadPayload } from '../../../lib/services/crm.service';
import { resolveErrorMessage } from '../../../lib/utils/error-handler';

interface LeadConvertModalProps {
  isOpen: boolean;
  onClose: () => void;
  leadId: string | null;
  leadName?: string;
  onConverted: () => void | Promise<void>;
}

/**
 * Capture modal for the lead → account/contact conversion. Collects the account
 * name (required) plus optional account/contact fields, then runs the atomic
 * `CrmService.convertLead` transition. Cancel performs no write (mirror of
 * `ProposalCaptureModal`). Built on the canonical `Modal.tsx` primitive.
 */
export function LeadConvertModal({ isOpen, onClose, leadId, leadName, onConverted }: LeadConvertModalProps) {
  const { t } = useTranslation('crm');

  const [accountName, setAccountName] = useState('');
  const [segment, setSegment] = useState('');
  const [size, setSize] = useState('');
  const [website, setWebsite] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [contactRole, setContactRole] = useState('');
  const [contactJobTitle, setContactJobTitle] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset the form each time the modal (re)opens — prefill the account name with
  // the lead name as a sensible default.
  useEffect(() => {
    if (isOpen) {
      setAccountName(leadName ?? '');
      setSegment('');
      setSize('');
      setWebsite('');
      setCity('');
      setState('');
      setContactRole('');
      setContactJobTitle('');
      setSubmitting(false);
      setError(null);
    }
  }, [isOpen, leadName]);

  const isValid = accountName.trim() !== '';

  const handleConfirm = async () => {
    if (!isValid || submitting || !leadId) return;
    setSubmitting(true);
    setError(null);

    const trim = (v: string) => {
      const s = v.trim();
      return s === '' ? undefined : s;
    };

    const payload: ConvertLeadPayload = {
      leadId,
      account: {
        name: accountName.trim(),
        segment: trim(segment),
        size: trim(size),
        website: trim(website),
        city: trim(city),
        state: trim(state),
      },
      contact: {
        role: trim(contactRole),
        jobTitle: trim(contactJobTitle),
      },
    };

    try {
      await CrmService.convertLead(payload);
      await onConverted();
      onClose();
    } catch (err) {
      setError(resolveErrorMessage(err, t));
    } finally {
      setSubmitting(false);
    }
  };

  const inputClass =
    'w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-bold text-gray-800 outline-none focus:border-blue-400 dark:border-white/10 dark:bg-neutral-800 dark:text-gray-200';
  const labelClass = 'mb-1 block text-[10px] font-black uppercase tracking-widest text-gray-400';

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t('convert.title', 'Converter Lead')}
      maxWidth="max-w-lg"
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-bold text-gray-700 transition hover:bg-gray-100 dark:border-white/10 dark:text-gray-200 dark:hover:bg-neutral-800"
          >
            {t('convert.cancel', 'Cancelar')}
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!isValid || submitting}
            className="rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 px-4 py-2 text-sm font-black text-white shadow-lg shadow-blue-500/20 transition hover:from-blue-700 hover:to-indigo-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? t('convert.converting', 'Convertendo…') : t('convert.confirm', 'Converter')}
          </button>
        </>
      }
    >
      <div className="space-y-4 p-5">
        <p className="text-sm font-semibold text-gray-500 dark:text-gray-400">
          {t('convert.subtitle', 'Crie uma conta e um contato a partir deste lead.')}
        </p>

        {error ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">
            {error}
          </div>
        ) : null}

        <section className="space-y-4 rounded-2xl border border-gray-200 bg-white p-4 dark:border-white/5 dark:bg-neutral-900">
          <h3 className="text-[10px] font-black uppercase tracking-widest text-gray-400">
            {t('convert.account_section', 'Conta')}
          </h3>

          <div>
            <label className={labelClass}>{t('convert.account_name', 'Nome da conta')} *</label>
            <input
              type="text"
              value={accountName}
              onChange={(e) => setAccountName(e.target.value)}
              autoFocus
              className={inputClass}
              placeholder={t('convert.account_name_ph', 'Nome da empresa')}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>{t('convert.segment', 'Segmento')}</label>
              <input type="text" value={segment} onChange={(e) => setSegment(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>{t('convert.size', 'Porte')}</label>
              <input type="text" value={size} onChange={(e) => setSize(e.target.value)} className={inputClass} />
            </div>
          </div>

          <div>
            <label className={labelClass}>{t('convert.website', 'Website')}</label>
            <input type="text" value={website} onChange={(e) => setWebsite(e.target.value)} className={inputClass} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>{t('convert.city', 'Cidade')}</label>
              <input type="text" value={city} onChange={(e) => setCity(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>{t('convert.state', 'Estado')}</label>
              <input type="text" value={state} onChange={(e) => setState(e.target.value)} className={inputClass} />
            </div>
          </div>
        </section>

        <section className="space-y-4 rounded-2xl border border-gray-200 bg-white p-4 dark:border-white/5 dark:bg-neutral-900">
          <h3 className="text-[10px] font-black uppercase tracking-widest text-gray-400">
            {t('convert.contact_section', 'Contato')}
          </h3>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>{t('convert.contact_role', 'Papel')}</label>
              <input
                type="text"
                value={contactRole}
                onChange={(e) => setContactRole(e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>{t('convert.contact_job_title', 'Cargo')}</label>
              <input
                type="text"
                value={contactJobTitle}
                onChange={(e) => setContactJobTitle(e.target.value)}
                className={inputClass}
              />
            </div>
          </div>
        </section>
      </div>
    </Modal>
  );
}

export default LeadConvertModal;
