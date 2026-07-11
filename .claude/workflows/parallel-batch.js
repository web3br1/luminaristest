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

const spec = args || {}
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

// ── Fase 0 — schema serial, na main, ANTES do fanout (PAR-003) ──
// Barrier PAR-004: este `await` FECHA a Fase 0 antes de qualquer worktree da Fase A ser requisitado;
//   logo os worktrees nascem do HEAD já atualizado — ordering por construção do await, não por acaso.
phase('Fase 0 — Schema')
if (spec.schema) {
  await agent(
    `Você é o integrador. Na main, aplique SÓ as mudanças de schema deste lote e gere UMA migração:\n${spec.schema}\n` +
    `Leia .claude/skills/_PARALLELIZATION-CONTRACT.md (PAR-003 Fase 0) + _ARCHITECTURE-CONTRACT.md. ` +
    `Rode 'cd server && npx prisma migrate dev' e 'npx tsc --noEmit'; reporte o exit code REAL. ` +
    `NÃO toque em corpo de feature nem em registro — só schema + migração.`,
    { label: 'fase0:schema', phase: 'Fase 0 — Schema' }
  )
  log('Fase 0 concluída — schema congelado.')
} else {
  log('Lote sem mudança de schema — pulando Fase 0.')
}

// ── Fase A — corpos em paralelo (1 worktree/slice) → review independente por branch ──
// pipeline: cada slice implementa e é revisado assim que fica pronto (sem barrier entre as etapas).
const reviewed = await pipeline(
  slices,
  (s) => agent(
    `Você é o luminaris-implementer. Leia .claude/skills/luminaris-implementer/SKILL.md e implemente o CORPO da feature "${s.feature}" contra o schema já congelado; faça commit na branch ${s.branch}.\n` +
    `Plano:\n${s.plan}\n` +
    `PAR-003 Fase A: implemente APENAS o corpo (dtos/repo/policy/service/controller/routes/<feature>.ts próprio/páginas/i18n do domínio). ` +
    `NÃO edite os choke points PAR-001 (routes/index.ts, factory.ts, schema.prisma, seed.ts, openapi.json) — isso é Fase B. ` +
    `Rode 'npm ci' no worktree primeiro (node_modules não vem; o prisma client da main é stale vs o schema). ` +
    `Rode tsc dos dois lados, registre o exit code, e inclua a seção "Gates de envio OPS-001" no relatório.`,
    { label: `impl:${s.feature}`, phase: 'Fase A — Corpos', isolation: 'worktree' }
  ),
  (_impl, s) => agent(
    `Você é o luminaris-reviewer, INDEPENDENTE. Leia .claude/skills/luminaris-reviewer/SKILL.md e revise a branch ${s.branch} (feature "${s.feature}") do ZERO via 'git diff main...${s.branch}' — NÃO confie no relatório do implementer (REV-003). ` +
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
  `Você é o integrador (serial). Na main, integre SÓ as branches aprovadas, na ordem: ${pass.map(p => p.branch).join(', ')}.\n` +
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
