# Tuning por modelo — Opus 4.8 (ativo) e Fable 5 (referência)

> Complemento **modelo-específico** das três camadas portáveis (gates / guia / traços — que são
> agnósticas de modelo). Fonte: documentação oficial Anthropic (migration guide → "Migrating to
> Opus 4.8" e "Migrating to Claude Fable 5"; "Prompting Claude Fable 5"). Grau: **verificado nas
> docs oficiais**, não reproduzido em benchmark próprio.
>
> **O achado central — assimetria direcional de prescrição:**
> - **Fable 5:** prompts/skills prescritivos demais *degradam* o output. Dê objetivo + restrições;
>   deixe o modelo escolher os passos. Ao migrar PARA Fable, faça A/B removendo scaffolding
>   passo-a-passo — **mas só scaffolding, nunca contrato** (ver escopo do A/B na seção Fable 5).
> - **Opus 4.8:** *sub-alcança* capacidades que exigem decisão explícita (subagentes, memória,
>   busca, custom tools). Prescreva **gatilhos** — "chame isto quando…" na descrição de cada
>   tool/skill dá ganho medido. Ao rodar em Opus, o sistema prescritivo deste repo está **certo** —
>   não des-prescrever.

## Opus 4.8 — snippets oficiais (modelo ativo deste repo)

**1. Autonomia em micro-decisões** (corta ~12pp da taxa de perguntas sem aumentar over-reach):

> Para escolhas menores (nomes, formatação, valores default, qual entre abordagens equivalentes),
> escolha uma opção razoável e anote-a em vez de perguntar. Para mudanças de escopo ou ações
> destrutivas, continue perguntando antes.

**2. Gatilhos explícitos por capacidade** (memória, subagentes, busca):

> Antes de qualquer tarefa com mais de alguns turnos, cheque seu arquivo de memória por contexto
> prévio relevante e escreva descobertas novas nele. Quando uma tarefa se espalha por itens
> independentes (muitos arquivos, muitos testes, muitos candidatos), delegue a subagentes em vez
> de iterar em série.

**3. Guarda de recall em review** — instrução conservadora ("só reporte high-severity", "seja
conservador") é seguida **literalmente** e derruba recall medido mesmo com bug-finding melhor.
Padrão: reporte-tudo com confiança+severidade, filtre num passo downstream. Status no repo:
`luminaris-reviewer` verificado limpo do padrão por grep (2026-07-07) — manter limpo é regra.

**4. Narração** — Opus 4.8 já narra progresso sozinho; **remova** scaffolding "resuma a cada N
tool calls". Se verboso demais, default de silêncio explícito.

## Fable 5 — referência (se este repo voltar a rodar nele)

Snippets oficiais completos em "Prompting Claude Fable 5" (docs.claude.com). Os que importam aqui:

- **Anti-overplanning:** "When you have enough information to act, act…" — Fable delibera demais
  em tarefa ambígua.
- **No-tidying em effort alto:** "Don't add features, refactor, or introduce abstractions beyond
  what the task requires…" (≈ ponytail oficial).
- **Claims auditados / verificador de contexto fresco / memória um-fato-por-arquivo /
  lead-with-outcome / fronteira assess-first:** já codificados como OPS-001..004 + T1–T8 + guia —
  a doc oficial **converge** com as três camadas; nada a adicionar, grau promovido.
- **Nunca** instruir o modelo a reproduzir o raciocínio interno no texto de resposta — dispara
  refusal `reasoning_extraction`. Auditar skills por instruções "mostre seu raciocínio" antes de
  migrar.
- **Escopo do A/B de des-prescrição** — "prescrição" tem duas espécies que se comportam diferente
  em Fable; só uma entra no A/B:

  | Espécie | Exemplo neste repo | Ao rodar em Fable |
  |---|---|---|
  | **Contrato** (o quê / never / invariante) | STOP DynamicTable×Prisma, cadeia de camadas, gates binários OPS-001..004 | **Fica intocado** — restrição explícita não degrada; a doc oficial manda nunca simplificar o pedido explícito |
  | **Scaffolding** (como / passo-a-passo) | generation contracts passo-a-passo, skills geradoras com steps numerados | **Entra no A/B** — é isto que degrada o output em Fable |

  Fonte: migration guide → "Migrating to Claude Fable 5" ("de-prescribe migrated prompts and
  skills") + política de nunca simplificar o explicitamente pedido. Grau: verificado nas docs
  oficiais (2026-07-08).
- Turnos longos por padrão (minutos): planejar timeouts/streaming/progresso antes de migrar.
- Refusals de classifier (cyber/bio) retornam HTTP 200 + `stop_reason: "refusal"` — código de API
  deve checar `stop_reason` antes de ler `content` e opt-in em `fallbacks` para `claude-opus-4-8`.

## Regra de manutenção

Item novo entra aqui só com fonte oficial ou medição própria; o que for agnóstico de modelo sobe
para o guia/gates/traços. Ao trocar o modelo ativo do repo, revisar esta página **antes** de
ajustar qualquer prompt.
