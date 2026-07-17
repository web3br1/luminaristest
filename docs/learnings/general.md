# Learnings — Geral (cross-cutting)

Ledger dos aprendizados que não pertencem a um buildout de domínio — plataforma, camada de
skills, disciplina de agente. Formato e regras: skill `learning-log`. Entradas mais novas no topo.

---

### 2026-07-16 · pitfall · Varredura de class-fix tem ESCOPO — e o escopo é o bug (4 recorrências no mesmo dia)
- **Contexto:** Esforço RISK-SEC-AUTH-001 + fonte única do contrato de rota. Uma regra (`protectedApiPaths`) transcrita em ~30 lugares precisava sumir da camada executável.
- **Aprendizado:** a disciplina de class-fix ([[idempotency-class-fix-discipline]]) manda enumerar a classe inteira, mas não diz **onde** procurar — e o escopo escolhido foi o defeito, quatro vezes seguidas, cada uma um nível acima: (1) li o arquivo numa **faixa de linhas** (70–120) e perdi 8 cópias acima, incluindo a `description` do frontmatter, que é o gatilho de ativação da skill; (2) escopei a varredura em `.claude/skills/ server/src/ docs/claude-skills/` e perdi `CLAUDE.md:72` — a **raiz sempre-ativa**, superfície de maior precedência do projeto; (3) a varredura repo-wide achou um `SKILLS_GUIDE.html` **duplicado na raiz** que nem eu nem os reviewers víamos; (4) ao corrigir a assertion de eval que reprovava o acerto, **reintroduzi a mesma armadilha** no comando do reviewer dois commits depois. Nenhuma foi falta de regra: a regra estava escrita, inclusive por mim, no comentário do código.
- **Evidência:** commits `b343a58` (4 superfícies vivas) e `6dd5dd4` (o comando reintroduzido); review independente REPROVADO no ciclo 1 (skills) e no ciclo 2 (segurança), ambos com a superfície nomeada e `file:line`. Os três gates (`governance-check` 34/34, `validate` 36/36, `wiring` exit 0) estavam **VERDES** durante todas as quatro.
- **Como aplicar:** a varredura de uma class-fix declara o escopo **antes** de rodar, e o escopo default é o **repositório inteiro**, não os diretórios "óbvios" — CLAUDE.md da raiz, HTML, duplicatas fora de `docs/`. Ferramenta: **`git grep`**; `grep -r` e o ripgrep **estouram timeout** neste worktree (junctions de `node_modules`) — e uma varredura que morre por timeout é lida como "não achou nada", que é o falso-limpo mais caro que existe.
- **Durável?** sim → refina [[idempotency-class-fix-discipline]] (a classe existe; o que faltava era a regra de escopo + ferramenta)

### 2026-07-16 · pitfall · O merge REABASTECE a superfície que a varredura já limpou
- **Contexto:** Mesmo esforço. `routes/counterparties.ts` apareceu com o comentário "3-touch registration" **depois** de eu ter varrido e declarado limpo.
- **Aprendizado:** varri em `1ac3523`, depois mergei `origin/main` (que trazia o módulo INCR-COUNTERPARTY novo) — e o merge trouxe uma cópia fresca da regra extinta. Uma varredura é válida **para o commit em que rodou**, não para a branch. Em repo com sessões paralelas mergeando em `main`, isso não é hipótese: `main` avançou **duas vezes** durante esta sessão.
- **Evidência:** `git cat-file -e 1ac3523:server/src/routes/counterparties.ts` → **ABSENT**; o arquivo entra via o merge `e221d49`; achado pelo reviewer independente de skills, não por mim.
- **Como aplicar:** toda varredura de class-fix **re-roda depois do último merge**, imediatamente antes do PR — mesma disciplina do re-fetch de [[verify-write-context-before-writing]], aplicada à varredura e não só ao commit. "Varri e está limpo" tem prazo de validade de um merge.
- **Durável?** sim → reforça [[verify-write-context-before-writing]]

### 2026-07-16 · pattern · Gate `eval` prova que a skill DIZ; só gate que lê o APP prova que o app FAZ
- **Contexto:** Investigação de por que dois furos de auth passaram por uma regra escrita em ~30 lugares e por um gate de wiring criado exatamente para pegar registro tsc-cego.
- **Aprendizado:** `ROUTE-002` (o toque em `protectedApiPaths`) **tinha** gate declarado no `governance.md` — do tipo `eval`, que verifica se a **skill manda fazer**, não se o **app fez**. E o `check-registries.mjs` do wiring gate cobre o toque 1 (`routes/index.ts`), nunca o toque 2. Ou seja: o gate existia, era do tipo errado, e o gate certo olhava a superfície errada. Foi por essa fresta que `/api/package-balances` entrou — montado (gate passa), fora do allowlist (gate cego).
- **Evidência:** `.claude/skills/backend-route-generator/governance.md` (ROUTE-002 → `type: eval`); `.claude/skills/skill-audit/check-registries.mjs` `REGISTRIES` (só `routes/index.ts`, KPI, preset); `git show origin/main:server/src/middleware/auth.ts | grep -c package-balances` → **0**.
- **Como aplicar:** ao admitir um gate novo, classifique-o: **eval** = o texto da skill; **estático/execução sobre o app** = o comportamento. Regra com consequência de runtime exige o segundo. Auditar os `governance.md` existentes com essa lente é varredura, não skill nova. E o melhor gate é o que deixa de ser necessário: deny-by-default **eliminou** o toque esquecível em vez de vigiá-lo.
- **Durável?** sim → [[gate-eval-prova-o-texto-nao-o-app]]

### 2026-07-16 · decision · Deny-by-default vence o allowlist; reconciliação com o #118 já mergeado
- **Contexto:** Colisão de sessões paralelas. Enquanto esta branch implementava deny-by-default, o PR #118 (`c8f0939`) mergeou em `main` o fix **pontual** do MESMO risco (mantém o allowlist + strip + normalização).
- **Aprendizado:** a divergência entre "o que o dono ratificou comigo" e "o que já foi mergeado" é **decisão do humano**, não escolha do agente — apresentei os dois desenhos e ele escolheu. O critério objetivo que decidiu: o #118 **não fecha `/api/package-balances`**, porque o allowlist continua sendo a geradora. Não competi com um PR que reverte o #118: absorvi o que ele tinha de mérito (nome/ordem de `INBOUND_IDENTITY_HEADERS`, helper de teste, caso percent-encoded) e descartei o resto com evidência.
- **Evidência:** merge `e221d49` (resolução manual); a guarda-de-árvore pegou a colisão antes de qualquer PR — `git diff --stat origin/main..HEAD` acusava 46 arquivos / 1326 deleções para 2 commits que tocaram 21 (mergear apagaria 25 arquivos de `main`).
- **Como aplicar:** ver [[critical-auth-bypass-case-sensitive-guard]] para o estado por superfície. Quando duas sessões colidem no mesmo nó, a reconciliação mais barata costuma ser **emendar o mergeado** — mas quando o mergeado deixa o furo aberto, o desenho que fecha a classe ganha, e o humano decide.
- **Durável?** sim → [[critical-auth-bypass-case-sensitive-guard]] (memória atualizada com este caso)

### 2026-07-16 · gotcha · Express: deriva HEAD do handler GET, mas NÃO decodifica o mount path
- **Contexto:** RISK-SEC-AUTH-001. Duas premissas sobre o roteador sustentam o guard de auth inteiro; as duas foram testadas contra um Express real, não deduzidas.
- **Aprendizado:** (a) o Express **não** percent-decodifica ao casar mount path — `/api/%61ccounting/post` → **404**, não chega no router; `/api/ACCOUNTING/post` → **200**, chega. Logo o `decodeURIComponent` do #118 defende um vetor inexistente, e **decodificar no guard seria errado**: faria o guard ver um path diferente do router, que é a causa-raiz da classe. (b) o Express **serve HEAD a partir do handler GET** (e só HEAD — nenhum outro verbo é derivado), então **toda regra keyed por método precisa dobrar `HEAD→GET`** ou o gate para de aplicar em silêncio.
- **Evidência:** probe descartável com Express real (rodado por mim e **reproduzido de forma independente** pelo reviewer); `HEAD /api/users` com token USER executava o handler ADMIN-only (`GET` dava 403) — pré-existente, também em `main`; fix em `routedMethod()` usado por `isPublic` E `isAdminOnly` (`6dd5dd4`), com 2 testes que ficam vermelhos sem ele.
- **Como aplicar:** o casamento do guard **espelha o roteador** — toda divergência é um bypass em potencial, nas duas direções. Premissa sobre o framework se prova com probe ao vivo, nunca por leitura de comentário: o comentário do #118 afirmava o oposto do que o Express faz. **Residual honesto:** a premissa HEAD sustenta 2 gates e não tem teste — os testes provam a decisão do middleware, não a derivação do Express.
- **Durável?** sim → [[critical-auth-bypass-case-sensitive-guard]]

### 2026-07-16 · pitfall · Duplicata de arquivo não tem gate — e diverge no primeiro edit
- **Contexto:** `SKILLS_GUIDE.html` existia em `docs/claude-skills/` **e** na raiz, byte-idêntico (mesmo blob), rastreado, referenciado por ninguém.
- **Aprendizado:** nenhum gate do repo vê duplicata de arquivo — nem `governance-check`, nem `validate`, nem `wiring`. E o custo se provou **na própria sessão**: ao corrigir o contrato de rota eu editei só a cópia de `docs/` e as duas divergiram na hora. Duas cópias de um guia vivo não são redundância, são uma bomba-relógio com pavio de um commit.
- **Evidência:** blob `d34a659d9658783ebcac7c48e684d582f3ba136f` nos dois paths em `f0843a9`; `git grep -i "SKILLS_GUIDE"` → zero hits (ninguém dependia do path da raiz); deletado em `a54bea3`.
- **Como aplicar:** ao consolidar uma regra em fonte única, procure **duplicatas do próprio documento**, não só cópias da regra — `git grep` pelo nome do arquivo e por um trecho distintivo do conteúdo. Guia vivo tem **um** path; o resto é histórico datado ou deleção.
- **Durável?** não (é a aplicação do princípio de fonte única a este repo; o princípio já vive no contrato)

### 2026-07-16 · pitfall · Assertion `absent:<token>` global reprova o ACERTO quando a skill ensina o token
- **Contexto:** Reescrita do eval `regression-1` de `backend-route-generator` depois que `protectedApiPaths` deixou de existir.
- **Aprendizado:** escrevi `absent:protectedApiPaths` para pegar quem reintroduz o toque morto. Mas a resposta **correta** precisa nomear o array para dizer que ele não existe — a própria `SKILL.md` ensina essa frase. A assertion reprovava o acerto. O que a regressão emite é o **elemento** (`'/api/invoices'`), não o nome do container. `absent:` é seguro em eval cuja saída é **código** (happy-1: os 3 arquivos-alvo), e perigoso em eval cuja saída é **prosa sobre a regra**.
- **Evidência:** `.claude/skills/backend-route-generator/evals/evals.json` `regression-1` + `assertion_notes`; achado pelo reviewer independente de skills, que também mostrou a fresta residual (uma resposta correta ainda pode citar `'/api/invoices'` ao contrastar com o caso público).
- **Como aplicar:** antes de fechar um `absent:<token>`, pergunte **se a resposta certa pode dizer aquilo** — e escolha o token que **só** a regressão emite. Eval de prosa e eval de código pedem assertions de classes diferentes.
- **Durável?** não (específico da camada de evals; vive no `assertion_notes` junto da assertion)
