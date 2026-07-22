// React default import: tsconfig uses jsx:"preserve", so vitest/esbuild transforms JSX with the
// classic runtime and needs React in scope (same pattern as ImportExportPanel, the tested precedent).
import React, { useState } from 'react';
import { useTranslation } from 'next-i18next';
import { FiDownload, FiRefreshCw, FiPlus, FiTrash2 } from 'react-icons/fi';
import {
  spedService,
  type EcdDeclarant,
  type EcdBook,
  type EcdSigner,
  type EcfDeclarant,
  type EcfSigner,
} from '../../../lib/services/sped.service';
import { resolveError } from '../lib/resolveError';

/** Tabela de UF (0000 campo 07) — reference data mirrored from server SpedEcdDto.UF_CODES. */
const UF_CODES = [
  'AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MG', 'MS', 'MT',
  'PA', 'PB', 'PE', 'PI', 'PR', 'RJ', 'RN', 'RO', 'RR', 'RS', 'SC', 'SE', 'SP', 'TO',
];

const inputClass =
  'rounded-xl border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 focus:border-emerald-500 focus:outline-none disabled:opacity-50';


/**
 * Pure: mirror the ECD J930 superRefine (SpedEcdDto) so the owner gets an inline
 * error before the round-trip. Returns an i18n key suffix under `sped.error.*`, or
 * null when the signer set is valid. Exactly one legal responsible; at least one
 * contador (COD_ASSIN='900') and one non-contador.
 */
export function validateEcdSigners(signers: EcdSigner[]): string | null {
  if (signers.length < 1) return 'signersRequired';
  if (signers.some((s) => !s.identNom.trim() || !s.identCpfCnpj.trim() || !s.codAssin.trim()))
    return 'signersIncomplete';
  const respLegal = signers.filter((s) => s.indRespLegal === 'S');
  if (respLegal.length !== 1) return 'ecdRespLegal';
  const hasContador = signers.some((s) => s.codAssin.trim() === '900');
  const hasNonContador = signers.some((s) => s.codAssin.trim() !== '900');
  if (!hasContador || !hasNonContador) return 'ecdContador';
  return null;
}

/**
 * Pure: mirror the ECF 0930 superRefine (SpedEcfDto). At least one contador
 * (IDENT_QUALIF='900' with CPF 11 digits + IND_CRC) and one non-contador; max 2.
 */
export function validateEcfSigners(signers: EcfSigner[]): string | null {
  if (signers.length < 1 || signers.length > 2) return 'ecfSignerCount';
  if (signers.some((s) => !s.identNom.trim() || !s.identCpfCnpj.trim() || !s.identQualif.trim()))
    return 'signersIncomplete';
  const contadores = signers.filter((s) => s.identQualif.trim() === '900');
  const hasNonContador = signers.some((s) => s.identQualif.trim() !== '900');
  if (contadores.length < 1 || !hasNonContador) return 'ecfContador';
  if (contadores.some((c) => c.identCpfCnpj.trim().length !== 11 || !c.indCrc?.trim()))
    return 'ecfContadorCrc';
  return null;
}

const emptyEcdSigner = (): EcdSigner => ({
  identNom: '',
  identCpfCnpj: '',
  identQualif: '',
  codAssin: '',
  indRespLegal: 'N',
});
const emptyEcfSigner = (): EcfSigner => ({
  identNom: '',
  identCpfCnpj: '',
  identQualif: '',
  indCrc: '',
  email: '',
  fone: '',
});

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs text-neutral-400">
      {label}
      {children}
    </label>
  );
}

/**
 * SPED generation panel (A1b) — owner-facing forms to generate & download the ECD
 * and ECF `.txt` files over the existing generation endpoints. Only the required DTO
 * fields are collected; the backend defaults the rest. ECD needs a ready referential
 * mapping (authored in the CompliancePanel above) — a coverage gap returns 400.
 */
export function SpedGenerationPanel({ unitId }: { unitId: string }) {
  const { t } = useTranslation('accounting');
  const currentYear = new Date().getFullYear();

  // ── ECD state ──────────────────────────────────────────────────────────────
  const [ecdYear, setEcdYear] = useState(String(currentYear - 1));
  const [ecdVersion, setEcdVersion] = useState('');
  const [ecdDeclarant, setEcdDeclarant] = useState<EcdDeclarant>({
    nome: '', cnpj: '', uf: 'SP', codMun: '', indNire: '0', indGrandePorte: '0',
  });
  const [ecdBook, setEcdBook] = useState<EcdBook>({ numOrd: '', natLivr: '', dtExSocial: '' });
  const [ecdSigners, setEcdSigners] = useState<EcdSigner[]>([emptyEcdSigner()]);
  const [ecdBusy, setEcdBusy] = useState(false);
  const [ecdError, setEcdError] = useState<string | null>(null);

  // ── ECF state ──────────────────────────────────────────────────────────────
  const [ecfYear, setEcfYear] = useState(String(currentYear - 1));
  const [ecfDeclarant, setEcfDeclarant] = useState<EcfDeclarant>({
    cnpj: '', nome: '', codNat: '', cnaeFiscal: '', endereco: '', bairro: '',
    uf: 'SP', codMun: '', cep: '', email: '',
  });
  const [ecfCsll, setEcfCsll] = useState<'1' | '4'>('1');
  const [ecfSigners, setEcfSigners] = useState<EcfSigner[]>([emptyEcfSigner()]);
  const [ecfBusy, setEcfBusy] = useState(false);
  const [ecfError, setEcfError] = useState<string | null>(null);

  const genericError = () => t('sped.error.generic', 'Ocorreu um erro. Verifique os campos e tente novamente.');
  const signerError = (code: string) =>
    t(`sped.error.${code}`, t('sped.error.signersInvalid', 'Signatários inválidos.'));

  function setEcdD<K extends keyof EcdDeclarant>(k: K, v: EcdDeclarant[K]) {
    setEcdDeclarant((p) => ({ ...p, [k]: v }));
  }
  function setEcdB<K extends keyof EcdBook>(k: K, v: EcdBook[K]) {
    setEcdBook((p) => ({ ...p, [k]: v }));
  }
  function setEcfD<K extends keyof EcfDeclarant>(k: K, v: EcfDeclarant[K]) {
    setEcfDeclarant((p) => ({ ...p, [k]: v }));
  }

  async function handleGenerateEcd() {
    setEcdError(null);
    const year = Number(ecdYear);
    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      setEcdError(t('sped.error.year', 'Informe um ano válido.'));
      return;
    }
    if (!ecdVersion.trim()) {
      setEcdError(t('sped.error.versionRequired', 'Informe a versão do mapeamento referencial.'));
      return;
    }
    const signerIssue = validateEcdSigners(ecdSigners);
    if (signerIssue) {
      setEcdError(signerError(signerIssue));
      return;
    }
    setEcdBusy(true);
    try {
      await spedService.generateAndDownloadEcd({
        unitId,
        mappingVersion: ecdVersion.trim(),
        year,
        declarant: ecdDeclarant,
        book: ecdBook,
        signers: ecdSigners,
      });
    } catch (err) {
      setEcdError(resolveError(err, genericError()));
    } finally {
      setEcdBusy(false);
    }
  }

  async function handleGenerateEcf() {
    setEcfError(null);
    const year = Number(ecfYear);
    if (!Number.isInteger(year) || year < 2015 || year > 2100) {
      setEcfError(t('sped.error.yearEcf', 'Informe um ano válido (≥ 2015).'));
      return;
    }
    const signerIssue = validateEcfSigners(ecfSigners);
    if (signerIssue) {
      setEcfError(signerError(signerIssue));
      return;
    }
    setEcfBusy(true);
    try {
      await spedService.generateAndDownloadEcf({
        unitId,
        year,
        declarant: ecfDeclarant,
        fiscal: { indAliqCsll: ecfCsll, indRecReceita: '2' },
        signers: ecfSigners,
      });
    } catch (err) {
      setEcfError(resolveError(err, genericError()));
    } finally {
      setEcfBusy(false);
    }
  }

  return (
    <div className="space-y-8">
      {/* ── ECD ─────────────────────────────────────────────────────────────── */}
      <section className="rounded-2xl border border-neutral-800 bg-neutral-900/50 p-5">
        <h2 className="mb-1 text-lg font-semibold text-neutral-200">{t('sped.ecd.title', 'Gerar SPED ECD')}</h2>
        <p className="mb-4 text-sm text-neutral-500">
          {t('sped.ecd.description', 'Escrituração Contábil Digital. Exige o mapeamento referencial completo (badge "Pronto" acima).')}
        </p>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Field label={t('sped.field.year', 'Ano')}>
            <input type="number" value={ecdYear} onChange={(e) => setEcdYear(e.target.value)} className={inputClass} />
          </Field>
          <Field label={t('sped.field.version', 'Versão mapeamento')}>
            <input type="text" value={ecdVersion} onChange={(e) => setEcdVersion(e.target.value)} placeholder="2026" className={inputClass} />
          </Field>
          <Field label={t('sped.field.cnpj', 'CNPJ')}>
            <input type="text" value={ecdDeclarant.cnpj} onChange={(e) => setEcdD('cnpj', e.target.value)} placeholder="14 dígitos" className={inputClass} />
          </Field>
          <Field label={t('sped.field.nome', 'Nome empresarial')}>
            <input type="text" value={ecdDeclarant.nome} onChange={(e) => setEcdD('nome', e.target.value)} className={inputClass} />
          </Field>
          <Field label={t('sped.field.uf', 'UF')}>
            <select value={ecdDeclarant.uf} onChange={(e) => setEcdD('uf', e.target.value)} className={inputClass}>
              {UF_CODES.map((uf) => <option key={uf} value={uf}>{uf}</option>)}
            </select>
          </Field>
          <Field label={t('sped.field.codMun', 'Cód. município (IBGE)')}>
            <input type="text" value={ecdDeclarant.codMun} onChange={(e) => setEcdD('codMun', e.target.value)} placeholder="7 dígitos" className={inputClass} />
          </Field>
          <Field label={t('sped.field.indNire', 'Possui NIRE')}>
            <select value={ecdDeclarant.indNire} onChange={(e) => setEcdD('indNire', e.target.value as '0' | '1')} className={inputClass}>
              <option value="0">{t('sped.opt.no', 'Não')}</option>
              <option value="1">{t('sped.opt.yes', 'Sim')}</option>
            </select>
          </Field>
          <Field label={t('sped.field.indGrandePorte', 'Grande porte')}>
            <select value={ecdDeclarant.indGrandePorte} onChange={(e) => setEcdD('indGrandePorte', e.target.value as '0' | '1')} className={inputClass}>
              <option value="0">{t('sped.opt.no', 'Não')}</option>
              <option value="1">{t('sped.opt.yes', 'Sim')}</option>
            </select>
          </Field>
        </div>

        <h3 className="mb-2 mt-5 text-sm font-semibold text-neutral-300">{t('sped.ecd.book', 'Livro (termo)')}</h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Field label={t('sped.field.numOrd', 'Nº de ordem')}>
            <input type="text" value={ecdBook.numOrd} onChange={(e) => setEcdB('numOrd', e.target.value)} className={inputClass} />
          </Field>
          <Field label={t('sped.field.natLivr', 'Natureza do livro')}>
            <input type="text" value={ecdBook.natLivr} onChange={(e) => setEcdB('natLivr', e.target.value)} placeholder="Diário Geral" className={inputClass} />
          </Field>
          <Field label={t('sped.field.dtExSocial', 'Encerr. exercício')}>
            <input type="date" value={ecdBook.dtExSocial} onChange={(e) => setEcdB('dtExSocial', e.target.value)} className={inputClass} />
          </Field>
        </div>

        <EcdSignersEditor t={t} signers={ecdSigners} setSigners={setEcdSigners} />

        {ecdError && (
          <div className="mt-4 rounded-xl border border-red-900/50 bg-red-950/30 px-4 py-3 text-sm text-red-300">{ecdError}</div>
        )}

        <button
          type="button"
          onClick={handleGenerateEcd}
          disabled={ecdBusy}
          className="mt-4 inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-500 active:bg-emerald-700 disabled:opacity-50"
        >
          {ecdBusy ? <FiRefreshCw className="animate-spin" size={16} /> : <FiDownload size={16} />}
          {ecdBusy ? t('sped.generating', 'Gerando…') : t('sped.ecd.submit', 'Gerar e baixar ECD')}
        </button>
      </section>

      {/* ── ECF ─────────────────────────────────────────────────────────────── */}
      <section className="rounded-2xl border border-neutral-800 bg-neutral-900/50 p-5">
        <h2 className="mb-1 text-lg font-semibold text-neutral-200">{t('sped.ecf.title', 'Gerar SPED ECF')}</h2>
        <p className="mb-4 text-sm text-neutral-500">
          {t('sped.ecf.description', 'Escrituração Contábil Fiscal (Lucro Presumido). O PVA recupera os blocos da ECD ativa.')}
        </p>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Field label={t('sped.field.year', 'Ano')}>
            <input type="number" value={ecfYear} onChange={(e) => setEcfYear(e.target.value)} className={inputClass} />
          </Field>
          <Field label={t('sped.field.cnpj', 'CNPJ')}>
            <input type="text" value={ecfDeclarant.cnpj} onChange={(e) => setEcfD('cnpj', e.target.value)} placeholder="14 dígitos" className={inputClass} />
          </Field>
          <Field label={t('sped.field.nome', 'Nome empresarial')}>
            <input type="text" value={ecfDeclarant.nome} onChange={(e) => setEcfD('nome', e.target.value)} className={inputClass} />
          </Field>
          <Field label={t('sped.field.codNat', 'Nat. jurídica')}>
            <input type="text" value={ecfDeclarant.codNat} onChange={(e) => setEcfD('codNat', e.target.value)} placeholder="2062" className={inputClass} />
          </Field>
          <Field label={t('sped.field.cnae', 'CNAE-Fiscal')}>
            <input type="text" value={ecfDeclarant.cnaeFiscal} onChange={(e) => setEcfD('cnaeFiscal', e.target.value)} placeholder="7 dígitos" className={inputClass} />
          </Field>
          <Field label={t('sped.field.endereco', 'Endereço')}>
            <input type="text" value={ecfDeclarant.endereco} onChange={(e) => setEcfD('endereco', e.target.value)} className={inputClass} />
          </Field>
          <Field label={t('sped.field.bairro', 'Bairro')}>
            <input type="text" value={ecfDeclarant.bairro} onChange={(e) => setEcfD('bairro', e.target.value)} className={inputClass} />
          </Field>
          <Field label={t('sped.field.uf', 'UF')}>
            <select value={ecfDeclarant.uf} onChange={(e) => setEcfD('uf', e.target.value)} className={inputClass}>
              {UF_CODES.map((uf) => <option key={uf} value={uf}>{uf}</option>)}
            </select>
          </Field>
          <Field label={t('sped.field.codMun', 'Cód. município (IBGE)')}>
            <input type="text" value={ecfDeclarant.codMun} onChange={(e) => setEcfD('codMun', e.target.value)} placeholder="7 dígitos" className={inputClass} />
          </Field>
          <Field label={t('sped.field.cep', 'CEP')}>
            <input type="text" value={ecfDeclarant.cep} onChange={(e) => setEcfD('cep', e.target.value)} placeholder="8 dígitos" className={inputClass} />
          </Field>
          <Field label={t('sped.field.email', 'E-mail')}>
            <input type="email" value={ecfDeclarant.email} onChange={(e) => setEcfD('email', e.target.value)} className={inputClass} />
          </Field>
          <Field label={t('sped.field.csll', 'Alíquota CSLL')}>
            <select value={ecfCsll} onChange={(e) => setEcfCsll(e.target.value as '1' | '4')} className={inputClass}>
              <option value="1">9%</option>
              <option value="4">15%</option>
            </select>
          </Field>
        </div>

        <EcfSignersEditor t={t} signers={ecfSigners} setSigners={setEcfSigners} />

        {ecfError && (
          <div className="mt-4 rounded-xl border border-red-900/50 bg-red-950/30 px-4 py-3 text-sm text-red-300">{ecfError}</div>
        )}

        <button
          type="button"
          onClick={handleGenerateEcf}
          disabled={ecfBusy}
          className="mt-4 inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-500 active:bg-emerald-700 disabled:opacity-50"
        >
          {ecfBusy ? <FiRefreshCw className="animate-spin" size={16} /> : <FiDownload size={16} />}
          {ecfBusy ? t('sped.generating', 'Gerando…') : t('sped.ecf.submit', 'Gerar e baixar ECF')}
        </button>
      </section>
    </div>
  );
}

// ── Signer editors ─────────────────────────────────────────────────────────────

type TFn = (key: string, fallback: string) => string;

function EcdSignersEditor({
  t,
  signers,
  setSigners,
}: {
  t: TFn;
  signers: EcdSigner[];
  setSigners: React.Dispatch<React.SetStateAction<EcdSigner[]>>;
}) {
  function update(i: number, k: keyof EcdSigner, v: string) {
    setSigners((prev) => prev.map((s, idx) => (idx === i ? { ...s, [k]: v } : s)));
  }
  return (
    <div className="mt-5">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-neutral-300">{t('sped.signers.title', 'Signatários (J930)')}</h3>
        <button
          type="button"
          onClick={() => setSigners((p) => [...p, emptyEcdSigner()])}
          className="inline-flex items-center gap-1 rounded-lg border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs text-neutral-200 hover:bg-neutral-700"
        >
          <FiPlus size={13} /> {t('sped.signers.add', 'Adicionar')}
        </button>
      </div>
      <div className="space-y-2">
        {signers.map((s, i) => (
          <div key={i} className="grid grid-cols-2 gap-2 rounded-xl border border-neutral-800 p-3 sm:grid-cols-6">
            <input className={inputClass} placeholder={t('sped.field.identNom', 'Nome')} value={s.identNom} onChange={(e) => update(i, 'identNom', e.target.value)} />
            <input className={inputClass} placeholder={t('sped.field.cpfCnpj', 'CPF/CNPJ')} value={s.identCpfCnpj} onChange={(e) => update(i, 'identCpfCnpj', e.target.value)} />
            <input className={inputClass} placeholder={t('sped.field.qualifDesc', 'Qualificação')} value={s.identQualif} onChange={(e) => update(i, 'identQualif', e.target.value)} />
            <input className={inputClass} placeholder={t('sped.field.codAssin', 'Cód. (900=contador)')} value={s.codAssin} onChange={(e) => update(i, 'codAssin', e.target.value)} />
            <select className={inputClass} value={s.indRespLegal} onChange={(e) => update(i, 'indRespLegal', e.target.value)}>
              <option value="N">{t('sped.signers.notResp', 'Não resp. legal')}</option>
              <option value="S">{t('sped.signers.resp', 'Resp. legal')}</option>
            </select>
            <button
              type="button"
              onClick={() => setSigners((p) => p.filter((_, idx) => idx !== i))}
              disabled={signers.length <= 1}
              className="inline-flex items-center justify-center rounded-lg border border-neutral-700 bg-neutral-800 px-2 text-neutral-400 hover:bg-neutral-700 disabled:opacity-40"
              aria-label={t('sped.signers.remove', 'Remover')}
            >
              <FiTrash2 size={14} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function EcfSignersEditor({
  t,
  signers,
  setSigners,
}: {
  t: TFn;
  signers: EcfSigner[];
  setSigners: React.Dispatch<React.SetStateAction<EcfSigner[]>>;
}) {
  function update(i: number, k: keyof EcfSigner, v: string) {
    setSigners((prev) => prev.map((s, idx) => (idx === i ? { ...s, [k]: v } : s)));
  }
  return (
    <div className="mt-5">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-neutral-300">{t('sped.signers.titleEcf', 'Signatários (0930, máx 2)')}</h3>
        <button
          type="button"
          onClick={() => setSigners((p) => (p.length < 2 ? [...p, emptyEcfSigner()] : p))}
          disabled={signers.length >= 2}
          className="inline-flex items-center gap-1 rounded-lg border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs text-neutral-200 hover:bg-neutral-700 disabled:opacity-40"
        >
          <FiPlus size={13} /> {t('sped.signers.add', 'Adicionar')}
        </button>
      </div>
      <div className="space-y-2">
        {signers.map((s, i) => (
          <div key={i} className="grid grid-cols-2 gap-2 rounded-xl border border-neutral-800 p-3 sm:grid-cols-6">
            <input className={inputClass} placeholder={t('sped.field.identNom', 'Nome')} value={s.identNom} onChange={(e) => update(i, 'identNom', e.target.value)} />
            <input className={inputClass} placeholder={t('sped.field.cpfCnpj', 'CPF/CNPJ')} value={s.identCpfCnpj} onChange={(e) => update(i, 'identCpfCnpj', e.target.value)} />
            <input className={inputClass} placeholder={t('sped.field.qualifCode', 'Qualif. (900=contador)')} value={s.identQualif} onChange={(e) => update(i, 'identQualif', e.target.value)} />
            <input className={inputClass} placeholder={t('sped.field.indCrc', 'CRC')} value={s.indCrc ?? ''} onChange={(e) => update(i, 'indCrc', e.target.value)} />
            <input className={inputClass} placeholder={t('sped.field.email', 'E-mail')} value={s.email} onChange={(e) => update(i, 'email', e.target.value)} />
            <div className="flex gap-2">
              <input className={`${inputClass} flex-1`} placeholder={t('sped.field.fone', 'Fone')} value={s.fone} onChange={(e) => update(i, 'fone', e.target.value)} />
              <button
                type="button"
                onClick={() => setSigners((p) => p.filter((_, idx) => idx !== i))}
                disabled={signers.length <= 1}
                className="inline-flex items-center justify-center rounded-lg border border-neutral-700 bg-neutral-800 px-2 text-neutral-400 hover:bg-neutral-700 disabled:opacity-40"
                aria-label={t('sped.signers.remove', 'Remover')}
              >
                <FiTrash2 size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
