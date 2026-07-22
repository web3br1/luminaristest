# Luminaris — Gates Operacionais do Agente (OPS)

> **Fonte única da disciplina operacional do agente.** Enquanto o `_ARCHITECTURE-CONTRACT.md` encoda
> *o que* é código correto neste repo, este doc encoda *como o agente trabalha* para que confiança e
> correção andem juntas — independente de qual modelo está rodando. A tese: **um modelo mais fraco com
> gates estruturais supera um modelo mais forte solto.** Nenhuma checagem crítica pode depender do
> modelo lembrar de rodá-la.
>
> Origem: manual de operação (sessão 2026-07-06). Versão portável para outros projetos:
> `docs/operating-manual/PORTABLE-GUIDE.md`.

---

## [OPS-001] Gates de envio — self-test binário obrigatório

Antes de fechar qualquer resposta substantiva, relatório de incremento ou PR, o agente roda os 5 gates.
Cada um é **sim/não** e aponta para um **artefato no próprio texto** — gate que não pode falhar não é gate.
Qualquer "não" bloqueia o envio e devolve ao trabalho.

1. **Objetivo, não palavras.** Posso apontar a frase exata que responde ao *objetivo* do pedido (não à
   letra dele)? → aponte-a.
2. **Grau visível.** Todo claim de sustentação carrega grau explícito — verificado / inferido / assumido?
   (Definições em OPS-003.)
3. **Ataque registrado.** Escrevi *qual* caso adversarial tentei contra a própria conclusão e o que
   aconteceu? (vazio, zero, máximo, concorrente, re-run, soft-deleted, cross-job — o caso mais provável
   de quebrar, não o caminho feliz de novo.)
4. **Checagem falseável.** Existe ao menos uma checagem que *teria falhado* se eu estivesse errado?
   (teste vermelho→verde, expressão executada, `tsc`, fixture assimétrica.)
5. **Duas primeiras linhas.** Sozinhas, elas entregam a verdade **e** o risco principal? (Resposta →
   raciocínio → risco, nesta ordem; o risco é o gosto final, nunca enterrado no meio.)

**Enforcement:** o `luminaris-reviewer` trata OPS-001 como item de checklist em todo review de
incremento — relatório sem os artefatos dos gates 3 e 4 nomeados é FAIL de forma, antes de mérito.

---

## [OPS-002] Protocolo de teto de capacidade

O caso mais caro não é errar — é **aprofundar uma linha errada com confiança**. Quatro sinais objetivos
(contáveis, nenhum exige autoconsciência) de que o problema excedeu a capacidade de raciocínio disponível:

1. Revisei o claim central **duas vezes sem fato novo** entrar entre as revisões.
2. Não consigo enunciar o teste de aceite em **uma frase**.
3. Meu plano de verificação é "ler de novo".
4. Toda decomposição que tento deixa uma peça cuja condição de verdade eu não sei enunciar.

**Ao disparar qualquer sinal: pare de aprofundar, comece a converter.** Troque raciocínio por checagem
externa, da mais barata para a mais cara:

> executar a expressão → escrever o teste que ficaria vermelho → `git bisect` → ler a fonte → *só então*
> pensar mais.

Encolha o claim ao subconjunto efetivamente verificado; entregue o resto como **pergunta aberta
explícita** com o que fecharia ela. **Nunca blefe continuidade** entre a parte verificada e a parte
chutada. Terceira hipótese de mecanismo sem fato novo = sinal 1 disparado: bisseção termina, quarta
teoria não.

---

## [OPS-003] Graus de evidência

Todo claim de sustentação carrega um grau, soldado à frase desde a formação — não promovido por
repetição:

| Grau | Significa | Exemplo |
|---|---|---|
| **verificado** | eu rodei / li a linha / vi o teste falhar e passar | "a rota está registrada — li o router" |
| **inferido** | decorre de algo verificado | "logo o 404 é downstream" |
| **assumido** | plausível, não checado | "provavelmente ordem do middleware — não tracei" |

Reafirmar um *assumido* não o torna *verificado* — só evidência promove grau. Isto é a extensão
comportamental do **[CBM-001]**: o grafo localiza, o código decide; grau *verificado* exige código,
teste ou execução — nunca só o grafo, nunca só memória.

---

## [OPS-004] Risco silencioso primeiro

Risco = P(erro) × custo do erro **não pego**. As falhas barulhentas (`tsc` vermelho, teste quebrado,
crash) já têm guarda — o julgamento do agente é a única guarda das silenciosas. Procedimento executável:

1. Liste toda superfície que o diff toca.
2. Para cada uma: *se isto estiver errado, quem me avisa?* — compilador / teste / usuário / **ninguém**.
3. Ordene: "ninguém" primeiro (dinheiro movido, atomicidade aparente, idempotência cross-job, tenancy,
   invariante de período/saldo).
4. Gaste o esforço nessa ordem; o que o compilador guarda ganha um olhar, não uma hora.
5. Escreva o risco-silencioso nº 1, por extenso, no relatório final (é o artefato do gate 5 de OPS-001).

Evidência própria do repo de que a classe existe: `tx-nao-propagado-ao-repo` (atomicidade aparente),
`unique-de-idempotencia-x-soft-delete` (idempotência que morre em P2002),
`date-only-regex-nao-valida-calendario` (rollover silencioso de data — classe de 7 sites).

---

## [OPS-005] Gate de fila — não abrir frente nova sobre trabalho não-landado

Trabalho feito e **não landado é passivo, não ativo**. Três custos que crescem sozinhos enquanto a fila
não drena: (1) **superfície de conflito** — cada PR que toca um choke point (schema, factory, auth,
rotas) multiplica os pares; (2) **review envelhece** — um PASS vale contra a árvore revisada; um rebase
do pai o invalida **por transitividade** em toda a pilha; (3) **aposta empilhada** — construir sobre uma
base cujo gate bloqueante nunca rodou aposta *todos* os PRs da pilha nesse gate.

Procedimento executável, **antes de abrir qualquer frente nova de código**:

1. Liste o trabalho não-landado: `gh pr list --state open` + branches locais não mergeadas.
2. Para cada item, nomeie o **gate bloqueante ainda não executado** (smoke-migration-gate, merge, sign-off).
3. Meça a **profundidade da pilha**: um PR empilhado herda **todos** os gates da base. Base com gate aberto
   ⇒ o default é **NÃO** empilhar mais nada em cima.
4. **≥3 itens não-landados com gate aberto ⇒ relate a fila em vez de rotear.** O default é não construir.
5. **Exceção sempre permitida:** trabalho que **drena** a fila (rodar um gate, resolver conflito, consertar
   um PR aberto, mergear). Isso é higiene, não frente nova.
6. Escreva o **estado da fila** no relatório final (artefato — pareia com o gate 5 de OPS-001).

**Evidência própria (n=1, sessão 2026-07-15).** O debate de personas do início da sessão já diagnosticou
"o gargalo é validação humana, não falta de código" — e o diagnóstico virou **memória**. Nada o **gateou**:
ao longo da sessão foram empilhados **5 PRs** em cima daquele diagnóstico, a pilha do A1 chegou a **4 níveis**
(A1 → aging → tie-out, + FE-A1 em paralelo), apostando **4 PRs** num smoke-migration-gate **nunca rodado
contra dados reais** — o padrão exato de `sintetico-nao-cobre-formato-de-dado-real`. Um fix de segurança
**crítico e READY** (#118) ficou parado atrás de nada. **Memória descreve; só gate segura.**

**Por que não é uma skill.** Skill só dispara quando invocada — e o modo de falha real foi *ninguém invocar
nada*: o agente construía direto a cada "segue". Além disso a `luminaris-orchestrator` é **estruturalmente
incapaz** de pegar isto: todo o vocabulário de saída dela é "quais skills geradoras rodar" (Phase 4 emite uma
tabela de passos); ela não tem representação de fila, gate ou merge. Seu único freio (ORCH-006) é colisão com
§1/§4 do master map — não saturação da fila. Por isso a regra vive aqui: camada **sempre-ativa**, sem invocação.

---

## Mapa regra → enforcement

| Regra | O que enforça hoje | Gap conhecido |
|---|---|---|
| OPS-001 | checklist do `luminaris-reviewer` + este doc sempre referenciado no CLAUDE.md | não é hook automático — depende do reviewer independente |
| OPS-002 | disciplina do agente + revisor checa "pergunta aberta explícita" em relatórios | sinais são auto-reportados |
| OPS-003 | CBM-001 já enforça a metade estrutural; revisor rejeita claim comportamental sem fonte | prosa livre não é lintável |
| OPS-004 | item 5 vira artefato obrigatório do relatório (FAIL de forma se ausente) | passos 1–4 são processo, não gate |
| OPS-005 | **probe objetivo** (`gh pr list --state open` — a única OPS com fonte externa, não auto-reportada); estado da fila vira artefato do relatório | o revisor independente **não** vê a fila (revisa um diff, não o estado de PRs do repo) — quem abre a frente é quem conta |

Gaps declarados de propósito (OPS-001 gate 5 aplicado a este próprio doc): a metade auto-reportada
dessas regras só fecha com **review independente** (`reviewer-independence-separate-agent`) — que já é
norma da casa e é o enforcement de última instância de todas as quatro.

## Validação empírica

**Teste de sistema 2026-07-07** (lacuna real do CRM, pipeline orchestrator→implementer→reviewer,
artefatos em `docs/operating-manual/system-test-2026-07-07/` na branch do teste): **9/10** no
scorecard; mutação de controle (handoff sem a seção OPS-001) **reprovada por forma** pelo revisor
de contexto fresco. Achados que viraram patch: P3 (pré-condição de ambiente no tsc do reviewer) e
P4 (seção rotulada obrigatória — o check por artefatos avulsos era satisfazível implicitamente).
Achados com dono externo: P1 (camada não merjada → decisão de merge do PR #44) e P2 (main com 35
erros de server tsc pré-existentes — cliente Prisma stale, task própria). n=1 — prova que o
pipeline *pode* segurar; consistência (pass^k) exige repetição em outras lacunas.
