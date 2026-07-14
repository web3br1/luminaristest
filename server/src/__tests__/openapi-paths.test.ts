/**
 * Regression guard for the swagger-jsdoc silent path-drop bug.
 *
 * swagger-jsdoc DROPS an entire `@openapi` path without error when an unquoted `: `
 * (colon-space) appears in a YAML value inside the JSDoc block. It has bitten ≥3× —
 * PR #59 (-17 paths), CNAB, and SPED-ECD — each caught only by luck. This builds the
 * spec straight from source (same `options` the generator uses) and fails if the path
 * count drops below the known baseline, catching a drop BEFORE openapi.json is committed.
 *
 * BASELINE is a floor (`>=`), not an exact match: adding a route never breaks this test.
 * When you legitimately add paths, RAISE BASELINE to the new count on purpose.
 */
/* eslint-disable @typescript-eslint/no-var-requires */
const swaggerJSDoc = require('swagger-jsdoc');
const { options } = require('../../scripts/generate-openapi');
/* eslint-enable @typescript-eslint/no-var-requires */

// Current path count on this branch. Raise deliberately when adding routes.
// +3 (BE-INCR-9B Track A): referential mappings/batch, mappings/copy, skeleton.
// +2 (BE-INCR-9B Track B): referential catalog/import, catalog.
// +1 (BE-INCR-SPED-ECF): POST /api/accounting/sped/ecf/generate.
// +3 (report reports): GET /api/accounting/reports/{cash-flow,period-comparison,daily-journal}.
// +1 (Recibos Fase B): GET /api/accounting/journal-entries/{entryId}/receipt.
// +6 (INCR-AP Contas a Pagar): /api/payables (GET+POST), /reconcile, /{id}, /{id}/pay,
//    /{id}/cancel, /{id}/payments/{paymentId}/cancel.
// +6 (ADR-INCR-APPROVAL maker-checker torre): /api/entry-approvals/pending (GET), /drafts (POST),
//    /drafts/{id} (PUT), /drafts/{id}/submit, /{id}/approve, /{id}/reject.
const BASELINE = 121;

describe('OpenAPI @openapi path coverage', () => {
  it('exposes at least BASELINE paths (guards the swagger-jsdoc `: ` drop bug)', () => {
    const spec = swaggerJSDoc(options) as { paths?: Record<string, unknown> };
    const pathCount = Object.keys(spec.paths || {}).length;

    expect(pathCount).toBeGreaterThanOrEqual(BASELINE);
  });

  // Companion guard: the floor test above cannot catch POLLUTION that RAISES the count. A prose
  // comment containing the literal jsdoc-openapi tag in a globbed file (routes/ or controllers/)
  // makes swagger-jsdoc spread the comment string char-by-char into `paths` as numeric keys
  // "0","1",… — inflating the count while corrupting the served spec (INCR-AP Fase B incident).
  // Every real path key starts with '/'; anything else is junk.
  it('emits no junk (non-slash) path keys', () => {
    const spec = swaggerJSDoc(options) as { paths?: Record<string, unknown> };
    const junk = Object.keys(spec.paths || {}).filter((k) => !k.startsWith('/'));
    expect(junk).toEqual([]);
  });
});
