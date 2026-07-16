// Smoke-migration-gate — INCR-DIM-COMPLETENESS (B1), PR #120.
//
// Aplica a migração real da branch `claude/incr-dim-completeness-b1` numa CÓPIA do seu dev.db
// POPULADO e prova: coluna adicionada (zero mudança de dado) + o grafo de FK/cascade INTACTO
// (o ponto do ALTER TABLE vs table-rebuild — o rebuild default quebrava o cascade de user.delete).
// NUNCA toca o dev.db original. Bypassa o `prisma migrate`/drift aplicando o SQL direto.
//
// USO (a partir de server/):
//   node --experimental-sqlite scripts/smoke-gate-incr-dim-completeness.mjs <caminho-do-dev.db-real>
//
// Requer: Node >= 22.5 (node:sqlite) e a branch claude/incr-dim-completeness-b1 local.

import { DatabaseSync } from 'node:sqlite';
import { execSync } from 'node:child_process';
import { copyFileSync, existsSync, statSync } from 'node:fs';

const BRANCH = 'claude/incr-dim-completeness-b1';
const MIGRATION = 'server/prisma/migrations/20260715205436_incr_dim_completeness/migration.sql';

const realDb = process.argv[2];
if (!realDb) {
  console.error('ERRO: passe o caminho do dev.db real.\n  node --experimental-sqlite scripts/smoke-gate-incr-dim-completeness.mjs <dev.db>');
  process.exit(2);
}
if (!existsSync(realDb)) { console.error(`ERRO: não existe: ${realDb}`); process.exit(2); }
if (statSync(realDb).size === 0) {
  console.error(`ERRO: ${realDb} tem 0 bytes (vazio). O gate precisa de um dev.db POPULADO.`);
  process.exit(2);
}

let migrationSql;
try {
  migrationSql = execSync(`git show ${BRANCH}:${MIGRATION}`, { encoding: 'utf8', cwd: process.cwd().endsWith('server') ? '..' : '.' });
} catch {
  console.error(`ERRO: não consegui ler a migração via git show ${BRANCH}:${MIGRATION}\n  Confirme que a branch existe localmente (git fetch).`);
  process.exit(2);
}

const copy = `${realDb}.smoke-dim-completeness.db`;
copyFileSync(realDb, copy);
console.log(`[smoke-gate INCR-DIM-COMPLETENESS] cópia: ${copy}\n`);

const db = new DatabaseSync(copy);
const one = (sql) => db.prepare(sql).get();
const n = (sql) => Number(one(sql).n);
const cols = () => db.prepare("PRAGMA table_info('accounts')").all().map((c) => c.name);

const results = [];
const check = (name, pass, detail) => { results.push({ name, pass, detail }); console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`); };

if (!one("SELECT name FROM sqlite_master WHERE type='table' AND name='accounts'")) {
  console.error('ERRO: a cópia não tem a tabela accounts — este não parece o dev.db do accounting.');
  process.exit(2);
}

// Pré: coluna ainda não existe.
check('pré-migração: coluna requiresDimension ausente', !cols().includes('requiresDimension'));
const baseAcc = n('SELECT COUNT(*) n FROM accounts');
// Integridade referencial ANTES (baseline p/ comparar).
const fkBefore = db.prepare('PRAGMA foreign_key_check').all().length;
console.log(`  baseline: accounts=${baseAcc} | foreign_key_check violações=${fkBefore}\n`);

// Aplica (ALTER TABLE ADD COLUMN puro).
try { db.exec(migrationSql); } catch (e) { console.error(`ERRO ao aplicar a migração: ${e.message}`); process.exit(1); }

// A. accounts preservados.
check('A. accounts preservados (count inalterado)', n('SELECT COUNT(*) n FROM accounts') === baseAcc, `${baseAcc}`);
// B. coluna criada + zero mudança de dado (todo account nasce requiresDimension=false).
check('B. coluna requiresDimension presente', cols().includes('requiresDimension'));
check('B. toda conta existente com requiresDimension=false (0)', n('SELECT COUNT(*) n FROM accounts WHERE requiresDimension<>0') === 0);
// C. FK/cascade intactos — o motivo do ALTER (não rebuild). Sem NOVAS violações vs baseline.
const fkAfter = db.prepare('PRAGMA foreign_key_check').all().length;
check('C. grafo de FK intacto (sem novas violações vs baseline)', fkAfter <= fkBefore, `antes=${fkBefore} depois=${fkAfter}`);
// C2. A FK RESTRICT referential_mappings.accountId → accounts (a que o rebuild quebrava) ainda existe.
const rmFk = db.prepare("PRAGMA foreign_key_list('referential_mappings')").all().some((f) => f.table === 'accounts');
check('C2. FK referential_mappings.accountId → accounts preservada', rmFk);

db.close();

const failed = results.filter((r) => !r.pass);
console.log(`\n[smoke-gate INCR-DIM-COMPLETENESS] ${failed.length === 0 ? 'DEPLOY-CLEARED ✅' : `FAIL ❌ (${failed.length})`}`);
if (baseAcc === 0) console.log('  ⚠  AVISO: dev.db sem accounts — rode contra uma base com plano de contas real.');
console.log(`  cópia mantida p/ inspeção: ${copy}`);
process.exit(failed.length === 0 ? 0 : 1);
