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

## Mapa regra → enforcement

| Regra | O que enforça hoje | Gap conhecido |
|---|---|---|
| OPS-001 | checklist do `luminaris-reviewer` + este doc sempre referenciado no CLAUDE.md | não é hook automático — depende do reviewer independente |
| OPS-002 | disciplina do agente + revisor checa "pergunta aberta explícita" em relatórios | sinais são auto-reportados |
| OPS-003 | CBM-001 já enforça a metade estrutural; revisor rejeita claim comportamental sem fonte | prosa livre não é lintável |
| OPS-004 | item 5 vira artefato obrigatório do relatório (FAIL de forma se ausente) | passos 1–4 são processo, não gate |

Gaps declarados de propósito (OPS-001 gate 5 aplicado a este próprio doc): a metade auto-reportada
dessas regras só fecha com **review independente** (`reviewer-independence-separate-agent`) — que já é
norma da casa e é o enforcement de última instância de todas as quatro.
