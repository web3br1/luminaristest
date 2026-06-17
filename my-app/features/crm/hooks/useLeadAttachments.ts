'use client';

import { useCallback, useEffect, useState } from 'react';
import { CrmService, type AttachmentMeta } from '../../../lib/services/crm.service';

export interface LeadAttachmentsState {
  loading: boolean;
  error: string | null;
  attachments: AttachmentMeta[];
  reload: () => Promise<void>;
}

/**
 * Loads the file-store attachments for a single lead via the CRM service
 * (`listAttachments('lead', leadId)`). Returns metadata only — the binary is
 * fetched on demand by the download action. Degrades gracefully on error
 * (empty list + message). Service layer only (contract §3).
 */
export function useLeadAttachments(leadId: string): LeadAttachmentsState {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<AttachmentMeta[]>([]);

  const reload = useCallback(async () => {
    if (!leadId) {
      setAttachments([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await CrmService.listAttachments('lead', leadId);
      setAttachments(res?.data ?? []);
    } catch (e) {
      setAttachments([]);
      setError(e instanceof Error ? e.message : 'Falha ao carregar anexos');
    } finally {
      setLoading(false);
    }
  }, [leadId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { loading, error, attachments, reload };
}
