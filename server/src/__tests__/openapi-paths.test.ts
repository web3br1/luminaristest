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
const BASELINE = 98;

describe('OpenAPI @openapi path coverage', () => {
  it('exposes at least BASELINE paths (guards the swagger-jsdoc `: ` drop bug)', () => {
    const spec = swaggerJSDoc(options) as { paths?: Record<string, unknown> };
    const pathCount = Object.keys(spec.paths || {}).length;

    expect(pathCount).toBeGreaterThanOrEqual(BASELINE);
  });
});
