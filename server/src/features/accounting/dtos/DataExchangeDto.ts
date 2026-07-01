import { z } from 'zod';
import { IMPORT_KINDS } from '../models/DataExchange.model';

/**
 * Zod DTOs for the accounting Data Exchange (BE-INCR-6). Validation happens at the
 * controller boundary; the service trusts the parsed types.
 */

const dateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Data deve estar no formato YYYY-MM-DD');

/** Export kinds wired so far (Phase 3). EXPORT_IMPORT_ERRORS joins in Phase 5. */
export const IMPLEMENTED_EXPORT_KINDS = [
  'EXPORT_TRIAL_BALANCE',
  'EXPORT_GENERAL_LEDGER',
  'EXPORT_BALANCE_SHEET',
  'EXPORT_INCOME_STATEMENT',
  'EXPORT_TEMPLATE',
] as const;

/** POST /exports body — which report/template to render and in which format. */
export const ExportRequestSchema = z
  .object({
    kind: z.enum(IMPLEMENTED_EXPORT_KINDS),
    format: z.enum(['csv', 'xlsx']),
    unitId: z.string().min(1),
    asOf: dateOnly.optional(),
    accountCode: z.string().min(1).optional(),
    templateKind: z.enum(IMPORT_KINDS).optional(),
  })
  .superRefine((val, ctx) => {
    if ((val.kind === 'EXPORT_BALANCE_SHEET' || val.kind === 'EXPORT_INCOME_STATEMENT') && !val.asOf) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['asOf'], message: 'asOf é obrigatório para BP/DRE.' });
    }
    if (val.kind === 'EXPORT_GENERAL_LEDGER' && !val.accountCode) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['accountCode'], message: 'accountCode é obrigatório para o razão.' });
    }
    if (val.kind === 'EXPORT_TEMPLATE' && !val.templateKind) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['templateKind'], message: 'templateKind é obrigatório para exportar template.' });
    }
  });

export type ExportRequestDto = z.infer<typeof ExportRequestSchema>;

/** Query for job-scoped GET endpoints (job summary, artifact download, rows). */
export const JobScopeQuerySchema = z.object({ unitId: z.string().min(1) });

/** Body fields for a multipart import upload (kind + unitId travel as form fields). */
export const ImportUploadSchema = z.object({
  kind: z.enum(IMPORT_KINDS),
  unitId: z.string().min(1),
});
export type ImportUploadDto = z.infer<typeof ImportUploadSchema>;

/** Body for committing a staged import. */
export const CommitImportSchema = z.object({ unitId: z.string().min(1) });

/** GET /templates/:kind param. */
export const TemplateKindSchema = z.enum(IMPORT_KINDS);
