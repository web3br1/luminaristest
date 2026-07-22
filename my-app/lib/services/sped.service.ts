import { apiClient } from '../api/api-client';
import { dataExchangeService, type DataExchangeJob } from './dataExchange.service';

/**
 * SPED generation service — typed client over `/api/accounting/sped/{ecd,ecf}/generate`
 * (BE-INCR-SPED-ECD / ECF). Each endpoint stages an EXPORT_SPED_* job and returns its
 * summary; the `.txt` downloads through the existing data-exchange job route
 * (`dataExchangeService.downloadArtifact`). Only the REQUIRED DTO fields are sent —
 * the backend schemas default the rest (`.strict()` rejects only UNKNOWN keys, so
 * omitting a defaulted/optional key is safe).
 */

interface Envelope<T> {
  success: boolean;
  data: T;
}

// ── ECD (SpedEcdRequestSchema, required subset) ────────────────────────────────
export interface EcdDeclarant {
  nome: string;
  cnpj: string;
  uf: string;
  codMun: string;
  indNire: '0' | '1';
  indGrandePorte: '0' | '1';
}
export interface EcdBook {
  numOrd: string;
  natLivr: string;
  dtExSocial: string; // YYYY-MM-DD
}
export interface EcdSigner {
  identNom: string;
  identCpfCnpj: string;
  identQualif: string; // free description
  codAssin: string; // 3 digits ('900' = contador)
  indRespLegal: 'S' | 'N';
}
export interface GenerateEcdPayload {
  unitId: string;
  mappingVersion: string;
  year: number;
  declarant: EcdDeclarant;
  book: EcdBook;
  signers: EcdSigner[];
}

// ── ECF (SpedEcfRequestSchema, required subset) ────────────────────────────────
export interface EcfDeclarant {
  cnpj: string;
  nome: string;
  codNat: string;
  cnaeFiscal: string;
  endereco: string;
  bairro: string;
  uf: string;
  codMun: string;
  cep: string;
  email: string;
}
export interface EcfSigner {
  identNom: string;
  identCpfCnpj: string;
  identQualif: string; // 3 digits ('900' = contador)
  indCrc?: string;
  email: string;
  fone: string;
}
export interface GenerateEcfPayload {
  unitId: string;
  year: number;
  declarant: EcfDeclarant;
  fiscal?: { indAliqCsll: '1' | '4'; indRecReceita: '1' | '2' };
  signers: EcfSigner[];
}

export const spedService = {
  /** Generate the ECD .txt and immediately download it. Requires coverage.ready. */
  async generateAndDownloadEcd(payload: GenerateEcdPayload): Promise<DataExchangeJob> {
    const res = await apiClient.post<Envelope<DataExchangeJob>>(
      '/accounting/sped/ecd/generate',
      payload,
    );
    const job = res.data;
    await dataExchangeService.downloadArtifact(
      job.id,
      payload.unitId,
      job.fileName ?? `sped-ecd-${payload.year}.txt`,
    );
    return job;
  },

  /** Generate the ECF .txt and immediately download it. */
  async generateAndDownloadEcf(payload: GenerateEcfPayload): Promise<DataExchangeJob> {
    const res = await apiClient.post<Envelope<DataExchangeJob>>(
      '/accounting/sped/ecf/generate',
      payload,
    );
    const job = res.data;
    await dataExchangeService.downloadArtifact(
      job.id,
      payload.unitId,
      job.fileName ?? `sped-ecf-${payload.year}.txt`,
    );
    return job;
  },
};
