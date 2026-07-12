import { z } from 'zod';
import { UF_CODES } from './SpedEcdDto';

/**
 * Zod DTO for SPED ECF generation (ADR-INCR-SPED-ECF, D4 — TRANSIENTE).
 * The declarant identity/cadastral (registers 0000/0030) and the signers (0930)
 * are transient request params — never persisted as a TaxRegime/LegalEntity
 * (would reopen the rejected multi-company tower, master map §4). Validation is
 * shape-only at the boundary; `.strict()` rejects unknown keys.
 *
 * Passo A (FASE 2) — o que NÃO existe neste DTO e por quê:
 *  - `ecdRecibo`/`ecdHash`: os Blocos C/E são recuperados PELO PVA da ECD ativa
 *    na base (não importados) — não há campo de recibo/hash a preencher.
 *  - `mappingVersion`: o `.txt` não emite linha keyed por código referencial RFB
 *    (P100/P150/J/K recuperados pelo PVA); o gate é exaustividade da RECEITA
 *    (contas Revenue → linha de presunção), não cobertura referencial.
 * Regime fixo = Lucro Presumido (D1); os parâmetros fiscais fixos (FORMA_TRIB=5,
 * FORMA_APUR=T, TIP_ESC_PRE=C, FORMA_TRIB_PER=PPPP) são default do serviço, não
 * input do usuário.
 */

const cnpj = z.string().regex(/^\d{14}$/, 'CNPJ deve ter 14 dígitos (só números).');
const cpfOrCnpj = z.string().regex(/^\d{11}$|^\d{14}$/, 'CPF (11) ou CNPJ (14) dígitos.');

/** Declarante — identificação (0000) + dados cadastrais (0030). Manual pp. 61-101. */
const DeclarantSchema = z
  .object({
    // 0000
    cnpj,
    nome: z.string().min(1).max(150),
    // 0030
    codNat: z.string().regex(/^\d{3,4}$/, 'Código de natureza jurídica (tabela Sped).'),
    cnaeFiscal: z.string().regex(/^\d{7}$/, 'CNAE-Fiscal = 7 dígitos.'),
    endereco: z.string().min(1).max(150),
    num: z.string().max(6).default('S/N'),
    compl: z.string().max(50).optional(),
    bairro: z.string().min(1).max(50),
    uf: z.enum(UF_CODES),
    codMun: z.string().regex(/^\d{7}$/, 'Código IBGE do município = 7 dígitos.'),
    cep: z.string().regex(/^\d{8}$/, 'CEP = 8 dígitos (só números).'),
    numTel: z.string().max(15).optional(),
    email: z.string().email('E-mail inválido.'),
  })
  .strict();

/** Parâmetros fiscais opcionais (0010/0020). Defaults = Presumido trimestral 9% CSLL. */
const FiscalSchema = z
  .object({
    // 0020.IND_ALIQ_CSLL — ECF ≥ 2019 ∈ {1 (9%), 4 (15%)} (REGRA_PREENCHIMENTO_IND_ALIQ_CSSL).
    indAliqCsll: z.enum(['1', '4']).default('1'),
    // 0010.IND_REC_RECEITA — 2 = Regime de Competência (default; mantém a ECD).
    indRecReceita: z.enum(['1', '2']).default('2'),
  })
  .strict();

/**
 * Signatário — 0930 (7 campos, máx 2). Manual pp. 103-106. IDENT_QUALIF é código
 * de 3 dígitos da tabela SPEDECF_QUALIF_ASSINANTE ('900' = Contador). Quando
 * '900' ⇒ CPF (11 dígitos) e IND_CRC obrigatórios.
 */
const SignerSchema = z
  .object({
    identNom: z.string().min(1),
    identCpfCnpj: cpfOrCnpj,
    identQualif: z.string().regex(/^\d{3}$/, 'IDENT_QUALIF = 3 dígitos (tabela Sped).'),
    indCrc: z.string().optional(),
    email: z.string().email('E-mail do signatário inválido.'),
    fone: z.string().min(1).max(14),
  })
  .strict();

/**
 * POST /sped/ecf/generate body. `year` drives the four quarterly windows (D3).
 * Regime = Presumido (D1). No dtIni/dtFin override (annual calendar → 4 trimestres).
 */
export const SpedEcfRequestSchema = z
  .object({
    unitId: z.string().min(1),
    year: z.number().int().gte(2015).lte(2100),
    declarant: DeclarantSchema,
    fiscal: FiscalSchema.default({ indAliqCsll: '1', indRecReceita: '2' }),
    signers: z.array(SignerSchema).min(1).max(2),
  })
  .strict()
  .superRefine((val, ctx) => {
    // 0930 compliance (REGRA_OBRIGATORIO_ASSIN_CONTADOR, p. 104): ≥1 contador
    // (IDENT_QUALIF='900' com IND_CRC) e ≥1 não-contador.
    const contadores = val.signers.filter((s) => s.identQualif === '900');
    const hasNonContador = val.signers.some((s) => s.identQualif !== '900');
    if (contadores.length < 1 || !hasNonContador) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['signers'],
        message: 'A ECF exige um signatário contador (IDENT_QUALIF=900) e um não-contador.',
      });
    }
    for (const c of contadores) {
      if (c.identCpfCnpj.length !== 11 || !c.indCrc) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['signers'],
          message: 'O signatário contador (900) exige CPF de 11 dígitos e IND_CRC.',
        });
      }
    }
  });

export type SpedEcfRequestDto = z.infer<typeof SpedEcfRequestSchema>;
export type SpedEcfDeclarantDto = z.infer<typeof DeclarantSchema>;
export type SpedEcfSignerDto = z.infer<typeof SignerSchema>;
