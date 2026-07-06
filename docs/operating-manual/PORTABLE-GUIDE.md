# Gates Operacionais — Guia Portável (qualquer projeto, qualquer modelo)

> Versão genérica e auto-contida da disciplina codificada em `.claude/skills/_OPERATING-GATES.md`.
> Copie este arquivo para qualquer repo e siga os 6 passos. Nada aqui depende do Luminaris.
>
> **A tese em uma linha:** a confiança de um modelo e a correção dele são variáveis independentes;
> estrutura de verificação externa é o que as trava juntas. Por isso um modelo mais fraco *com gates*
> supera um modelo mais forte *solto* — e por isso este guia funciona igual com Opus, Sonnet, Haiku
> ou o que vier depois.

---

## O bloco a copiar (cole no doc de regras do seu projeto)

### Gates de envio (binários — qualquer "não" bloqueia)

Antes de fechar qualquer resposta substantiva ou PR, aponte o artefato de cada gate **no próprio texto**:

1. **Objetivo, não palavras.** Aponte a frase exata que responde ao *objetivo* do pedido, não à letra.
2. **Grau visível.** Todo claim de sustentação marcado: `verificado` (rodei/li) / `inferido` (decorre
   de verificado) / `assumido` (plausível, não checado). Repetir um assumido não o promove — só
   evidência promove.
3. **Ataque registrado.** Escreva *qual* caso adversarial foi tentado contra a conclusão e o resultado
   (vazio, zero, máximo, concorrente, re-execução, deletado-e-recriado — o caso mais provável de
   quebrar, não o caminho feliz de novo).
4. **Checagem falseável.** Ao menos uma checagem que *teria falhado* se a conclusão estivesse errada
   (teste vermelho→verde, expressão executada, build). Checagem que não pode falhar não conta.
5. **Duas primeiras linhas.** Sozinhas, entregam a verdade **e** o risco principal. Ordem fixa:
   resposta → raciocínio → risco.

### Protocolo de teto de capacidade

Sinais objetivos de que o problema excedeu o raciocínio disponível (contáveis, sem autoconsciência):

1. Claim central revisado **duas vezes sem fato novo** entre as revisões.
2. Teste de aceite não cabe em **uma frase**.
3. Plano de verificação é "ler de novo".
4. Toda decomposição deixa uma peça cuja condição de verdade ninguém sabe enunciar.

Ao disparar qualquer sinal: **pare de aprofundar, converta raciocínio em checagem**, da mais barata
para a mais cara — executar a expressão → escrever o teste que ficaria vermelho → bisseção → ler a
fonte → só então pensar mais. Encolha o claim ao subconjunto verificado; entregue o resto como
pergunta aberta explícita com o que a fecharia. Nunca blefe continuidade entre o verificado e o chutado.

### Risco silencioso primeiro

Risco = P(erro) × custo do erro **não pego**. Procedimento:

1. Liste toda superfície que a mudança toca.
2. Para cada uma: *se isto estiver errado, quem me avisa?* — compilador / teste / usuário / **ninguém**.
3. Ordene "ninguém" primeiro; gaste o esforço nessa ordem.
4. Escreva o risco-silencioso nº 1, por extenso, na entrega final.

---

## Os 6 passos de instalação

### 1. Dê um endereço às regras — e um ponteiro sempre-ativo

Cole o bloco acima num doc versionado (`docs/OPERATING-GATES.md`, `AGENTS.md`, o que o projeto usar) e
referencie-o no arquivo que o agente lê **toda sessão** (`CLAUDE.md`, `.cursorrules`, system prompt).
No arquivo sempre-ativo vai só o resumo curto + link; regra pesada no doc. Regra de ouro: **nenhuma
checagem crítica pode depender do modelo lembrar dela** — se está só na cabeça (ou só numa conversa
antiga), não existe.

### 2. Torne os gates estruturais, não aspiracionais

Todo gate que puder virar máquina, vire máquina:

| Gate | Versão estrutural |
|---|---|
| "código compila" | build/typecheck obrigatório no CI e como pré-condição de avanço local |
| "testes passam" | suite no CI; teste novo obrigatório para toda correção de bug (o teste que ficaria vermelho) |
| "invariante de domínio" | constraint no banco / assertion em runtime — nunca só validação na aplicação |
| "formato do relatório" | template/checklist que o revisor rejeita por forma antes de julgar mérito |

O que não vira máquina (gates 1–3, teto de capacidade) fica auto-reportado — e é exatamente por isso
que existe o passo 3.

### 3. Review independente — o maior equalizador

Regra: **quem implementou não aprova**. O review roda em contexto limpo (outro agente, outra sessão,
outro worktree), re-derivando do zero a partir do diff — não lendo o relatório de quem fez. Por que
funciona como equalizador de modelo: duas amostras independentes têm erros pouco correlacionados;
N amostras + um juiz adversarial compram com tokens o que falta em peso. Para as decisões mais duras,
escale para N=3 tentativas independentes + juiz.

### 4. Tarefas pequenas, teste de aceite antes

Folga de raciocínio só é estressada quando o problema inteiro precisa caber numa cabeça. Corte o
trabalho em incrementos onde:

- o teste de aceite é enunciado em uma frase **antes** de implementar;
- cada peça tem condição de verdade própria — "posso errar A e ainda acertar B?" (se um bug em A
  envenena a checagem de B, o corte está errado: corte por **fronteira de dado e invariante**, não
  por passo cronológico);
- um incremento = uma sessão/PR. Com modelo mais fraco, a tentação é dar tarefas maiores; resista —
  é a direção errada.

**Loops delimitados.** Todo trabalho iterativo (tentar → verificar → tentar de novo) roda com dois
freios declarados **antes** de começar: (1) condição de parada verificável por **avaliador externo ao
executor** — quem implementa não decide que terminou (mesma lógica do passo 3); (2) **teto duro de
iterações** ("pare após N tentativas"). Bater o teto sem fechar não pede mais tentativas — cai no
protocolo de teto de capacidade: declarar o aberto. O cap é a versão *estrutural* daquele protocolo:
não depende de o agente perceber os próprios sinais. E antes de um lote grande, **pilote numa fatia
pequena** para calibrar custo e taxa de acerto.

### 5. Verificação > raciocínio, no prompt

Instrução literal para o doc sempre-ativo: **"não afirme comportamento; execute."** Todo claim que
pode virar comando, vira: rodar a expressão no console, escrever o teste, bisseção. Modelo-com-execução
empata com modelo-maior-de-memória em quase todo claim verificável. Corolário de custo: trabalho
determinístico que se repete vira **script versionado**, não re-raciocínio a cada execução — rodar
script é mais barato e mais confiável que re-derivar os passos. Complementos:

- Orçamento de pensamento (effort/extended thinking) no máximo nas tarefas de risco silencioso;
  modo rápido só no mecânico.
- Contexto enxuto: raciocínio degrada com janela inchada. Localize primeiro (busca/índice/grafo),
  carregue só o arquivo que importa. Um índice de memória externo (fatos duráveis em arquivos, uma
  linha por fato num índice) vence despejar histórico na janela.

### 6. Feche o ciclo: cada bug vira regra ou gate

Quando um bug escapa, a pergunta não é "quem errou" — é **"qual gate teria pego, e por que ele não
existia?"**. A resposta vira: um teste novo, uma constraint, uma linha no doc de regras, ou uma
entrada na memória externa (com o *porquê*, não só o *o quê*). Bugs de classe (idempotência, data,
tenancy, dinheiro) exigem varredura da classe inteira, nunca patch de um caminho só. É assim que o
sistema fica mais forte que qualquer modelo que rodar nele.

---

## O que este guia NÃO fecha (grau: verificado por construção)

O resíduo é o raciocínio novo, single-shot, **sem verificador possível** — o design sutil que nenhum
teste existente pega, o invariante cross-domain que só existe na cabeça de quem desenha. Mitigação:
passo 3 em dose máxima (N amostras + juiz) ou honestidade estruturada — o protocolo de teto manda
declarar o aberto em vez de blefar. Se o seu projeto vive disso (pesquisa, design de protocolo,
criptografia), gates ajudam mas não substituem o melhor raciocínio disponível — aí, sim, o modelo
mais forte importa.
