/**
 * SPED ECD serializer primitives (ADR-INCR-SPED-ECD).
 *
 * Pure format-critical logic — the money, date and determinism class-bugs. These
 * tests pin the domain-ratified rules (Manual Leiaute 9 da ECD, ADE Cofis 01/2026):
 *  - cents -> decimal BR by integer divmod: comma, 2 places, NO thousands sep, no float;
 *  - the value field is UNSIGNED magnitude; the sign lives in a separate D/C indicator;
 *  - date YYYY-MM-DD -> DDMMYYYY by literal slice, NO UTC day-shift at year boundary;
 *  - pipe-delimited line starts and ends with `|`; a `|` inside a field is rejected;
 *  - register counting is derived from the actual emitted lines (cannot drift).
 */
import {
  spedLine,
  centsToSpedDecimal,
  dcIndicator,
  spedDate,
  countRegisters,
  __selfCheck,
  build0000,
  buildI010,
  buildI030,
  buildI050,
  buildI051,
  buildI052,
  buildI150,
  buildI155,
  buildI200,
  buildI250,
  buildJ005,
  buildJ100,
  buildJ150,
  buildJ900,
  buildJ930,
  buildBlockOpen,
  buildBlockClose,
  buildEcdFile,
  serializeEcd,
  type EcdFileInput,
  type Reg0000Input,
} from '../sped';
import { createHash } from 'crypto';

describe('sped serializer primitives', () => {
  describe('centsToSpedDecimal — money, no float, unsigned magnitude', () => {
    it('formats cents as decimal BR with comma and 2 places', () => {
      expect(centsToSpedDecimal(123456)).toBe('1234,56');
      expect(centsToSpedDecimal(100)).toBe('1,00');
      expect(centsToSpedDecimal(5)).toBe('0,05');
      expect(centsToSpedDecimal(0)).toBe('0,00');
    });

    it('emits UNSIGNED magnitude (sign belongs to the D/C indicator)', () => {
      expect(centsToSpedDecimal(-123456)).toBe('1234,56');
      expect(centsToSpedDecimal(-5)).toBe('0,05');
    });

    it('has no thousands separator on large values (float-safe)', () => {
      // A value that (n/100).toFixed(2) could distort; divmod is exact.
      expect(centsToSpedDecimal(214748364799)).toBe('2147483647,99');
    });

    it('rejects non-integer cents (never silently rounds)', () => {
      expect(() => centsToSpedDecimal(10.5)).toThrow();
    });
  });

  describe('dcIndicator — sign as separate D/C column', () => {
    it('debit balance (>=0) is D, credit balance (<0) is C', () => {
      expect(dcIndicator(1)).toBe('D');
      expect(dcIndicator(0)).toBe('D');
      expect(dcIndicator(-1)).toBe('C');
    });
  });

  describe('spedDate — literal slice, no UTC shift', () => {
    it('formats YYYY-MM-DD as DDMMYYYY', () => {
      expect(spedDate('2026-01-31')).toBe('31012026');
    });

    it('does not roll the day back at the year boundary (UTC-shift class bug)', () => {
      // Under a naive new Date('2026-01-01') in America/Sao_Paulo this would be 2025-12-31.
      expect(spedDate('2026-01-01')).toBe('01012026');
    });

    it('rejects a non-calendar date (Feb 30 does not silently roll)', () => {
      expect(() => spedDate('2026-02-30')).toThrow();
      expect(() => spedDate('2026/01/01')).toThrow();
    });
  });

  describe('spedLine — pipe-delimited, starts and ends with pipe', () => {
    it('wraps fields with leading and trailing pipe', () => {
      expect(spedLine(['I150', '01012026', '31012026'])).toBe('|I150|01012026|31012026|');
    });

    it('emits an empty field as empty between pipes', () => {
      expect(spedLine(['I051', '', '1.01.01.00'])).toBe('|I051||1.01.01.00|');
    });

    it('rejects a field containing a pipe (would corrupt the record)', () => {
      expect(() => spedLine(['I050', 'Conta|Ruim'])).toThrow();
    });
  });

  describe('countRegisters — derived from the actual lines', () => {
    it('counts occurrences per register and total lines', () => {
      const lines = ['|0000|x|', '|I150|a|', '|I150|b|', '|I155|c|'];
      const { byRegister, total } = countRegisters(lines);
      expect(byRegister.get('I150')).toBe(2);
      expect(byRegister.get('0000')).toBe(1);
      expect(total).toBe(4);
    });
  });

  it('__selfCheck passes', () => {
    expect(() => __selfCheck()).not.toThrow();
  });
});

// ─── Register builders (field order transcribed from Leiaute 9) ───────────────

const declarant: Reg0000Input = {
  dtIni: '2026-01-01',
  dtFin: '2026-12-31',
  nome: 'EMPRESA TESTE LTDA',
  cnpj: '11222333000181',
  uf: 'SP',
  ie: '',
  codMun: '3550308',
  indSitIniPer: '0',
  indNire: '1',
  indFinEsc: '0',
  indGrandePorte: '0',
  tipEcd: '0',
  identMf: 'N',
  indEscCons: 'N',
  indCentralizada: '0',
  indMudancPc: '0',
  codPlanRef: '2',
};

describe('register builders', () => {
  it('0000 emits 23 fields in the manual order (pp. 64-67)', () => {
    const line = build0000(declarant);
    const fields = line.slice(1, -1).split('|');
    expect(fields).toHaveLength(23);
    expect(fields[0]).toBe('0000');
    expect(fields[1]).toBe('LECD');
    expect(fields[2]).toBe('01012026'); // DT_INI, no UTC shift
    expect(fields[3]).toBe('31122026'); // DT_FIN
    expect(fields[4]).toBe('EMPRESA TESTE LTDA'); // NOME
    expect(fields[5]).toBe('11222333000181'); // CNPJ
    expect(fields[6]).toBe('SP'); // UF
    expect(fields[18]).toBe('N'); // IDENT_MF
    expect(fields[22]).toBe('2'); // COD_PLAN_REF (last)
  });

  it('I010 = REG, IND_ESC, COD_VER_LC (p. 108)', () => {
    expect(buildI010('G')).toBe('|I010|G|9.00|');
  });

  it('I030 carries QTD_LIN and DNRC_ABERT fixed text (pp. 113-114)', () => {
    const line = buildI030({
      numOrd: '1',
      natLivr: 'DIARIO GERAL',
      qtdLin: 500,
      nome: 'EMPRESA TESTE LTDA',
      cnpj: '11222333000181',
      dtExSocial: '2026-12-31',
    });
    const fields = line.slice(1, -1).split('|');
    expect(fields).toHaveLength(12);
    expect(fields[1]).toBe('TERMO DE ABERTURA');
    expect(fields[4]).toBe('500'); // QTD_LIN
    expect(fields[11]).toBe('31122026'); // DT_EX_SOCIAL
  });

  it('I050 = 8 fields with COD_NAT/IND_CTA pre-resolved (pp. 117-118)', () => {
    expect(
      buildI050({ dtAlt: '2026-01-01', codNat: '01', indCta: 'A', nivel: 4, codCta: '1.1.1.01', cta: 'Caixa' }),
    ).toBe('|I050|01012026|01|A|4|1.1.1.01||Caixa|');
  });

  it('I051 has no COD_ENT_REF — only COD_CCUS + COD_CTA_REF (PVA-4, p. 123)', () => {
    expect(buildI051('11100009')).toBe('|I051||11100009|');
  });

  it('I052 = REG, COD_CCUS(empty), COD_AGL (p. 124)', () => {
    expect(buildI052('BP_ATIVO')).toBe('|I052||BP_ATIVO|');
  });

  it('I150 monthly window, literal slice (pp. 131-132)', () => {
    expect(buildI150('2026-01-01', '2026-01-31')).toBe('|I150|01012026|31012026|');
  });

  it('I155 = 9 fields, magnitude + separate D/C (pp. 132-133)', () => {
    // saldo inicial devedor 1000, débitos 500, créditos 200, saldo final devedor 1300
    expect(
      buildI155({ codCta: '1.1.1.01', saldoIniCents: 100000, debitCents: 50000, creditCents: 20000, saldoFinCents: 130000 }),
    ).toBe('|I155|1.1.1.01||1000,00|D|500,00|200,00|1300,00|D|');
  });

  it('I155 credit balance -> C indicator, unsigned value', () => {
    const line = buildI155({ codCta: '2.1', saldoIniCents: -50000, debitCents: 0, creditCents: 10000, saldoFinCents: -60000 });
    const f = line.slice(1, -1).split('|');
    expect(f[3]).toBe('500,00');
    expect(f[4]).toBe('C');
    expect(f[7]).toBe('600,00');
    expect(f[8]).toBe('C');
  });

  it('I200 = 6 fields, IND_LCTO defaults N (pp. 142-143)', () => {
    expect(buildI200({ numLcto: '1', dtLcto: '2026-01-15', vlLctoCents: 130000 })).toBe(
      '|I200|1|15012026|1300,00|N||',
    );
  });

  it('I250 = 9 fields, HIST filled, participante empty (pp. 147-148)', () => {
    expect(
      buildI250({ codCta: '1.1.1.01', vlCents: 130000, indDc: 'D', hist: 'Recebimento' }),
    ).toBe('|I250|1.1.1.01||1300,00|D|||Recebimento||');
  });

  it('J005 = 5 fields, ID_DEM defaults 1 (pp. 171-172)', () => {
    expect(buildJ005({ dtIni: '2026-01-01', dtFin: '2026-12-31' })).toBe(
      '|J005|01012026|31122026|1||',
    );
  });

  it('J100 = 12 fields with IND_GRP_BAL (pp. 174-176)', () => {
    const line = buildJ100({
      codAgl: '1.1.1.01', indCodAgl: 'D', nivelAgl: 4, codAglSup: 'BP_ATIVO',
      indGrpBal: 'A', descr: 'Caixa', vlIniCents: 0, vlFinCents: 130000,
    });
    const f = line.slice(1, -1).split('|');
    expect(f).toHaveLength(12);
    expect(f[2]).toBe('D'); // IND_COD_AGL
    expect(f[5]).toBe('A'); // IND_GRP_BAL
    expect(f[9]).toBe('1300,00'); // VL_CTA_FIN
    expect(f[10]).toBe('D'); // IND_DC_CTA_FIN
  });

  it('J150 = 13 fields with NU_ORDEM + IND_GRP_DRE (pp. 180-182)', () => {
    const line = buildJ150({
      nuOrdem: 1, codAgl: '3.1', indCodAgl: 'D', nivelAgl: 2,
      descr: 'Receita de Vendas', vlIniCents: 0, vlFinCents: -500000, indGrpDre: 'R',
    });
    const f = line.slice(1, -1).split('|');
    expect(f).toHaveLength(13);
    expect(f[1]).toBe('1'); // NU_ORDEM
    expect(f[11]).toBe('R'); // IND_GRP_DRE
  });

  it('J900 = 8 fields with fixed encerramento text (pp. 195-196)', () => {
    const line = buildJ900({
      numOrd: '1', natLivro: 'DIARIO GERAL', nome: 'EMPRESA TESTE LTDA',
      qtdLin: 500, dtIniEscr: '2026-01-01', dtFinEscr: '2026-12-31',
    });
    const f = line.slice(1, -1).split('|');
    expect(f).toHaveLength(8);
    expect(f[1]).toBe('TERMO DE ENCERRAMENTO');
    expect(f[5]).toBe('500');
  });

  it('J930 = 12 fields, QUALIF codes passthrough (pp. 199-201)', () => {
    const line = buildJ930({
      identNom: 'FULANO CONTADOR', identCpfCnpj: '12345678909',
      identQualif: 'Contador', codAssin: '900', indCrc: 'SP123456',
      email: 'c@x.com', fone: '11999998888', ufCrc: 'SP', indRespLegal: 'N',
    });
    const f = line.slice(1, -1).split('|');
    expect(f).toHaveLength(12);
    expect(f[3]).toBe('Contador'); // IDENT_QUALIF (campo 04)
    expect(f[4]).toBe('900'); // COD_ASSIN (campo 05)
    expect(f[11]).toBe('N'); // IND_RESP_LEGAL
  });

  it('block open = REG + 0; block close = REG + count', () => {
    expect(buildBlockOpen('I001')).toBe('|I001|0|');
    expect(buildBlockClose('I990', 42)).toBe('|I990|42|');
  });
});

// ─── File assembler (block order + counters + determinism) ────────────────────

function minimalInput(): EcdFileInput {
  return {
    declarant,
    indEsc: 'G',
    book: { numOrd: '1', natLivr: 'DIARIO GERAL', dtExSocial: '2026-12-31' },
    accounts: [
      { account: { dtAlt: '2026-01-01', codNat: '01', indCta: 'S', nivel: 1, codCta: '1', cta: 'ATIVO' } },
      {
        account: { dtAlt: '2026-01-01', codNat: '01', indCta: 'A', nivel: 2, codCta: '1.1', codCtaSup: '1', cta: 'Caixa' },
        refCode: '11100009',
        aglCode: '1.1',
      },
      {
        account: { dtAlt: '2026-01-01', codNat: '04', indCta: 'A', nivel: 2, codCta: '3.1', cta: 'Receita' },
        refCode: '31000001',
        aglCode: '3.1',
      },
    ],
    months: [
      {
        dtIni: '2026-01-01',
        dtFin: '2026-01-31',
        saldos: [
          { codCta: '1.1', saldoIniCents: 0, debitCents: 50000, creditCents: 0, saldoFinCents: 50000 },
          { codCta: '3.1', saldoIniCents: 0, debitCents: 0, creditCents: 50000, saldoFinCents: -50000 },
        ],
      },
    ],
    entries: [
      {
        entry: { numLcto: '1', dtLcto: '2026-01-15', vlLctoCents: 50000 },
        legs: [
          { codCta: '1.1', vlCents: 50000, indDc: 'D', hist: 'Venda' },
          { codCta: '3.1', vlCents: 50000, indDc: 'C', hist: 'Venda' },
        ],
      },
    ],
    balanceSheet: [
      { codAgl: 'BP_ATIVO', indCodAgl: 'T', nivelAgl: 1, indGrpBal: 'A', descr: 'ATIVO', vlIniCents: 0, vlFinCents: 50000 },
      { codAgl: '1.1', indCodAgl: 'D', nivelAgl: 2, codAglSup: 'BP_ATIVO', indGrpBal: 'A', descr: 'Caixa', vlIniCents: 0, vlFinCents: 50000 },
    ],
    incomeStatement: [
      { nuOrdem: 1, codAgl: 'DRE_REC', indCodAgl: 'T', nivelAgl: 1, descr: 'RECEITAS', vlIniCents: 0, vlFinCents: -50000, indGrpDre: 'R' },
      { nuOrdem: 2, codAgl: '3.1', indCodAgl: 'D', nivelAgl: 2, codAglSup: 'DRE_REC', descr: 'Receita', vlIniCents: 0, vlFinCents: -50000, indGrpDre: 'R' },
    ],
    signers: [
      { identNom: 'RESP LEGAL', identCpfCnpj: '11222333000181', identQualif: 'Administrador', codAssin: '205', indRespLegal: 'S' },
      { identNom: 'CONTADOR', identCpfCnpj: '12345678909', identQualif: 'Contador', codAssin: '900', indCrc: 'SP1', email: 'c@x.com', fone: '11999998888', ufCrc: 'SP', indRespLegal: 'N' },
    ],
  };
}

describe('buildEcdFile — assembly', () => {
  it('emits blocks in order 0 → I → J → 9', () => {
    const lines = buildEcdFile(minimalInput());
    const regs = lines.map((l) => l.split('|')[1]);
    expect(regs[0]).toBe('0000');
    expect(regs[regs.length - 1]).toBe('9999');
    // I052 appears between I051 and the next I050/I150 for analytic accounts
    expect(regs).toContain('I052');
    // block order: last 0-block is 0990 before first I-block I001
    expect(regs.indexOf('0990')).toBeLessThan(regs.indexOf('I001'));
    expect(regs.indexOf('I990')).toBeLessThan(regs.indexOf('J001'));
    expect(regs.indexOf('J990')).toBeLessThan(regs.indexOf('9001'));
  });

  it('9999 equals the true total line count', () => {
    const lines = buildEcdFile(minimalInput());
    const last = lines[lines.length - 1].slice(1, -1).split('|');
    expect(last[0]).toBe('9999');
    expect(Number(last[1])).toBe(lines.length);
  });

  it('I030.QTD_LIN and J900.QTD_LIN both equal 9999 total (cross-register rule)', () => {
    const lines = buildEcdFile(minimalInput());
    const total = lines.length;
    const i030 = lines.find((l) => l.startsWith('|I030|'))!.slice(1, -1).split('|');
    const j900 = lines.find((l) => l.startsWith('|J900|'))!.slice(1, -1).split('|');
    expect(Number(i030[4])).toBe(total); // I030 campo 05
    expect(Number(j900[5])).toBe(total); // J900 campo 06
  });

  it('9900 has one line per register type present, self-referential (PVA-6)', () => {
    const lines = buildEcdFile(minimalInput());
    const nine900 = lines.filter((l) => l.startsWith('|9900|'));
    const distinctTypes = new Set(lines.map((l) => l.split('|')[1]));
    // one 9900 line per distinct register type
    expect(nine900).toHaveLength(distinctTypes.size);
    // each 9900 count matches the actual occurrences in the file
    const actual = countRegisters(lines).byRegister;
    for (const l of nine900) {
      const [, reg, qtd] = l.slice(1, -1).split('|');
      expect(Number(qtd)).toBe(actual.get(reg));
    }
  });

  it('block closers count their own block lines', () => {
    const lines = buildEcdFile(minimalInput());
    const blockOf = (reg: string) => lines.filter((l) => l.split('|')[1]?.[0] === reg[0]);
    // I990 QTD == number of I-block lines
    const i990 = lines.find((l) => l.startsWith('|I990|'))!.slice(1, -1).split('|');
    const iCount = lines.filter((l) => /^\|I/.test(l)).length;
    expect(Number(i990[1])).toBe(iCount);
    void blockOf;
  });

  it('is deterministic — same input → byte-identical (sha256), D8', () => {
    const a = serializeEcd(buildEcdFile(minimalInput()));
    const b = serializeEcd(buildEcdFile(minimalInput()));
    const h = (s: string) => createHash('sha256').update(Buffer.from(s, 'latin1')).digest('hex');
    expect(h(a)).toBe(h(b));
  });

  it('serializeEcd terminates every record with CRLF (PVA-7)', () => {
    const text = serializeEcd(['|9001|0|', '|9999|2|']);
    expect(text).toBe('|9001|0|\r\n|9999|2|\r\n');
  });

  it('I052 only for analytic accounts, never synthetic', () => {
    const lines = buildEcdFile(minimalInput());
    // synthetic account "1" (ATIVO) must NOT get I051/I052 children
    const idxSynthetic = lines.findIndex((l) => l === '|I050|01012026|01|S|1|1||ATIVO|');
    expect(idxSynthetic).toBeGreaterThan(-1);
    // the line immediately after the synthetic I050 is another I050 (no I051/I052)
    expect(lines[idxSynthetic + 1].startsWith('|I050|')).toBe(true);
  });
});
