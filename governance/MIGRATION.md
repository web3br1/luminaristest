---
document_id: SKILL-GOV-002
title: Instrução de migração e auditoria das skills
version: "1.0.0"
status: active
applies-to: governance/SKILLS_STANDARD.md
---

# Migração e validação das skills segundo o padrão

Objetivo: migrar e validar todas as skills deste repositório segundo
`SKILLS_STANDARD.md`, preservando o comportamento correto existente e eliminando
ambiguidades entre contrato, gates, evals e fontes de evidência.

## Restrições obrigatórias

1. Não introduza codegen `src -> generated`.
2. `.claude/skills/<nome>/SKILL.md` continua sendo a fonte canônica.
3. Não adicione Obsidian MCP como dependência de runtime.
4. Preserve `[[wikilinks]]` apenas em documentos de governança; use links
   Markdown relativos nos arquivos executáveis.
5. Aplique CBM-001: cbm localiza estrutura; arquivos e testes confirmam.
6. Não altere scores, datas ou status manualmente sem relatório correspondente.
7. Não declare PASS para verificações não executadas.
8. Não enfraqueça testes existentes para obter aprovação.
9. Não remova uma regra sem verificar seus gates, evals, incidentes e dependentes.
10. Não edite o hook user-scope, exceto se a tarefa mencionar explicitamente
    sua manutenção.

## Fases

### FASE 1 — Inventário somente leitura

- Liste todas as skills encontradas.
- Registre nome, path, skill ID, status, versão, quantidade de regras, gates,
  evals, links quebrados e possíveis colisões.
- Identifique skills pessoais ou de plugins que possam sobrescrever nomes de
  projeto, quando essa informação estiver disponível.
- Produza uma matriz de gaps antes de editar qualquer skill.

### FASE 2 — Fortalecer o auditor

- Implemente validação de estrutura e frontmatter.
- Implemente extração de IDs normativos.
- Implemente regra ↔ gate ↔ target.
- Implemente verificação de referências.
- Implemente cobertura de evals.
- Implemente comparação de metadata com relatório.
- Implemente fixtures válidas e inválidas.
- Faça o self-check passar antes da migração em massa.

### FASE 3 — Migrar skill por skill

Para cada skill:

1. Preserve uma baseline da versão atual.
2. Normalize nome, diretório e frontmatter.
3. Atribua governance-skill-id estável.
4. Torne a description específica e testável.
5. Separe instruções essenciais de referências extensas.
6. Adicione IDs somente às regras normativas.
7. Crie ou atualize governance.md.
8. Mapeie cada regra a pelo menos um gate real.
9. Crie evals positivos, negativos, happy path, edge case e regressões.
10. Execute os gates.
11. Compare com a baseline.
12. Corrija regressões.
13. Atualize metadata a partir do relatório.
14. Promova para validated somente após PASS integral.

### FASE 4 — Integração

- Execute o audit completo.
- Gere o mapa de cobertura.
- Execute o self-check.
- Confirme que nenhuma skill depende do Obsidian em runtime.
- Confirme que nenhuma conclusão comportamental dos relatórios depende somente
  do cbm.
- Confirme que skills com efeitos colaterais não são invocáveis pelo modelo.
- Confirme que não existem regras sem gate nem gates sem regra.

## Contrato do `skill-audit` (comandos)

Os nomes podem ser adaptados à CLI existente, mas estes comportamentos devem existir:

    skill-audit validate          # estrutura, frontmatter, nomes, IDs, referências
    skill-audit governance-check  # regra ↔ gate ↔ target ↔ eval
    skill-audit eval --changed    # evals das skills alteradas e dependentes
    skill-audit coverage --check  # gera e verifica o mapa global de cobertura
    skill-audit sync-metadata --check  # score/data/status do SKILL.md refletem o relatório
    skill-audit self-check        # prova que o auditor detecta fixtures inválidas
    skill-audit run --all         # suíte completa

### Códigos mínimos de falha

    INVALID_SKILL_STRUCTURE
    INVALID_FRONTMATTER
    NAME_DIRECTORY_MISMATCH
    DUPLICATE_SKILL_NAME
    DUPLICATE_SKILL_ID
    BROKEN_REFERENCE
    SKILL_TOO_LARGE
    RULE_WITHOUT_GATE
    GATE_WITHOUT_RULE
    GATE_TARGET_NOT_FOUND
    RULE_WITHOUT_EVAL_COVERAGE
    MISSING_TRIGGER_EVAL
    UNSAFE_AUTO_INVOCATION
    EVAL_FAILED
    EVAL_BELOW_THRESHOLD
    STALE_EVALUATION
    METADATA_REPORT_MISMATCH
    AUDITOR_SELF_CHECK_FAILED

> O auditor **não** tenta detectar CBM-001 por análise de linguagem — permanece
> política sempre-ativa, vira gate só se surgir um padrão objetivo de violação.

### Self-check do auditor

Para cada código de falha deve existir uma fixture intencionalmente quebrada em
`.claude/skills/skill-audit/fixtures/`. O self-check prova:

1. A fixture válida passa.
2. Cada fixture inválida falha pelo código esperado.

Um erro interno, teste não executado ou fixture ausente não pode resultar em PASS.

## Pipeline de CI

```bash
set -euo pipefail
skill-audit validate
skill-audit governance-check
skill-audit coverage --check
skill-audit sync-metadata --check
skill-audit eval --changed
skill-audit self-check
```

Branch principal: `skill-audit run --all`.

O CI deve falhar também quando: um comando obrigatório não puder ser executado;
uma dependência do audit estiver ausente; o relatório estiver desatualizado; uma
skill `draft` estiver no path de descoberta; existirem alterações não
materializadas no mapa de cobertura.

## Entrega final

1. Tabela de todas as skills e resultado PASS/FAIL/BLOCKED.
2. Lista exata de arquivos alterados.
3. Regras adicionadas, removidas ou semanticamente modificadas.
4. Gates e evals criados.
5. Falhas ainda existentes, com evidência.
6. Checks executados e respectivos exit codes.
7. Nenhuma alegação de sucesso sem saída verificável.
