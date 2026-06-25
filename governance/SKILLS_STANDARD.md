---
document_id: SKILL-GOV-001
title: Padrão Operacional de Skills
version: "1.0.0"
status: active
---

# Padrão Operacional de Skills

## 1. Linguagem normativa

- MUST / DEVE: requisito obrigatório. O descumprimento causa FAIL.
- SHOULD / DEVERIA: padrão recomendado. O descumprimento exige justificativa.
- MAY / PODE: opção permitida.
- Gate: verificação estática, teste, eval, smoke test ou revisão registrada.
- Evidência: arquivo, saída de teste, relatório ou trecho verificável que sustenta um resultado.

## 2. Fontes de verdade

A precedência obrigatória é:

1. Código, testes executados e histórico Git: comportamento objetivo.
2. SKILL.md: comportamento normativo esperado da skill.
3. governance.md: relação entre regras, gates, evals e evidências.
4. Relatórios do skill-audit: resultado materializado das verificações.
5. Codebase-Memory MCP: índice estrutural derivado.
6. Auto-memory: heurísticas e aprendizados curados.
7. Obsidian: interface de autoria, navegação e visualização.

Conflitos não devem ser resolvidos silenciosamente:

- Código diferente do contrato indica drift e deve gerar investigação.
- Resultado do cbm diferente do arquivo deve ser resolvido em favor do arquivo.
- Auto-memory diferente do contrato deve ser corrigida ou descartada.
- Frontmatter diferente do relatório de eval deve causar FAIL.

## 3. Localização e identidade

[SG-001] Toda skill ativa de projeto DEVE existir em:

    .claude/skills/<skill-name>/SKILL.md

[SG-002] O diretório e o campo `name` DEVEM:

- ser idênticos;
- usar apenas letras minúsculas, números e hífens;
- não começar ou terminar com hífen;
- não conter hífens consecutivos.

[SG-003] Toda skill DEVE possuir um `governance-skill-id` estável e globalmente
único. Alterar o diretório ou o nome visível não altera esse ID.

[SG-004] Nenhuma skill de projeto PODE depender de uma skill user-scope para
funcionar. Skills pessoais podem complementar o ambiente, mas não fazer parte
do contrato reproduzível do repositório.

[SG-005] Skills em estado draft não podem permanecer no branch principal dentro
do caminho de descoberta. Somente skills validated ou deprecated podem ser
descobertas em produção.

## 4. Fonte canônica e Obsidian

[SG-006] Na fase atual, o próprio `.claude/skills/<nome>/SKILL.md` é a fonte
canônica editável. Não existe pipeline `src -> generated`.

[SG-007] Nenhum arquivo em `generated/`, symlink ou cópia intermediária pode ser
necessário para a descoberta da skill.

[SG-008] Obsidian é uma camada de autoria e governança offline. Nenhuma skill
pode depender do Obsidian, Dataview ou Obsidian MCP em runtime.

[SG-009] Documentos de governança podem usar `[[wikilinks]]`. Arquivos
executáveis pelo Claude devem usar links Markdown relativos normais.

## 5. Frontmatter obrigatório

Toda skill DEVE conter:

    ---
    name: example-skill
    description: Executa X usando o padrão Y. Use quando o usuário solicitar Z ou quando os arquivos A forem modificados.
    compatibility: Claude Code; requer git e as dependências do projeto.
    metadata:
      governance-skill-id: "SKL-EXAMPLE"
      governance-version: "1.0.0"
      governance-status: "validated"
      governance-owner: "engineering"
      governance-last-evaluated: "2026-06-25"
      governance-eval-score: "0.95"
    ---

[SG-010] `description` DEVE explicar:

- o que a skill faz;
- quando deve ser ativada;
- termos concretos que aparecem em pedidos reais;
- seu domínio ou tipo de arquivo, quando aplicável.

[SG-011] O score e a data de avaliação são projeções do relatório do
skill-audit. Não podem ser editados manualmente sem regenerar ou validar o
relatório correspondente.

[SG-012] Requisitos específicos de ambiente, ferramentas, rede ou sistema
operacional devem aparecer em `compatibility`.

## 6. Invocação e efeitos colaterais

[SG-013] Skills com efeitos externos ou destrutivos DEVEM usar:

    disable-model-invocation: true

Isso inclui deploy, publicação, commit, envio de mensagens, alteração de
infraestrutura e migração de dados.

[SG-014] Skills usadas apenas como conhecimento de apoio PODEM usar:

    user-invocable: false

[SG-015] Skills específicas de uma área do monorepo DEVEM declarar `paths`
sempre que isso reduzir ativações incorretas.

[SG-016] Uma skill não pode modificar contratos, governança ou outras skills
silenciosamente durante uma tarefa comum.

## 7. Estrutura do conteúdo

O corpo do SKILL.md DEVE seguir esta ordem:

1. Objetivo.
2. Quando usar e quando não usar.
3. Pré-condições.
4. Contrato normativo.
5. Procedimento.
6. Validação.
7. Gotchas.
8. Recursos adicionais.

[SG-017] O `SKILL.md` DEVE permanecer abaixo de 500 linhas.

[SG-018] Detalhes extensos devem ser movidos para:

    references/
    examples/
    assets/
    scripts/

[SG-019] Todo arquivo auxiliar DEVE ser referenciado pelo `SKILL.md`, explicando
exatamente quando deve ser lido ou executado.

Exemplo correto:

    Leia `references/api-errors.md` somente se a API retornar status não-2xx.

Exemplo incorreto:

    Consulte a pasta references se precisar.

[SG-020] Scripts empacotados devem ser referenciados por caminho relativo à
skill, usando `${CLAUDE_SKILL_DIR}` quando executados.

## 8. IDs estáveis nas regras

[SG-021] Toda regra normativa auditável DEVE possuir um ID estável:

    ### [USR-001] Usuários removidos devem ser filtrados

[SG-022] IDs devem seguir:

    <PREFIXO-DA-SKILL>-<NÚMERO>

[SG-023] IDs nunca podem ser reutilizados para outro significado.

[SG-024] Alterar semanticamente uma regra existente exige:

- atualizar seu gate;
- atualizar seus evals;
- atualizar sua versão;
- registrar a alteração.

[SG-025] Toda regra nova deve nascer no mesmo change-set com pelo menos um gate.
Não existe estado intermediário em que uma regra normativa está sem cobertura.

Prosa explicativa, exemplos e recomendações não normativas não precisam de ID.

## 9. Arquivo de governança

Cada skill DEVE conter:

    .claude/skills/<skill-name>/governance.md

Formato mínimo:

    ---
    schema_version: 1
    type: skill-governance
    skill_id: SKL-EXAMPLE
    skill_path: ./SKILL.md
    status: validated
    owner: engineering
    criticality: normal

    evaluation:
      report: ../skill-audit/reports/example-skill/REPORT.md
      last_evaluated: 2026-06-25
      score: 0.95
      minimum_score: 0.90

    rules:
      EX-001:
        gates:
          - type: static
            target: ../skill-audit/checks/example-skill/ex-001.test.ts
      EX-002:
        gates:
          - type: eval
            target: ./evals/evals.json#edge-case-1
          - type: smoke
            target: ../skill-audit/tests/smoke/example-skill.test.ts
    ---

[SG-026] O texto da regra não deve ser duplicado em `governance.md`.
O arquivo relaciona IDs a gates, não replica o contrato.

[SG-027] Todo target de gate deve existir e ser executável ou verificável.

[SG-028] Um gate sem regra correspondente é drift e deve causar FAIL.

> **Compatibilidade com os pilotos da Fase 1.** Os dois `governance.md` pilotos
> (`dynamic-table-preset-generator`, `backend-workflow-transition-generator`)
> usam o dialeto pré-padrão `governs-rules:` + `gates:` mapeando regras `AC-*`
> do contrato. O auditor aceita **ambos** os dialetos; ver
> [§ Anexo A](#anexo-a--layout-concreto-neste-repositório).

## 10. Papel do Codebase-Memory MCP

[CBM-001] Codebase-Memory MCP é um localizador estrutural, não uma fonte de
verdade comportamental.

Use cbm para:

- localizar símbolos;
- descobrir callers e dependências;
- mapear caminhos de chamada;
- analisar impacto;
- obter uma visão arquitetural inicial.

Use Read, Grep, Git e testes diretamente para:

- busca textual exata ou exaustiva;
- contexto integral de arquivos;
- condições linha a linha;
- assertions de testes;
- diffs e histórico;
- confirmação do comportamento.

Nenhuma conclusão comportamental pode ser sustentada somente pelo grafo.

Fluxo obrigatório:

    cbm localiza
    -> arquivos confirmam
    -> testes validam

Se o índice estiver ausente, desatualizado ou incompleto, use as ferramentas
nativas e registre a limitação. A indisponibilidade do cbm não pode impedir uma
tarefa que possa ser concluída pela leitura do repositório.

Operações administrativas como `manage_adr`, `delete_project` ou equivalentes
não devem ser utilizadas por skills sem autorização explícita.

> CBM-001 permanece **política sempre-ativa**, não gate automático: "conclusão
> sustentada somente pelo grafo" não é verificável de forma confiável por análise
> de linguagem. Vira gate apenas se surgir um padrão objetivo de violação.

## 11. Evals obrigatórios

[SG-029] Toda skill validated DEVE possuir:

    evals/evals.json

Cobertura mínima:

- um caso de ativação positiva;
- um caso de não ativação;
- um happy path;
- um edge case;
- um caso de regressão para cada incidente conhecido relevante.

[SG-030] Cada eval deve relacionar as regras que cobre:

    {
      "id": "edge-case-1",
      "type": "contract",
      "rules": ["EX-002"],
      "prompt": "...",
      "expected_output": "...",
      "assertions": [
        "..."
      ]
    }

[SG-031] Assertions mecânicas devem ser verificadas por código sempre que
possível. Julgamento por modelo fica reservado a propriedades qualitativas.

[SG-032] Todo PASS deve incluir evidência concreta. Resultado sem evidência é
FAIL.

[SG-033] Evals devem executar em contexto limpo.

[SG-034] Mudanças comportamentais devem ser comparadas com:

- a versão anterior da skill; ou
- uma execução sem a skill, quando ela ainda não possui baseline.

[SG-035] Gates determinísticos exigem 100% de aprovação.

[SG-036] O limite para avaliações não determinísticas deve ser declarado em
`governance.md`. O padrão é 0.90, sem regressão em regras críticas.

## 12. Validação durante a execução

Toda skill geradora ou modificadora deve aplicar:

    entender
    -> localizar
    -> confirmar
    -> planejar
    -> executar
    -> validar
    -> corrigir
    -> revalidar
    -> reportar evidência

[SG-037] A skill só pode declarar conclusão depois de executar seus validadores.

[SG-038] Um comando não executado não pode ser descrito como aprovado.

[SG-039] Testes ignorados, indisponíveis ou interrompidos devem aparecer como
SKIP ou BLOCKED, nunca PASS.

[SG-040] Falhas devem ser corrigidas e os gates executados novamente.

## 13. Ferramentas, permissões e hooks

[SG-041] `allowed-tools` deve conter apenas permissões necessárias.

[SG-042] `allowed-tools` não deve ser tratado como restrição de segurança. Para
bloqueios determinísticos, use permissões, `disallowed-tools` ou hooks.

[SG-043] CLAUDE.md e o corpo das skills são instruções. Requisitos que não podem
depender da decisão do modelo devem ser implementados em CI ou hooks.

[SG-044] Hooks user-scope devem conter política global autossuficiente e podem
referenciar regras de projeto apenas condicionalmente.

[SG-045] Hooks instalados por ferramentas externas devem possuir um marcador
detectável, por exemplo:

    # CBM-POLICY: structural-locator-v1

## 14. Versionamento

Use versionamento semântico:

- MAJOR: mudança incompatível no contrato, inputs, outputs ou invocação.
- MINOR: nova capacidade ou nova regra compatível.
- PATCH: correção ou esclarecimento sem mudança do contrato.

[SG-046] Mudança em regra, gate ou comportamento deve atualizar a versão.

[SG-047] Mudanças apenas em score ou data de avaliação não alteram a versão.

## 15. Estado de uma skill

Estados permitidos:

- draft: ainda não pode integrar o branch principal no caminho de descoberta;
- validated: todos os gates obrigatórios passam;
- deprecated: permanece apenas para compatibilidade e aponta para substituta.

[SG-048] Apenas o skill-audit pode promover uma skill para validated.

[SG-049] Uma skill deprecated não deve ser invocada automaticamente.

## 16. Definição de concluído

Uma skill é considerada funcional somente quando:

- estrutura e frontmatter são válidos;
- ID e nome são únicos;
- todos os links relativos existem;
- todas as regras possuem gate;
- não existem gates órfãos;
- evals mínimos estão presentes;
- gates determinísticos passam;
- score mínimo é atingido;
- metadata corresponde ao relatório;
- não há ativação automática insegura;
- o self-check do auditor passa;
- o relatório contém evidências.

---

# Anexo A — layout concreto neste repositório

O corpo normativo acima usa `example-skill` e caminhos ilustrativos. Este anexo
fixa os caminhos **reais** deste monorepo para que os links do próprio padrão
não fiquem quebrados (SG-027). É a única tradução permitida: muda o *onde*,
nunca o *quê*.

| Conceito do padrão | Caminho real |
|---|---|
| Fonte canônica da skill | `.claude/skills/<skill>/SKILL.md` |
| Governança da skill | `.claude/skills/<skill>/governance.md` |
| Evals da skill | `.claude/skills/<skill>/evals/evals.json` |
| Ferramenta auditor | `.claude/skills/skill-audit/` (skill + CLI co-localizados) |
| Relatórios | `.claude/skills/skill-audit/reports/<skill>/REPORT.md` |
| Checks estáticos | `.claude/skills/skill-audit/checks/<skill>/` |
| Fixtures do self-check | `.claude/skills/skill-audit/fixtures/` |
| Texto das regras de arquitetura | `.claude/skills/_ARCHITECTURE-CONTRACT.md` (IDs `AC-*`) |
| Vault de governança | `governance/` (coverage, incidentes) |

**Diferença vs. o exemplo do §9:** o exemplo escreve `../../../skill-audit/...`
(que resolveria para a raiz do repo). Aqui o auditor é co-localizado em
`.claude/skills/skill-audit/`, então a partir de um `governance.md` o caminho é
`../skill-audit/...`. Use sempre a forma da tabela acima.

**Dois dialetos de `governance.md` aceitos:**

- *Dialeto-padrão* (§9): `rules: { <ID>: { gates: [...] } }` + bloco `evaluation:`.
- *Dialeto-piloto* (Fase 1): `governs-rules: [...]` + `gates: { <ID>: {...} }` +
  `eval-score-source:`. Mapeia regras `AC-*` do contrato para gates `skill-audit/Gx`.

Ambos satisfazem SG-026..SG-028. O auditor (`governance-check`) normaliza os dois
para a mesma malha regra→gate→target antes de validar.

**IDs estáveis (SG-003).** Os dois pilotos usam o próprio nome como
`governance-skill-id`. O padrão exige um ID desacoplado do nome visível. A
migração (Fase 3) atribui IDs estáveis no formato `SKL-<PREFIXO>` e mantém
compatibilidade reconhecendo o nome-como-id legado durante a transição.
