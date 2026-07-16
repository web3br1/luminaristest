// Smoke-migration-gate — INCR-COUNTERPARTY (A1), PR #119.
//
// Aplica a migração real da branch `claude/incr-counterparty-a1` numa CÓPIA do seu dev.db
// POPULADO e prova as propriedades do gate (SEC-A1-2/3 + preservação + cobertura + idempotência).
// NUNCA toca o dev.db original. Bypassa o `prisma migrate` (e o drift do add_entry_numbering)
// aplicando o migration.sql direto via node:sqlite.
//
// USO (a partir de server/):
//   node --experimental-sqlite scripts/smoke-gate-incr-counterparty.mjs <caminho-do-dev.db-real>
// ex.:
//   node --experimental-sqlite scripts/smoke-gate-incr-counterparty.mjs ./prisma/dev.db
//
// Requer: Node >= 22.5 (node:sqlite) e que a branch claude/incr-counterparty-a1 exista localmente
// (o script lê a migração via `git show`, então NÃO precisa estar com ela em checkout).

import { DatabaseSync } from 'node:sqlite';
import { execSync } from 'node:child_process';
import { copyFileSync, existsSync, statSync } from 'node:fs';

const BRANCH = 'claude/incr-counterparty-a1';
const MIGRATION = 'server/prisma/migrations/20260715060000_incr_counterparty/migration.sql';

const realDb = process.argv[2];
if (!realDb) {
  console.error('ERRO: passe o caminho do dev.db real.\n  node --experimental-sqlite scripts/smoke-gate-incr-counterparty.mjs <dev.db>');
  process.exit(2);
}
if (!existsSync(realDb)) { console.error(`ERRO: não existe: ${realDb}`); process.exit(2); }
if (statSync(realDb).size === 0) {
  console.error(`ERRO: ${realDb} tem 0 bytes (vazio). O gate precisa de um dev.db POPULADO (dados escritos pelo app).`);
  process.exit(2);
}

// Migração vinda da branch do increment (fonte de verdade; funciona de qualquer branch em checkout).
let migrationSql;
try {
  migrationSql = execSync(`git show ${BRANCH}:${MIGRATION}`, { encoding: 'utf8', cwd: process.cwd().endsWith('server') ? '..' : '.' });
} catch (e) {
  console.error(`ERRO: não consegui ler a migração via git show ${BRANCH}:${MIGRATION}\n  Confirme que a branch existe localmente (git fetch).`);
  process.exit(2);
}
// A parte de backfill (do "-- SUPPLIERS from payables" em diante) é idempotente por design; re-rodá-la testa SEC idempotência.
const backfillSql = migrationSql.slice(migrationSql.indexOf('-- SUPPLIERS from payables'));

const copy = `${realDb}.smoke-counterparty.db`;
copyFileSync(realDb, copy);
console.log(`[smoke-gate INCR-COUNTERPARTY] cópia: ${copy}\n`);

const db = new DatabaseSync(copy);
const one = (sql) => db.prepare(sql).get();
const n = (sql) => Number(one(sql).n);

const results = [];
const check = (name, pass, detail) => { results.push({ name, pass, detail }); console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`); };

// Sanidade: é um dev.db do accounting?
const tbl = (t) => one(`SELECT name FROM sqlite_master WHERE type='table' AND name='${t}'`);
if (!tbl('payables') || !tbl('receivables')) {
  console.error('ERRO: a cópia não tem payables/receivables — este não parece o dev.db do accounting.');
  process.exit(2);
}
// Pré: counterparties ainda não existe.
check('pré-migração: tabela counterparties ausente', !tbl('counterparties'));

// Baseline (antes da migração).
const basePay = n('SELECT COUNT(*) n FROM payables');
const baseRec = n('SELECT COUNT(*) n FROM receivables');
const distSup = n('SELECT COUNT(*) n FROM (SELECT DISTINCT userId, unitId, supplierName FROM payables)');
const distCus = n('SELECT COUNT(*) n FROM (SELECT DISTINCT userId, unitId, customerName FROM receivables)');
console.log(`  baseline: payables=${basePay} receivables=${baseRec} | escopos-fornecedor=${distSup} escopos-cliente=${distCus}\n`);

// Aplica a migração (CREATE TABLE + rebuild FK + backfill).
try { db.exec(migrationSql); } catch (e) { console.error(`ERRO ao aplicar a migração: ${e.message}`); process.exit(1); }

// A. Preservação de linhas.
check('A. payables preservados (count inalterado)', n('SELECT COUNT(*) n FROM payables') === basePay, `${basePay}`);
check('A. receivables preservados (count inalterado)', n('SELECT COUNT(*) n FROM receivables') === baseRec, `${baseRec}`);

// B. Dedupe por escopo (SEC-A1-2): 1 counterparty por (userId,unitId,name) por tipo.
const cpSup = n("SELECT COUNT(*) n FROM counterparties WHERE type='SUPPLIER'");
const cpCus = n("SELECT COUNT(*) n FROM counterparties WHERE type='CUSTOMER'");
check('B. #counterparties SUPPLIER == #escopos-fornecedor distintos', cpSup === distSup, `${cpSup} vs ${distSup}`);
check('B. #counterparties CUSTOMER == #escopos-cliente distintos', cpCus === distCus, `${cpCus} vs ${distCus}`);

// C. Zero FK cross-scope (SEC-A1-3): nenhum link para counterparty de outro userId/unitId.
const xPay = n('SELECT COUNT(*) n FROM payables p JOIN counterparties c ON p.counterpartyId=c.id WHERE p.userId<>c.userId OR p.unitId<>c.unitId');
const xRec = n('SELECT COUNT(*) n FROM receivables r JOIN counterparties c ON r.counterpartyId=c.id WHERE r.userId<>c.userId OR r.unitId<>c.unitId');
check('C. zero FK cross-scope em payables', xPay === 0, `violações=${xPay}`);
check('C. zero FK cross-scope em receivables', xRec === 0, `violações=${xRec}`);

// D. Cobertura do backfill: toda linha existente ganhou counterpartyId (importa p/ o futuro NOT NULL).
check('D. zero payable sem counterpartyId', n('SELECT COUNT(*) n FROM payables WHERE counterpartyId IS NULL') === 0);
check('D. zero receivable sem counterpartyId', n('SELECT COUNT(*) n FROM receivables WHERE counterpartyId IS NULL') === 0);

// E. Idempotência: re-rodar o backfill não cria nada nem lança (sem P2002).
const cpBefore = n('SELECT COUNT(*) n FROM counterparties');
let idem = true; try { db.exec(backfillSql); } catch { idem = false; }
const cpAfter = n('SELECT COUNT(*) n FROM counterparties');
check('E. backfill idempotente (2ª execução = no-op, sem erro)', idem && cpAfter === cpBefore, `${cpBefore}→${cpAfter}`);

// F. Integridade referencial geral pós-migração.
const fkViol = db.prepare('PRAGMA foreign_key_check').all();
check('F. PRAGMA foreign_key_check sem violações', fkViol.length === 0, `${fkViol.length} violação(ões)`);

db.close();

const failed = results.filter((r) => !r.pass);
console.log(`\n[smoke-gate INCR-COUNTERPARTY] ${failed.length === 0 ? 'DEPLOY-CLEARED ✅' : `FAIL ❌ (${failed.length})`}`);
if (basePay === 0 && baseRec === 0) console.log('  ⚠  AVISO: dev.db sem payables/receivables — o gate passou trivialmente. Rode contra uma base com dados de AP/AR reais.');
console.log(`  cópia mantida p/ inspeção: ${copy}`);
process.exit(failed.length === 0 ? 0 : 1);
