---
name: skill-audit
description: Audita as skills geradoras contra o grafo (codebase-memory) em loop com gate objetivo — verifica que os golden refs existem no path, que os anti-exemplos continuam mortos, que todo hotspot de fan-in alto tem dono, que os clones SIMILAR_TO de um canônico não cresceram desde o último baseline, e que os limites de plataforma DynamicTable do Contrato §2.1 (money=centavos, sem self-relation, `unique`≠constraint, guarda de delete) são respeitados. Propõe patches de skill por evidência de grafo; NÃO aplica. Use com `/loop` para rodar até o gate fechar.
argument-hint: "[skill ou pasta a auditar — vazio = todas as skills geradoras + os 3 contratos]"
allowed-tools: Read, Grep, Glob, Bash, mcp__codebase-memory-mcp__search_graph, mcp__codebase-memory-mcp__query_graph, mcp__codebase-memory-mcp__get_architecture, mcp__codebase-memory-mcp__search_code, mcp__codebase-memory-mcp__trace_path
---

# Skill Audit — as skills dizem a verdade sobre o grafo?

Inverte o `PROJECT_REVIEW_ORCHESTRATOR`: aquele faz **grafo → patches de skill**; este faz **skill → o grafo confirma o que a skill afirma?**. Cada skill geradora faz **asserções verificáveis** (golden ref num path, anti-exemplo deletado, ponteiro pra canônico). O grafo agora confirma ou desmente cada uma. Projeto indexado: `C-Users-smurf-Downloads-Luminaris`.

> **Por que isto é um loop legítimo (teste das 4 caixas):** repete a cada lote de geração; tem **gate objetivo** (asserções booleanas sobre o grafo, não taste); é agent-doable ponta-a-ponta; "done" é objetivo no gate. A *proposta de patch* é julgamento → por isso **propõe, humano aprova** (mantém cost-per-accepted-change honesto).

> **Ressalva que NÃO pode ser esquecida:** in-degree (`trace_path` inbound) **sub-reporta componente frontend** — composição JSX (`<GenericTable/>`) não vira aresta `CALLS/USAGE/IMPORTS`. Provado: `Modal`/`GenericTable`/`StandardPagination` deram in-degree 0 sendo canônicos vivos. **Liveness de componente = existência no path + "é este que está sendo clonado?" (`SIMILAR_TO`)**, nunca in-degree. In-degree só vale pra service/função backend.

---

## Dois modos

- **`--sweep` (varredura completa, per-skill):** audita **cada skill individualmente, uma por iteração**, até a fila zerar. Use na 1ª auditoria geral e depois de refactors grandes. É o loop completo (abaixo).
- **default (incremental):** só re-checa skill cujo arquivo mudou + gates grafo-wide baratos. Manutenção contínua.

---

## MODO VARREDURA COMPLETA (`--sweep`) — o loop completo

```
GOAL: cada uma das 34 skills geradoras auditada individualmente; todo FAIL
      vira patch proposto; fila esgotada.

SETUP (1ª iteração, se a fila não existe no STATE):
  enfileirar todas as `.claude/skills/*/SKILL.md` EXCETO skill-audit (34). Ordem = a fila abaixo.

EACH ITERATION (UMA skill por vez):
  1. pop a próxima skill `pending` da fila no STATE.
  2. ler o SKILL.md dela + identificar a(s) camada(s) que ela gera.
  3. rodar o PROTOCOLO PER-SKILL P1–P5 (abaixo), escopado a ELA.
  4. append o registro estruturado da skill no `REPORT.md` (schema do OUTPUT CONTRACT); status de 1 palavra no `STATE.md`. Reescrever o bloco AGREGADO no topo do REPORT.
  5. marcar a skill como `done`. Se sobram pendentes, a fila continua (próxima iteração = próxima skill).

STOP WHEN: fila vazia  OU  cap de iterações = nº de skills + 2.
ON STOP: completar o bloco AGREGADO do `REPORT.md` (placar + por-camada + tabela de patches Sev×blast radius + 1 linha por achado). NÃO aplicar patch.
```

> **Self-paced, NÃO agendado.** Rode `/loop /skill-audit --sweep` — o `/loop` re-dispara a próxima skill por conta própria até a fila zerar; quando zera, o loop encerra. Sem cron, sem Actions (decisão do usuário). Uma skill por iteração mantém cada passada barata e o contexto pequeno — o oposto do re-send que explode custo.

### Fila (34 skills, agrupada por camada — ordem de auditoria)
```
backend:   dto · repository · policy · service · controller · route · prisma-model ·
           workflow-transition · test-suite · crud-resource · api-contract-sync
frontend:  api-service · context-provider · page · modal · component · widget ·
           table-screen · kanban-workflow · hook · feature-module · design-system · dashboard-kpi-end-to-end
domínio:   analytics-kpi · dynamic-table-preset · document-processing · interview-setup ·
           structured-data · chat-domain · job
fullstack: fullstack-feature
agentes:   luminaris-orchestrator · luminaris-implementer · luminaris-reviewer
```

### PROTOCOLO PER-SKILL (P1–P5) — aplicado a UMA skill por iteração
- **P1 · Golden refs vivos (G1 escopado):** todo golden ref/canônico que ESTA skill cita existe no path e está vivo (regra backend vs. frontend da ressalva). FAIL se fantasma/movido.
- **P2 · Anti-exemplos mortos (G2 escopado):** todo `Anti-exemplo: X` desta skill continua ausente do source. FAIL se ressuscitou.
- **P3 · Shape ensinado = canônico atual:** os paths/nomes que a skill manda gerar batem com `GENERATION_CONTRACTS.md` E com a forma do canônico vivo no grafo? FAIL se a skill ensina um shape que o canônico já não tem (drift de ensino).
- **P4 · Output da skill não vira clone:** o domínio que ESTA skill gera mostra clone `SIMILAR_TO` (jaccard ≥0.9) de um canônico? Se sim, o checklist de reuso dela está frouxo → patch. (Foi o que pegou formatters/FinanceService.)
- **P5 · Higiene de contrato:** a skill **referencia** `_ARCHITECTURE-CONTRACT.md` em vez de **repetir** regras (repetir = fonte de drift, como o `zinc`); cita o gate `tsc`; não inventa canônico paralelo aos da §0.
- **P6 · Limites de plataforma §2.1 (só skills de money/preset/workflow/test):** FAIL **só por contradição ativa** — a skill **ensina** algo que o §2.1 proíbe. **Omissão NÃO é FAIL:** o Contrato é herdado (preâmbulo: "prevalece mesmo se a skill omitir"), então cobrar um ponteiro redundante seria pointer-spam (drift). Condições de FAIL+patch:
  - ensina `numberFormat: currency|decimal`/float para um campo que entra em **invariante de fechamento exato** (razão/saldo) — não para money em geral (`currency` é o default correto p/ preço/total);
  - ensina `parentId` **auto-relacional** como forma de modelar hierarquia (o certo é code prefix);
  - apresenta `unique`/`compositeUnique` como **constraint de DB** / garantia de idempotência à prova de corrida;
  - manda hard/soft-delete de registro **postado/terminal** sem a guarda de status na camada de serviço.

  Self-relation tem backstop objetivo no G5. N/A para skills que não tocam esses domínios; PASS se a skill é money/preset/workflow mas não ensina nenhuma das contradições acima (mesmo sem citar o §2.1).

Verdict per-skill: **PASS** (P1–P6 limpos) · **PASS-NOTE** (divergência sancionada pelo `_REUSE-CRITERION`, ou nit sem severidade) · **FAIL** (+ patch cirúrgico proposto, com `arquivo:linha` e evidência de grafo).

---

## OUTPUT CONTRACT — dado vs. report (separados de propósito)

Dois arquivos, dois papéis. Nunca misture prosa no `STATE`.

### `STATE.md` = controle (fila + retomada). Verdict aqui é **uma palavra**.
```yaml
sweep_queue:
  - <skill>: done | pending
verdicts:                       # status only — detalhe vai pro REPORT
  - <skill>: PASS | PASS-NOTE | FAIL
clones_baseline: <N>
triaged_drift: [ <achado>: <decisão> ]
```

### `REPORT.md` = saída revisável. Schema **fixo** por skill (append a cada iteração):
```markdown
### <skill> · camada: <X> · verdict: <PASS|PASS-NOTE|FAIL> · <data>
| Check | Status | Evidência (arquivo:linha / sinal de grafo) |
|---|---|---|
| P1 golden refs vivos | PASS/FAIL/N/A | … |
| P2 anti-exemplos mortos | PASS/FAIL/N/A | … |
| P3 shape = canônico atual | PASS/FAIL | … |
| P4 sem clone SIMILAR_TO | PASS/FAIL | … |
| P5 higiene de contrato | PASS/NOTE/FAIL | … |
| P6 limites §2.1 (money/preset/workflow) | PASS/FAIL/N/A | … |

Findings:
| # | Sev | arquivo:linha | Problema | Patch proposto |
|---|---|---|---|---|
( "—" se nenhum )
```

### Bloco AGREGADO (reescrito no topo do REPORT a cada iteração; completo no STOP):
```markdown
## Sweep Report — <done>/<34> · run <data>
### Placar
| Verdict | N |  → PASS / PASS-NOTE / FAIL
### Por camada
| Camada | PASS | NOTE | FAIL |
### Patches propostos (ordenado por Sev × blast radius)
| # | Sev | Skill | arquivo:linha | Patch | Aprovado? |
### Uma linha por achado
- [skill] <achado> → enriquece <alvo>
```

**Sev:** `high` (golden ref morto / anti-exemplo ressuscitado / shape drift que gera código errado) · `med` (clone de canônico / regra repetida que vai divergir) · `low` (nit interno, cosmético). **Blast radius:** nº de skills/arquivos que o patch toca. **Aprovado?** coluna que VOCÊ preenche — o loop nunca aplica.

---

## Os gates (objetivos — é o coração; o resto é encanamento)

### G1 — Golden ref vivo
Para cada `Golden ref ...: <símbolo>` / `Golden refs verificadas: ...` / ponteiro de canônico §0 nas skills:
- `search_graph(name_pattern=<símbolo>)` → o símbolo **existe** e seu `file_path` bate com o que a skill cita.
- **FAIL** se ausente ou movido de path. (Skill apontando pra fantasma ensina drift.)
- Liveness: **backend** (service/função) → `trace_path` inbound > 0; **frontend** (componente) → existe no path + NÃO é o lado clonado de um `SIMILAR_TO` (ver ressalva acima).

### G2 — Anti-exemplo continua morto
Para cada `Anti-exemplo: X (deletado)`:
- `search_code(X, mode=files)` → retorna **só** `docs/`, zero arquivo de source.
- **FAIL** se X reaparece no source → o anti-exemplo ressuscitou; a skill perdeu a briga. Vira padrão FAIL no `luminaris-reviewer`.

### G3 — Cobertura inversa (pegou o `formatters.ts`)
- `get_architecture(aspects=["hotspots"])`. Filtrar ruído (logger/i18n `t`/`trim`/`handleApiError`/`getUserContextFromRequest`/`getFactory` — já cobertos).
- Todo hotspot de fan-in ≥ 10 restante **deve** aparecer na tabela §0 de `_ARCHITECTURE-CONTRACT.md` OU como golden ref de alguma skill.
- **FAIL** = hotspot sem dono = ponto-cego de geração (→ nova linha §0). Foi assim que `formatCurrency` (fan-in 14) caiu.

### G4 — Drift = clones SIMILAR_TO de um canônico
- `query_graph`: `MATCH (a)-[r:SIMILAR_TO]->(b) WHERE r.same_file = false AND r.jaccard >= 0.9 RETURN ...`
- Descartar boilerplate sancionado (`getServerSideProps`, `CrmLoading`, scripts `audit-*-kpi`). Dos restantes, contar os pares onde **um lado é canônico conhecido** (§0).
- **FAIL** se a contagem passou do baseline no STATE → algum gerador está cuspindo clone do canônico; aperta o checklist de reuso daquele gerador. (Pegou `formatTimestamp` ×3, `FinanceService` gêmeo.)

### G5 — §2.1 respeitado no canon (objetivo onde o grafo enxerga)
A única trava do §2.1 detectável no grafo/source é a **self-relation** (as outras três são design-time → P6). Baseline = **0** (nenhum preset hoje aponta relation pra própria tabela):
- `search_code("targetTable: '@@PRESET_TABLE_KEY::", mode=content)` sobre `server/.../presets/modules/**` → para cada hit, comparar a `<internalName>` do `targetTable` com a tabela do módulo que o declara.
- **FAIL** se algum preset referencia a **própria** tabela (self-relation embarcou no canon, apesar de não-suportada) → patch: trocar por hierarquia codificada (`code` prefix) + ajustar a skill `dynamic-table-preset` se foi ela que ensinou.
- Sem baseline novo: qualquer self-relation > 0 é FAIL direto.

> **Sempre re-confirme o símbolo no grafo antes de propor** — não confie em símbolo lembrado (mesma regra do `luminaris-reviewer`). Memória recém-recordada reflete o que era verdade quando escrita; o grafo é o agora.

---

## STATE (ledger — é o que faz o loop aprender, não repetir)

Arquivo: `.claude/skills/skill-audit/STATE.md` (criado na 1ª corrida). Mínimo, human-readable:

```markdown
last_run: <commit sha + data passada via args>
clones_baseline: <N pares SIMILAR_TO canônico-vs-clone aceitos>

# --- fila do modo --sweep (uma skill por iteração; é o que permite RETOMAR) ---
sweep_queue:           # pending | done — o loop continua enquanto houver pending
  - backend-dto-generator: done — PASS
  - backend-repository-generator: pending
  - ...                # (as 34, na ordem da fila acima)

verdicts:              # STATUS de 1 palavra — o detalhe estruturado vive no REPORT.md
  - <skill>: PASS | PASS-NOTE | FAIL

# --- modo incremental ---
verified_ok:           # asserções que bateram — pular re-check se o arquivo não mudou
  - <skill>: <asserção>
triaged_drift:         # FAILs já vistos e decididos (aceito/adiado) — NÃO re-reportar
  - <achado>: <decisão + por quê>
```

Sem STATE o loop vira o "Ralph Wiggum": re-audita as 34 do zero a cada disparo, re-reporta o mesmo drift aceito e gasta token à toa. Com a `sweep_queue`, cada disparo do `/loop` pega a **próxima** skill `pending` e o loop retoma exatamente de onde parou — fecha sozinho quando todas viram `done`.

---

## Ordem de adoção (NÃO pule etapas — artigo + ponytail)

```
1. corrida manual confiável ........ FEITA (checks A–E rodaram, acharam formatters/FinanceService/chat-hooks)
2. skill (instruções reutilizáveis) . ESTE ARQUIVO
3. wrap em loop (gate + stop + state)  /loop "/skill-audit"   ← caps e STATE embutidos aqui
4. schedule (cron/Actions) .......... SÓ depois de 2–3 corridas /loop limpas provarem o accept-rate
```

Agendar antes de provar manualmente é exatamente como loops explodem dormindo.

## Custo (a parte que os demos escondem)
- Driver = ler ~40 SKILL.md + queries de grafo por passada. Mitigação no passo 1 do loop: **só re-checa skill cujo arquivo mudou** (git), + os gates grafo-wide baratos (G3/G4). Mantém cost-per-pass baixo.
- Métrica que importa: **cost-per-accepted-patch**, não passadas rodadas. Abaixo de ~50% de patches aceitos, o gate está frouxo ou o baseline G4 está errado — recalibre antes de continuar.
- **Upgrade path (versão pesada, só se a leve faltar):** separar maker/checker — um sub-agente acha (`agent`/`parallel`), um segundo mais estrito verifica o patch antes de propor. `// ponytail: inline single-pass; vira fan-out de sub-agentes se o nº de skills/asserções crescer e a passada ficar lenta.`

## Como rodar
```
/loop /skill-audit --sweep         # VARREDURA COMPLETA: cada skill individualmente, uma por iteração, até a fila zerar
/loop /skill-audit                 # incremental: só o que mudou + gates grafo-wide
/skill-audit frontend-modal        # uma corrida avulsa, escopo a uma skill (sem loop)
```
Saída sempre = verdict per-skill + FAILs + patches propostos + 1 linha por achado. **Nunca aplica** — humano aprova quais entram (Patches 1–5 desta sessão foram exatamente esse fluxo).
