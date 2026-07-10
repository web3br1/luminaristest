import { z } from 'zod';
import { isValidDateOnly } from '../models/dates';

/**
 * Zod DTO for SPED ECD generation (ADR-INCR-SPED-ECD, D3). The declarant
 * identity (register 0000), the book term (I030/J900) and the signers (J930)
 * are TRANSIENT request params — they do NOT exist in the ledger and are NEVER
 * persisted as a LegalEntity/CompanyProfile (would reopen the rejected
 * multi-company tower, master map §4). Validation is shape-only at the boundary;
 * the service trusts the parsed types. `.strict()` rejects unknown keys.
 */

const dateOnly = z
  .string()
  .refine(isValidDateOnly, 'Data deve ser uma data real no formato YYYY-MM-DD');

/** Tabela de Unidades da Federação (0000 campo 07, manual p. 67). */
export const UF_CODES = [
  'AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MG', 'MS', 'MT',
  'PA', 'PB', 'PE', 'PI', 'PR', 'RJ', 'RN', 'RO', 'RR', 'RS', 'SC', 'SE', 'SP', 'TO',
] as const;

const cnpj = z.string().regex(/^\d{14}$/, 'CNPJ deve ter 14 dígitos (só números).');
const cpfOrCnpj = z.string().regex(/^\d{11}$|^\d{14}$/, 'CPF (11) ou CNPJ (14) dígitos.');

/** Declarante — identificação do registro 0000 (manual pp. 64-67). */
const DeclarantSchema = z
  .object({
    nome: z.string().min(1).max(150),
    cnpj,
    uf: z.enum(UF_CODES),
    ie: z.string().optional(),
    codMun: z.string().regex(/^\d{7}$/, 'Código IBGE do município = 7 dígitos.'),
    im: z.string().optional(),
    indSitEsp: z.enum(['1', '2', '3', '4']).optional(), // cisão/fusão/incorp/extinção
    indSitIniPer: z.enum(['0', '1', '2']).default('0'),
    indNire: z.enum(['0', '1']),
    indFinEsc: z.enum(['0', '1']).default('0'), // 0=Original
    codHashSub: z.string().optional(),
    indGrandePorte: z.enum(['0', '1']),
    tipEcd: z.enum(['0', '1', '2']).default('0'),
    codScp: cnpj.optional(),
    identMf: z.enum(['S', 'N']).default('N'), // MVP: N (sem moeda funcional)
    indEscCons: z.enum(['S', 'N']).default('N'),
    indCentralizada: z.enum(['0', '1']).default('0'),
    indMudancPc: z.enum(['0', '1']).default('0'),
    codPlanRef: z.enum(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10']).optional(),
  })
  .strict();

/** Livro — termo de abertura/encerramento (I030/J900, manual pp. 113/195). */
const BookSchema = z
  .object({
    numOrd: z.string().min(1),
    natLivr: z.string().min(1).max(80),
    nire: z.string().optional(),
    dtArq: dateOnly.optional(),
    dtArqConv: dateOnly.optional(),
    descMun: z.string().optional(),
    dtExSocial: dateOnly, // encerramento do exercício social (obrigatório)
  })
  .strict();

/** Signatário — J930 (manual pp. 199-201). COD_ASSIN/IDENT_QUALIF validados por
 * shape; a tabela de qualificação (PVA-5) é responsabilidade do declarante. */
const SignerSchema = z
  .object({
    identNom: z.string().min(1),
    identCpfCnpj: cpfOrCnpj,
    identQualif: z.string().min(1), // descrição (campo 04)
    codAssin: z.string().regex(/^\d{3}$/, 'COD_ASSIN = 3 dígitos.'), // campo 05
    indCrc: z.string().optional(),
    email: z.string().optional(),
    fone: z.string().optional(),
    ufCrc: z.enum(UF_CODES).optional(),
    numSeqCrc: z.string().optional(),
    dtCrc: dateOnly.optional(),
    indRespLegal: z.enum(['S', 'N']),
  })
  .strict();

/**
 * POST /sped/ecd/generate body. `year` drives the annual window (Jan 1 → Dec 31,
 * D11); the MVP is annual only (D4), so no dtIni/dtFin override is exposed.
 */
export const SpedEcdRequestSchema = z
  .object({
    unitId: z.string().min(1),
    mappingVersion: z.string().min(1),
    year: z.number().int().gte(2000).lte(2100),
    declarant: DeclarantSchema,
    book: BookSchema,
    signers: z.array(SignerSchema).min(1),
  })
  .strict()
  .superRefine((val, ctx) => {
    // J930 compliance (REGRA_OBRIGATORIO_ASSIN_CONTADOR / _UM_RESP_LEGAL, p. 200):
    // exactly one legal responsible, at least one contador (900) and one non-900.
    const respLegal = val.signers.filter((s) => s.indRespLegal === 'S');
    if (respLegal.length !== 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['signers'],
        message: 'Deve haver exatamente um signatário responsável legal (IND_RESP_LEGAL=S).',
      });
    }
    const hasContador = val.signers.some((s) => s.codAssin === '900');
    const hasNonContador = val.signers.some((s) => s.codAssin !== '900');
    if (!hasContador || !hasNonContador) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['signers'],
        message: 'A ECD exige um signatário contador (COD_ASSIN=900) e um não-contador.',
      });
    }
  });

export type SpedEcdRequestDto = z.infer<typeof SpedEcdRequestSchema>;
export type SpedDeclarantDto = z.infer<typeof DeclarantSchema>;
export type SpedBookDto = z.infer<typeof BookSchema>;
export type SpedSignerDto = z.infer<typeof SignerSchema>;
