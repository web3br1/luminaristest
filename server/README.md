# Luminaris Server

The **Express + TypeScript** backend of the Luminaris platform: JWT authentication, Prisma ORM, a
**feature-based** layered architecture. To understand **how the backend is assembled** (layering,
factory/DI, middleware, error pattern, how to add a feature), read **[`ARCHITECTURE.md`](./ARCHITECTURE.md)**.

---

## 🚀 Quick start

```bash
cd server
npm install
npm run dev        # development (hot reload)
npm run build && npm start   # production
npm test           # tests (unit + integration) — see TESTING.md
```

> **Tests:** full strategy, tools and structure in [`TESTING.md`](./TESTING.md).

### Environment variables
Loaded by `src/config/env.ts` (from `server/.env` or the root). Main ones:

| Variable | Use |
|---|---|
| `DATABASE_URL` | Prisma connection (e.g. `file:./dev.db` for SQLite) |
| `JWT_SECRET` | token signing (change it in production — required, the app refuses to start without it in prod) |
| `NODE_ENV` | `development` / `production` |
| `OPENAI_API_KEY` | AI features (chat, documents) |
| `QDRANT_URL` / `QDRANT_API_KEY` | vector store (document RAG) |
| `REDIS_URL` | cache/queues (when applicable) |
| `PORT` | server port (default 3001) |

---

## 🛠️ Stack

Express.js · TypeScript · Prisma · SQLite · JWT · bcryptjs · Zod · Helmet · CORS · Compression ·
OpenAI · Qdrant (vectors). Tests: Jest · ts-jest · supertest.

---

## 📁 Structure (summary)

```
server/
├── ARCHITECTURE.md        # detailed architecture (start here)
├── TESTING.md             # testing strategy, tools and structure
├── prisma/                # schema.prisma, migrations, dev.db
└── src/
    ├── app.ts             # createApp(): builds the Express app (no listen)
    ├── server.ts          # bootstrap (listen + external-infra init)
    ├── config/            # env
    ├── database/          # PrismaClient singleton
    ├── controllers/       # HTTP adapters per feature
    ├── routes/            # routing (index aggregates the sub-routers)
    ├── middleware/        # auth (JWT + protected paths, fail-closed)
    ├── lib/               # cross-cutting: factory(DI), errors, logger, jwt, apiUtils, ...
    └── features/          # one directory per domain (see the index below)
```

> The full structure and each layer's contract are in [`ARCHITECTURE.md`](./ARCHITECTURE.md).

---

## 🧩 Features

| Feature | Role | Doc |
|---|---|---|
| `users` | Users, roles, profile | [README](./src/features/users/README.md) |
| `dynamicTables` | Dynamic tables + declarative governance + presets | [README + docs/](./src/features/dynamicTables/README.md) |
| `analytics` | KPIs/charts over the user's tables | [README](./src/features/analytics/README.md) |
| `chat` | AI response (RAG and Agent ERP modes) | [README](./src/features/chat/README.md) |
| `chatInstances` | Chat instances per widget | [README](./src/features/chatInstances/README.md) |
| `chatMessages` | Message persistence (CRUD) | [README](./src/features/chatMessages/README.md) |
| `documents` | Document upload/processing/search (RAG) | [README](./src/features/documents/README.md) |
| `structuredData` | Structured data extracted from documents | [README](./src/features/structuredData/README.md) |
| `dashboardLayout` | Dashboard layouts (upsert per user) | [README](./src/features/dashboardLayout/README.md) |
| `reports` | Report/chart data | [README](./src/features/reports/README.md) |
| `interview` | Guided customization | [READMEs](./src/features/interview/) |

---

## 📡 Endpoints

Routes are mounted in `src/routes/index.ts`, one sub-route per feature (`/api/auth`, `/api/users`,
`/api/documents`, `/api/chat`, `/api/dashboard`, `/api/dynamic-tables`, ...). Each feature documents
its endpoints in its own README. Auth via `Authorization: Bearer <jwt>` (see
[`ARCHITECTURE.md` §3](./ARCHITECTURE.md)). Health check: `GET /health`.

---

## 🗄️ Prisma

```bash
npx prisma generate                              # generate the client
npx prisma migrate dev --name <migration_name>   # create/apply a migration
npx prisma studio                                # explore the database
```
Main models: `User`, `DashboardLayout`, `ChatInstance`, `ChatMessage`, `Document`,
`StructuredData`, `DynamicTable` / `DynamicTableData`.
