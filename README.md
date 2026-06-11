# Luminaris

B2B SaaS platform: dynamic ERP + Document Intelligence (RAG) + Financial Analytics + AI Agent.

## Architecture

Two independent applications:
- `server/` — Express 4 + TypeScript + Prisma (SQLite) + OpenAI + Qdrant
- `my-app/` — Next.js 15 (Pages Router) + React 19 + TypeScript

## Quick Start

### Backend
```bash
cd server
cp .env.example .env  # fill in your values
npm install
npx prisma migrate dev
npm run db:seed
npm run dev  # runs on :3001
```

### Frontend
```bash
cd my-app
npm install
npm run dev  # runs on :3000
```

## Requirements
- Node >= 18
- OpenAI API key
- Qdrant instance (local or cloud)

## License
MIT
