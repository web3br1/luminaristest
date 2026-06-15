/*
  Temporary development seed helper.
  Enable via NEXT_PUBLIC_ENABLE_DEV_SEED=true to show the trigger button in the UI.
  Safe to delete after tests.
*/
import type { IDynamicTable } from '../dashboard/components/shared/dynamic-tables.client';
import { SeedService } from './seed/SeedService';

export async function runDevSeed(tables: IDynamicTable[], setMsg: (m: string) => void): Promise<void> {
  console.log('[SEED] Starting Refactored Seed Scan...');

  try {
    // Instantiate the orchestrator
    const service = new SeedService(tables, setMsg);

    // EXECUTE THE GOLDEN PATH
    await service.run();

  } catch (err: unknown) {
    console.error('[SEED FATAL]', err);
    setMsg(`ERRO FATAL: ${err instanceof Error ? err.message : String(err)}`);
    // Re-throw to ensure the UI knows it failed if it catches
    throw err;
  }
}
