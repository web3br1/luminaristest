---
type: governance-incident
date: "2026-06-24"
severity: high
rules-violated:
  - AC-2.1-B1
detected-by: manual-review (pre-merge)
status: resolved
related-skills:
  - backend-workflow-transition-generator
  - backend-service-generator
  - luminaris-orchestrator
related-memory: dynamictable-vs-prisma-boundary
---

# Incidente — `PostingService` injetado no motor DynamicTable

## O que aconteceu

Um plano de integração Vendas → Contabilidade tentou fazer o `PostingService` (serviço Prisma
first-class, com invariante `Σdébito = Σcrédito`) se comunicar com o motor DynamicTable
**injetando-o via `RuleContext`** dentro do plugin engine (`accountingSync.ts` + `postingService?`
em `RuleTypes.ts`). Pego em revisão antes do merge e revertido.

## Por que é grave

Acopla um serviço de domínio (com invariante de banco) ao motor genérico de tabelas. **Todo
módulo ERP futuro** (Folha, Fiscal, RH) herdaria esse acoplamento — a integração viraria
responsabilidade do lugar errado (o motor de plugins), e não do nível de aplicação.

## Regra que cobre (hoje)

`AC-2.1-B1` — *NUNCA injete um serviço Prisma first-class dentro de `DynamicTableService`,
`RuleContext` ou qualquer `RulePlugin`.*

## A lição estrutural (motivou a camada de governança)

A regra **não existia com gate** quando o incidente aconteceu. O §2.1 foi escrito como reação,
mas metade dele (routing/injeção) ficou sem verificador — **a regra e o que a faz cumprir
driftaram em silêncio.** Esse é o problema que a Fase 1 de governança ataca:

- `AC-2.1-B1` agora tem gate executável `skill-audit/G6` (`grep dynamicTables/** por PostingService == vazio`);
- a malha regra→gate vive em `governance.md` por skill, verificada por `skill-audit governance-check`;
- `RULE_WITHOUT_GATE` torna impossível uma regra nova nascer órfã de novo.

## Correção aplicada (sessão 2026-06-24)

1. Revertido o design errado (`accountingSync.ts` + teste deletados; `postingService?` removido de `RuleTypes`).
2. `findEntryBySource` mantido em `PostingService` (útil, independe de onde a integração vive).
3. §2.1 + §2.2 codificados no contrato com IDs estáveis.
4. STOP §2.1 + anti-patterns nas 5 skills da fronteira; gate §2.1 no orquestrador; G6 no skill-audit.
5. Camada de governança Fase 1 (este vault) iniciada nos 2 pilotos.

A integração Vendas → Contabilidade **continua pendente** — mas agora só pode nascer no lugar
certo (controller/serviço de integração), com a trava no caminho.
