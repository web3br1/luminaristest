---
type: governance-coverage
phase: 1
generated-by: skill-audit governance-check
last-updated: "2026-06-24"
piloted-skills:
  - dynamic-table-preset-generator
  - backend-workflow-transition-generator
---

# Cobertura de governança — Fase 1 (pilotos)

Mapa **regra → gate → status** das skills já governadas (com `governance.md`). Não é editado à
mão: é a projeção que o `skill-audit governance-check` materializa a cada corrida. Adoção é
incremental — skills sem `governance.md` ainda não aparecem aqui e **não** falham o check.

## Matriz

| Regra | Texto (contrato) | Skill responsável | Gate | Tipo | Status |
|---|---|---|---|---|---|
| `AC-2.1-B1` | Não injetar serviço Prisma first-class no motor | backend-workflow-transition-generator | `skill-audit/G6` | executável (grep) | ✅ coberto |
| `AC-2.1-B2` | Não modelar invariante como linha de DynamicTable | dynamic-table-preset-generator | `luminaris-reviewer/fronteira-2.1` | design-time | ✅ coberto |
| `AC-2.1-B3` | Preset não é persistência de módulo ERP | dynamic-table-preset-generator | `luminaris-reviewer/fronteira-2.1` | design-time | ✅ coberto |
| `AC-2.1-B4` | Não editar DynamicTableService p/ integração | backend-workflow-transition-generator | `luminaris-reviewer/fronteira-2.1` | design-time | ✅ coberto |
| `AC-2.2-2` | `unique` de preset ≠ constraint de DB | dynamic-table-preset-generator | `skill-audit/P6` | design-time | ✅ coberto |
| `AC-2.2-3` | Sem self-relation provada | dynamic-table-preset-generator | `skill-audit/G5` | executável (grep) | ✅ coberto |

Ainda **sem dono governado** (referência §2.1/§2.2 existe, mas nenhuma skill-piloto a reivindica
em `governs-rules` — entra na próxima leva de skills, não é falha na Fase 1):
`AC-2.1-B5` (gêmeo de `AC-2.2-2`), `AC-2.2-1` (money=centavos), `AC-2.2-4` (delete ignora `immutableAfter`).

## A prova de que o modelo pega o drift que nos queimou

`AC-2.1-B1` (a regra que o incidente de 2026-06-24 violou — `PostingService` injetado no motor)
mapeia para `skill-audit/G6`. **G6 não existia até esta sessão.** Rodar o `governance-check`
*antes* do fix teria reportado:

```
RULE_WITHOUT_GATE: AC-2.1-B1 (contrato §2.1) não tem entrada em nenhum governance.md.gates
```

Era exatamente esse o buraco: a regra escrita no contrato, sem verificador. Com G6 + este mapa,
o buraco vira um FAIL objetivo em vez de um esquecimento silencioso.

## Legenda de status

- ✅ **coberto** — regra tem gate; gate existe; alvo do gate encontrado.
- ⚠️ **design-time** — gate é julgamento do reviewer/audit (não mecanizável por grep), mas é um gate nomeado e rastreável.
- ❌ **órfã** — regra sem gate (`RULE_WITHOUT_GATE`). Zero toleradas entre as skills governadas.

Ver incidentes em [`incidents/`](./incidents/); o registro fundador é
[`incidents/2026-06-24-prisma-service-into-dynamictable-engine.md`](./incidents/2026-06-24-prisma-service-into-dynamictable-engine.md).
