'use client';

import React, { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'next-i18next';
import { CrmService, type AttachmentMeta } from '../../../lib/services/crm.service';
import { resolveErrorMessage } from '../../../lib/utils/error-handler';
import { useLeadAttachments } from '../hooks/useLeadAttachments';
import { formatTimestamp } from '../lib/dates';

interface LeadAttachmentsPanelProps {
  leadId: string;
  onChanged?: () => void;
}

// Client-side size hint mirroring the server's multer limit (25MB). The server
// is authoritative (413); this avoids a doomed round-trip for obvious overflows.
const MAX_SIZE_BYTES = 25 * 1024 * 1024;

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** exponent;
  return `${value.toFixed(exponent === 0 ? 0 : 1)} ${units[exponent]}`;
}

/**
 * Real downloadable file-store for a lead's attachments, rendered inside the
 * Lead360 modal (after Notes). Hidden file input + "attach" button drive the
 * multipart upload; each row offers download (blob) and soft-delete. All
 * persistence goes through CrmService (service layer only) — no raw fetch in the
 * component. rounded-2xl / neutral / dark, i18n (crm namespace).
 */
export function LeadAttachmentsPanel({ leadId, onChanged }: LeadAttachmentsPanelProps) {
  const { t } = useTranslation('crm');
  const { loading, error, attachments, reload } = useLeadAttachments(leadId);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Newest first — memoized so modal re-renders don't resort (contract §3).
  const ordered = useMemo<AttachmentMeta[]>(() => {
    return [...attachments].sort((a, b) => {
      const ca = String(a.createdAt ?? '');
      const cb = String(b.createdAt ?? '');
      if (ca === cb) return 0;
      return ca < cb ? 1 : -1;
    });
  }, [attachments]);

  const handlePick = () => {
    setFormError(null);
    fileInputRef.current?.click();
  };

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Reset the input so selecting the same file again re-triggers onChange.
    e.target.value = '';
    if (!file) return;

    if (file.size > MAX_SIZE_BYTES) {
      setFormError(t('attachments.too_large', 'Arquivo muito grande (máx. 25MB).'));
      return;
    }

    setUploading(true);
    setFormError(null);
    try {
      await CrmService.uploadAttachment('lead', leadId, file);
      await reload();
      onChanged?.();
    } catch (err) {
      const status = (err as { status?: number })?.status;
      if (status === 413) {
        setFormError(t('attachments.too_large', 'Arquivo muito grande (máx. 25MB).'));
      } else if (status === 415) {
        setFormError(t('attachments.invalid_type', 'Tipo de arquivo não permitido.'));
      } else {
        setFormError(resolveErrorMessage(err, t));
      }
    } finally {
      setUploading(false);
    }
  };

  const handleDownload = async (att: AttachmentMeta) => {
    setFormError(null);
    setBusyId(att.id);
    try {
      await CrmService.downloadAttachment(att.id, att.fileName);
    } catch (err) {
      setFormError(resolveErrorMessage(err, t));
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (att: AttachmentMeta) => {
    if (typeof window !== 'undefined' && !window.confirm(t('attachments.confirm_delete', 'Remover este anexo?'))) {
      return;
    }
    setFormError(null);
    setBusyId(att.id);
    try {
      await CrmService.deleteAttachment(att.id);
      await reload();
      onChanged?.();
    } catch (err) {
      setFormError(resolveErrorMessage(err, t));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-3">
      <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileSelected} />

      {loading ? (
        <p className="text-sm font-bold text-gray-400">{t('common.loading', 'Carregando…')}</p>
      ) : error ? (
        <p className="text-sm font-bold text-rose-600 dark:text-rose-400">{error}</p>
      ) : ordered.length === 0 ? (
        <p className="text-sm font-bold text-gray-400">{t('attachments.empty', 'Nenhum anexo.')}</p>
      ) : (
        <ul className="space-y-2">
          {ordered.map((att) => (
            <li
              key={att.id}
              className="flex items-center justify-between gap-3 rounded-2xl border border-gray-200 bg-white px-4 py-3 dark:border-white/5 dark:bg-neutral-900/60"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-gray-800 dark:text-gray-200">{att.fileName}</p>
                <div className="mt-1 flex items-center gap-2 text-xs font-bold text-gray-500 dark:text-gray-400">
                  <span>{formatBytes(Number(att.fileSize ?? 0))}</span>
                  <span aria-hidden>·</span>
                  <span>{formatTimestamp(att.createdAt)}</span>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleDownload(att)}
                  disabled={busyId === att.id}
                  className="rounded-xl border border-gray-300 bg-white px-3 py-1.5 text-xs font-black text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:bg-neutral-800 dark:text-gray-200 dark:hover:bg-neutral-700"
                >
                  {t('attachments.download', 'Baixar')}
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(att)}
                  disabled={busyId === att.id}
                  className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-xs font-black text-rose-600 transition hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-50 dark:text-rose-400"
                >
                  {t('attachments.delete', 'Excluir')}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {formError && <p className="text-sm font-bold text-rose-600 dark:text-rose-400">{formError}</p>}

      <div className="flex items-center justify-end">
        <button
          type="button"
          onClick={handlePick}
          disabled={uploading}
          className="rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 px-4 py-2 text-sm font-black text-white shadow-lg shadow-blue-500/20 transition hover:from-blue-700 hover:to-indigo-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {uploading ? t('attachments.uploading', 'Enviando…') : t('attachments.upload', 'Anexar arquivo')}
        </button>
      </div>
    </div>
  );
}

export default LeadAttachmentsPanel;
