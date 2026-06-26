import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

/**
 * §2.1 boundary guard (AC-2.1-B1/B4). The DynamicTable engine must never import the
 * accounting (Prisma first-class) world: no PostingService, no AccountingSync, no
 * mapper/bridge. Integration lives at the controller/bridge layer, one level up —
 * the dependency points accounting → dynamicTables(read-only via repo), never back.
 * This test fails loudly if anyone wires an accounting import into the engine.
 */
const ENGINE_ROOT = join(__dirname, '..');

function tsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...tsFiles(full));
    } else if (entry.endsWith('.ts')) {
      out.push(full);
    }
  }
  return out;
}

// Match an import/require that pulls from the accounting feature or names an accounting
// service — ignores the word elsewhere (comments referencing "accounting" are fine).
const FORBIDDEN = /(from\s+['"][^'"]*features\/accounting[^'"]*['"])|(PostingService|AccountingSyncService|AccountingSyncPort)/;

describe('DynamicTable engine §2.1 boundary', () => {
  it('contains zero accounting imports anywhere under features/dynamicTables', () => {
    const offenders = tsFiles(ENGINE_ROOT).filter((file) => {
      // Don't flag this guard test itself (it names the forbidden tokens on purpose).
      if (file.endsWith('no-accounting-imports.boundary.test.ts')) return false;
      return FORBIDDEN.test(readFileSync(file, 'utf8'));
    });

    expect(offenders).toEqual([]);
  });
});
