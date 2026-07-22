/**
 * Pure HTML serializer for an accounting entry receipt (comprovante de lançamento).
 *
 * Mirrors the "serializer lives in lib/, stays pure" pattern of lib/sped.ts and
 * lib/spreadsheet.ts: it takes a plain data shape (NOT Prisma types) and returns a
 * self-contained HTML string (inline CSS, no external assets) so lib/pdf.ts can render
 * it offline. All logic that can be wrong — money formatting, date rendering, HTML
 * escaping, totals — lives here and is unit-tested; puppeteer is a thin wrapper on top.
 */

export interface ReceiptLine {
  code: string;
  name: string;
  debitCents: number;
  creditCents: number;
}

export interface ReceiptData {
  entryNumber: number;
  fiscalYear: number;
  status: string;
  date: Date;
  description: string;
  sourceType: string;
  sourceId: string | null;
  lines: ReceiptLine[];
}

/** Escapes the five HTML-significant chars — description/account names are user-controlled. */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ponytail: display-only money via integer split (no float) + manual thousands grouping
// (NOT toLocaleString — it silently drops the separator on a small-ICU Node). cents are Int32
// (models/money.ts MAX_CENTS). Promote to a shared server-side formatter only if a 2nd
// consumer appears (memory reuse-criterion-blind-to-reinlined-technique).
function centsToBRL(cents: number): string {
  const neg = cents < 0;
  const abs = Math.abs(cents);
  const reais = String(Math.floor(abs / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const cent = String(abs % 100).padStart(2, '0');
  return `${neg ? '-' : ''}R$ ${reais},${cent}`;
}

// ponytail: UTC getters render the stored calendar date without the local-tz day-shift
// (memory date-only-rendering-utc-shift-class-bug). entry.date is a UTC-midnight DateTime.
function dateBR(d: Date): string {
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getUTCFullYear()}`;
}

/**
 * Renders the receipt HTML. `generatedAt` is injected (not read from the clock) so the
 * output is deterministic and unit-testable.
 */
export function renderReceiptHtml(data: ReceiptData, generatedAt: Date): string {
  const totalDebit = data.lines.reduce((s, l) => s + l.debitCents, 0);
  const totalCredit = data.lines.reduce((s, l) => s + l.creditCents, 0);

  const rows = data.lines
    .map(
      (l) => `
      <tr>
        <td class="code">${escapeHtml(l.code)}</td>
        <td class="name">${escapeHtml(l.name)}</td>
        <td class="num">${l.debitCents > 0 ? centsToBRL(l.debitCents) : ''}</td>
        <td class="num">${l.creditCents > 0 ? centsToBRL(l.creditCents) : ''}</td>
      </tr>`,
    )
    .join('');

  const origem = data.sourceId
    ? `${escapeHtml(data.sourceType)} — ref. ${escapeHtml(data.sourceId)}`
    : escapeHtml(data.sourceType);

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<style>
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #171717; margin: 40px; font-size: 13px; }
  h1 { font-size: 18px; margin: 0 0 4px; }
  .sub { color: #525252; font-size: 12px; margin-bottom: 24px; }
  .meta { margin-bottom: 20px; }
  .meta div { margin: 2px 0; }
  .meta .label { display: inline-block; width: 110px; color: #525252; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  th, td { padding: 6px 8px; border-bottom: 1px solid #e5e5e5; text-align: left; }
  th { background: #f5f5f5; font-size: 11px; text-transform: uppercase; letter-spacing: .04em; color: #525252; }
  td.num, th.num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
  td.code { white-space: nowrap; color: #525252; }
  tfoot td { font-weight: bold; border-top: 2px solid #171717; border-bottom: none; }
  .footer { margin-top: 32px; color: #737373; font-size: 11px; }
</style>
</head>
<body>
  <h1>Comprovante de Lançamento Contábil</h1>
  <div class="sub">Lançamento nº ${data.entryNumber}/${data.fiscalYear} · ${escapeHtml(data.status)}</div>

  <div class="meta">
    <div><span class="label">Data</span>${dateBR(data.date)}</div>
    <div><span class="label">Histórico</span>${escapeHtml(data.description)}</div>
    <div><span class="label">Origem</span>${origem}</div>
  </div>

  <table>
    <thead>
      <tr><th>Conta</th><th>Descrição</th><th class="num">Débito</th><th class="num">Crédito</th></tr>
    </thead>
    <tbody>${rows}
    </tbody>
    <tfoot>
      <tr>
        <td colspan="2">Totais</td>
        <td class="num">${centsToBRL(totalDebit)}</td>
        <td class="num">${centsToBRL(totalCredit)}</td>
      </tr>
    </tfoot>
  </table>

  <div class="footer">Documento gerado eletronicamente em ${dateBR(generatedAt)}.</div>
</body>
</html>`;
}
