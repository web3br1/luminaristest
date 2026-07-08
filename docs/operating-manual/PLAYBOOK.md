# Playbook do operador — como dirigir o sistema nas próximas tarefas

> Guia para o **humano** que opera o pipeline. As camadas de agente (gates OPS, guia portável,
> traços T1–T8, tuning de modelo) são lidas pelos agentes; este doc diz **como você as aciona**:
> onde achar a próxima tarefa, qual prompt colar, o que exigir de volta e como fechar o ciclo.

---

## 0. O mapa em 30 segundos

| Peça | Onde | Papel |
|---|---|---|
| Gates de envio OPS-001..004 | `.claude/skills/_OPERATING-GATES.md` | O que todo relatório/handoff precisa provar |
| Guia portável (6 passos) | `docs/operating-manual/PORTABLE-GUIDE.md` | Como o sistema compensa o modelo |
| Traços T1–T8 | `docs/operating-manual/REASONING-TRAITS.md` | Como o agente pensa durante o trabalho |
| Tuning por modelo | `docs/operating-manual/MODEL-TUNING.md` | Opus 4.8 ativo: gatilhos explícitos, micro-autonomia |
| Trio de agentes | `luminaris-orchestrator` → `luminaris-implementer` → `luminaris-reviewer` | Planeja → executa → reprova/aprova com evidência |
| Gates mecânicos | `tsc` ×2, `skill-audit governance-check`, `skill-audit wiring`, CI | O que não depende de ninguém lembrar |

Validação: teste de sistema 2026-07-07 — 9/10, mutação de controle reprovada por forma
(`_OPERATING-GATES.md § Validação empírica`).

---

## 1. Onde achar a próxima tarefa (fontes ranqueadas)

Consulte nesta ordem — a primeira que der tarefa concreta vence:

1. **`docs/accounting/ACCOUNTING-MASTER-MAP.md`** — roadmap contábil real. O nó **⏳** é a
   próxima tarefa de produto por definição; §1/§4 dizem o que NÃO propor. (ORCH-006 manda o
   orquestrador lê-lo; você também deve.)
2. **`MEMORY.md` do projeto** (auto-memória do agente) — quase toda entrada carrega "pending:"
   explícito (sign-off humano, smoke em dev.db real, FE deferido, re-run A–K…). Grep mental:
   "pending", "deferred", "HELD", "não merjado".
3. **Chips de task pendentes** (spawn_task) — trabalho já escopado com prompt pronto; um clique
   abre sessão em worktree fresco.
4. **Relatórios de teste de sistema** — `docs/operating-manual/system-test-*/` lista
   não-conformidades preteridas (ex.: NC-2 do CRM, formatters clonados) — backlog pronto com
   evidência arquivo:linha.
5. **`docs/learnings/<esforço>.md`** — decisões/pitfalls por esforço; itens `pitfall` sem fix
   viram tarefa.
6. **Varreduras sob demanda:** `node .claude/skills/skill-audit/skill-audit.mjs run` (drift de
   skills/clones/hotspots) e `/ponytail-debt` (shortcuts `ponytail:` esquecidos no código).

**Regra de decisão entre fontes:** invariante quebrado > pendência de incremento já aberto >
padronização (CRM) > débito de skill/lint. Em empate, menor blast radius primeiro.

---

## 2. Fluxo padrão de um incremento (o prompt que você cola)

Sessão nova, e adapte:

```
Tarefa: [1-3 frases — o quê + INTENÇÃO: por que / para quem / o que habilita]

Regras: worktree/branch isolada (nunca main); effort alto; micro-decisões: decida e anote,
pare só para escopo/destrutivo; NÃO faça merge — entregue branch + relatório.

Fluxo:
1. Invoque a skill luminaris-orchestrator com a tarefa. Se ela pedir esclarecimento, responda
   e siga. Guarde o plano.
2. Invoque a skill luminaris-implementer com o plano. O handoff DEVE ter a seção rotulada
   "Gates de envio OPS-001" (caso adversarial tentado + checagem falseável + risco nº 1) e
   checks com exit codes reais.
3. Delegue a revisão a um agente SEPARADO em worktree isolado, contexto fresco, lendo só:
   o diff, o handoff e .claude/skills/luminaris-reviewer/SKILL.md. Ambiente sem deps
   resolvidas = BLOCKED, não PASS/FAIL.
4. Se REPROVADO: devolva os FAILs ao implementer (nunca ao revisor), re-submeta à revisão.
   Máximo 3 ciclos; travou → pare e me traga o aberto.
5. Closeout: registre "Decisões a registrar" via learning-log; se contábil, promova o nó no
   ACCOUNTING-MASTER-MAP (ORCH-007).

Relatório final: 1ª linha = veredicto; 2ª = risco principal; depois evidências.
```

**O que você confere ao receber (2 min, binário):** plano tem linha *Intenção* + STEP 0 §2.1?
Handoff tem a seção OPS-001 rotulada? Revisão veio de contexto fresco com tsc+wiring executados
(exit codes)? Veredicto REPROVADO com evidência boa = o sistema funcionou — não é má notícia.

---

## 3. Revisão avulsa (PR já aberto / diff pronto)

```
Revise o diff da branch [X] como agente independente: worktree isolado, contexto fresco.
Leia apenas o diff, o handoff (se houver) e .claude/skills/luminaris-reviewer/SKILL.md.
Re-derive tudo (tsc server+my-app, wiring gate, checklists por camada). Sem handoff OPS-001
rotulado = FAIL de forma. Cobertura antes de filtro: reporte TODO achado com confiança +
severidade. Não corrija nada — reporte e devolva.
```

---

## 4. Sessão de descoberta ("o que fazer agora?")

```
Monte a fila de trabalho atual deste repo. Consulte nesta ordem e cite evidência:
(1) docs/accounting/ACCOUNTING-MASTER-MAP.md — nó ⏳ e pendências dos ✅ recentes;
(2) MEMORY.md — entradas com pending/deferred/HELD;
(3) docs/operating-manual/system-test-*/ — não-conformidades preteridas;
(4) docs/learnings/ — pitfalls sem fix;
(5) node .claude/skills/skill-audit/skill-audit.mjs run — findings.
Saída: tabela [tarefa | fonte | invariante em risco | blast radius | pronta-pra-rodar?],
ordenada por (invariante > incremento aberto > padronização > débito). Para as 3 primeiras,
escreva o prompt de incremento (§2) pronto pra colar. Não implemente nada.
```

---

## 5. Quando NÃO usar o pipeline

- **Fix de 1 linha óbvio / typo / doc:** sessão direta, gates de envio manuais (OPS-001 no
  texto da resposta), sem trio. O pipeline custa mais que o bug.
- **Pergunta/diagnóstico:** o deliverable é o parecer — nada de implementar (T-boundary).
- **Decisão arquitetural** (colide com §1/§4 do master map, novo módulo Prisma vs DynamicTable
  ambíguo): não roteie geração — exija ADR + seu sinal humano primeiro.
- **Tarefa contábil:** sempre com a persona `luminaris-accounting-architect` anexando parecer
  ao plano (o orquestrador já faz; confira que o parecer veio).

## 6. Higiene entre sessões

- Sessões concorrentes: cada uma em seu worktree (memória: checkout pode ser roubado por outra
  sessão DEPOIS de verificado).
- Revisor nunca é a sessão que implementou (norma dura da casa).
- Todo bug que escapar: pergunte "qual gate teria pego?" e transforme em patch de gate/skill —
  foi assim que P3/P4 nasceram.
- Screenshot/validação viva de tela `withAuth`: build de produção, nunca `next dev`; servidor
  fresco do commit exato (memória: stale dev server já mentiu antes).
