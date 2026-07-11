# Luminaris — Contrato de Paralelização (PAR)

> **Fonte única da decisão "este lote de trabalho pode rodar em paralelo sem gerar conflito de commit — e como fatiá-lo?".** Carregado *só quando essa decisão está viva*: o orquestrador planejando um **lote** (≥2 features/slices no mesmo pedido); o integrador ordenando a fase serial; o reviewer checando que um merge não cruzou um choke point. Complementa `_ARCHITECTURE-CONTRACT.md` (que diz *o que* é código correto) e `_OPERATING-GATES.md` (que diz *como o agente trabalha*) — este diz **como o trabalho é fatiado entre agentes concorrentes**.
>
> Existe porque worktrees isolados nunca conflitam no código *da feature* — conflitam nos **arquivos de registro que o contrato §3 obriga todo feature a tocar** ("registro em 3 toques"). "Paralelo sem conflito" não é spawnar N implementers e torcer; é **separar corpo de registro** e serializar só o registro. Este contrato torna esse fatiamento **repetível** (qualquer execução chega ao mesmo lote paralelo + delta serial).

---

## [PAR-001] Registro de choke points (a lista é DADO, não memória)

Arquivos de **edição compartilhada**: todo feature novo os toca. Dois trabalhos que escrevem no **mesmo** choke point NÃO são paralelizáveis entre si — a escrita vai para a fase serial (PAR-003 Fase B).

| Choke point | Por que compartilhado | Natureza |
|---|---|---|
| `server/src/routes/index.ts` | bloco de `router.use(...)` + imports no topo | ponto único |
| `server/src/lib/factory.ts` | todo service/repo/controller registra aqui | ponto único |
| `server/prisma/schema.prisma` (+ `migrations/`) | todo model novo + histórico de migração diverge entre worktrees | ponto único — o mais duro |
| `server/prisma/seed.ts` | fixtures compartilhadas | ponto único |
| `my-app/public/openapi.json` (+ geração) | artefato derivado; dois regens sempre conflitam | derivado |
| `my-app/public/locales/*/<dom>.json` | i18n **por domínio** | **disjunto entre domínios, compartilhado dentro do mesmo domínio** |

> **A tabela drifta.** Um 6º registro compartilhado adicionado ao repo (ex.: um índice de plugins) é um choke point novo — atualize **este** arquivo, e todo consumidor (orquestrador, integrador, reviewer) herda. `skill-audit` deve checar esta lista contra a realidade do repo. Nunca replique a lista dentro de uma skill.

## [PAR-002] Teste de disjunção (provado por grafo, confirmado no código — CBM-001)

Dois trabalhos são **paralelizáveis** ⟺ seus **write-sets fora dos choke points** não se cruzam.

- Write-set previsto via cbm: `detect_changes` (blast radius do diff planejado) + `trace_path` inbound (quem mais toca esses símbolos). Disjunção é **provada por grafo, não chutada** — e, como todo resultado de grafo, confirmada lendo o arquivo antes de virar decisão (CBM-001).
- **Não é disjunto** (→ serial, PAR-005): dois slices **no mesmo domínio** (ambos tocam `routes/<dom>.ts` + `<dom>.json`); qualquer trabalho que **edita um arquivo já existente** (só slices *novos* disjuntos paralelizam limpo); duas mudanças de schema entre si.

## [PAR-003] Decomposição em 3 fases

Todo lote paralelizável se decompõe em três fases — nunca uma:

- **Fase 0 — schema (serial, na main, rápida).** *Todas* as mudanças de `schema.prisma` do lote juntas, **uma** migração, antes do fanout. Schema/migração é o que menos paraleliza (histórico diverge entre worktrees). Depois disso cada worktree nasce com suas tabelas prontas.
- **Fase A — corpos (paralela, 1 worktree por slice).** O **corpo** de cada feature contra o schema congelado. Corpo = `dtos/`, `repositories/`, `policies/`, `services/`, `controllers/`, o `routes/<feature>.ts` **próprio**, páginas/componentes, o **namespace i18n do domínio**. Write-sets disjuntos → zero contenção. Cada agente commita no seu branch; reviewer roda **por branch antes do merge**.
- **Fase B — registro (serial, integrador único, fina).** Só as **deltas de registro** nos choke points PAR-001: a linha do `router.use`, os registros no factory, regen do openapi, seed. Uma de cada vez, `tsc` verde entre cada. O conflito aqui vira **append trivial de 1 linha em série**, não 3-way merge de feature inteira.

## [PAR-004] Isolamento e ordem

- **Fase dependente = barrier (fechar-antes-de-começar).** Uma fase só inicia quando a fase de que depende **fecha por inteiro** — nunca sobrepõe. Consequências duras: os **worktrees da Fase A só nascem depois da Fase 0 fechar** (schema commitado na main), então nascem do HEAD **já atualizado** — o ordering é garantido pelo barrier, não pelo acaso; a **Fase B só começa depois de TODA a Fase A + review fechar**, então as branches aprovadas já existem e estão visíveis ao integrador. No harness isto é o `await` entre fases; a regra é: **jamais requisitar um worktree antes do predecessor fechar.**
- **SDD — specs fecham antes da execução.** Todos os specs das fases fecham no **planejamento** (a seção PAR-006 do orquestrador) ANTES de qualquer execução. Worktrees são criados como **passo pós-spec**, não durante o planejamento; não se abre worktree para "descobrir o spec".
- Fase A em **worktrees isolados** — `npm ci` no worktree (node_modules não vem de graça) e o prisma client gerado da main é **stale** vs o schema da branch; junctions removidas com `cmd`, nunca `rm -rf`. (Ver auto-memória `worktree-deps-stale-prisma-client`.)
- Reviewer **por branch, em paralelo**, antes do merge — mantém a independência exigida (`reviewer-independence-separate-agent`): um PASS da mesma sequência que implementou é rejeitado.
- Integrador serial aplica Fase 0 e Fase B; entre cada delta de registro, `tsc` dos dois lados.

## [PAR-005] Teto honesto — quando NÃO paralelizar (em dúvida → serial)

O grau de paralelismo seguro = nº de slices com write-sets disjuntos (PAR-002). Vai **serial** quando: same-domain; edita arquivo existente; schema-vs-schema; ou a prova de disjunção não fecha. **Em dúvida → serial** (espelha o "em dúvida → Prisma first-class" do §2.1: o default é o lado seguro). O ganho real aparece com **várias features novas de domínios diferentes** — o padrão dos increments; não com incrementos empilhados no mesmo módulo.

## [PAR-006] Contrato de saída (o que o plano DEVE emitir)

Quando o lote é paralelizável, o plano carrega uma seção **Plano de paralelização** com:

1. **Lote paralelo (Fase A)** — cada slice com: feature, `branch`/worktree, write-set, e a prova de disjunção (sinal de grafo citado: "in-degree 0 fora do domínio", "detect_changes não cruza").
2. **Delta serial (Fase 0 + Fase B)** — as mudanças de schema (Fase 0) e as linhas de registro nos choke points PAR-001 (Fase B), na ordem de aplicação.
3. **Slices serializados e por quê** — os que caíram em PAR-005, com a razão (same-domain / edita-existente).

## Casos (decida por analogia)

| Lote | PAR-002 | Decisão |
|---|---|---|
| feature `appointments` (nova) + feature `inventory` (nova), domínios distintos | write-sets disjuntos; só cruzam em routes/factory/schema | **paralelo** — Fase A ×2, delta serial junta o registro |
| dois KPIs no mesmo dashboard de `accounting` | ambos tocam `accounting.json` + analytics do domínio | **serial** (same-domain) |
| INCR-N + INCR-N+1 no módulo contábil | ambos editam services existentes de accounting | **serial** (edita-existente + schema-vs-schema) |
