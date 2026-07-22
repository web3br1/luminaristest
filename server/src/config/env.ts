import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { z } from 'zod';
import { logger } from '../lib/logger'; // relative on purpose: env loads at boot, before path aliases

// Try server/.env first, then project root ../.env
const serverEnvPath = path.resolve(process.cwd(), '.env');
const rootEnvPath = path.resolve(process.cwd(), '..', '.env');

let loadedPath: string | null = null;

// Under Jest (NODE_ENV=test, set by test/jest.setupEnv.ts BEFORE this module loads), the test
// harness pre-sets DATABASE_URL/JWT_SECRET to isolated values. dotenv must FILL missing keys only,
// never override them — overriding would silently point integration tests at the dev database.
const DOTENV_OVERRIDE = process.env.NODE_ENV !== 'test';

if (fs.existsSync(serverEnvPath)) {
  dotenv.config({ path: serverEnvPath, override: DOTENV_OVERRIDE });
  loadedPath = serverEnvPath;
} else if (fs.existsSync(rootEnvPath)) {
  dotenv.config({ path: rootEnvPath, override: DOTENV_OVERRIDE });
  loadedPath = rootEnvPath;
}

if (!loadedPath) {
  // Fallback to default dotenv search to avoid throwing
  dotenv.config({ override: DOTENV_OVERRIDE });
}

// If after loading we still have no keys, attempt a robust manual parse and force-assign
try {
  const targetPath = loadedPath && fs.existsSync(loadedPath)
    ? loadedPath
    : (fs.existsSync(serverEnvPath) ? serverEnvPath : (fs.existsSync(rootEnvPath) ? rootEnvPath : null));
  if (targetPath) {
    const buf = fs.readFileSync(targetPath);
    let text: string;
    // Detect BOM for UTF-16 LE/BE
    if (buf.length >= 2 && ((buf[0] === 0xFF && buf[1] === 0xFE) || (buf[0] === 0xFE && buf[1] === 0xFF))) {
      // Use utf16le as Node does not support utf16be decode directly in many cases
      text = buf.toString('utf16le');
      console.warn('[env] Detected UTF-16 encoded .env file; converted using utf16le decoder');
    } else {
      text = buf.toString('utf8');
    }

    // Try dotenv.parse on text first
    let parsed: Record<string, string> = {};
    try {
      parsed = dotenv.parse(text);
    } catch {
      parsed = {};
    }

    // Fallback regex parse for lines (supports optional 'export ' prefix)
    const lineRegex = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/gm;
    let match: RegExpExecArray | null;
    while ((match = lineRegex.exec(text)) !== null) {
      const key = match[1];
      let val = match[2] ?? '';
      // Strip inline comments starting with # only if not within quotes
      if (!(val.startsWith('"') || val.startsWith("'"))) {
        const hashIdx = val.indexOf('#');
        if (hashIdx >= 0) val = val.substring(0, hashIdx);
      }
      val = val.trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!parsed[key]) parsed[key] = val;
    }

    const assigned: string[] = [];
    for (const [k, v] of Object.entries(parsed)) {
      if (!process.env[k] && v !== undefined && v !== null && String(v).length > 0) {
        process.env[k] = v;
        assigned.push(k);
      }
    }
    if (assigned.length > 0) {
      console.info('[env] Assigned variables from manual parse:', assigned);
    }
  }
} catch {
  /* best-effort manual .env parse; ignore failures and fall through to schema validation */
}

// ---------------------------------------------------------------------------
// Schema validation — fail-fast at boot on a missing/invalid required variable.
// ---------------------------------------------------------------------------
// Required everywhere: DATABASE_URL. Required in production: JWT_SECRET (mirrors lib/jwt's
// fail-closed check, but surfaced earlier with an aggregated message). External integrations
// (OpenAI/Qdrant/Redis) are optional so dev/test runs and offline flows don't need every key;
// their absence is warned in production, not fatal.
//
// `buildEnvSchema` / `validateEnv` are exported as pure functions so the rules are unit-testable
// without the import-time side effect below.

/** Builds the env schema; production tightens JWT_SECRET to required. */
export function buildEnvSchema(nodeEnv: string) {
  const isProduction = nodeEnv === 'production';
  return z
    .object({
      NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
      PORT: z.coerce.number().int().positive().optional(),
      DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
      JWT_SECRET: z.string().min(1).optional(),
      JWT_EXPIRES_IN: z.string().optional(),
      OPENAI_API_KEY: z.string().optional(),
      QDRANT_URL: z.string().optional(),
      QDRANT_API_KEY: z.string().optional(),
      REDIS_URL: z.string().optional(),
    })
    .superRefine((val, ctx) => {
      if (isProduction && !val.JWT_SECRET) {
        ctx.addIssue({ code: 'custom', path: ['JWT_SECRET'], message: 'JWT_SECRET is required in production' });
      }
    });
}

export type Env = z.infer<ReturnType<typeof buildEnvSchema>>;

/** Validates a source (defaults to process.env); throws a single aggregated error on failure. */
export function validateEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const nodeEnv = source.NODE_ENV ?? 'development';
  const parsed = buildEnvSchema(nodeEnv).safeParse(source);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    // Fail-fast: refuse to start with an invalid configuration. Thrown (not process.exit) so it is
    // visible in logs and catchable by tests; an unhandled throw at boot crashes the process as intended.
    throw new Error(`[env] Invalid environment configuration:\n${details}`);
  }
  return parsed.data;
}

/** Validated, typed environment. Prefer importing this over reading `process.env` directly. */
export const env = validateEnv(process.env);

// Warn (don't fail) on missing external integrations in production — features depending on them degrade.
if (env.NODE_ENV === 'production') {
  for (const key of ['OPENAI_API_KEY', 'QDRANT_URL'] as const) {
    if (!env[key]) logger.warn(`[env] ${key} is not set — features depending on it will be unavailable`);
  }
}

// Quiet presence report (dev-only; never prints values).
logger.debug('[env] loaded', {
  from: loadedPath ?? '(default search)',
  nodeEnv: env.NODE_ENV,
  present: (['DATABASE_URL', 'JWT_SECRET', 'OPENAI_API_KEY', 'QDRANT_URL', 'REDIS_URL'] as const).filter(
    (k) => !!env[k],
  ),
});

/**
 * Base directory for CRM attachment binaries (Slice 4 file-store).
 * Defaults to <cwd>/storage/attachments when unset. The attachmentStorage util reads
 * process.env.ATTACHMENTS_DIR directly at runtime; this export is the typed accessor.
 */
export const ATTACHMENTS_DIR: string =
  process.env.ATTACHMENTS_DIR || path.resolve(process.cwd(), 'storage/attachments');


