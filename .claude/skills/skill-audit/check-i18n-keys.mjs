#!/usr/bin/env node
// check-i18n-keys — paridade de chaves i18n en↔pt. Chave em en e não em pt
// (ou namespace só em um lado) = texto cai pro fallback em runtime, com tsc verde.
// ponytail: compara conjuntos de chaves achatadas; não varre uso de t('...').
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const LOC = join(ROOT, 'my-app/public/locales');
if (!existsSync(LOC)) { console.log('sem my-app/public/locales — nada a checar.'); process.exit(0); }

const flat = (o, p = '', out = {}) => {
  for (const k of Object.keys(o)) {
    const key = p ? `${p}.${k}` : k;
    if (o[k] && typeof o[k] === 'object' && !Array.isArray(o[k])) flat(o[k], key, out);
    else out[key] = true;
  }
  return out;
};
const ns = (loc) => new Set(readdirSync(join(LOC, loc)).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)));

const en = ns('en'), pt = ns('pt');
let fails = 0;

// 1) namespaces presentes nos dois lados?
for (const n of en) if (!pt.has(n)) { console.error(`✗ namespace '${n}' em en/ mas não em pt/`); fails++; }
for (const n of pt) if (!en.has(n)) { console.error(`✗ namespace '${n}' em pt/ mas não em en/`); fails++; }

// 2) paridade de chaves por namespace comum
for (const n of [...en].filter((x) => pt.has(x))) {
  const e = flat(JSON.parse(readFileSync(join(LOC, 'en', `${n}.json`), 'utf8')));
  const p = flat(JSON.parse(readFileSync(join(LOC, 'pt', `${n}.json`), 'utf8')));
  const missPt = Object.keys(e).filter((k) => !p[k]);
  const missEn = Object.keys(p).filter((k) => !e[k]);
  if (missPt.length || missEn.length) {
    fails += missPt.length + missEn.length;
    console.error(`✗ ${n}.json:`);
    missPt.forEach((k) => console.error(`    falta em pt: ${k}`));
    missEn.forEach((k) => console.error(`    falta em en: ${k}`));
  }
}
if (fails) { console.error(`\n${fails} divergência(s) i18n en↔pt.`); process.exit(1); }
console.log('i18n en↔pt consistente.');
