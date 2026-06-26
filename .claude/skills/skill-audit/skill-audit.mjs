#!/usr/bin/env node
// skill-audit — auditor de skills contra governance/SKILLS_STANDARD.md
// Comandos: inventory | validate | governance-check | sync-metadata | coverage |
//           eval | self-check | wiring | run
// ponytail: mini-parser de YAML (sem dependência) — frontmatter/governance são subset controlado.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AUDIT_DIR = __dirname;
const REPO_ROOT = path.resolve(__dirname, '../../..');
const SKILLS_DIR = path.join(REPO_ROOT, '.claude', 'skills');
const CONTRACT = path.join(SKILLS_DIR, '_ARCHITECTURE-CONTRACT.md');

const NON_GENERATOR = new Set(['skill-audit']);

// TypeScript (CJS) carregado de server/ ou my-app/ — para assertions AST-aware (JSX/TSX).
const _require = createRequire(import.meta.url);
let ts = null;
for (const b of ['server', 'my-app']) {
  try { ts = _require(_require.resolve('typescript', { paths: [path.join(REPO_ROOT, b)] })); break; } catch { /* try next */ }
}

const RULE_ID_RE = /\[([A-Z]{2,}[A-Z0-9]*-[0-9][0-9A-Za-z.\-]*)\]/g;
const CONTRACT_RULE_RE = /\bAC-\d+(?:\.\d+)*-[A-Z0-9]+\b/g;
const MD_LINK_RE = /\[[^\]]*\]\(([^)]+)\)/g;
const WIKILINK_RE = /\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g;
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DATE_RE = /\b(\d{4}-\d{2}-\d{2})\b/;

// gatilhos de efeito colateral (SG-013) — heurística documentada
// SG-013 backstop (heurística, não é a trava — SG-042). Sinais FORTES de efeito DB/deploy/destrutivo
// que a skill EXECUTA; evita falsos positivos com verbos de exemplo (ex.: "approve/publish" numa action).
const SIDE_EFFECT_RE = /\b(destrutiv|migration|migrate|migra[çc][ãa]o|deploy|drop\s+table|rm\s+-rf)\b/i;

// ---------------------------------------------------------------------------
// mini-YAML
// ---------------------------------------------------------------------------
function stripComment(line) {
  let inS = false, inD = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === "'" && !inD) inS = !inS;
    else if (c === '"' && !inS) inD = !inD;
    else if (c === '#' && !inS && !inD && (i === 0 || /\s/.test(line[i - 1]))) return line.slice(0, i);
  }
  return line;
}
function parseYaml(text) {
  const lines = text.split('\n').map(stripComment).filter((l) => l.trim() !== '');
  let idx = 0;
  const indent = (l) => l.length - l.trimStart().length;
  const scalar = (v) => {
    v = v.trim();
    if (v === '' || v === '~' || v === 'null') return null;
    if (v === 'true') return true;
    if (v === 'false') return false;
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) return v.slice(1, -1);
    return v;
  };
  function parseNode(curIndent) {
    if (idx >= lines.length) return null;
    return lines[idx].trim().startsWith('- ') ? parseSeq(curIndent) : parseMap(curIndent);
  }
  function parseMap(curIndent) {
    const obj = {};
    while (idx < lines.length) {
      const line = lines[idx];
      const ind = indent(line);
      if (ind < curIndent) break;
      if (ind > curIndent) { idx++; continue; }
      const t = line.trim();
      if (t.startsWith('- ')) break;
      const m = t.match(/^([^:]+):\s*(.*)$/);
      if (!m) { idx++; continue; }
      const key = m[1].trim();
      const val = m[2];
      idx++;
      if (val.trim() === '') {
        if (idx < lines.length && indent(lines[idx]) > curIndent) obj[key] = parseNode(indent(lines[idx]));
        else obj[key] = null;
      } else obj[key] = scalar(val);
    }
    return obj;
  }
  function parseSeq(curIndent) {
    const arr = [];
    while (idx < lines.length) {
      const line = lines[idx];
      const ind = indent(line);
      if (ind < curIndent) break;
      const t = line.trim();
      if (!t.startsWith('- ')) break;
      if (ind > curIndent) { idx++; continue; }
      const rest = t.slice(2);
      const m = rest.match(/^([^:\s][^:]*):\s*(.*)$/);
      if (m) {
        lines[idx] = ' '.repeat(ind + 2) + rest; // re-parse item as map
        arr.push(parseMap(ind + 2));
      } else {
        idx++;
        arr.push(scalar(rest));
      }
    }
    return arr;
  }
  return parseNode(indent(lines[0] || '')) || {};
}

// ---------------------------------------------------------------------------
// helpers de arquivo
// ---------------------------------------------------------------------------
function splitFrontmatter(raw) {
  if (!raw.startsWith('---')) return { fm: '', body: raw };
  const end = raw.indexOf('\n---', 3);
  if (end === -1) return { fm: '', body: raw };
  const fm = raw.slice(raw.indexOf('\n') + 1, end);
  const body = raw.slice(raw.indexOf('\n', end + 1) + 1);
  return { fm, body };
}
function readFm(file) {
  const raw = fs.readFileSync(file, 'utf8');
  const { fm, body } = splitFrontmatter(raw);
  return { raw, fm, body, data: fm ? parseYaml(fm) : {} };
}
function get(obj, dotted) {
  return dotted.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}
function uniqueMatches(text, re) {
  const out = new Set();
  let m;
  re.lastIndex = 0;
  while ((m = re.exec(text)) !== null) out.add(m[1] ?? m[0]);
  return [...out];
}
function firstDate(text) {
  const m = text.match(DATE_RE);
  return m ? m[1] : null;
}

// ---------------------------------------------------------------------------
// contrato
// ---------------------------------------------------------------------------
let _contractRules = null;
function contractRules() {
  if (_contractRules) return _contractRules;
  _contractRules = new Set();
  if (fs.existsSync(CONTRACT)) {
    for (const id of uniqueMatches(fs.readFileSync(CONTRACT, 'utf8'), CONTRACT_RULE_RE)) _contractRules.add(id);
  }
  return _contractRules;
}

let _branch = undefined;
function onMainBranch() {
  if (_branch === undefined) {
    try { _branch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: REPO_ROOT, encoding: 'utf8' }).trim(); }
    catch { _branch = ''; }
  }
  return _branch === 'main' || _branch === 'master';
}

// gates documentados neste skill-audit (G1..Gn, P1..Pn) — para GATE_TARGET_NOT_FOUND
let _auditGates = null;
function auditGates() {
  if (_auditGates) return _auditGates;
  _auditGates = new Set();
  const md = fs.readFileSync(path.join(AUDIT_DIR, 'SKILL.md'), 'utf8');
  for (const m of md.matchAll(/^###?\s+(G\d+|P\d+)\b/gm)) _auditGates.add(m[1]); // G1.. headings
  for (const m of md.matchAll(/\*\*(P\d+)\s*[·:]/g)) _auditGates.add(m[1]);       // P1.. protocolo (bullets)
  return _auditGates;
}

// ---------------------------------------------------------------------------
// normalização de governance.md (aceita os dois dialetos)
// ---------------------------------------------------------------------------
function normalizeGovernance(govDir) {
  const govPath = path.join(govDir, 'governance.md');
  if (!fs.existsSync(govPath)) return null;
  const { data } = readFm(govPath);
  const out = { dir: govDir, path: govPath, skillId: null, status: null, rules: {}, evaluation: {} };
  out.skillId = data['governance-skill-id'] ?? data['skill_id'] ?? data['skill-id'] ?? null;
  out.status = data['status'] ?? null;

  if (data.rules && typeof data.rules === 'object') {
    // dialeto-padrão
    for (const [rid, body] of Object.entries(data.rules)) {
      const gates = (body && body.gates) || [];
      out.rules[rid] = (Array.isArray(gates) ? gates : [gates]).map((g) => ({
        type: g.type || 'unknown',
        target: g.target || null,
      }));
    }
    const ev = data.evaluation || {};
    out.evaluation = {
      report: ev.report || null,
      lastEvaluated: ev.last_evaluated || ev['last-evaluated'] || null,
      score: ev.score != null ? Number(ev.score) : null,
      minimumScore: ev.minimum_score != null ? Number(ev.minimum_score) : 0.9,
    };
  } else if (data['governs-rules']) {
    // dialeto-piloto
    const governed = Array.isArray(data['governs-rules']) ? data['governs-rules'] : [];
    const gatesMap = data.gates || {};
    for (const rid of governed) {
      const g = gatesMap[rid] || {};
      const type = g.kind === 'executable' ? 'command' : g.kind === 'design-time' ? 'review' : (g.kind || 'review');
      out.rules[rid] = [{ type, target: g.command || g.gate || null }];
    }
    out.evaluation = {
      report: data['eval-score-source'] || null,
      lastEvaluated: data['last-evaluated'] || null,
      score: null,
      minimumScore: 0.9,
    };
  }
  return out;
}

// ---------------------------------------------------------------------------
// scan de uma skill (root = dir; usado por skills reais E fixtures)
// ---------------------------------------------------------------------------
function scanSkill(skillDir) {
  const dir = path.basename(skillDir);
  const skillMd = path.join(skillDir, 'SKILL.md');
  if (!fs.existsSync(skillMd)) return null;
  const { raw, fm, body, data } = readFm(skillMd);
  const lines = raw.split('\n').length;
  const evalsPath = path.join(skillDir, 'evals', 'evals.json');
  let evals = null;
  if (fs.existsSync(evalsPath)) {
    try { evals = JSON.parse(fs.readFileSync(evalsPath, 'utf8')); } catch { evals = { __parseError: true }; }
  }
  return {
    dir,
    skillDir,
    raw, fm, body, data,
    name: data.name ?? null,
    description: data.description ?? '',
    skillId: get(data, 'metadata.governance-skill-id') ?? null,
    status: get(data, 'metadata.governance-status') ?? data.status ?? null,
    version: get(data, 'metadata.governance-version') ?? null,
    evalScore: get(data, 'metadata.governance-eval-score') ?? null,
    disableModelInvocation: data['disable-model-invocation'] === true,
    hasCompatibility: data.compatibility != null,
    lines,
    ruleIds: uniqueMatches(body, RULE_ID_RE),
    wikilinks: uniqueMatches(body, WIKILINK_RE).length,
    governance: normalizeGovernance(skillDir),
    evals,
    evalsPath,
  };
}
function listSkillDirs() {
  return fs.readdirSync(SKILLS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && fs.existsSync(path.join(SKILLS_DIR, d.name, 'SKILL.md')))
    .map((d) => path.join(SKILLS_DIR, d.name))
    .sort();
}

// ---------------------------------------------------------------------------
// CHECKS — cada um retorna findings[]  {code, skill, rule?, detail}
// ---------------------------------------------------------------------------
function brokenRefs(s) {
  const out = [];
  let m;
  MD_LINK_RE.lastIndex = 0;
  while ((m = MD_LINK_RE.exec(s.body)) !== null) {
    let t = m[1].trim();
    if (/^(https?:|mailto:|tel:|#)/.test(t)) continue;
    t = t.split('#')[0].replace(/:\d+$/, '').trim();
    if (!t) continue;
    if (!fs.existsSync(path.resolve(s.skillDir, t))) out.push(t);
  }
  return out;
}

function checkStructure(s) {
  const f = [];
  const F = (code, detail) => f.push({ code, skill: s.dir, detail });
  if (!s.name) F('INVALID_SKILL_STRUCTURE', 'SKILL.md sem campo name');
  if (!s.description) F('INVALID_FRONTMATTER', 'sem description (SG-010)');
  if (s.name && !SLUG_RE.test(s.name)) F('INVALID_FRONTMATTER', `name não é slug válido: ${s.name} (SG-002)`);
  if (s.name && s.name !== s.dir) F('NAME_DIRECTORY_MISMATCH', `name=${s.name} ≠ dir=${s.dir} (SG-002)`);
  if (!s.skillId) F('INVALID_FRONTMATTER', 'sem metadata.governance-skill-id (SG-003)');
  if (!s.status) F('INVALID_FRONTMATTER', 'sem metadata.governance-status (SG-005)');
  else if (!['validated', 'deprecated', 'draft'].includes(s.status)) F('INVALID_FRONTMATTER', `status inválido: ${s.status}`);
  else if (s.status === 'draft' && onMainBranch()) F('INVALID_FRONTMATTER', 'skill draft no path de descoberta da branch principal (SG-005)');
  if (!s.version) F('INVALID_FRONTMATTER', 'sem metadata.governance-version (SG-046)');
  if (s.lines > 500) F('SKILL_TOO_LARGE', `${s.lines} linhas > 500 (SG-017)`);
  for (const w of [...uniqueMatches(s.body, WIKILINK_RE)]) F('BROKEN_REFERENCE', `wikilink em arquivo executável: [[${w}]] (SG-009)`);
  for (const b of brokenRefs(s)) F('BROKEN_REFERENCE', `link relativo inexistente: ${b} (SG-027)`);
  // efeito colateral sem trava de invocação (SG-013)
  if (SIDE_EFFECT_RE.test(s.description) && !s.disableModelInvocation)
    F('UNSAFE_AUTO_INVOCATION', 'description indica efeito colateral/destrutivo sem disable-model-invocation (SG-013)');
  return f;
}

function checkGlobalDuplicates(skills) {
  const f = [];
  const byName = {}, byId = {};
  for (const s of skills) {
    (byName[s.name] ??= []).push(s.dir);
    if (s.skillId) (byId[s.skillId] ??= []).push(s.dir);
  }
  for (const [k, v] of Object.entries(byName)) if (v.length > 1) f.push({ code: 'DUPLICATE_SKILL_NAME', skill: v.join(','), detail: `name ${k}` });
  for (const [k, v] of Object.entries(byId)) if (v.length > 1) f.push({ code: 'DUPLICATE_SKILL_ID', skill: v.join(','), detail: `id ${k}` });
  return f;
}

function gateTargetExists(gate, govDir) {
  const t = gate.target;
  if (!t) return false;
  if (gate.type === 'command') return t.trim().length > 0; // comando: presença basta no check estrutural
  if (gate.type === 'review') {
    // "skill-audit/Gx" → Gx documentado aqui; "outro/qualquer" → aceito (gate nomeado rastreável)
    const m = t.match(/^skill-audit\/(G\d+|P\d+)$/);
    if (m) return auditGates().has(m[1]);
    return /\//.test(t); // gate nomeado namespaced
  }
  // static/smoke/eval → caminho em disco
  const [file, frag] = t.split('#');
  const abs = path.resolve(govDir, file);
  if (!fs.existsSync(abs)) return false;
  if (frag && file.endsWith('.json')) {
    try {
      const j = JSON.parse(fs.readFileSync(abs, 'utf8'));
      const ids = (j.evals || j.cases || j || []).map?.((e) => e.id) || [];
      return ids.includes(frag);
    } catch { return false; }
  }
  return true;
}

function evalsCoverRule(s, rid) {
  const cases = s.evals && (s.evals.evals || s.evals.cases);
  if (!Array.isArray(cases)) return false;
  return cases.some((c) => Array.isArray(c.rules) && c.rules.includes(rid));
}
function evalTriggerKinds(s) {
  const cases = (s.evals && (s.evals.evals || s.evals.cases)) || [];
  const types = new Set(cases.map((c) => c.type));
  return { hasPos: types.has('trigger-positive') || types.has('activation'), hasNeg: types.has('trigger-negative') || types.has('non-activation') };
}

function checkGovernance(s) {
  const f = [];
  const F = (code, detail, rule) => f.push({ code, skill: s.dir, rule, detail });
  const g = s.governance;
  if (!g) return f; // adoção incremental: sem governance.md não falha governance-check
  const known = new Set([...contractRules(), ...s.ruleIds]);
  const govRuleIds = Object.keys(g.rules);

  // DUPLICATE_RULE_ID dentro do governance
  const seen = new Set();
  for (const rid of govRuleIds) { if (seen.has(rid)) F('DUPLICATE_RULE_ID', `regra repetida: ${rid}`, rid); seen.add(rid); }

  // GATE_WITHOUT_RULE: id governado não existe como regra (contrato ou body)
  for (const rid of govRuleIds) if (!known.has(rid)) F('GATE_WITHOUT_RULE', `${rid} não existe no contrato nem no corpo da SKILL.md`, rid);

  // RULE_WITHOUT_GATE: regra do corpo não governada
  for (const rid of s.ruleIds) if (!govRuleIds.includes(rid)) F('RULE_WITHOUT_GATE', `regra ${rid} no corpo sem entrada em governance.md`, rid);

  // por regra governada: precisa de gate + target válido
  for (const rid of govRuleIds) {
    const gates = g.rules[rid];
    if (!gates || gates.length === 0) { F('RULE_WITHOUT_GATE', `${rid} sem gate`, rid); continue; }
    for (const gate of gates) if (!gateTargetExists(gate, g.dir)) F('GATE_TARGET_NOT_FOUND', `${rid}: target ausente/inválido (${gate.type}: ${gate.target})`, rid);
    // cobertura de eval: só exigida para regra cujo gate NÃO é determinístico
    // (gate executável/static/smoke já é evidência mais forte que um eval — SG-035).
    const hasDeterministic = gates.some((x) => ['command', 'static', 'smoke'].includes(x.type));
    const hasEvalGate = gates.some((x) => x.type === 'eval');
    if (!hasDeterministic && !hasEvalGate && !evalsCoverRule(s, rid))
      F('RULE_WITHOUT_EVAL_COVERAGE', `${rid} (gate não-determinístico) sem eval que a cubra (SG-030)`, rid);
  }

  // gatilhos de eval mínimos (SG-029)
  if (s.evals) {
    const { hasPos, hasNeg } = evalTriggerKinds(s);
    if (!hasPos || !hasNeg) F('MISSING_TRIGGER_EVAL', `evals sem caso ${!hasPos ? 'de ativação' : ''}${!hasPos && !hasNeg ? ' e ' : ''}${!hasNeg ? 'de não-ativação' : ''} (SG-029)`);
  } else if (govRuleIds.length) {
    F('RULE_WITHOUT_EVAL_COVERAGE', 'governada mas sem evals/evals.json (SG-029)');
  }

  // STALE_EVALUATION — só cobrado para skill VALIDATED (draft ainda não foi avaliada)
  const ev = g.evaluation;
  if (ev.report && s.status === 'validated') {
    const repAbs = path.resolve(g.dir, ev.report);
    if (!fs.existsSync(repAbs)) F('GATE_TARGET_NOT_FOUND', `evaluation.report inexistente: ${ev.report}`);
    else {
      const repDate = firstDate(fs.readFileSync(repAbs, 'utf8'));
      if (ev.lastEvaluated && repDate && ev.lastEvaluated < repDate)
        F('STALE_EVALUATION', `last-evaluated ${ev.lastEvaluated} < última corrida do report ${repDate}`);
    }
  }
  return f;
}

function checkSyncMetadata(s) {
  const f = [];
  const g = s.governance;
  if (!g) return f;
  // status do SKILL.md == status do governance.md
  if (s.status && g.status && s.status !== g.status)
    f.push({ code: 'METADATA_REPORT_MISMATCH', skill: s.dir, detail: `status SKILL.md=${s.status} ≠ governance.md=${g.status}` });
  // eval-score do frontmatter deve ser projeção do report
  if (s.evalScore != null && g.evaluation.report) {
    const repAbs = path.resolve(g.dir, g.evaluation.report);
    if (fs.existsSync(repAbs)) {
      const txt = fs.readFileSync(repAbs, 'utf8');
      const m = txt.match(/score[^\d]*([01](?:\.\d+)?)/i);
      if (m && Number(m[1]).toFixed(2) !== Number(s.evalScore).toFixed(2))
        f.push({ code: 'METADATA_REPORT_MISMATCH', skill: s.dir, detail: `eval-score frontmatter ${s.evalScore} ≠ report ${m[1]} (SG-011)` });
    }
  }
  return f;
}

// ---------------------------------------------------------------------------
// runners
// ---------------------------------------------------------------------------
function allSkills() {
  return listSkillDirs().map(scanSkill).filter(Boolean).filter((s) => !NON_GENERATOR.has(s.dir));
}
function printFindings(findings) {
  if (!findings.length) { console.log('  ✅ sem findings'); return; }
  const byCode = {};
  for (const x of findings) (byCode[x.code] ??= []).push(x);
  for (const [code, list] of Object.entries(byCode)) {
    console.log(`  ❌ ${code} (${list.length})`);
    for (const x of list) console.log(`     - ${x.skill}${x.rule ? ' [' + x.rule + ']' : ''}: ${x.detail}`);
  }
}

function cmdValidate(skills = allSkills()) {
  let findings = checkGlobalDuplicates(skills);
  for (const s of skills) findings = findings.concat(checkStructure(s));
  console.log(`\n== validate (${skills.length} skills) ==`);
  printFindings(findings);
  return findings;
}
function cmdGovernanceCheck(skills = allSkills()) {
  const governed = skills.filter((s) => s.governance);
  let findings = [];
  for (const s of governed) findings = findings.concat(checkGovernance(s));
  console.log(`\n== governance-check (${governed.length} skills governadas) ==`);
  printFindings(findings);
  return findings;
}
function cmdSyncMetadata(skills = allSkills()) {
  let findings = [];
  for (const s of skills) findings = findings.concat(checkSyncMetadata(s));
  console.log(`\n== sync-metadata ==`);
  printFindings(findings);
  return findings;
}
function cmdCoverage(skills = allSkills()) {
  const governed = skills.filter((s) => s.governance);
  let rows = [];
  for (const s of governed) {
    for (const [rid, gates] of Object.entries(s.governance.rules)) {
      const ok = gates.length && gates.every((g) => gateTargetExists(g, s.governance.dir));
      rows.push({ rule: rid, skill: s.dir, gate: gates.map((g) => `${g.type}:${g.target}`).join(' | '), status: ok ? '✅' : '❌' });
    }
  }
  let md = `---\ntype: governance-coverage\nphase: 2\ngenerated-by: skill-audit coverage\n---\n\n# Cobertura regra → gate (auto)\n\n| Regra | Skill | Gate | Status |\n|---|---|---|---|\n`;
  for (const r of rows) md += `| \`${r.rule}\` | ${r.skill} | ${r.gate} | ${r.status} |\n`;
  fs.writeFileSync(path.join(REPO_ROOT, 'governance', 'coverage-auto.md'), md);
  console.log(`\n== coverage (${rows.length} mapeamentos) -> governance/coverage-auto.md ==`);
  const broken = rows.filter((r) => r.status === '❌');
  if (broken.length) console.log(`  ❌ ${broken.length} regra(s) com gate quebrado`);
  else console.log('  ✅ toda regra governada tem gate com target válido');
  return broken.map((r) => ({ code: 'GATE_TARGET_NOT_FOUND', skill: r.skill, rule: r.rule, detail: r.gate }));
}

// ---------------------------------------------------------------------------
// self-check — fixtures
// ---------------------------------------------------------------------------
function fixtureFindings(fixDir) {
  const s = scanSkill(fixDir);
  if (!s) return [{ code: 'INVALID_SKILL_STRUCTURE', skill: path.basename(fixDir), detail: 'fixture sem SKILL.md' }];
  // o name da fixture é o nome do dir (slug) -> evita falso NAME_DIRECTORY_MISMATCH irrelevante
  return [...checkStructure(s), ...checkGovernance(s), ...checkSyncMetadata(s)];
}
function cmdSelfCheck() {
  const fixRoot = path.join(AUDIT_DIR, 'fixtures');
  const expectations = {
    'valid-minimal-skill': null, // deve passar
    'invalid-name-mismatch': 'NAME_DIRECTORY_MISMATCH',
    'invalid-rule-without-gate': 'RULE_WITHOUT_GATE',
    'invalid-orphan-gate': 'GATE_WITHOUT_RULE',
    'invalid-broken-reference': 'BROKEN_REFERENCE',
    'invalid-stale-evaluation': 'STALE_EVALUATION',
    'invalid-unsafe-auto-invocation': 'UNSAFE_AUTO_INVOCATION',
  };
  console.log(`\n== self-check (${Object.keys(expectations).length} fixtures) ==`);
  let failed = 0;
  for (const [name, expected] of Object.entries(expectations)) {
    const dir = path.join(fixRoot, name);
    if (!fs.existsSync(path.join(dir, 'SKILL.md'))) { console.log(`  ❌ ${name}: fixture ausente`); failed++; continue; }
    const codes = new Set(fixtureFindings(dir).map((x) => x.code));
    if (expected === null) {
      if (codes.size === 0) console.log(`  ✅ ${name}: passa limpo`);
      else { console.log(`  ❌ ${name}: deveria passar, mas: ${[...codes].join(', ')}`); failed++; }
    } else {
      if (codes.has(expected)) console.log(`  ✅ ${name}: detectou ${expected}`);
      else { console.log(`  ❌ ${name}: esperava ${expected}, obteve: ${[...codes].join(', ') || '(nada)'}`); failed++; }
    }
  }
  const findings = failed ? [{ code: 'AUDITOR_SELF_CHECK_FAILED', skill: 'skill-audit', detail: `${failed} fixture(s) divergente(s)` }] : [];
  if (failed) console.log(`  ❌ AUDITOR_SELF_CHECK_FAILED: ${failed}`);
  else console.log('  ✅ self-check íntegro');
  return findings;
}

// ---------------------------------------------------------------------------
// controls — prova que cada assertion CORRIGIDA (de-brittle) ainda discrimina:
// variante boa PASSA, variante violadora FALHA. Arquivos: controls/<skill>.json
// [{ rule, assertion, good, bad }]  (good deve passar; bad deve falhar)
function cmdControls() {
  const cdir = path.join(AUDIT_DIR, 'controls');
  const findings = [];
  if (!fs.existsSync(cdir)) { console.log('\n== controls == (nenhum)'); return findings; }
  const files = fs.readdirSync(cdir).filter((f) => f.endsWith('.json'));
  console.log(`\n== controls (${files.length} skill(s)) ==`);
  for (const f of files) {
    const skill = f.replace(/\.json$/, '');
    const entries = JSON.parse(fs.readFileSync(path.join(cdir, f), 'utf8'));
    for (const e of entries) {
      const a = e.assertion.replace(/^@[^:]+::\s*/, ''); // controla a forma kind:arg (snippet single-file)
      const i = a.indexOf(':');
      const kind = a.slice(0, i).trim(), arg = a.slice(i + 1).trim();
      const fname = e.file || 'chunk.tsx';
      const g = applyKind(kind, arg, e.good, fname);
      const b = applyKind(kind, arg, e.bad, fname);
      // good DEVE passar; bad NÃO pode passar (FAIL ou BLOCKED ambos contam como discriminação)
      const pass = g.ok === true && b.ok !== true;
      if (!pass) findings.push({ code: 'CONTROL_FAILED', skill, rule: e.rule, detail: `good=${g.ok} bad=${b.ok} :: ${e.assertion}` });
      console.log(`  ${pass ? '✅' : '❌'} ${skill} [${e.rule}] good=${g.ok} bad=${b.ok}`);
    }
  }
  if (findings.length) console.log(`  ❌ CONTROL_FAILED: ${findings.length}`);
  else console.log('  ✅ todo controle discrimina (bom passa, ruim falha)');
  return findings;
}

// ---------------------------------------------------------------------------
// eval — valida ESTRUTURA dos evals; execução comportamental é model-in-loop (BLOCKED aqui)
// ---------------------------------------------------------------------------
function changedSkillDirs() {
  try {
    const out = execSync('git diff --name-only HEAD', { cwd: REPO_ROOT, encoding: 'utf8' });
    const dirs = new Set();
    for (const line of out.split('\n')) {
      const m = line.match(/\.claude\/skills\/([^/]+)\//);
      if (m) dirs.add(m[1]);
    }
    return dirs;
  } catch { return null; }
}
function cmdEval(changedOnly) {
  let skills = allSkills().filter((s) => s.governance);
  if (changedOnly) {
    const ch = changedSkillDirs();
    if (ch) skills = skills.filter((s) => ch.has(s.dir));
  }
  const findings = [];
  console.log(`\n== eval${changedOnly ? ' --changed' : ''} (${skills.length} skills governadas) ==`);
  for (const s of skills) {
    if (!s.evals) { findings.push({ code: 'RULE_WITHOUT_EVAL_COVERAGE', skill: s.dir, detail: 'sem evals/evals.json' }); console.log(`  ❌ ${s.dir}: sem evals.json`); continue; }
    if (s.evals.__parseError) { findings.push({ code: 'EVAL_FAILED', skill: s.dir, detail: 'evals.json inválido (JSON)' }); console.log(`  ❌ ${s.dir}: evals.json não é JSON válido`); continue; }
    const cases = s.evals.evals || s.evals.cases || [];
    const ids = cases.map((c) => c.id);
    const dup = ids.filter((x, i) => ids.indexOf(x) !== i);
    if (dup.length) findings.push({ code: 'EVAL_FAILED', skill: s.dir, detail: `ids duplicados: ${dup.join(',')}` });
    const { hasPos, hasNeg } = evalTriggerKinds(s);
    if (!hasPos || !hasNeg) findings.push({ code: 'MISSING_TRIGGER_EVAL', skill: s.dir, detail: 'faltam gatilhos pos/neg' });
    // assertions comportamentais → BLOCKED (precisam de execução model-in-loop; nunca PASS sem evidência)
    const behavioral = cases.length;
    console.log(`  ⏸ ${s.dir}: ${behavioral} caso(s) estruturalmente válidos — execução comportamental BLOCKED (harness model-in-loop)`);
  }
  return findings;
}

// eval-assert <skillDir> <caseId> <outputFile> — roda as assertions mecânicas de UM caso
// contra o output gerado por um subagente (model-in-loop fora do CLI). SG-031.
function cmdEvalAssert(skillDirArg, caseId, outFile) {
  const skillDir = path.isAbsolute(skillDirArg) ? skillDirArg : path.join(SKILLS_DIR, skillDirArg);
  const evalsPath = path.join(skillDir, 'evals', 'evals.json');
  const data = JSON.parse(fs.readFileSync(evalsPath, 'utf8'));
  const c = (data.evals || data.cases || []).find((e) => e.id === caseId);
  if (!c) { console.error(`caso ${caseId} não existe`); process.exit(2); }
  const out = fs.readFileSync(path.resolve(outFile), 'utf8');
  const { res: results, fail } = assertCase(c, out);
  console.log(`eval-assert ${path.basename(skillDir)}#${caseId}:`);
  for (const r of results) console.log(`  ${r.ok === true ? '✅' : r.ok === false ? '❌' : '⏸'} ${r.a}${r.note ? ' — ' + r.note : ''}`);
  const mech = results.filter((r) => r.ok !== null);
  const passed = mech.filter((r) => r.ok).length;
  console.log(`  => ${passed}/${mech.length} assertions mecânicas PASS${fail ? ` (${fail} FAIL)` : ''}`);
  process.exit(fail ? 1 : 0);
}

// batch-eval <skill> <combinedfile> — split em ===HAPPY===/===EDGE===/===REGRESSION===
// e roda as assertions de happy-1/edge-1/regression-1 contra a SEÇÃO isolada (evita contaminação).
// remove comentários de linha (// …) e de bloco (/* … */) para asserts que olham só CÓDIGO.
// Scanner por caractere (não regex) com estados string/template/regex — `//` dentro de string
// ("a//b"), URL ("http://x"), regex literal (/a\/\//) ou template (`/* x */`) NÃO são comentário
// e ficam intactos. Direção segura: na dúvida, removemos MENOS (mantém o token) → nunca um
// PASS falso de `absent-code` (no máximo um FAIL conservador). ponytail: teto conhecido — um
// regex logo após `)`/`]`/identificador (contexto de divisão) pode ser lido como divisão; os
// casos reais de regex aqui vêm após `=`/`(`/`.match(`/keyword (contexto de regex), cobertos.
const REGEX_PRECEDING_KW = /(?:return|typeof|instanceof|in|of|new|delete|void|do|else|case|yield|await|throw)$/;
function stripCodeComments(text) {
  let out = '';
  let prevSig = '';   // último caractere significativo (não-espaço) emitido — decide regex vs divisão
  let lastWord = '';  // identificador à esquerda (preservado por espaços) — detecta `return /re/`
  const emit = (ch) => {
    out += ch;
    if (/\S/.test(ch)) { prevSig = ch; lastWord = /[A-Za-z0-9_$]/.test(ch) ? lastWord + ch : ''; }
  };
  let i = 0; const n = text.length;
  while (i < n) {
    const c = text[i], d = text[i + 1];
    if (c === '/' && d === '/') { i += 2; while (i < n && text[i] !== '\n') i++; continue; }      // linha
    if (c === '/' && d === '*') { i += 2; while (i < n && !(text[i] === '*' && text[i + 1] === '/')) i++; i += 2; out += ' '; continue; } // bloco → espaço
    if (c === '"' || c === "'") {  // string
      out += c; i++;
      while (i < n) { const ch = text[i]; out += ch; if (ch === '\\') { out += text[i + 1] ?? ''; i += 2; continue; } i++; if (ch === c) break; }
      prevSig = c; lastWord = ''; continue;
    }
    if (c === '`') {  // template (mantido inteiro — conservador; comentário interno raro fica)
      out += c; i++;
      while (i < n) { const ch = text[i]; out += ch; if (ch === '\\') { out += text[i + 1] ?? ''; i += 2; continue; } i++; if (ch === '`') break; }
      prevSig = '`'; lastWord = ''; continue;
    }
    if (c === '/') {  // regex literal só em contexto de valor (não após identificador/`)`/`]`)
      const division = /[A-Za-z0-9_$)\]}`'".]/.test(prevSig) && !REGEX_PRECEDING_KW.test(lastWord);
      if (!division) {
        out += c; i++; let inClass = false;
        while (i < n) { const ch = text[i]; out += ch; if (ch === '\\') { out += text[i + 1] ?? ''; i += 2; continue; } i++; if (ch === '[') inClass = true; else if (ch === ']') inClass = false; else if (ch === '/' && !inClass) break; }
        prevSig = '/'; lastWord = ''; continue;
      }
      emit(c); i++; continue;
    }
    emit(c); i++;
  }
  return out;
}
function runKind(kind, arg, text) {
  if (kind === 'contains') return text.includes(arg);
  if (kind === 'absent') return !text.includes(arg);
  // *-code: ignora comentários — limite arquitetural por arquivo sem falso-positivo de comentário
  if (kind === 'contains-code') return stripCodeComments(text).includes(arg);
  if (kind === 'absent-code') return !stripCodeComments(text).includes(arg);
  if (kind === 'regex') { try { return new RegExp(arg).test(text); } catch { return false; } }
  return null; // qualitativa (model-judged)
}

// --- AST-aware (JSX/TSX). createSourceFile + forEachChild (sintático, sem TypeChecker). ---
function tsScriptKind(fname) {
  return /\.ts$/.test(fname) && !/\.tsx$/.test(fname) ? ts.ScriptKind.TS : ts.ScriptKind.TSX; // default TSX
}
function hasJsxTag(sf, tag) {
  let found = false;
  const visit = (n) => {
    if (found) return;
    if (ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n)) {
      if (n.tagName.getText(sf) === tag) { found = true; return; }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return found;
}
function moduleMatch(spec, mod) {
  return spec === mod || spec.endsWith(mod) || spec.endsWith('/' + mod.replace(/^@\//, ''));
}
// import LIGADO: o binding `name` (export real, respeitando alias) vem do módulo `mod`
function hasBoundImport(sf, name, mod) {
  for (const st of sf.statements) {
    if (!ts.isImportDeclaration(st) || !ts.isStringLiteral(st.moduleSpecifier)) continue;
    if (!moduleMatch(st.moduleSpecifier.text, mod)) continue;
    const c = st.importClause;
    if (!c) continue;
    if (c.name && c.name.text === name) return true; // default import
    const nb = c.namedBindings;
    if (nb) {
      if (ts.isNamespaceImport(nb) && nb.name.text === name) return true;
      // named: casa pelo NOME EXPORTADO (propertyName quando há alias) — pega "Foo as Modal" como NÃO-Modal
      if (ts.isNamedImports(nb) && nb.elements.some((e) => (e.propertyName ? e.propertyName.text : e.name.text) === name)) return true;
    }
  }
  return false;
}
function hasLiteralDescendant(node) {
  let has = false;
  const v = (n) => { if (has) return; if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) || ts.isTemplateExpression(n)) has = true; else ts.forEachChild(n, v); };
  v(node);
  return has;
}
function noClassToken(sf, token) {
  let found = false, dynamic = false;
  const visit = (n) => {
    if ((ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) && n.text.includes(token)) found = true;
    if (ts.isTemplateExpression(n) && (n.head.text.includes(token) || n.templateSpans.some((s) => s.literal.text.includes(token)))) found = true;
    if (ts.isJsxAttribute(n) && n.name.getText(sf) === 'className' && n.initializer && ts.isJsxExpression(n.initializer) && n.initializer.expression) {
      if (!hasLiteralDescendant(n.initializer.expression)) dynamic = true; // sem literal → totalmente dinâmico
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  if (found) return { ok: false, note: `token '${token}' presente em classe estática` };
  if (dynamic) return { ok: false, note: `className totalmente dinâmico — ausência não comprovável (BLOCKED)` };
  return { ok: true, note: '' };
}
function astAssert(kind, arg, code, fname) {
  if (!ts) return { ok: false, note: 'typescript indisponível (BLOCKED)' };
  const sf = ts.createSourceFile(fname || 'chunk.tsx', code, ts.ScriptTarget.Latest, true, tsScriptKind(fname || 'chunk.tsx'));
  const diags = sf.parseDiagnostics || [];
  if (diags.length) return { ok: false, note: `parse error (BLOCKED): ${diags.length} diagnóstico(s)` };
  if (kind === 'ast-jsx') { const ok = hasJsxTag(sf, arg); return { ok, note: ok ? '' : `<${arg}> ausente` }; }
  if (kind === 'ast-import') {
    const at = arg.indexOf('@'); if (at < 0) return { ok: false, note: `formato esperado Name@module: ${arg}` };
    const ok = hasBoundImport(sf, arg.slice(0, at), arg.slice(at + 1));
    return { ok, note: ok ? '' : `import ligado ${arg} ausente` };
  }
  if (kind === 'ast-noclass') return noClassToken(sf, arg);
  return { ok: null, note: `ast kind desconhecido: ${kind}` };
}
// roteia text→regex / ast. AST nunca retorna PASS sob incerteza (parse error / dinâmico = BLOCKED → ok:false).
function applyKind(kind, arg, text, fname) {
  if (kind.startsWith('ast-')) return astAssert(kind, arg, text, fname || 'chunk.tsx');
  const ok = runKind(kind, arg, text);
  return { ok, note: ok === null ? 'qualitativa (model-judged)' : '' };
}
// divide uma seção em chunks por marcador de arquivo `// caminho/arquivo.ext` (linha isolada)
function splitFiles(text) {
  const files = [];
  let cur = { path: '', body: [] };
  for (const ln of text.split('\n')) {
    const m = ln.match(/^\/\/\s*([\w./-]+\.\w+)\s*$/);
    if (m) { if (cur.body.length) files.push({ path: cur.path, body: cur.body.join('\n') }); cur = { path: m[1], body: [] }; }
    else cur.body.push(ln);
  }
  if (cur.body.length) files.push({ path: cur.path, body: cur.body.join('\n') });
  return files;
}
// assertion com escopo opcional `@<substr-do-arquivo>::<kind>:<arg>` → roda só no chunk daquele arquivo
function evalAssertion(a, sectionText, files) {
  let scope = null, body = a;
  const m = a.match(/^@([^:]+)::(.*)$/);
  if (m) { scope = m[1]; body = m[2]; }
  const i = body.indexOf(':');
  const kind = body.slice(0, i).trim(), arg = body.slice(i + 1).trim();
  let target = sectionText, fname = 'chunk.tsx';
  if (scope) {
    const f = files.find((x) => x.path.includes(scope));
    if (!f) return { a, ok: false, note: `arquivo-alvo '${scope}' ausente na seção` };
    target = f.body; fname = f.path || fname;
  }
  const r = applyKind(kind, arg, target, fname);
  return { a, ok: r.ok, note: r.note };
}
function assertCase(c, text) {
  const files = splitFiles(text);
  const res = (c.assertions || []).map((a) => evalAssertion(a, text, files));
  return { res, fail: res.filter((r) => r.ok === false).length };
}
function cmdBatchEval(skill, file) {
  const skillDir = path.join(SKILLS_DIR, skill);
  const data = JSON.parse(fs.readFileSync(path.join(skillDir, 'evals', 'evals.json'), 'utf8'));
  const cases = data.evals || data.cases || [];
  const raw = fs.readFileSync(path.resolve(file), 'utf8');
  // seção por case-id: ===<id>=== ... até o próximo marcador. Aceita HAPPY/EDGE/REGRESSION legados.
  const legacy = { 'happy-1': 'HAPPY', 'edge-1': 'EDGE', 'regression-1': 'REGRESSION' };
  const sec = (cid) => {
    for (const name of [cid, legacy[cid]].filter(Boolean)) {
      const m = raw.match(new RegExp(`===${name}===([\\s\\S]*?)(?:\\n===[\\w-]+===|$)`));
      if (m) return m[1].replace(/```[a-z]*\n?/g, '');
    }
    return null;
  };
  const codeCaseList = cases.filter((c) => !String(c.type).startsWith('trigger'));
  let passCases = 0, codeCases = 0;
  console.log(`\nbatch-eval ${skill}:`);
  for (const c of codeCaseList) {
    codeCases++;
    const text = sec(c.id);
    if (text == null) { console.log(`  ⏸ ${c.id}: seção ausente no output`); continue; }
    const { res, fail } = assertCase(c, text);
    if (!fail) passCases++;
    console.log(`  ${fail ? '❌' : '✅'} ${c.id} (${res.filter((r) => r.ok).length}/${res.filter((r) => r.ok !== null).length})`);
    for (const r of res) if (r.ok === false) console.log(`       FAIL ${r.a}${r.note ? ' — ' + r.note : ''}`);
  }
  console.log(`  => ${passCases}/${codeCases} casos de código PASS`);
  return passCases === codeCases ? 0 : 1;
}

// ---------------------------------------------------------------------------
// inventory (Fase 1) — mantido
// ---------------------------------------------------------------------------
function cmdInventory() {
  const skills = allSkills();
  const yes = (b) => (b ? '✅' : '—');
  const ok = (b) => (b ? 'ok' : '❌');
  let md = `---\ntype: skill-inventory\ngenerated-by: skill-audit inventory\nphase: 1\ngenerator-skills: ${skills.length}\n---\n\n# Inventário de skills — Fase 1\n\n| # | Skill | name=dir | stable-id | status | ver | size | rules | gov.md | gov-rules | evals | links |\n|---|---|:--:|:--:|:--:|:--:|--:|--:|:--:|--:|:--:|:--:|\n`;
  skills.forEach((s, i) => {
    md += `| ${i + 1} | \`${s.dir}\` | ${ok(s.name === s.dir)} | ${s.skillId ? '✅' : '❌'} | ${s.status || '—'} | ${s.version || '—'} | ${s.lines} | ${s.ruleIds.length} | ${yes(!!s.governance)} | ${s.governance ? Object.keys(s.governance.rules).length : 0} | ${yes(!!s.evals)} | ${brokenRefs(s).length === 0 ? 'ok' : '❌'} |\n`;
  });
  fs.writeFileSync(path.join(REPO_ROOT, 'governance', 'INVENTORY.md'), md);
  console.log(`inventory: ${skills.length} skills geradoras -> governance/INVENTORY.md`);
  console.log(`  governance.md: ${skills.filter((s) => s.governance).length} | evals: ${skills.filter((s) => s.evals).length} | stable-id: ${skills.filter((s) => s.skillId).length}`);
}

// ---------------------------------------------------------------------------
// dispatcher
// ---------------------------------------------------------------------------
function exit(findings) {
  process.exit(findings && findings.length ? 1 : 0);
}

// wiring — bugs de "membership em registro central" no APP gerado que o tsc não vê
// (rota não montada, categoria KPI/preset órfã, divergência i18n en↔pt).
// Roda os checks co-localizados; cada exit≠0 vira 1 finding com a saída.
function cmdWiring() {
  const findings = [];
  for (const script of ['check-registries.mjs', 'check-i18n-keys.mjs']) {
    try {
      execSync(`node "${path.join(AUDIT_DIR, script)}"`, { stdio: 'pipe' });
    } catch (e) {
      const out = `${e.stdout?.toString() || ''}${e.stderr?.toString() || ''}`.trim();
      findings.push({ code: 'WIRING_REGISTRY_MISSING', skill: script, detail: out.split('\n').filter(Boolean).join(' | ') });
    }
  }
  return findings;
}
const cmd = process.argv[2] || 'run';
switch (cmd) {
  case 'inventory': cmdInventory(); break;
  case 'validate': exit(cmdValidate()); break;
  case 'governance-check': exit(cmdGovernanceCheck()); break;
  case 'sync-metadata': exit(cmdSyncMetadata()); break;
  case 'coverage': exit(cmdCoverage()); break;
  case 'eval': exit(cmdEval(process.argv.includes('--changed'))); break;
  case 'eval-assert': cmdEvalAssert(process.argv[3], process.argv[4], process.argv[5]); break;
  case 'batch-eval': process.exit(cmdBatchEval(process.argv[3], process.argv[4])); break;
  case 'controls': exit(cmdControls()); break;
  case 'self-check': exit(cmdSelfCheck()); break;
  case 'wiring': exit(cmdWiring()); break;
  case 'run': {
    const skills = allSkills();
    const all = [
      ...cmdValidate(skills),
      ...cmdGovernanceCheck(skills),
      ...cmdSyncMetadata(skills),
      ...cmdCoverage(skills),
      ...cmdEval(false),
      ...cmdControls(),
      ...cmdSelfCheck(),
      ...cmdWiring(),
    ];
    console.log(`\n== run --all: ${all.length} finding(s) ==`);
    exit(all);
    break;
  }
  default:
    console.error(`comando desconhecido: ${cmd}`);
    process.exit(2);
}
