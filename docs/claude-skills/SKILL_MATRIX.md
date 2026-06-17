# Skill Matrix

| Skill | Atom(s) | Purpose | Invocation Example | Risk Level | Mode |
|---|---|---|---|---|---|
| backend-route-generator | Route, OpenAPI block | Generate Express route file + OpenAPI JSDoc | /backend-route-generator "appointments" | Low | Auto |
| backend-controller-generator | Controller | Generate async controller functions with Zod + factory + handleApiError | /backend-controller-generator "appointments" | Low | Auto |
| backend-service-generator | Service, Factory registration | Generate feature Service class with typed errors and factory wiring | /backend-service-generator "appointments" | Medium | Auto |
| backend-repository-generator | Repository, IRepository | Generate Prisma-backed repository class + interface | /backend-repository-generator "appointments" | Medium | Auto |
| backend-policy-generator | Policy, IPolicy | Generate authorization policy class + interface | /backend-policy-generator "appointments" | Low | Auto |
| backend-dto-generator | DTO, Zod schema, domain model, type guards | Generate DTOs with Zod schemas, inferred types, and isXxxDto guards | /backend-dto-generator "Appointment" | Low | Auto |
| backend-prisma-model-generator | Prisma model, migration | Add new model to schema.prisma and run migration | /backend-prisma-model-generator "Appointment" | High | Manual confirm |
| dynamic-table-preset-generator | DynamicTable preset module, field presets, system preset | Create new ERP module preset with typed fields + system registration | /dynamic-table-preset-generator "Clinica Estetica" | Medium | Auto |
| analytics-kpi-generator | KPI Processor, KPI Template, test | Create KPI processor + template + register in index | /analytics-kpi-generator "Ticket medio por periodo" | Medium | Auto |
| document-processing-generator | Document Extractor, RAG step, status tracking | Add/modify document processing pipeline | /document-processing-generator "csv-extractor" | High | Manual confirm |
| job-generator | Background job, Seed fixture | Create background job or dev seed script | /job-generator "PurgeExpiredProposals" | Medium | Auto |
| frontend-page-generator | Next.js Page, i18n namespace | Create page under my-app/pages/ with auth guard + i18n | /frontend-page-generator "appointments" | Low | Auto |
| frontend-feature-module-generator | Feature module, Category view | Scaffold new feature folder under category-views/ | /frontend-feature-module-generator "appointments" | Medium | Auto |
| frontend-component-generator | React component, Form field, Card | Create typed FC with props interface (delega tabela→table-screen, modal→modal) | /frontend-component-generator "AppointmentCard" | Low | Auto |
| frontend-table-screen-generator | Table screen (GenericTabbedView wrapper) | Tela de listagem com CRUD inline + filtros + paginação reusando o stack canônico | /frontend-table-screen-generator "contacts crmContacts" | Medium | Auto |
| frontend-modal-generator | Modal (detail/edit/confirm/capture) | Modal ancorado em Modal.tsx, padrão modal-não-rota | /frontend-modal-generator "Lead360Modal detail" | Low | Auto |
| frontend-hook-generator | React hook | Create data-fetching or UI state custom hook | /frontend-hook-generator "useAppointments" | Low | Auto |
| frontend-context-provider-generator | Context provider | Create React context + provider + useX hook | /frontend-context-provider-generator "Appointments" | Medium | Auto |
| frontend-widget-generator | Dashboard widget, Chart | Create widget for dashboard grid | /frontend-widget-generator "AppointmentsCalendar" | Medium | Auto |
| frontend-kanban-workflow-generator | Workflow Kanban board (drag-drop + card modal) | Tela de fluxo de trabalho reusando os primitivos do Kanban canônico | /frontend-kanban-workflow-generator "pipeline" | Medium | Auto |
| backend-workflow-transition-generator | Stage transition service (side effects) | Serviço de transição de etapa com efeitos colaterais atômicos (padrão CrmPipelineService) | /backend-workflow-transition-generator "Pipeline" | Medium | Auto |
| frontend-api-service-generator | Frontend API service | Create lib/services/*.service.ts wrapping apiClient | /frontend-api-service-generator "appointments" | Low | Auto |
| frontend-design-system | Design tokens + componentes-assinatura | Aplica a linguagem visual real (lumi-*/neutral, gauge, BANT, gradient header) — usada junto com toda geração de UI | /frontend-design-system "CRM Overview" | Low | Auto |
| fullstack-feature-generator | All layers | Complete vertical slice (Prisma to frontend page) | /fullstack-feature-generator "ActionProposal approval flow" | High | Manual confirm |
| api-contract-sync-generator | Route DTO, Frontend service | Synchronize backend DTO with frontend service types | /api-contract-sync-generator "appointments" | Medium | Auto |
| crud-resource-generator | All backend layers + frontend service | CRUD resource with soft-delete across all layers | /crud-resource-generator "appointments" | High | Manual confirm |
| dashboard-kpi-end-to-end-generator | KPI Processor + Template + Frontend KPI card | Full KPI from backend processor to frontend card | /dashboard-kpi-end-to-end-generator "Ticket medio" | High | Manual confirm |
| **META-AGENTS** | | | | | |
| luminaris-orchestrator | All skills | Analisa tarefa em linguagem natural, seleciona skills e produz plano de execução | /luminaris-orchestrator "criar módulo de agendamentos com KPIs" | Low | Auto |
| luminaris-implementer | All skills | Executa plano do orquestrador consumindo cada skill em ordem, com checks contínuos | /luminaris-implementer [plano] | High | Confirm if plan is High risk |
| luminaris-reviewer | All layers | Valida consistência, padrões de camada, anti-patterns e inter-conexão de todos os artefatos | /luminaris-reviewer | Low | Auto |
