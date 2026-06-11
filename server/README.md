# Luminaris Server

Backend **Express + TypeScript** da plataforma Luminaris: autenticação JWT, Prisma ORM, arquitetura
**feature-based** em camadas. Para entender **como o backend é montado** (layering, factory/DI,
middleware, padrão de erros, como adicionar uma feature), leia **[`ARCHITECTURE.md`](./ARCHITECTURE.md)**.

---

## 🚀 Quick start

```bash
cd server
npm install
npm run dev        # desenvolvimento (hot reload)
npm run build && npm start   # produção
```

### Variáveis de ambiente
Carregadas por `src/config/env.ts` (de `server/.env` ou da raiz). Principais:

| Variável | Uso |
|---|---|
| `DATABASE_URL` | conexão Prisma (ex: `file:./dev.db` para SQLite) |
| `JWT_SECRET` | assinatura dos tokens (mude em produção!) |
| `NODE_ENV` | `development` / `production` |
| `OPENAI_API_KEY` | features de IA (chat, documentos) |
| `QDRANT_URL` / `QDRANT_API_KEY` | vetor store (RAG de documentos) |
| `REDIS_URL` | cache/filas (quando aplicável) |
| `PORT` | porta do servidor (padrão 3001) |

---

## 🛠️ Stack

Express.js · TypeScript · Prisma · SQLite · JWT · bcryptjs · Zod · Helmet · CORS · Compression ·
OpenAI · Qdrant (vetores).

---

## 📁 Estrutura (resumo)

```
server/
├── ARCHITECTURE.md        # arquitetura detalhada (comece por aqui)
├── prisma/                # schema.prisma, migrations, dev.db
└── src/
    ├── server.ts          # bootstrap (middlewares globais + rotas)
    ├── config/            # env
    ├── database/          # PrismaClient singleton
    ├── controllers/       # adaptadores HTTP por feature
    ├── routes/            # roteamento (index agrega os sub-routers)
    ├── middleware/        # auth (JWT + paths protegidos)
    ├── lib/               # cross-cutting: factory(DI), errors, logger, jwt, apiUtils, ...
    └── features/          # um diretório por domínio (ver índice abaixo)
```

> A estrutura completa e o contrato de cada camada estão em [`ARCHITECTURE.md`](./ARCHITECTURE.md).

---

## 🧩 Features

| Feature | Papel | Doc |
|---|---|---|
| `users` | Usuários, roles, perfil | [README](./src/features/users/README.md) |
| `dynamicTables` | Tabelas dinâmicas + governança declarativa + presets | [README + docs/](./src/features/dynamicTables/README.md) |
| `analytics` | KPIs/charts sobre as tabelas do usuário | [README](./src/features/analytics/README.md) |
| `chat` | Resposta de IA (modos RAG e Agent ERP) | [README](./src/features/chat/README.md) |
| `chatInstances` | Instâncias de chat por widget | [README](./src/features/chatInstances/README.md) |
| `chatMessages` | Persistência de mensagens (CRUD) | [README](./src/features/chatMessages/README.md) |
| `documents` | Upload/processamento/busca de documentos (RAG) | [README](./src/features/documents/README.md) |
| `structuredData` | Dados estruturados extraídos de documentos | [README](./src/features/structuredData/README.md) |
| `dashboardLayout` | Layouts de dashboard (upsert por usuário) | [README](./src/features/dashboardLayout/README.md) |
| `reports` | Dados de relatórios/charts | [README](./src/features/reports/README.md) |
| `interview` | Customização guiada | [READMEs](./src/features/interview/) |

---

## 📡 Endpoints

As rotas são montadas em `src/routes/index.ts`, uma sub-rota por feature (`/api/auth`, `/api/users`,
`/api/documents`, `/api/chat`, `/api/dashboard`, `/api/dynamic-tables`, ...). Cada feature documenta
seus endpoints no próprio README. Auth via `Authorization: Bearer <jwt>` (ver
[`ARCHITECTURE.md` §3](./ARCHITECTURE.md)). Health check: `GET /health`.

---

## 🗄️ Prisma

```bash
npx prisma generate                              # gerar cliente
npx prisma migrate dev --name <nome_migracao>    # criar/aplicar migração
npx prisma studio                                # explorar o banco
```
Models principais: `User`, `DashboardLayout`, `ChatInstance`, `ChatMessage`, `Document`,
`StructuredData`, `DynamicTable` / `DynamicTableData`.
