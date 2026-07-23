/**
 * CLASS GATE — every audit eventType a service EMITS must exist in PAYLOAD_ALLOWLIST.
 *
 * Why this test exists: `canonicalizeAuditPayload` THROWS on an unknown eventType, and
 * `AuditService.append` runs INSIDE the write transaction — so an emitted-but-unlisted event
 * does not degrade, it 500s the whole operation and rolls back. Service unit tests mock the
 * AuditService, so the allowlist is never exercised on the real path; this gap shipped
 * INCR-COUNTERPARTY, INCR-DIM-COMPLETENESS and the reconciliation/SPED write-paths broken
 * (every mutation 500'd) despite green suites and independent review.
 *
 * This test statically scans the accounting feature source for every `eventType:` occurrence —
 * both string literals and identifier constants (resolved from their `export const X = '...'`
 * declaration) — and asserts each resolved value is a key in the allowlist. It is the check
 * that would have failed on the bug, so the class cannot silently reappear.
 */
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { PAYLOAD_ALLOWLIST } from '../auditCanonical';

const FEATURE_ROOT = join(__dirname, '..', '..'); // server/src/features/accounting

function walkTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (entry === '__tests__' || entry === 'node_modules') continue;
      out.push(...walkTsFiles(full));
    } else if (entry.endsWith('.ts')) {
      out.push(full);
    }
  }
  return out;
}

/** Resolve `export const NAME = 'event.type'` declarations across the feature into a map. */
function collectEventConstants(files: string[]): Map<string, string> {
  const map = new Map<string, string>();
  const re = /export const ([A-Z0-9_]+)\s*=\s*'([a-z0-9_.]+)'/g;
  for (const f of files) {
    const src = readFileSync(f, 'utf8');
    let m: RegExpExecArray | null;
    while ((m = re.exec(src)) !== null) map.set(m[1], m[2]);
  }
  return map;
}

/** Every `eventType:` value emitted, resolved to its literal string. Includes ternary literals. */
function collectEmittedEventTypes(files: string[], consts: Map<string, string>): Set<string> {
  const emitted = new Set<string>();
  // matches `eventType: 'x'`, `eventType: CONST`, and `eventType: cond ? 'a' : 'b'`
  const re = /eventType:\s*([^,\n]+)/g;
  const litRe = /'([a-z0-9_.]+)'/g;
  const identRe = /\b([A-Z0-9_]{2,})\b/g;
  for (const f of files) {
    const src = readFileSync(f, 'utf8');
    let m: RegExpExecArray | null;
    while ((m = re.exec(src)) !== null) {
      const rhs = m[1];
      let lit: RegExpExecArray | null;
      let hadLiteral = false;
      while ((lit = litRe.exec(rhs)) !== null) {
        emitted.add(lit[1]);
        hadLiteral = true;
      }
      if (!hadLiteral) {
        let id: RegExpExecArray | null;
        while ((id = identRe.exec(rhs)) !== null) {
          const resolved = consts.get(id[1]);
          if (resolved) emitted.add(resolved);
        }
      }
    }
  }
  return emitted;
}

describe('audit allowlist coverage (class gate)', () => {
  const files = walkTsFiles(FEATURE_ROOT);
  const consts = collectEventConstants(files);
  const emitted = collectEmittedEventTypes(files, consts);

  it('discovers a non-trivial set of emitted eventTypes (guards the scanner itself)', () => {
    // If the scanner silently matched nothing, the coverage assertion below would vacuously pass.
    expect(emitted.size).toBeGreaterThan(20);
    expect(emitted.has('entry.posted')).toBe(true);
    expect(emitted.has('counterparty.created')).toBe(true);
  });

  it('every emitted eventType is present in PAYLOAD_ALLOWLIST', () => {
    const missing = [...emitted].filter((e) => !(e in PAYLOAD_ALLOWLIST)).sort();
    expect(missing).toEqual([]);
  });
});
