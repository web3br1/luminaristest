---
schema_version: 1
type: skill-governance
governance-skill-id: SKL-CHAT-DOMAIN
skill_path: ./SKILL.md
status: validated
owner: engineering
criticality: high
evaluation:
  report: ../skill-audit/reports/chat-domain-generator/REPORT.md
  last_evaluated: 2026-06-25
  score: 1.00
  minimum_score: 0.90
rules:
  CHAT-001:
    gates:
      - type: eval
        target: ./evals/evals.json#happy-1
      - type: eval
        target: ./evals/evals.json#regression-1
  CHAT-002:
    gates:
      - type: eval
        target: ./evals/evals.json#happy-1
  CHAT-003:
    gates:
      - type: eval
        target: ./evals/evals.json#happy-1
  CHAT-004:
    gates:
      - type: eval
        target: ./evals/evals.json#happy-1
  CHAT-005:
    gates:
      - type: eval
        target: ./evals/evals.json#edge-1
  CHAT-006:
    gates:
      - type: eval
        target: ./evals/evals.json#edge-1
  CHAT-007:
    gates:
      - type: eval
        target: ./evals/evals.json#regression-1
  CHAT-008:
    gates:
      - type: eval
        target: ./evals/evals.json#happy-1
  CHAT-009:
    gates:
      - type: eval
        target: ./evals/evals.json#regression-1
  CHAT-010:
    gates:
      - type: eval
        target: ./evals/evals.json#happy-1
---

# Governança — `chat-domain-generator`

| Camada | Fonte canônica |
|---|---|
| Texto das **regras** | `SKILL.md` (IDs `CHAT-*` inline no checklist) |
| Relação **regra→gate** | este arquivo (`rules:` no frontmatter) |
| Coerência | `skill-audit governance-check` |
| Evidência de execução | `evals/evals.json` + `../skill-audit/reports/chat-domain-generator/REPORT.md` |

Regras normativas do **domínio de chat / agente AI** (`LuminarisAgentService` + `ChatService` + `KnowledgeGraphService`),
cada uma coberta por ao menos um caso de eval comportamental:

- `CHAT-001` — ação de ESCRITA em `handleToolCall` cria `ActionProposal` (`status: 'PENDING'`) e retorna `{ status: 'PROPOSED', proposalId }`; nunca escreve direto no banco.
- `CHAT-002` — ação de LEITURA retorna `{ status: 'OK', result }` direto; nunca `ACTION_PROPOSAL`.
- `CHAT-003` — toda tool tem entry em `getTools()` (snake_case) **e** case em `handleToolCall()`.
- `CHAT-004` — resolve tabelas por `internalName`/`getTableById` escopado ao `userId`, nunca por posição `[0]`.
- `CHAT-005` — isolamento de tenant no RAG (segurança): ownership check antes do Qdrant + `vectorRepository.search(..., documentIds, user.id)`.
- `CHAT-006` — não confundir modos: RAG só quando `documentIds.length > 0`; AGENT é o default.
- `CHAT-007` — loop de tool calls limitado a 5 (`while (iterations < 5)`); não aumentar.
- `CHAT-008` — nova dep de service injetada via factory no construtor do `LuminarisAgentService`; nunca `new Service()` dentro do agente.
- `CHAT-009` — ação que toca módulo Prisma first-class (contábil/folha/fiscal) vai pela API própria do módulo; nunca `prisma.*`/`PostingService` cravado no handler (§2.1-B).
- `CHAT-010` — DOMAIN-BOUNDARY: serviços de chat são camada de servidor pura — sem React/JSX/hooks (apresentação) e sem `Request`/`Response`/`res.json` (transporte); pedido puramente visual não é esta skill.

Status `validated`: avaliado em 2026-06-25 (score 1.00 — ver `REPORT.md`). `governance-eval-score`/
`governance-last-evaluated` no frontmatter da skill são **projeção** do `REPORT.md` (SG-011) — materializados na
promoção a `validated` pelo skill-audit (SG-048).
