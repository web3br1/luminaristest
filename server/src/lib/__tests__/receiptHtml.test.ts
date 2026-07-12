import { renderReceiptHtml, type ReceiptData } from '../receiptHtml';

const GENERATED_AT = new Date('2026-07-12T15:30:00.000Z');

function makeData(over: Partial<ReceiptData> = {}): ReceiptData {
  return {
    entryNumber: 7,
    fiscalYear: 2026,
    status: 'Posted',
    date: new Date('2026-07-10T00:00:00.000Z'),
    description: 'Venda de serviço',
    sourceType: 'salon.sale.finalized',
    sourceId: 'sale-123',
    lines: [
      { code: '1.1.1', name: 'Caixa', debitCents: 123456, creditCents: 0 },
      { code: '3.1.1', name: 'Receita de Serviços', debitCents: 0, creditCents: 123456 },
    ],
    ...over,
  };
}

describe('renderReceiptHtml', () => {
  it('formats cents as pt-BR BRL with grouping', () => {
    const html = renderReceiptHtml(makeData(), GENERATED_AT);
    expect(html).toContain('R$ 1.234,56');
  });

  it('renders the stored date without a timezone day-shift (UTC getters)', () => {
    // A UTC-midnight date must render as its own calendar day even in UTC-3.
    const html = renderReceiptHtml(makeData(), GENERATED_AT);
    expect(html).toContain('10/07/2026');
    expect(html).toContain('Documento gerado eletronicamente em 12/07/2026.');
  });

  it('shows the entry header (number/year/status) and origin with ref', () => {
    const html = renderReceiptHtml(makeData(), GENERATED_AT);
    expect(html).toContain('Lançamento nº 7/2026');
    expect(html).toContain('Posted');
    expect(html).toContain('salon.sale.finalized — ref. sale-123');
  });

  it('omits the ref when there is no sourceId', () => {
    const html = renderReceiptHtml(makeData({ sourceType: 'manual', sourceId: null }), GENERATED_AT);
    expect(html).toContain('manual');
    expect(html).not.toContain('ref.');
  });

  it('totals debits and credits independently', () => {
    const html = renderReceiptHtml(
      makeData({
        lines: [
          { code: '1', name: 'A', debitCents: 10000, creditCents: 0 },
          { code: '2', name: 'B', debitCents: 5000, creditCents: 0 },
          { code: '3', name: 'C', debitCents: 0, creditCents: 15000 },
        ],
      }),
      GENERATED_AT,
    );
    // Totais row: débito R$ 150,00 / crédito R$ 150,00.
    expect(html).toContain('R$ 150,00');
  });

  it('escapes HTML-significant characters in user-controlled text', () => {
    const html = renderReceiptHtml(
      makeData({
        description: '<script>alert(1)</script>',
        lines: [{ code: '1.1', name: 'A & B <x>', debitCents: 100, creditCents: 0 }],
      }),
      GENERATED_AT,
    );
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('A &amp; B &lt;x&gt;');
  });
});
