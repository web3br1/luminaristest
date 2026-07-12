export const meta = {
  name: 'parallel-batch',
  description: 'Executa um lote de features em paralelo sem conflito de commit, conforme _PARALLELIZATION-CONTRACT.md — Fase 0 schema (serial) → Fase A corpos (paralelo, worktree/slice) → review independente por branch → Fase B registro (serial)',
  phases: [
    { title: 'Fase 0 — Schema' },
    { title: 'Fase A — Corpos' },
    { title: 'Review' },
    { title: 'Fase B — Integração' },
  ],
}

// args = a seção "Plano de paralelização" do orquestrador (PAR-006):
// {
//   schema: "mudanças de schema.prisma do lote, numa migração" | null,   // Fase 0
//   slices: [{ feature, branch, plan }],   // Fase A — write-sets provados disjuntos (PAR-002)
//   registration: "deltas de registro nos choke points PAR-001, na ordem", // Fase B
//   serialized: [{ feature, reason }]      // PAR-005 — só p/ log; NÃO entram no fanout
// }

// robustez: neste harness `args` chega ao script como string JSON, não objeto — parseia se for
// (medido no smoke wf_f7a4600f: sem isto, args.slices=undefined → early-return {done:false}, 0 agentes).
const spec = typeof args === 'string' ? JSON.parse(args) : (args || {})
const baseBranch = spec.baseBranch || 'main'
const slices = spec.slices || []
if (!slices.length) { log('Lote sem slice paralelo (PAR-005 serializou tudo) — nada a orquestrar aqui.'); return { done: false } }

// PAR-005: nunca truncar em silêncio — registrar o que ficou serial e por quê.
for (const s of (spec.serialized || [])) log(`serial (PAR-005): ${s.feature} — ${s.reason}`)

const VERDICT = {
  type: 'object',
  properties: {
    verdict: { enum: ['PASS', 'FAIL'] },
    branch: { type: 'string' },
    evidence: { type: 'string' },
  },
  required: ['verdict', 'branch'],
}

// ── Fase 0 — schema serial, na branch base, ANTES do fanout (PAR-003) ──
// PAR-004 (corrigido pós-smoke wf_f7a4600f): o `await` ordena a EXECUÇÃO, mas NÃO controla a base do
//   worktree — o `isolation:worktree` do harness escolhe a base de forma INCONSISTENTE (medido: um slice
//   nasceu do HEAD com a Fase 0, o outro nasceu de main SEM ela). Por isso a Fase 0 devolve o SHA do commit
//   de schema e cada slice da Fase A GARANTE esse commit no seu worktree — nunca confia em herança de base.
const FASE0 = { type: 'object', properties: { sha: { type: 'string' }, applied: { type: 'boolean' }, evidence: { type: 'string' } }, required: ['sha'] }
let fase0Sha = null
phase('Fase 0 — Schema')
if (spec.schema) {
  const f0 = await agent(
    `Você é o integrador. Na branch ${baseBranch} (checkout já feito), aplique SÓ as mudanças de schema deste lote e gere UMA migração:\n${spec.schema}\n` +
    `Leia .claude/skills/_PARALLELIZATION-CONTRACT.md (PAR-003 Fase 0) + _ARCHITECTURE-CONTRACT.md. ` +
    `Rode 'cd server && npx prisma migrate dev' e 'cd server && npx tsc --noEmit'; reporte o exit code REAL. ` +
    `Faça commit na branch ${baseBranch}. NÃO toque em corpo de feature nem em registro — só schema + migração. ` +
    `Retorne no schema o SHA do commit de schema ('git rev-parse HEAD') — os slices da Fase A vão garantir esse commit no worktree deles (o harness NÃO garante herança de base).`,
    { label: 'fase0:schema', phase: 'Fase 0 — Schema', schema: FASE0 }
  )
  fase0Sha = f0?.sha || null
  log(`Fase 0 fechada — schema commitado (${fase0Sha || 'SHA não reportado'}).`)
} else {
  log('Lote sem mudança de schema — pulando Fase 0.')
}

// ── Fase A — corpos em paralelo (1 worktree/slice) → review independente por branch ──
// pipeline: cada slice implementa e é revisado assim que fica pronto (sem barrier entre as etapas).
const reviewed = await pipeline(
  slices,
  (s) => agent(
    `Você é o luminaris-implementer. Implemente o CORPO da feature "${s.feature}" e faça commit numa branch nova '${s.branch}'.\n` +
    (fase0Sha
      ? `SEAM 1 (OBRIGATÓRIO antes de construir — o worktree pode NÃO ter herdado a Fase 0): rode 'git merge-base --is-ancestor ${fase0Sha} HEAD'. Se NÃO for ancestral, traga o schema da Fase 0 para o seu worktree com 'git merge ${fase0Sha} --no-edit' (ou 'git cherry-pick ${fase0Sha}') e rode 'cd server && npx prisma generate' para regenerar o client com o(s) model(s) novo(s). Confirme (grep no schema.prisma) que o(s) model(s) existe(m) ANTES de prosseguir; se não conseguir trazer o commit, PARE e reporte (não construa contra schema stale).\n`
      : ``) +
    `Leia .claude/skills/luminaris-implementer/SKILL.md.\nPlano:\n${s.plan}\n` +
    `PAR-003 Fase A: implemente APENAS o corpo (dtos/repo/policy/service/controller/routes/<feature>.ts próprio/páginas/i18n do domínio). ` +
    `NÃO edite os choke points PAR-001 (routes/index.ts, factory.ts, schema.prisma, seed.ts, openapi.json) — isso é Fase B. ` +
    `Se faltar server/node_modules, rode 'cd server && npm ci' primeiro. Rode tsc, registre o exit code, inclua a seção "Gates de envio OPS-001", e faça commit na branch '${s.branch}'.`,
    { label: `impl:${s.feature}`, phase: 'Fase A — Corpos', isolation: 'worktree' }
  ),
  (_impl, s) => agent(
    `Você é o luminaris-reviewer, INDEPENDENTE. Leia .claude/skills/luminaris-reviewer/SKILL.md e revise a branch ${s.branch} (feature "${s.feature}") do ZERO via 'git diff ${baseBranch}...${s.branch}' — NÃO confie no relatório do implementer (REV-003). ` +
    `Cheque também que o diff NÃO tocou nenhum choke point PAR-001 (isso é Fase B; tocar aqui é FAIL). ` +
    `Rode os checks, cite arquivo:linha, devolva o veredicto no schema.`,
    { label: `review:${s.feature}`, phase: 'Review', schema: VERDICT }
  )
)

const done = reviewed.filter(Boolean)
const pass = done.filter(r => r.verdict === 'PASS')
const fail = done.filter(r => r.verdict === 'FAIL')
for (const f of fail) log(`FAIL — fora da integração: ${f.branch} — ${f.evidence || 'ver relatório'}`)
if (!pass.length) { log('Nenhuma branch passou no review — Fase B abortada.'); return { schemaApplied: !!spec.schema, passed: [], failed: fail.map(f => f.branch) } }

// ── Fase B — integrador serial: merge + deltas de registro, tsc ENTRE cada (PAR-003 Fase B) ──
// ponytail: integração é intrinsecamente serial (choke points PAR-001 são pontos únicos). Um agente, um merge por vez.
phase('Fase B — Integração')
await agent(
  `Você é o integrador (serial). Na branch ${baseBranch}, integre SÓ as branches aprovadas, na ordem: ${pass.map(p => p.branch).join(', ')}.\n` +
  `PAR-003 Fase B + PAR-001: para CADA branch, faça o merge, aplique a delta de registro dela nos choke points ` +
  `(router.use em routes/index.ts, factory.ts, seed) e rode 'npx tsc --noEmit' dos dois lados ANTES de passar à próxima — nunca em lote. ` +
  `Ao final (uma vez só), regenere o openapi. Deltas de registro:\n${spec.registration || '(derivar de cada branch)'}\n` +
  `Se um tsc quebrar, PARE e reporte a branch culpada — não empilhe merges sobre uma main vermelha.`,
  { label: 'faseB:integracao', phase: 'Fase B — Integração' }
)

return {
  schemaApplied: !!spec.schema,
  passed: pass.map(p => p.branch),
  failed: fail.map(f => f.branch),
  serialized: (spec.serialized || []).map(s => s.feature),
}
