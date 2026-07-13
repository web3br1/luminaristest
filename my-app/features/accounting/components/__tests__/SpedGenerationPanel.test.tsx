import { describe, it, expect } from 'vitest';
import { validateEcdSigners, validateEcfSigners } from '../SpedGenerationPanel';
import type { EcdSigner, EcfSigner } from '../../../../lib/services/sped.service';

const ecd = (o: Partial<EcdSigner> = {}): EcdSigner => ({
  identNom: 'Fulano',
  identCpfCnpj: '12345678901',
  identQualif: 'Sócio',
  codAssin: '205',
  indRespLegal: 'N',
  ...o,
});
const ecf = (o: Partial<EcfSigner> = {}): EcfSigner => ({
  identNom: 'Fulano',
  identCpfCnpj: '12345678901',
  identQualif: '205',
  indCrc: '',
  email: 'a@b.com',
  fone: '11999999999',
  ...o,
});

describe('validateEcdSigners (J930)', () => {
  it('accepts one legal-rep + one contador(900) + one non-contador', () => {
    const signers = [
      ecd({ codAssin: '900', indRespLegal: 'N' }),
      ecd({ codAssin: '205', indRespLegal: 'S' }),
    ];
    expect(validateEcdSigners(signers)).toBeNull();
  });

  it('rejects when no legal responsible', () => {
    expect(validateEcdSigners([ecd({ codAssin: '900' }), ecd({ codAssin: '205' })])).toBe('ecdRespLegal');
  });

  it('rejects when two legal responsibles', () => {
    const signers = [ecd({ codAssin: '900', indRespLegal: 'S' }), ecd({ codAssin: '205', indRespLegal: 'S' })];
    expect(validateEcdSigners(signers)).toBe('ecdRespLegal');
  });

  it('rejects when no contador (no 900)', () => {
    expect(validateEcdSigners([ecd({ codAssin: '205', indRespLegal: 'S' })])).toBe('ecdContador');
  });

  it('rejects when only contador (no non-900)', () => {
    const signers = [ecd({ codAssin: '900', indRespLegal: 'S' }), ecd({ codAssin: '900', indRespLegal: 'N' })];
    expect(validateEcdSigners(signers)).toBe('ecdContador');
  });

  it('rejects incomplete rows and empty set', () => {
    expect(validateEcdSigners([])).toBe('signersRequired');
    expect(validateEcdSigners([ecd({ identNom: '  ' })])).toBe('signersIncomplete');
  });
});

describe('validateEcfSigners (0930)', () => {
  it('accepts one contador(900, cpf11, crc) + one non-contador', () => {
    const signers = [
      ecf({ identQualif: '900', identCpfCnpj: '12345678901', indCrc: 'SP-123' }),
      ecf({ identQualif: '205' }),
    ];
    expect(validateEcfSigners(signers)).toBeNull();
  });

  it('rejects more than 2 signers', () => {
    expect(validateEcfSigners([ecf(), ecf(), ecf()])).toBe('ecfSignerCount');
  });

  it('rejects when no contador + non-contador mix', () => {
    expect(validateEcfSigners([ecf({ identQualif: '205' })])).toBe('ecfContador');
  });

  it('rejects contador without CRC', () => {
    const signers = [ecf({ identQualif: '900', identCpfCnpj: '12345678901', indCrc: '' }), ecf({ identQualif: '205' })];
    expect(validateEcfSigners(signers)).toBe('ecfContadorCrc');
  });

  it('rejects contador with CNPJ (not 11-digit CPF)', () => {
    const signers = [ecf({ identQualif: '900', identCpfCnpj: '12345678000199', indCrc: 'SP-1' }), ecf({ identQualif: '205' })];
    expect(validateEcfSigners(signers)).toBe('ecfContadorCrc');
  });
});
