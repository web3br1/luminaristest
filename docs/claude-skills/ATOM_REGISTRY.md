# Atom Registry

| Atom | Layer | Path Pattern | Depends On | Generates | Test Pattern | Skill |
|---|---|---|---|---|---|---|
| Route | backend | server/src/routes/*.ts | Controller | Express Router | – | backend-route-generator |
| Controller | backend | server/src/controllers/*Controller.ts | Service, Zod | Async handlers | – | backend-controller-generator |
| Service | backend | server/src/features/*/services/*Service.ts | Repository, Policy | Business logic class | __tests__/*.test.ts | backend-service-generator |
| Repository | backend | server/src/features/*/repositories/*Repository.ts | Prisma | DB access class | – | backend-repository-generator |
| IRepository | backend | server/src/features/*/repositories/I*Repository.ts | Repository | TypeScript interface | – | backend-repository-generator |
| Policy | backend | server/src/features/*/policies/*Policy.ts | IUser model | Auth rules class | – | backend-policy-generator |
| IPolicy | backend | server/src/features/*/policies/I*Policy.ts | Policy | TypeScript interface | – | backend-policy-generator |
| DTO | backend | server/src/features/*/dtos/*Dto.ts | Zod | Zod schemas + types + guards | – | backend-dto-generator |
| Domain Model | backend | server/src/features/*/models/*.model.ts | – | TypeScript interface/enum | – | backend-dto-generator |
| Zod Schema | backend | server/src/features/*/schemas/*.ts | – | Validation schema | – | backend-dto-generator |
| Prisma Model | backend | server/prisma/schema.prisma | – | DB model + migration | – | backend-prisma-model-generator |
| Factory Registration | backend | server/src/lib/factory.ts | Service, Repo, Policy | Singleton wiring | – | backend-service-generator |
| Job | backend | server/src/jobs/*.ts | Prisma | Scheduled task | – | job-generator |
| DynamicTable Preset Module | domain | server/src/features/dynamicTables/presets/modules/**/*.ts | Field presets | Module object export | – | dynamic-table-preset-generator |
| DynamicTable Field Preset | domain | server/src/features/dynamicTables/presets/fields/**/*.ts | ITableSchema | Field config object | – | dynamic-table-preset-generator |
| DynamicTable System Preset | domain | server/src/features/dynamicTables/presets/systems/*.ts | Module presets | System array export | – | dynamic-table-preset-generator |
| Analytics KPI Processor | domain | server/src/features/analytics/kpis/*/*.KpiProcessor.ts | AnalyticsProcessor | Single-pass processor fn | __tests__/*.test.ts | analytics-kpi-generator |
| Analytics KPI Template | domain | server/src/features/analytics/kpis/*/*.KpiTemplate.ts | KpiProcessor | Template registration object | – | analytics-kpi-generator |
| Analytics Dynamic Processor | domain | server/src/features/analytics/dynamic/processors/*.ts | AnalyticsProcessor | Processor fn | – | analytics-kpi-generator |
| Analytics Dynamic Template | domain | server/src/features/analytics/dynamic/templates/*.ts | DynamicProcessor | Template object | – | analytics-kpi-generator |
| Document Extractor | domain | server/src/lib/vector/extractors/*.ts | pdf-parse/mammoth/exceljs | Extracted text fn | – | document-processing-generator |
| Vector RAG step | domain | server/src/lib/vector/*.ts | Qdrant, OpenAI | Chunking/embedding fn | – | document-processing-generator |
| Chat Service | domain | server/src/features/chat/services/*.ts | Qdrant, OpenAI, DynamicTable | AI conversation service | – | (chat-domain-generator planned) |
| OpenAPI block | backend | server/src/routes/docs.paths.ts | Route | JSDoc @openapi block | – | backend-route-generator |
| Next.js Page | frontend | my-app/pages/**/*.tsx | AuthContext, i18n | Page component + getServerSideProps | – | frontend-page-generator |
| Feature Module | frontend | my-app/features/*/ | Page, Component, Hook, Service | Domain folder structure | – | frontend-feature-module-generator |
| Category View | frontend | my-app/features/dashboard/category-views/*/ | DynamicTable, Hook | View component (dynamic import) | – | frontend-feature-module-generator |
| React Component | frontend | my-app/components/**/*.tsx | – | FC with TypeScript props | – | frontend-component-generator |
| Dashboard Widget | frontend | my-app/components/widgets/**/*.tsx | DashboardGrid, Context | Widget FC | – | frontend-widget-generator |
| React Hook | frontend | my-app/lib/hooks/*.ts or features/*/hooks/*.ts | apiClient | Custom hook | – | frontend-hook-generator |
| Context Provider | frontend | my-app/lib/context/*Context.tsx | React | Context + Provider + useX hook | – | frontend-context-provider-generator |
| Frontend API Service | frontend | my-app/lib/services/*.service.ts | apiClient | API wrapper class | – | frontend-api-service-generator |
| i18n Namespace | frontend | my-app/public/locales/{en,pt}/*.json | next-i18next | Translation JSON | – | frontend-page-generator |
| Modal | frontend | my-app/components/ui/Modal.tsx pattern | – | Modal FC | – | frontend-component-generator |
| Form Field | frontend | my-app/features/dashboard/components/forms/ | – | Form field FC | – | frontend-component-generator |
| Chart | frontend | my-app/features/dashboard/category-views/finance/components/analytics/charts/ | Recharts | Chart FC | – | frontend-widget-generator |
| Seed Fixture | dev | my-app/features/dev/seed/modules/ | DynamicTableService | Seed data generator fn | – | job-generator |
