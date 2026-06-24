# Skill-Audit Sweep — Report

## Sweep Report — 34/34 · run 2026-06-22 (master)

### Placar
| Verdict | auditoria | pós-patch |
|---|---|---|
| PASS | 28 | **34** |
| PASS-NOTE | 4 | 0 |
| FAIL | 2 | 0 |

> **Pós-patch (2026-06-22):** os 7 patches foram aplicados. Os 2 FAIL (kanban-workflow, reviewer) e os 4 PASS-NOTE (dto, page, feature-module, implementer) estão resolvidos → 34/34 PASS. Detalhe abaixo é o registro da auditoria (o que foi encontrado).

### Por camada
| Camada | PASS | NOTE | FAIL |
|---|---|---|---|
| backend (11) | 10 | 1 | 0 |
| frontend (12) | 9 | 2 | 1 |
| domínio (7) | 7 | 0 | 0 |
| fullstack (1) | 1 | 0 | 0 |
| agentes (3) | 1 | 1 | 1 |

### Patches propostos (ordenado por Sev × blast radius)
| # | Sev | Skill | arquivo:linha | Patch | Aprovado? |
|---|---|---|---|---|---|
| 1 | med | frontend-kanban-workflow-generator | `SKILL.md:40,45,55` | `pages/crm/pipeline.tsx` não é mais "board estático" — foi remediado para wrapper de `CrmPipelineBoard`. Repontar golden ref/inspect-first e o "preserve a lógica" para `features/crm/components/CrmPipelineBoard.tsx` + `hooks/useCrmPipelineBoard.ts`; marcar o board estático como "já deletado" | ✅ aplicado |
| 2 | med | luminaris-reviewer | `SKILL.md:245,257` | Mesma raiz: `pages/crm/pipeline.tsx` citado como anti-exemplo "board estático bespoke" já está remediado. Trocar por referência histórica ou remover; manter só `RecordTable.tsx` como morto | ✅ aplicado |
| 3 | low | frontend-feature-module-generator | `SKILL.md:73` | "Referência da correção: `pages/crm/pipeline.tsx`" — a lógica migrou; repontar para `useCrmPipelineBoard.ts`/`CrmPipelineBoard.tsx` | ✅ aplicado |
| 4 | low | backend-dto-generator | `SKILL.md:85` | "Update schema: todos os campos `.optional()`" atrita com `.partial()` (:26/:135); reescrever para `Create<Resource>Schema.partial()` | ✅ aplicado |
| 5 | low | frontend-page-generator | `SKILL.md:58-62` | Numeração duplicada (`9`/`9`/`9b`/`10`); renumerar sequencial | ✅ aplicado |
| 6 | low | luminaris-implementer | `SKILL.md:137` | Reuse cita `GenericTable.tsx`/`GenericRow.tsx`/`RowActionsCell.tsx` por filename solto; usar path completo `features/dashboard/category-views/shared/components/…` (a própria skill proíbe import inventado) | ✅ aplicado |
| 7 | low | luminaris-reviewer | `SKILL.md:251,274` | Golden refs `KanbanCardDetailModal`/`ConfirmDeleteModal` por filename solto; anexar path completo | ✅ aplicado |

### Findings REJEITADOS na verificação (evidência-ou-silêncio)
| Skill | arquivo:linha | Claim do agente | Por que rejeitado |
|---|---|---|---|
| luminaris-orchestrator | `SKILL.md:24` | cadeia `users` poria controller/route dentro da feature (med) | over-read: é shorthand; a skill lista corretamente só dtos/services/repos/policies como internos da feature |
| luminaris-implementer | `SKILL.md:37` | idem | over-read: `implementer:40` separa explicitamente o que é interno da feature (sem controller/route). Cadeia é shorthand, não defeito |

### Uma linha por achado
- [kanban-workflow + reviewer + feature-module] anti-exemplo `pages/crm/pipeline.tsx` virou wrapper canônico → repontar p/ `CrmPipelineBoard` (raiz de 3 patches)
- [backend-dto] instrução :85 atrita com `.partial()` (:26/:135) → afia a skill
- [frontend-page] numeração `9/9/9b/10` duplicada → cosmético
- [implementer + reviewer] golden refs por filename solto → anexar path completo

---

## Tema dominante (o que a varredura ensina)
**1 causa-raiz, 3 skills.** `pages/crm/pipeline.tsx` foi remediado de board estático (anti-exemplo histórico) para um wrapper fino do canônico `CrmPipelineBoard`. Três skills congelaram o estado antigo: `kanban-workflow` e `reviewer` ainda o tratam como anti-exemplo vivo a inspecionar; `feature-module` ainda o cita como "fonte da lógica de correção" que migrou para `useCrmPipelineBoard.ts`. Um gerador/revisor que abra o path hoje vê código canônico onde a skill diz haver bespoke. **É exatamente o gate P2 funcionando: anti-exemplo que ressuscitou (corrigido) sem a skill saber.**

---

## Detalhe — skills com finding

### frontend-kanban-workflow-generator · camada: frontend · verdict: FAIL · 2026-06-22
| Check | Status | Evidência |
|---|---|---|
| P1 golden refs vivos | PASS | `InternalKanbanView`, `KanbanColumn`, `KanbanCardDetailModal`, `useKanbanLogic`, `CrmPipelineBoard`, `useCrmPipelineBoard` todos vivos |
| P2 anti-exemplos mortos | **FAIL** | `pages/crm/pipeline.tsx` (SKILL.md:40) citado como "board estático — veja o que falta"; o arquivo (47 linhas) hoje `dynamic()`-importa `CrmPipelineBoard` — verificado em `pages/crm/pipeline.tsx:19-31` |
| P3 shape = canônico atual | PASS | contrato manda reuse InternalKanbanView + CrmPipelineBoard — bate com canônico vivo |
| P4 sem clone SIMILAR_TO | PASS | 0 arestas em category-views/kanban |
| P5 higiene de contrato | PASS | referencia §0 + `_REUSE-CRITERION`; cita tsc |

Findings:
| # | Sev | arquivo:linha | Problema | Patch proposto |
|---|---|---|---|---|
| 1 | med | `SKILL.md:40,45` | ponteiro stale: `pipeline.tsx` como anti-exemplo "board estático" a inspecionar | repontar golden ref → `CrmPipelineBoard.tsx`; remover `pipeline.tsx` do "inspect first" |
| 2 | med | `SKILL.md:55` | "preserve a lógica que já existe em `pipeline.tsx`" — a lógica (seletor/default) migrou para `useCrmPipelineBoard.ts` | repontar para `useCrmPipelineBoard.ts` |

### luminaris-reviewer · camada: agente · verdict: FAIL · 2026-06-22
| Check | Status | Evidência |
|---|---|---|
| P1 golden refs vivos | PASS | slice `users`, `CrmPipelineService`, `GenericTabbedView`, `InternalKanbanView`, `Modal`, `CrmPipelineBoard`/`Lead360Modal`/`CrmTableScreen`/`ProposalCaptureModal` todos vivos |
| P2 anti-exemplos mortos | **FAIL** | `RecordTable.tsx` morto ✓ (só docs); mas `pages/crm/pipeline.tsx` (:245,:257) citado como "board estático bespoke" está remediado para wrapper de `CrmPipelineBoard` |
| P3 referências corretas | PASS | `_ARCHITECTURE-CONTRACT`/`_REUSE-CRITERION` e skills referenciadas existem |
| P4 sem clone | N/A | não gera código |
| P5 higiene de contrato | PASS | "contrato prevalece"; aplica reuse-criterion; cita tsc |

Findings:
| # | Sev | arquivo:linha | Problema | Patch proposto |
|---|---|---|---|---|
| 1 | med | `SKILL.md:245,257` | anti-exemplo `pipeline.tsx` obsoleto (já remediado) — engana o revisor a procurar bespoke onde não há | trocar por referência histórica; manter só `RecordTable.tsx` como morto |
| 2 | low | `SKILL.md:251,274` | golden refs `KanbanCardDetailModal`/`ConfirmDeleteModal` sem path completo | anexar path |

### backend-dto-generator · camada: DTO · verdict: PASS-NOTE · 2026-06-22
| Check | Status | Evidência |
|---|---|---|
| P1 golden refs vivos | PASS | `ChatInstanceDto.ts:63` `.partial()` exato; `UserDto.ts:48-68` redefine à mão (ressalva confere) |
| P2 anti-exemplos mortos | N/A | sem anti-exemplo de arquivo |
| P3 shape = canônico atual | PASS | forma ensinada = `ChatInstanceDto` vivo |
| P4 sem clone SIMILAR_TO | PASS | `SIMILAR_TO ≥0.9` em `dtos/` → 0 |
| P5 higiene de contrato | NOTE | referencia §0 sem repetir; nit `:85` vs `:26/:135` |

Findings:
| # | Sev | arquivo:linha | Problema | Patch proposto |
|---|---|---|---|---|
| 1 | low | `SKILL.md:85` | "todos os campos `.optional()`" pode ser lido como redefinir à mão (proibido em :135) | reescrever :85 → `Create<Resource>Schema.partial()` |

### frontend-page-generator · camada: Page · verdict: PASS-NOTE · 2026-06-22
| Check | Status | Evidência |
|---|---|---|
| P1 golden refs vivos | PASS | `dashboard/index.tsx`, `users/index.tsx`, `withAuth.tsx`, `LoadingSpinner`, `AuthContext` vivos |
| P2 anti-exemplos mortos | N/A | anti-exemplos CRM são vivos por design (contraexemplo) |
| P3 shape = canônico atual | PASS | SSR+i18n+`dynamic(ssr:false)`+modal-não-rota = padrão de `dashboard/index.tsx` |
| P4 sem clone SIMILAR_TO | PASS | pares em pages são boilerplate sancionado; o real (`CrmAnalyticsInner`↔`MeetingsInner`) vive em `pages/crm/*` já marcado anti-exemplo |
| P5 higiene de contrato | PASS | referencia contrato; cita tsc + next lint |

Findings:
| # | Sev | arquivo:linha | Problema | Patch proposto |
|---|---|---|---|---|
| 1 | low | `SKILL.md:58-62` | numeração duplicada `9/9/9b/10` | renumerar sequencial |

### frontend-feature-module-generator · camada: frontend · verdict: PASS-NOTE · 2026-06-22
| Check | Status | Evidência |
|---|---|---|
| P1 golden refs vivos | PASS | `GenericTabbedView`, `StandardPagination`, `FinanceView`, `AnalyticsDashboard`, `leads/` (legacy) vivos |
| P2 anti-exemplos mortos | PASS | `RecordTable`/`CrmKpiCard`/`CrmBarChart` só em docs |
| P3 shape = canônico atual | PASS | reuse GenericTabbedView/AnalyticsDashboard — vivos |
| P4 sem clone SIMILAR_TO | PASS | 0 em category-views/shared |
| P5 higiene de contrato | NOTE | mesmo ponteiro stale de `pipeline.tsx` |

Findings:
| # | Sev | arquivo:linha | Problema | Patch proposto |
|---|---|---|---|---|
| 1 | low | `SKILL.md:73` | "Referência da correção: `pages/crm/pipeline.tsx`" — lógica migrou | repontar para `useCrmPipelineBoard.ts` |

### luminaris-implementer · camada: agente · verdict: PASS-NOTE · 2026-06-22
*(agente reportou FAIL; rebaixado para PASS-NOTE após verificação — o finding med de path do slice `users` foi rejeitado como over-read; resta só o nit low de filename solto)*
| Check | Status | Evidência |
|---|---|---|
| P1 golden refs vivos | PASS | RevenueKpiProcessor, DataSanitizer, kpis/index, LeadsModule, LuminarisAgentService, GenericTabbedView etc. todos vivos. Cadeia `users` é shorthand correto (verificado :40) |
| P2 anti-exemplos mortos | N/A | — |
| P3 referências corretas | PASS | contrato + skills referenciadas existem |
| P4 sem clone | N/A | executa skills, não gera |
| P5 higiene de contrato | PASS | lê contrato como gate; cadeia coerente |

Findings:
| # | Sev | arquivo:linha | Problema | Patch proposto |
|---|---|---|---|---|
| 1 | low | `SKILL.md:137` | reuse cita `GenericTable.tsx`/`GenericRow.tsx`/`RowActionsCell.tsx` por filename solto | usar path completo `features/dashboard/category-views/shared/components/…` |

---

## Roster PASS (28) — P1–P5 limpos
| Skill | Camada | Nota |
|---|---|---|
| backend-repository-generator | Repository | anti-exemplo "não espelhe UserRepository (hard-delete)" confirmado real |
| backend-policy-generator | Policy | `UserPolicy` vivo; 0 clones em policies |
| backend-service-generator | Service | `UserService`/`CrmPipelineService` vivos; clones só frontend (já triados) |
| backend-controller-generator | Controller | `chatInstancesController` vivo; jaccard alto = thin-controller sancionado |
| backend-route-generator | Route | 4-toques (route+index+protectedApiPaths+OpenAPI) batem com `users` |
| backend-prisma-model-generator | Prisma | `DynamicTable`/`DynamicTableData` vivos; 0 clones em schema |
| backend-workflow-transition-generator | Workflow Svc | `CrmPipelineService.advanceStage` vivo; factory 180/229/259 |
| backend-test-suite-generator | Test | 7 golden suites vivas no source |
| crud-resource-generator | composta | slice `users` vivo; anti-exemplos só docs; sequência = GENERATION_CONTRACTS |
| api-contract-sync-generator | DTO↔svc | par `UserDto`↔`user.service.ts` vivo; cita só `my-app tsc` (correto p/ frontend-only) |
| fullstack-feature-generator | composta | slice + 9 sub-skills batem com GENERATION_CONTRACTS |
| frontend-api-service-generator | Frontend Service | services vivos; `updateRecord`↔`updateView` não é clone de canônico |
| frontend-context-provider-generator | Context | 4 contexts vivos (`useAuth` fan-in 20) |
| frontend-modal-generator | frontend | `Modal`/`Lead360Modal`/`ProposalCaptureModal`/`ConfirmDeleteModal` vivos |
| frontend-component-generator | Component | `RecordTable` morto ✓; reusa GenericTable/Modal |
| frontend-widget-generator | frontend | ChartRenderer/DashboardKpiCard/GoldKpiWidgetView vivos; anti-ex só docs |
| frontend-table-screen-generator | frontend | `GenericTabbedView`/`CrmTableScreen` vivos; `RecordTable` morto ✓ |
| frontend-hook-generator | Hook | `crmFetch`/`useCrmData` vivos; pares CRM fora do escopo |
| frontend-design-system | frontend | kit `crm/components/ui/` vivo; anti-padrões são regras (zinc), não arquivos |
| dashboard-kpi-end-to-end-generator | fullstack | cadeia processor→KpiCard→ChartRenderer viva |
| analytics-kpi-generator | analytics | `RevenueKpiProcessor` in_degree 4; 0 clones |
| dynamic-table-preset-generator | dynamicTables | LeadsModule/CrmContactsModule vivos |
| document-processing-generator | documents | `DocumentProcessingPipeline` in_degree 2; risco HIGH + confirmação |
| interview-setup-generator | interview | InterviewService/CustomizationService/FieldCustomizationService vivos |
| structured-data-generator | structuredData | `StructuredDataService` in_degree 5 |
| chat-domain-generator | chat | `LuminarisAgentService`/`ChatService`/`KnowledgeGraphService` vivos |
| job-generator | jobs | `PurgeDeletedRecords`/`seed-crm-demo` vivos |
| luminaris-orchestrator | agente | refs corretas; finding de path rejeitado (shorthand) |

## Nota de tooling
O parser Cypher do cbm rejeita `<>`, e alguns agentes reportaram rejeição de `>=`/`<` em certas posições — contorno: filtro `CONTAINS` no `file_path` + `same_file = false` + `ORDER BY`, sem threshold inline. Vale embutir isso no SKILL.md do skill-audit como dica de query.
