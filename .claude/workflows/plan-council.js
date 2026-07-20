export const meta = {
  name: 'plan-council',
  description: 'Council de DESENHO (não de código): decide um fork de ADR por advocacia + verify adversarial ancorado em contrato + síntese CONSULTIVA (humano ratifica). Alvo: forks que ESCREVEM no ledger ou CRUZAM a fronteira DynamicTable×Prisma — só aí as 4 lentes mordem superfícies distintas. NÃO usar em export read-only (ECF/ECD/BP-DRE): eval em 2026-07-20 (plan-council-harness-eval) mostrou boundary/invariant N/A e minimal→reuse, i.e. convergência = desperdício. NÃO implementa, NÃO aprova, NÃO mergeia.',
  phases: [
    { title: 'Enumerar' },   // opcional — só roda se args.options vier vazio
    { title: 'Advogar' },    // 1 agente por opção do fork
    { title: 'Verificar' },  // 1 agente por lente, cada lente julga TODAS as opções
    { title: 'Sintetizar' }, // chairman consultivo
  ],
}

// ── Por que este workflow existe ──────────────────────────────────────────────
// O council do karpathy/llm-council (fan-out → peer-ranking anônimo → chairman) NÃO serve
// pra implementação de código nossa: ali os gates são objetivos (tsc, contrato de camada,
// reviewer PASS/FAIL) e ranking-por-gosto joga isso fora. Ele serve onde o gate é CEGO:
// decisão de desenho ANTES do código — o fork de ADR. Duas trocas vs. o original:
//   1. ranking-por-insight  → verify adversarial ANCORADO em contrato (verdade objetiva > gosto)
//   2. chairman decide       → chairman RECOMENDA; humano ratifica (accounting-master-map §5.1,
//                              regra reviewer-independence). Sem auto-merge, sem tocar governança.
// ponytail: só vale pra fork de desenho AMBÍGUO. Numa geração de camada rotineira é desperdício —
//   ali o pipeline determinístico (orchestrator→implementer→reviewer) ganha. Se as lentes
//   convergirem, a lição é "mata o council, fica com a lente única" (o accounting-architect).
// EVAL 2026-07-20 (dry-run no fork D5 do ECF, ver memória plan-council-harness-eval): CONVERGIU.
//   Em export read-only, `boundary` é muda (Prisma-lê-Prisma nunca toca a fronteira) e `invariant`
//   admite que o prong "gate in-tx" é N/A → sobra 1 discriminador (`reuse`) + 2 paráfrases dele.
//   A lente única (accounting-architect) teria dado o mesmo veredito. → NÃO use aqui.
//   Confound honesto: o fork estava mergeado, as lentes leram a resposta shippada. Antes de MATAR
//   de vez, falta 1 teste num fork de LEDGER-WRITE realmente aberto — pode divergir. Até lá: provisório.

// ── args (chega como STRING JSON neste harness — parseia, igual parallel-batch) ──
// {
//   task:      "o fork de ECF Fase 2 a decidir, em 1-3 frases",   // OBRIGATÓRIO
//   options:   [{ id: "A", thesis: "..." }, ...] | null,          // as pernas do fork; se null, Fase Enumerar gera
//   contracts: ["docs/adr/OUTRO.md", ...],                        // âncoras extras específicas do fork (opcional)
// }
const spec = typeof args === 'string' ? JSON.parse(args) : (args || {})
if (!spec.task) { log('Sem args.task — nada a deliberar. Passe o fork a decidir.'); return { done: false } }

const extraContracts = (spec.contracts || []).join(', ') || '(nenhuma extra)'

// ── Lentes fixas, cada uma ancorada num contrato que JÁ existe no repo (paths verificados) ──
// A diversidade do nosso council vem do ÂNGULO, não do fornecedor de modelo. Sem anonimato de
// propósito: cada lente DEVE saber qual contrato defende (aqui o viés é feature, não bug).
const LENSES = [
  { key: 'reuse',     anchor: '.claude/skills/_REUSE-CRITERION.md',
    gate: 'A opção reusa o canônico existente, ou justifica o bespoke pelo critério de reuso (divergência de shape/posse sancionada)?' },
  { key: 'boundary',  anchor: '.claude/skills/_ARCHITECTURE-CONTRACT.md (§2.1)',
    gate: 'A opção respeita a fronteira §2.1 — entidade com invariante fiscal = Prisma first-class (nunca DynamicTable), zero serviço Prisma injetado no motor de plugins, integração cross-módulo no nível controller/route?' },
  { key: 'invariant', anchor: '.claude/skills/luminaris-accounting-architect/SKILL.md + docs/accounting/ACCOUNTING-MASTER-MAP.md',
    gate: 'A opção NOMEIA os invariantes contábeis afetados (período/saldo/idempotência) e o gate-autoritativo DENTRO da tx, e reconcilia com o que origin/main JÁ commitou (não replaneja decisão já mergeada)?' },
  { key: 'minimal',   anchor: 'ponytail (a decisão precisa desta complexidade?)',
    gate: 'A opção é o diff/estrutura mínimo que satisfaz o objetivo fiscal, sem abstração especulativa nem tabela/serviço que YAGNI dispensaria?' },
]

const ECF_ANCHORS =
  `Contexto de domínio OBRIGATÓRIO de ler: ${extraContracts}, docs/accounting/ACCOUNTING-MASTER-MAP.md. ` +
  'Âncoras contábeis sempre válidas: master map §1 (decisões travadas T1–T12), §4 (rejeitadas: torre ' +
  'multiempresa, Postgres, DynamicTable p/ contábil, multi-moeda), §6 (blocos canônicos de reuso); ' +
  '.claude/skills/luminaris-accounting-architect (invariantes ACC-0xx). ' +
  'Antes de opinar, confirme no git (origin/main) o ESTADO REAL do código (CBM-001) — não trate como ' +
  'aberto o que já foi decidido/mergeado, nem invente entidade/arquivo que não existe.'

// ── Fase Enumerar (opcional) — se o fork não veio com as pernas explícitas, um agente as levanta ──
phase('Enumerar')
let options = spec.options || []
if (!options.length) {
  const ENUM = { type: 'object', properties: {
    options: { type: 'array', items: { type: 'object', properties: {
      id: { type: 'string' }, thesis: { type: 'string' } }, required: ['id', 'thesis'] } }
  }, required: ['options'] }
  const enumerated = await agent(
    `Você mapeia o espaço de decisão de um fork de ECF (SPED Contribuições/ECF). ${ECF_ANCHORS}\n` +
    `FORK: ${spec.task}\n` +
    `Enumere as 2-4 pernas PLAUSÍVEIS e MUTUAMENTE EXCLUSIVAS deste fork (id curto + tese de 1 frase). ` +
    `Não invente pernas irreais; se o fork só tem 2 saídas honestas, retorne 2.`,
    { label: 'enumerar-fork', phase: 'Enumerar', schema: ENUM }
  )
  options = enumerated?.options || []
  log(`Fork enumerado em ${options.length} pernas: ${options.map(o => o.id).join(', ')}`)
} else {
  log(`Fork veio com ${options.length} pernas explícitas: ${options.map(o => o.id).join(', ')}`)
}
if (options.length < 2) { log('Menos de 2 pernas — não é fork, é decisão única. Council não se aplica.'); return { done: false, options } }

// ── Fase Advogar — 1 agente por perna constrói o CASO MAIS FORTE dela, aterrado em contrato ──
// barrier (parallel): as lentes da próxima fase precisam de TODAS as pernas de uma vez p/ comparar.
phase('Advogar')
const advocacies = (await parallel(options.map(o => () =>
  agent(
    `Você é o ADVOGADO da perna "${o.id}" de um fork de desenho contábil (ledger-write). Sua tese: ${o.thesis}\n` +
    `FORK: ${spec.task}\n${ECF_ANCHORS}\n` +
    `Construa o caso mais forte e HONESTO desta perna: o que ela decide, como ela satisfaz os invariantes/objetivo contábil, ` +
    `quais arquivos/camadas toca, e por que é preferível. Cite arquivo:linha ou §ADR onde puder. ` +
    `Declare também a MAIOR fraqueza da sua própria perna (advogado honesto, não vendedor).`,
    { label: `advogar:${o.id}`, phase: 'Advogar' }
  ).then(text => ({ id: o.id, thesis: o.thesis, case: text }))
))).filter(Boolean)

const dossier = advocacies.map(a => `### Perna ${a.id} — ${a.thesis}\n${a.case}`).join('\n\n')

// ── Fase Verificar — 1 agente por LENTE; cada lente vê TODAS as pernas e as refuta/rankeia ──
// Espelha o júri do council (cada jurado vê todas as respostas), mas o veredito é BINÁRIO por gate,
// ancorado em contrato — não nota ordinal por gosto. Custo = #lentes (não #lentes×#pernas).
const LENS_VERDICT = { type: 'object', properties: {
  lens: { type: 'string' },
  perOption: { type: 'array', items: { type: 'object', properties: {
    id: { type: 'string' },
    refuted: { type: 'boolean' },       // true = a perna VIOLA o gate desta lente
    rank: { type: 'integer' },          // 1 = melhor sob esta lente (desempate/sinal, não veredito)
    evidence: { type: 'string' },       // arquivo:linha / §ADR / invariante nomeado
  }, required: ['id', 'refuted', 'rank'] } },
}, required: ['lens', 'perOption'] }

phase('Verificar')
const verdicts = (await parallel(LENSES.map(L => () =>
  agent(
    `Você é a lente "${L.key}", verificador ADVERSARIAL. Leia sua âncora: ${L.anchor}\n` +
    `${ECF_ANCHORS}\n` +
    `Seu ÚNICO gate: ${L.gate}\n\n` +
    `As pernas do fork "${spec.task}":\n\n${dossier}\n\n` +
    `Para CADA perna, TENTE REFUTAR que ela satisfaz o seu gate. Default: refuted=true se ficar em dúvida ` +
    `(o ônus é da perna provar conformidade, não sua de provar violação). Dê evidência concreta ` +
    `(arquivo:linha, §ADR, invariante). Depois rankeie as pernas SÓ sob a sua lente (1=melhor). ` +
    `Você NÃO decide o fork — só reporta conformidade sob o seu gate.`,
    { label: `verificar:${L.key}`, phase: 'Verificar', schema: LENS_VERDICT }
  )
))).filter(Boolean)

// ── Agregado OBJETIVO (não é média de gosto): por perna, quantas lentes NÃO a refutaram ──
const scoreById = {}
for (const o of options) scoreById[o.id] = { id: o.id, thesis: o.thesis, passed: 0, refutedBy: [], rankSum: 0, rankCount: 0 }
for (const v of verdicts) {
  for (const po of (v.perOption || [])) {
    const s = scoreById[po.id]
    if (!s) continue
    if (po.refuted) s.refutedBy.push(`${v.lens}: ${po.evidence || 'sem evidência'}`)
    else s.passed += 1
    if (typeof po.rank === 'number') { s.rankSum += po.rank; s.rankCount += 1 }
  }
}
const board = Object.values(scoreById).map(s => ({
  ...s, avgRank: s.rankCount ? +(s.rankSum / s.rankCount).toFixed(2) : null,
})).sort((a, b) => b.passed - a.passed || (a.avgRank ?? 99) - (b.avgRank ?? 99))
for (const s of board) log(`perna ${s.id}: ${s.passed}/${LENSES.length} gates passados` + (s.refutedBy.length ? ` — refutada por [${s.refutedBy.map(r => r.split(':')[0]).join(', ')}]` : ''))

// ── Fase Sintetizar — chairman CONSULTIVO: recomenda + expõe dissenso. NÃO ratifica ──
// ponytail: a autoridade de síntese é humana (accounting-master-map §5.1). Este agente produz um
//   PARECER, não um veredito. Sem editar governança, sem merge.
phase('Sintetizar')
const recommendation = await agent(
  `Você é o Chairman de um council de DESENHO. NÃO decide sozinho: produz um PARECER que um humano ratifica.\n` +
  `${ECF_ANCHORS}\n` +
  `FORK: ${spec.task}\n\n` +
  `Placar objetivo de gates (por perna, quantas das ${LENSES.length} lentes NÃO a refutaram):\n` +
  JSON.stringify(board, null, 2) + `\n\n` +
  `Casos advogados:\n${dossier}\n\n` +
  `Vereditos por lente:\n${JSON.stringify(verdicts, null, 2)}\n\n` +
  `Entregue: (1) perna RECOMENDADA e por quê, ancorada no placar de gates — NÃO na sua preferência; ` +
  `(2) enxertos: o que trazer das pernas perdedoras pra fortalecer a vencedora; ` +
  `(3) DISSENSOS não resolvidos (gate refutado sem resposta convincente) — liste explícito pro humano decidir; ` +
  `(4) se as lentes CONVERGIRAM (todas passaram todas as pernas ou uma perna dominou sem refutação), ` +
  `DIGA que o council foi desnecessário aqui e a lente única (accounting-architect) bastaria — sinal p/ não repetir.`,
  { label: 'chairman', phase: 'Sintetizar' }
)

return {
  fork: spec.task,
  board,                                   // placar objetivo por perna
  recommendation,                          // parecer consultivo — RATIFICAÇÃO É HUMANA
  ratified: false,                         // este workflow nunca ratifica; some quando um humano fecha o ADR
  lenses: LENSES.map(l => l.key),
}
