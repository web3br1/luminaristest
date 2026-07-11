#!/usr/bin/env node
// BE-INCR-9B Fork 2 (B0) — converte o Plano de Contas Referencial oficial da RFB (arquivo pipe `|`)
// para o CSV de colunas neutras que o import do catálogo consome (code,name,isAnalytic,parentCode).
//
// Este script NÃO contém nenhum código de conta referencial: ele só recorta colunas do arquivo oficial
// e traduz o marcador de tipo S/A -> boolean (D1/D10: dado fiscal nunca é inventado nem assumido).
// A ORDEM POSICIONAL do arquivo oficial pode variar por leiaute/entidade -> os índices de coluna são
// PARÂMETROS. Default = leiaute observado na spec (docs/accounting/BE-INCR9B-fork2-...md §3). Confirme
// contra o header/manual do arquivo baixado antes de confiar no output.
//
// Uso:
//   node server/scripts/rfb-referential-to-catalog.mjs --in FILE --out FILE [--year AAAA]
//        [--code 0 --name 1 --tipo 5 --parent 6 --ini 2 --fim 3] [--sep '|']
//   node server/scripts/rfb-referential-to-catalog.mjs --selfcheck   # roda o teste embutido e sai

import { readFileSync, writeFileSync } from 'node:fs';

const DEFAULTS = { code: 0, name: 1, tipo: 5, parent: 6, ini: 2, fim: 3, sep: '|' };

function parseArgs(argv) {
  const a = { ...DEFAULTS };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--selfcheck') return { selfcheck: true };
    if (!k.startsWith('--')) continue;
    const name = k.slice(2);
    const v = argv[++i];
    a[name] = ['in', 'out', 'sep'].includes(name) ? v : name === 'year' ? v : Number(v);
  }
  return a;
}

// S -> sintética (isAnalytic=false); A -> analítica (isAnalytic=true). Qualquer outro token = erro duro:
// o marcador de tipo é dado fiscal, não se adivinha uma codificação exótica.
function tipoToAnalytic(raw) {
  const t = String(raw ?? '').trim().toUpperCase();
  if (t === 'A') return true;
  if (t === 'S') return false;
  return null;
}

// Uma linha do arquivo oficial vale para o ano-calendário se ini<=ano<=fim (datas DDMMAAAA). Sem --year,
// aceita tudo. Campos de validade vazios não filtram.
function validForYear(iniRaw, fimRaw, year) {
  if (!year) return true;
  const y = Number(year);
  const yr = (d) => (String(d ?? '').trim().length === 8 ? Number(String(d).slice(4, 8)) : null);
  const yi = yr(iniRaw);
  const yf = yr(fimRaw);
  if (yi !== null && y < yi) return false;
  if (yf !== null && y > yf) return false;
  return true;
}

function csvCell(s) {
  const v = String(s ?? '');
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function convert(text, opt) {
  const o = { ...DEFAULTS, ...opt };
  const out = [];
  const errors = [];
  text.split(/\r?\n/).forEach((line, i) => {
    if (line.trim() === '') return; // linha vazia = trailing de export, pula em silêncio
    const f = line.split(o.sep);
    const code = (f[o.code] ?? '').trim();
    if (code === '') return; // separador/comentário sem código -> ignora
    if (!validForYear(f[o.ini], f[o.fim], o.year)) return;
    const isAnalytic = tipoToAnalytic(f[o.tipo]);
    if (isAnalytic === null) {
      errors.push(`linha ${i + 1}: tipo inválido "${(f[o.tipo] ?? '').trim()}" (esperado S ou A) — code ${code}`);
      return;
    }
    out.push({
      code,
      name: (f[o.name] ?? '').trim(),
      isAnalytic,
      parentCode: (f[o.parent] ?? '').trim(),
    });
  });
  return { rows: out, errors };
}

function toCsv(rows) {
  const head = 'code,name,isAnalytic,parentCode';
  const body = rows.map(
    (r) => [r.code, r.name, r.isAnalytic ? 'true' : 'false', r.parentCode].map(csvCell).join(','),
  );
  return [head, ...body].join('\n') + '\n';
}

function selfcheck() {
  // Linha-amostra REAL do leiaute (doc Senior F043RFB) — valida a decodificação posicional default.
  const sample =
    '3.1.8.2.1.91.00|VARIAÇÕES DAS PROVISÕES TÉCNICAS - PREVIDÊNCIA COM|01012020|31122020|539|S|3.1.8.2.1.00.00|6|04';
  const { rows, errors } = convert(sample + '\n', {});
  const assert = (c, m) => {
    if (!c) throw new Error('SELFCHECK FALHOU: ' + m);
  };
  assert(errors.length === 0, 'erros inesperados: ' + errors.join('; '));
  assert(rows.length === 1, 'esperava 1 linha, veio ' + rows.length);
  const r = rows[0];
  assert(r.code === '3.1.8.2.1.91.00', 'code errado: ' + r.code);
  assert(r.name === 'VARIAÇÕES DAS PROVISÕES TÉCNICAS - PREVIDÊNCIA COM', 'name errado: ' + r.name);
  assert(r.isAnalytic === false, 'S deveria virar isAnalytic=false');
  assert(r.parentCode === '3.1.8.2.1.00.00', 'parentCode errado: ' + r.parentCode);
  // filtro de ano: 2019 fora do intervalo 2020-2020 => 0 linhas
  assert(convert(sample + '\n', { year: 2019 }).rows.length === 0, 'filtro de ano não excluiu 2019');
  assert(convert(sample + '\n', { year: 2020 }).rows.length === 1, 'filtro de ano excluiu 2020 indevidamente');
  // token analítico
  const a = convert(sample.replace('|S|', '|A|') + '\n', {}).rows[0];
  assert(a.isAnalytic === true, 'A deveria virar isAnalytic=true');
  console.log('SELFCHECK OK');
}

function main() {
  const opt = parseArgs(process.argv.slice(2));
  if (opt.selfcheck) return selfcheck();
  if (!opt.in || !opt.out) {
    console.error('faltam --in e/ou --out. Veja o cabeçalho do script ou rode --selfcheck.');
    process.exit(2);
  }
  const { rows, errors } = convert(readFileSync(opt.in, 'utf8'), opt);
  if (errors.length) {
    console.error(`${errors.length} erro(s) de tipo — nada foi escrito (import é all-or-nothing):`);
    errors.slice(0, 20).forEach((e) => console.error('  ' + e));
    process.exit(1);
  }
  writeFileSync(opt.out, toCsv(rows), 'utf8');
  const analytic = rows.filter((r) => r.isAnalytic).length;
  console.log(`OK: ${rows.length} contas (${analytic} analíticas / ${rows.length - analytic} sintéticas) -> ${opt.out}`);
}

main();
