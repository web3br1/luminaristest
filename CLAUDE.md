# Luminaris — Orientação do Agente

Monorepo: `server/` (Express + Prisma, **camadas estritas**) e `my-app/` (Next.js Pages Router).
As regras pesadas vivem nos docs abaixo — este arquivo é só a orientação sempre-ativa que aponta pra eles:

- **Bar de qualidade / camadas:** `.claude/skills/_ARCHITECTURE-CONTRACT.md`
- **Critério reuse-vs-bespoke:** `.claude/skills/_REUSE-CRITERION.md`
- **Scaffolding (nomes/paths por camada):** `docs/claude-skills/GENERATION_CONTRACTS.md`
- **Disciplina operacional do agente (OPS-001..004):** `.claude/skills/_OPERATING-GATES.md`
  (versão portável p/ outros projetos: `docs/operating-manual/PORTABLE-GUIDE.md`;
  política de raciocínio T1–T8: `docs/operating-manual/REASONING-TRAITS.md`;
  tuning por modelo — Opus 4.8 ativo, gatilhos explícitos + micro-autonomia + guarda de recall
  em review: `docs/operating-manual/MODEL-TUNING.md`)

**Regras path-scoped (CLAUDE.md aninhado — carregam só ao editar cada subtree):**
- `server/CLAUDE.md` — gates de camada backend (cadeia Route→…→Prisma, DTO/factory/soft-delete, gate dentro do tx).
- `my-app/CLAUDE.md` — gates de frontend (reuse canônico, `neutral-*`/`rounded-2xl`, `withAuth`+build de produção) + regras de teste (vitest, shim de `React` global).

## STOP — reflexo obrigatório ANTES de qualquer planejamento ou código

**Onde este novo módulo/feature vive?** Esta pergunta tem resposta binária e deve ser feita antes de qualquer linha:

| O dado/módulo é… | Tecnologia |
|---|---|
| Tabela que o usuário cria/configura em runtime (CRM, formulários, fluxos customizados) | **DynamicTable** (preset + plugin) |
| Entidade com invariante financeiro, legal ou regulatório (contabilidade, folha, fiscal, RH) | **Prisma first-class** (Model + Service + Repo + Policy próprios) |

**Se você está prestes a:**
- Injetar qualquer serviço Prisma (`PostingService`, `PayrollService`…) em `DynamicTableService`, `RuleContext` ou `RulePlugin` → **PARE. Design errado.**
- Modificar `DynamicTableService.ts` para integrar dois módulos → **PARE. Design errado.**
- Modelar uma entidade contábil/legal como linha de DynamicTable → **PARE. Design errado.**
- Fazer integração cross-módulo dentro do motor de plugins → **PARE. Isso sobe ao nível de controller/route/serviço de integração.**

Regra completa + anti-padrões proibidos em `.claude/skills/_ARCHITECTURE-CONTRACT.md §2.1`.

---

## Antes de escrever código — reflexo obrigatório

**1. Pergunte ao codebase-memory se o canônico já existe.** Isto é o degrau "reuse antes de recriar"
(Contrato §0) e a Etapa 1 do critério de reuso feitos por evidência, não por chute:

| Pergunta | Ferramenta cbm |
|---|---|
| Já existe algo com esse nome/forma? | `search_graph` (name/label/file_pattern) |
| Existe um quase-clone (ilha) que eu deveria reusar? | `semantic_query` + edges `SIMILAR_TO` / `SEMANTICALLY_RELATED` |
| O outro lado está vivo ou é legacy? (Etapa 2) | `trace_path` (in-degree) + `change_count` / `last_modified` |
| Qual o blast radius do meu diff antes de fechar? | `detect_changes` |

> **[CBM-001] Papel do cbm — localizador estrutural, NÃO fonte de verdade.** O grafo reduz o espaço de busca
> (símbolos, dependências, call paths, blast radius, arquitetura); a evidência final é **sempre código/teste/git**.
> Regra dura: **nenhuma conclusão comportamental se sustenta só no grafo** — todo resultado do cbm que vira
> afirmação sobre o que o código *faz* tem de ser confirmado lendo o arquivo (e o teste, quando aplicável).
> Use **cbm-primeiro para localizar** ("quem chama X?", "onde isto é implementado?", "o que quebra se eu mudar Y?",
> "qual a arquitetura deste domínio?"); use **`Read`/`Grep`/teste direto para confirmar** (condição exata,
> string/config, o que um teste afirma, contexto integral do arquivo, geração dinâmica/reflexão). Isto **refina**
> o hook de SessionStart ("cbm FIRST for ANY exploration"): cbm-first vale para *localização estrutural*, não para
> busca exaustiva de call sites nem leitura de contexto integral — aí a leitura nativa ganha (evidência própria:
> `cbm-indegree-underreports-frontend`, composição JSX não é aresta `CALLS`). `manage_adr`/`delete_project` ficam
> fora do uso do agente; ADR/incidente são editados direto no vault de governança.

**2. Reuse o canônico** listado no §0 (GenericTable, Modal, StandardPagination, AnalyticsDashboard,
CrmPipelineService…). Bespoke só com divergência de **shape ou posse** sancionada pelo critério de reuso,
justificada no relatório. Projeto indexado como `C-Users-smurf-Downloads-Luminaris`.

## Ponytail × este projeto

O ponytail (modo lazy, sempre ativo) e este projeto **concordam** no núcleo — menos código, reuse antes de
recriar, YAGNI — e o codebase-memory é o que torna esse instinto fundamentado. Mas com uma fronteira clara:

- **Padrões de camada NÃO são over-engineering.** A cadeia `Route → Controller → Service → Repository → Prisma`
  (+ Policy), injeção via **Factory**, **DTO Zod**, **soft-delete** e **registro de rota em 2 toques** são
  *requisitos do projeto* (Contrato §2/§3). Caem na própria regra do ponytail de "nunca simplificar o que foi
  explicitamente pedido / segurança". **Não** inline uma policy, **não** pule um DTO, **não** corte o factory
  "pra ser enxuto".
- O ponytail morde no **código solto** (um helper, um fix pontual) — aí sim, seja mínimo.
- Em dúvida entre enxugar e seguir o padrão da camada → **o contrato prevalece**.

## Gates rápidos (o resto está no contrato)

- `tsc` limpo é gate: `cd server && npx tsc --noEmit` e `cd my-app && npx tsc --noEmit` — não avance vermelho.
- `neutral-*`, **nunca** `zinc-*`; cards `rounded-2xl`/`3xl`; zero `any` evitável.
- Telas atrás de `withAuth` → verifique contra **build de produção**, não `next dev`.

## Gates de envio [OPS-001] — antes de fechar resposta/relatório/PR

Cinco perguntas binárias; cada uma aponta um artefato **no próprio texto**; qualquer "não" bloqueia:

1. Aponto a frase que responde ao **objetivo** (não à letra) do pedido?
2. Todo claim carrega grau — verificado / inferido / assumido? (só evidência promove grau)
3. Escrevi **qual** caso adversarial tentei contra a conclusão e o que aconteceu?
4. Existe checagem que **teria falhado** se eu estivesse errado?
5. As duas primeiras linhas, sozinhas, entregam a verdade **e** o risco principal?

Travou no raciocínio (claim revisado 2× sem fato novo / aceite não cabe numa frase)? → protocolo de
teto **[OPS-002]**: pare de aprofundar, converta em checagem (executar → teste vermelho → bisect →
ler fonte), declare o aberto — nunca blefe continuidade. Detalhe + OPS-003/004 em
`.claude/skills/_OPERATING-GATES.md`.

## Política de raciocínio [T1–T8] — durante o trabalho (detalhe em REASONING-TRAITS.md)

1. Nomeie o **objetivo sob a letra** do pedido; se divergem, responda ao objetivo e avise.
2. Claim inverificável → converta em artefato checável por fora, ou declare inverificável.
3. Regra que você criar **se aplica primeiro a você**; declare onde falha em si mesma.
4. Decisão que vai se repetir: formule a regra na 1ª vez, **cite-a** nas seguintes.
5. Input que só confirma o existente não vira texto novo — registre "confirma" e siga.
6. Sobre trabalho já ~certo: **patches no que falha, nunca rewrite**.
7. Instrução que alguém vai rodar = passos numerados; aforismo só como índice.
8. O risco final da entrega **inclui seus próprios vieses**, nomeados.
