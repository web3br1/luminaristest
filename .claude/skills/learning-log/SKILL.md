---
name: learning-log
description: Anota um aprendizado de trabalho extenso (multi-incremento) num ledger versionado no repo, e promove os duráveis para a auto-memória. Use quando descobrir um gotcha, uma decisão não-óbvia, uma armadilha, um padrão reusável ou uma correção de premissa durante um esforço longo — especialmente o buildout contábil (INCR-1..4). Triggers: "anota esse aprendizado", "registra o que aprendemos", "learning-log", "lição aprendida", "ponto pro ledger".
argument-hint: "[texto do aprendizado, ou vazio para varrer a sessão e propor entradas]"
allowed-tools: Read, Grep, Glob, Write, Edit
---

# Learning Log — capturar o que o trabalho extenso ensina

Trabalho longo (vários incrementos, dias, muitos agentes) gera aprendizado que se perde
entre um commit e outro: o gotcha que custou 2h, a premissa que estava errada, o padrão que
funcionou. Esta skill anota isso **na hora**, num lugar estável, no formato certo, e decide se
o aprendizado é **efêmero** (escopo do esforço → ledger no repo) ou **durável** (cross-sessão
→ auto-memória).

> Ponytail: isto é append num markdown + (às vezes) um arquivo de memória. Não é um sistema —
> não invente banco, schema ou índice. O ledger É o índice.

## Quando usar (e quando não)

**Use** quando, no meio de um esforço extenso, aparecer algo que você gostaria de ter sabido
no começo:
- **gotcha** — uma pegadinha técnica (ex.: "o glob do swagger não varre `dtos/`").
- **decision** — uma escolha de arquitetura tomada e o porquê (ponteiro pro ADR).
- **pattern** — um jeito que funcionou e deve ser repetido.
- **pitfall** — um caminho que parece certo e não é (anti-padrão vivido).
- **assumption-correction** — uma premissa que o código/teste desmentiu.

**Não use** para: o que o repo já registra (estrutura, histórico git, ADR já escrito), TODO de
tarefa (isso é task, não aprendizado), ou observação vaga ("podia estar mais limpo"). Aprendizado
é específico, tem evidência e tem "como aplicar da próxima vez".

## Dois destinos — escolha por durabilidade

| Durabilidade | Destino | Quando |
|---|---|---|
| **Efêmera** (vale para ESTE esforço/incremento) | Ledger no repo: `docs/learnings/<esforço>.md` | Default. A maioria dos aprendizados de buildout. |
| **Durável** (vale para sessões futuras, qualquer tarefa) | Auto-memória `~/.claude/projects/<proj>/memory/` + linha no `MEMORY.md` | Só quando o fato sobrevive ao esforço — um invariante do projeto, uma fronteira de arquitetura, uma característica não-óbvia da stack. |

Regra de decisão: *"daqui a 3 meses, numa tarefa não relacionada, isto ainda importaria?"*
Sim → também grava na memória (seguindo as regras de memória do projeto: um fato por arquivo,
frontmatter, `**Why:**`/`**How to apply:**`, link `[[...]]`). Não → só o ledger.

## Formato de uma entrada no ledger

Cada entrada é um bloco `###`. Mantenha curto — uma entrada que precisa de três parágrafos
provavelmente são duas entradas.

```markdown
### YYYY-MM-DD · <categoria> · <título curto>
- **Contexto:** <incremento/área> — onde isto apareceu.
- **Aprendizado:** <o fato, em uma ou duas frases>.
- **Evidência:** <file:line / commit / teste que prova>.
- **Como aplicar:** <a ação concreta da próxima vez>.
- **Durável?** não · OU sim → [[slug-da-memória]]
```

Categorias: `gotcha` | `decision` | `pattern` | `pitfall` | `assumption-correction`.

## Procedimento

1. **Resolver o esforço.** Se o usuário nomear (ex.: "buildout contábil"), use o ledger
   correspondente (`docs/learnings/accounting-buildout.md`). Senão, pergunte qual esforço ou
   use o ledger default `docs/learnings/general.md`. Crie o arquivo com um cabeçalho `# Learnings — <esforço>` se não existir.
2. **Modo com argumento** (`/learning-log <texto>`): transforme o texto na entrada estruturada.
   Se faltar evidência, **procure** (Grep/Read) o `file:line` que sustenta — aprendizado sem
   evidência é palpite (CBM-001 vale aqui também). Não invente evidência; se não achar, marque
   `Evidência: (a confirmar)` e diga ao usuário.
3. **Modo sem argumento** (`/learning-log`): varra o trabalho recente da sessão, **proponha**
   3–7 entradas candidatas e deixe o usuário escolher quais gravar. Não grave em lote sem o OK.
4. **Dedup:** antes de anexar, leia o ledger e cheque se a lição já existe; se sim, **refine** a
   entrada existente em vez de duplicar. Para durável: verificar também se já existe memória com o mesmo slug.
5. **Anexar** a entrada (entradas mais novas no topo, logo abaixo do cabeçalho).
6. **Promover se durável:** se a entrada passar no teste dos 3 meses, escreva também o arquivo
   de memória + a linha no `MEMORY.md`, e aponte a entrada do ledger para ele com `[[slug]]`.
   O slug do ledger **deve bater** com o `name:` do arquivo de memória — senão o link fica pendente
   (é o que o lint pega). A memória É a camada wiki (fato-por-arquivo, frontmatter, `[[links]]`,
   índice `MEMORY.md`); não há camada wiki separada.
7. **Fechar:** uma linha confirmando — `Anotado em <ledger> [+ memória <slug>]`.

## Modo lint (`/learning-log lint`)

Varre **ledger + memória** (não há wiki separada) e propõe correções — nunca escreve sem o OK:

1. **`[[slug]]` pendente:** toda referência `[[slug]]` nos ledgers (`docs/learnings/*.md`) e nas
   memórias (`memory/*.md`) cujo slug não tem arquivo `memory/<slug>.md` correspondente. O caso
   típico é o ledger marcar `Durável? sim → [[x]] (a escrever)` e a memória nunca ter sido criada,
   ou ter sido criada com `name:` diferente (mismatch). Propor: criar a memória, ou reapontar o link.
2. **Memória órfã do índice:** arquivo `memory/*.md` sem linha em `MEMORY.md` (ou vice-versa).
3. **Claim stale / contradição:** memória que cita `file:line`/flag que não existe mais (Grep/Read
   confirma), ou duas memórias que se contradizem. Reportar para o usuário decidir — não auto-editar.

Saída: lista de gaps com a correção sugerida. Ponytail: lint é leitura + grep + proposta, não um
sistema — sem banco, sem índice próprio.

## Invariantes (gate)

- **Nunca** grave aprendizado sem `Como aplicar` — uma lição sem ação é trivia.
- **Nunca** duplique uma entrada existente; refine.
- **Nunca** promova para memória algo que o repo já registra (estrutura, git, ADR) — isso é
  exatamente o que as regras de memória do projeto proíbem.
- Evidência é `file:line`/commit/teste real, ou explicitamente `(a confirmar)` — nunca fabricada.
- O ledger é markdown puro append-only conceitualmente; editar é só para refinar/dedup, não reescrever histórico.
