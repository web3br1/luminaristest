# skill-audit — STATE (ledger do loop)

last_run: 2026-06-22 (master) — sweep 34/34 COMPLETO
clones_baseline: 2   # formatters island + FinanceService gêmeo — já triados (ver triaged_drift)

# --- fila do modo --sweep (todas done) ---
sweep_queue:
  # backend
  - backend-dto-generator: done
  - backend-repository-generator: done
  - backend-policy-generator: done
  - backend-service-generator: done
  - backend-controller-generator: done
  - backend-route-generator: done
  - backend-prisma-model-generator: done
  - backend-workflow-transition-generator: done
  - backend-test-suite-generator: done
  - crud-resource-generator: done
  - api-contract-sync-generator: done
  # frontend
  - frontend-api-service-generator: done
  - frontend-context-provider-generator: done
  - frontend-page-generator: done
  - frontend-modal-generator: done
  - frontend-component-generator: done
  - frontend-widget-generator: done
  - frontend-table-screen-generator: done
  - frontend-kanban-workflow-generator: done
  - frontend-hook-generator: done
  - frontend-feature-module-generator: done
  - frontend-design-system: done
  - dashboard-kpi-end-to-end-generator: done
  # domínio
  - analytics-kpi-generator: done
  - dynamic-table-preset-generator: done
  - document-processing-generator: done
  - interview-setup-generator: done
  - structured-data-generator: done
  - chat-domain-generator: done
  - job-generator: done
  # fullstack + agentes
  - fullstack-feature-generator: done
  - luminaris-orchestrator: done
  - luminaris-implementer: done
  - luminaris-reviewer: done

verdicts:              # STATUS de 1 palavra — detalhe estruturado em REPORT.md
  - backend-dto-generator: PASS   # era PASS-NOTE; patch :85 aplicado
  - backend-repository-generator: PASS
  - backend-policy-generator: PASS
  - backend-service-generator: PASS
  - backend-controller-generator: PASS
  - backend-route-generator: PASS
  - backend-prisma-model-generator: PASS
  - backend-workflow-transition-generator: PASS
  - backend-test-suite-generator: PASS
  - crud-resource-generator: PASS
  - api-contract-sync-generator: PASS
  - frontend-api-service-generator: PASS
  - frontend-context-provider-generator: PASS
  - frontend-page-generator: PASS   # era PASS-NOTE; numeração corrigida
  - frontend-modal-generator: PASS
  - frontend-component-generator: PASS
  - frontend-widget-generator: PASS
  - frontend-table-screen-generator: PASS
  - frontend-kanban-workflow-generator: PASS   # era FAIL; pipeline.tsx repontado p/ CrmPipelineBoard
  - frontend-hook-generator: PASS
  - frontend-feature-module-generator: PASS   # era PASS-NOTE; :73 repontado
  - frontend-design-system: PASS
  - dashboard-kpi-end-to-end-generator: PASS
  - analytics-kpi-generator: PASS
  - dynamic-table-preset-generator: PASS
  - document-processing-generator: PASS
  - interview-setup-generator: PASS
  - structured-data-generator: PASS
  - chat-domain-generator: PASS
  - job-generator: PASS
  - fullstack-feature-generator: PASS
  - luminaris-orchestrator: PASS
  - luminaris-implementer: PASS   # era PASS-NOTE; :137 path completo
  - luminaris-reviewer: PASS   # era FAIL; anti-exemplo pipeline.tsx + golden refs corrigidos

# --- modo incremental (manutenção contínua) ---
verified_ok: []   # próxima corrida incremental só re-checa skill cujo arquivo mudar
triaged_drift:
  - formatters island (formatTimestamp ×3 + FinanceService gêmeo): aceito — virou Patch 1/2/3 da sessão de revisão
  - chat hooks bypass service layer: aceito — virou Patch 4
  - rejeitado over-read: orchestrator:24 / implementer:37 cadeia users — shorthand correto, NÃO é defeito
