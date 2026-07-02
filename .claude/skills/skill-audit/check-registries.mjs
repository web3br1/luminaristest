#!/usr/bin/env node
// check-registries — pega "membership em registro central" que o tsc NÃO vê:
// um artefato (rota / categoria de KPI / preset suite) existe mas ninguém o
// referenciou no índice → fica orfão e morto em runtime, com tsc verde.
//
// ponytail: cobre só o padrão LIMPO "todo arquivo/dir em X tem de aparecer no
// registro Y". Os pareados intra-arquivo (chat getTools↔handleToolCall, widget
// type↔switch) e os de membership-parcial (factory, _app providers) ficam de
// fora — falso-positivo alto e/ou já tsc-seguros. Reativar via STUBS abaixo só
// quando um miss real acontecer (baseline regra 5: harness só cresce com falha).
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, basename } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..'); // .claude/skills/skill-audit → repo
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const list = (dir, kind) => {
  const abs = join(ROOT, dir);
  if (!existsSync(abs)) return [];
  return readdirSync(abs, { withFileTypes: true })
    .filter((d) => (kind === 'dirs' ? d.isDirectory() : d.isFile()))
    .map((d) => d.name);
};

// Cada registro: dir de artefatos → string `ref(item)` que TEM de existir no `registry`.
const REGISTRIES = [
  {
    name: 'rota montada em routes/index.ts',
    dir: 'server/src/routes', kind: 'files', match: /\.ts$/,
    ignore: ['index.ts', 'docs.paths.ts'],
    registry: 'server/src/routes/index.ts',
    ref: (f) => `./${basename(f, '.ts')}'`, // import path; router.use ausente vira import não-usado (lint)
  },
  {
    name: 'categoria de KPI importada em kpis/index.ts',
    dir: 'server/src/features/analytics/kpis', kind: 'dirs',
    registry: 'server/src/features/analytics/kpis/index.ts',
    ref: (d) => `'./${d}'`, // side-effect import — esquecer = processor nunca registra, tsc verde
  },
  {
    name: 'preset suite em tablePresetSuites',
    dir: 'server/src/features/dynamicTables/presets/systems', kind: 'files', match: /Preset\.ts$/,
    ignore: ['CoreSystemPreset.ts'], // exportado à parte de propósito (não é suite selecionável)
    registry: 'server/src/features/dynamicTables/presets/index.ts',
    ref: (f) => basename(f, '.ts'), // identificador importado e usado no objeto tablePresetSuites
  },
  // STUBS desativados — reativar só com falha real:
  // { name:'chat tool com handler', ... }  // getTools()↔handleToolCall(): string-key, intra-arquivo
  // { name:'widget no switch', ... }       // WIDGET_TYPES↔renderWidgetContent
];

let fails = 0;
for (const r of REGISTRIES) {
  let reg;
  try { reg = read(r.registry); } catch { console.error(`✗ ${r.name}: registro ausente (${r.registry})`); fails++; continue; }
  const items = list(r.dir, r.kind).filter((n) => !(r.ignore || []).includes(n) && (!r.match || r.match.test(n)));
  const missing = items.filter((n) => !reg.includes(r.ref(n)));
  if (missing.length) {
    fails += missing.length;
    console.error(`✗ ${r.name}:`);
    missing.forEach((m) => console.error(`    ${m} ausente de ${r.registry}`));
  } else {
    console.log(`✓ ${r.name} — ${items.length} ok`);
  }
}
if (fails) { console.error(`\n${fails} artefato(s) não registrado(s) — o tsc não pega isto.`); process.exit(1); }
console.log('\nTodos os registros consistentes.');
