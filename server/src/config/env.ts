import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

// Try server/.env first, then project root ../.env
const serverEnvPath = path.resolve(process.cwd(), '.env');
const rootEnvPath = path.resolve(process.cwd(), '..', '.env');

let loadedPath: string | null = null;

if (fs.existsSync(serverEnvPath)) {
  dotenv.config({ path: serverEnvPath, override: true });
  loadedPath = serverEnvPath;
} else if (fs.existsSync(rootEnvPath)) {
  dotenv.config({ path: rootEnvPath, override: true });
  loadedPath = rootEnvPath;
}

if (!loadedPath) {
  // Fallback to default dotenv search to avoid throwing
  dotenv.config({ override: true });
}

// If after loading we still have no keys, attempt a robust manual parse and force-assign
try {
  const targetPath = loadedPath && fs.existsSync(loadedPath)
    ? loadedPath
    : (fs.existsSync(serverEnvPath) ? serverEnvPath : (fs.existsSync(rootEnvPath) ? rootEnvPath : null));
  if (targetPath) {
    let buf = fs.readFileSync(targetPath);
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
} catch {}

// Diagnostics (always print, without revealing secrets)
try {
  const keysToCheck = [
    'NODE_ENV',
    'OPENAI_API_KEY',
    'DATABASE_URL',
    'JWT_SECRET',
    'QDRANT_URL',
    'QDRANT_API_KEY',
    // REDIS_URL removed — no Redis client in this codebase
  ];
  const presenceReport = keysToCheck.reduce<Record<string, 'set' | 'missing'>>((acc, key) => {
    acc[key] = process.env[key] ? 'set' : 'missing';
    return acc;
  }, {} as Record<string, 'set' | 'missing'>);

  console.info('[env] cwd:', process.cwd());
  console.info('[env] serverEnvPath exists:', fs.existsSync(serverEnvPath));
  console.info('[env] rootEnvPath exists:', fs.existsSync(rootEnvPath));
  console.info('[env] Loaded .env from:', loadedPath ?? '(default search/no explicit path)');
  console.info('[env] Key presence (no values shown):', presenceReport);
} catch (e) {
  // Avoid any crash due to logging
}

/**
 * Base directory for CRM attachment binaries (Slice 4 file-store).
 * Defaults to <cwd>/storage/attachments when unset. The attachmentStorage util reads
 * process.env.ATTACHMENTS_DIR directly at runtime; this export is the typed accessor.
 */
export const ATTACHMENTS_DIR: string =
  process.env.ATTACHMENTS_DIR || path.resolve(process.cwd(), 'storage/attachments');


