#!/usr/bin/env node
// Gera a árvore de fixtures do self-check. Rode uma vez; os arquivos são commitados.
// Cada fixture inválida isola UM código de falha (resto idêntico à válida).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');

const EVALS = JSON.stringify({
  skill: 'fixture',
  evals: [
    { id: 'trigger-pos-1', type: 'trigger-positive', rules: ['VMS-001'], prompt: 'pedido que ativa', assertions: ['ativa'] },
    { id: 'trigger-neg-1', type: 'trigger-negative', rules: [], prompt: 'pedido que NÃO ativa', assertions: ['nao ativa'] },
    { id: 'happy-1', type: 'happy', rules: ['VMS-001'], prompt: 'caminho feliz', expected_output: 'ok', assertions: ['gerou ok'] },
    { id: 'edge-1', type: 'edge', rules: ['VMS-001'], prompt: 'borda', assertions: ['trata borda'] },
  ],
}, null, 2);

const REPORT = (date, score) => `# Report (fixture)\n\n- Executed at: ${date}\n- score: ${score}\n- Overall result: PASS\n`;

function skillMd({ name, desc, disable = true, rules = ['VMS-001'], extraBody = '' }) {
  const meta = [
    '---',
    `name: ${name}`,
    `description: ${desc}`,
    'compatibility: Claude Code; fixture offline do self-check.',
    ...(disable ? ['disable-model-invocation: true'] : []),
    'metadata:',
    '  governance-skill-id: "SKL-FIXTURE"',
    '  governance-version: "1.0.0"',
    '  governance-status: "validated"',
    '  governance-owner: "engineering"',
    '  governance-last-evaluated: "2026-06-25"',
    '  governance-eval-score: "0.95"',
    '---',
    '',
    `# ${name}`,
    '',
    '## Objetivo',
    'Fixture do self-check do skill-audit.',
    '',
    '## Contrato normativo',
    ...rules.map((r) => `### [${r}] Regra normativa ${r}\nCoberta por gate e eval.`),
    extraBody,
    '',
    '## Validação',
    'Rodar `skill-audit self-check`.',
    '',
  ];
  return meta.join('\n');
}

function governanceMd({ rules = { 'VMS-001': './evals/evals.json#happy-1' }, evaluation = null, status = 'validated' }) {
  const lines = [
    '---',
    'schema_version: 1',
    'type: skill-governance',
    'governance-skill-id: SKL-FIXTURE',
    'skill_path: ./SKILL.md',
    `status: ${status}`,
    'owner: engineering',
    'criticality: normal',
  ];
  if (evaluation) {
    lines.push('evaluation:', `  report: ${evaluation.report}`, `  last_evaluated: ${evaluation.lastEvaluated}`, '  score: 0.95', '  minimum_score: 0.90');
  }
  lines.push('rules:');
  for (const [rid, target] of Object.entries(rules)) {
    lines.push(`  ${rid}:`, '    gates:', '      - type: eval', `        target: ${target}`);
  }
  lines.push('---', '', '# Governança (fixture)', 'Mapa regra→gate.');
  return lines.join('\n');
}

function write(dir, files) {
  fs.rmSync(path.join(ROOT, dir), { recursive: true, force: true });
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(ROOT, dir, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
  }
}

const GOOD_DESC = 'Fixture de referência que passa em todos os gates. Use no self-check; não gera nada em runtime.';

// 1. válida
write('valid-minimal-skill', {
  'SKILL.md': skillMd({ name: 'valid-minimal-skill', desc: GOOD_DESC }),
  'governance.md': governanceMd({ evaluation: { report: './report.md', lastEvaluated: '2026-06-25' } }),
  'report.md': REPORT('2026-06-20', '0.95'),
  'evals/evals.json': EVALS,
});

// 2. NAME_DIRECTORY_MISMATCH
write('invalid-name-mismatch', {
  'SKILL.md': skillMd({ name: 'wrong-name', desc: GOOD_DESC }),
  'governance.md': governanceMd({}),
  'evals/evals.json': EVALS,
});

// 3. RULE_WITHOUT_GATE — corpo tem VMS-002 sem governança
write('invalid-rule-without-gate', {
  'SKILL.md': skillMd({ name: 'invalid-rule-without-gate', desc: GOOD_DESC, rules: ['VMS-001', 'VMS-002'] }),
  'governance.md': governanceMd({}),
  'evals/evals.json': EVALS,
});

// 4. GATE_WITHOUT_RULE — governa VMS-999 inexistente
write('invalid-orphan-gate', {
  'SKILL.md': skillMd({ name: 'invalid-orphan-gate', desc: GOOD_DESC }),
  'governance.md': governanceMd({ rules: { 'VMS-001': './evals/evals.json#happy-1', 'VMS-999': './evals/evals.json#happy-1' } }),
  'evals/evals.json': EVALS,
});

// 5. BROKEN_REFERENCE — link relativo inexistente
write('invalid-broken-reference', {
  'SKILL.md': skillMd({ name: 'invalid-broken-reference', desc: GOOD_DESC, extraBody: '\nVer [detalhe](./references/nope.md).' }),
  'governance.md': governanceMd({}),
  'evals/evals.json': EVALS,
});

// 6. STALE_EVALUATION — last_evaluated < data do report
write('invalid-stale-evaluation', {
  'SKILL.md': skillMd({ name: 'invalid-stale-evaluation', desc: GOOD_DESC }),
  'governance.md': governanceMd({ evaluation: { report: './report.md', lastEvaluated: '2026-06-01' } }),
  'report.md': REPORT('2026-06-20', '0.95'),
  'evals/evals.json': EVALS,
});

// 7. UNSAFE_AUTO_INVOCATION — efeito colateral sem disable-model-invocation
write('invalid-unsafe-auto-invocation', {
  'SKILL.md': skillMd({ name: 'invalid-unsafe-auto-invocation', desc: 'Executa o deploy de produção e a migration de dados do cliente.', disable: false }),
  'governance.md': governanceMd({}),
  'evals/evals.json': EVALS,
});

console.log('fixtures geradas em', ROOT);
