# Arquitetura do Backend — Luminaris Server

Servidor **Express + TypeScript** com arquitetura **feature-based** e **camadas limpas**
(Controller → Service → Repository), autorização por **policies** e injeção de dependência via um
**factory singleton**. Este documento é a porta de entrada para entender como o backend é montado e
como adicionar/alterar uma feature sem quebrar os padrões.

> Para o quick-start (rodar/buildar) ver [`README.md`](./README.md). Cada feature complexa tem sua
> própria documentação (ex: [`src/features/dynamicTables/`](./src/features/dynamicTables/README.md)).

---

## 1. Princípios

- **Feature-based:** cada domínio vive em `src/features/<feature>/` com suas próprias camadas. Não há
  uma pasta global `services/` — a lógica é local à feature.
- **Camadas com responsabilidade única:** controllers só lidam com HTTP; services contêm regra de
  negócio; repositories só acessam dados (Prisma); policies só decidem autorização.
- **Interfaces + implementação:** repositories e policies expõem interface (`I*`) + impl, para
  testabilidade e troca.
- **Type-safe na borda:** todo input é validado por DTOs Zod antes de chegar ao service.
- **Erros tipados:** o domínio lança `AppError` (e subclasses); um tradutor central converte em HTTP.

---

## 2. Estrutura de diretórios

```
server/
├── ARCHITECTURE.md            # este documento
├── README.md                  # quick-start + índice de features
├── prisma/                    # schema.prisma, migrations, dev.db
└── src/
    ├── server.ts              # bootstrap do Express (middlewares globais + rotas)
    ├── config/                # carregamento de env (config/env.ts)
    ├── database/              # PrismaClient singleton (database/prisma.ts)
    ├── controllers/           # adaptadores HTTP por feature (auth, users, dashboard, ...)
    ├── routes/                # roteamento (index.ts agrega os sub-routers por feature)
    ├── middleware/            # auth.ts (JWT + paths protegidos + injeção de contexto)
    ├── lib/                   # cross-cutting: factory, errors, logger, jwt, apiUtils, prisma, ...
    │   └── README.md          # detalhe do conteúdo de lib/
    ├── features/              # o coração: um diretório por domínio (ver §8)
    ├── scripts/               # scripts utilitários/manutenção
    └── types/                 # tipos globais/compartilhados
```

---

## 3. Ciclo de vida de um request

```
HTTP request
  │
  ▼
[ middlewares globais ]  (src/server.ts, nesta ordem)
  helmet → cors → compression → json → urlencoded → rateLimit(5000/15min) → authMiddleware
  │   authMiddleware (src/middleware/auth.ts):
  │     - valida o Bearer JWT em rotas protegidas
  │     - injeta headers x-user-id / x-user-role / x-user-email / x-user-name
  │     - aplica authz grosseira (ex: GET/DELETE /api/users só ADMIN)
  ▼
[ router ]  (src/routes/index.ts → src/routes/<feature>.ts)
  ▼
[ controller ]  (src/controllers/<feature>Controller.ts)
  - getUserContextFromRequest(req)  → lê os headers injetados
  - valida o body com o DTO Zod da feature
  - service = getFactory().getXService()
  - try { ... } catch (err) { handleApiError(err, res) }
  ▼
[ service ]  (src/features/<feature>/services)
  - regra de negócio; consulta a policy; lança AppError quando aplicável
  ▼
[ repository ]  +  [ policy ]
  - repository → Prisma (dados)        - policy → decisão de autorização
  ▼
PrismaClient singleton (src/database/prisma.ts)
```

Health check: `GET /health` → `{ status, timestamp, uptime }`. Erros não tratados caem no **error
handler global** ao fim de `server.ts`.

---

## 4. Anatomia de uma feature (exemplo: `users`)

Cada feature segue o mesmo esqueleto:

```
features/users/
├── controllers? (ficam em src/controllers/userController.ts — adaptador HTTP)
├── services/        UserService.ts            # regra de negócio
├── repositories/    IUserRepository.ts        # contrato de dados
│                    UserRepository.ts         # impl Prisma
├── policies/        IUserPolicy.ts            # contrato de autorização
│                    UserPolicy.ts             # impl
├── dtos/            UserDto.ts                # schemas Zod + type guards (is<Dto>)
└── models/          User.model.ts             # interfaces de domínio (IUser, Role, ...)
```

Contrato de cada camada:

| Camada | Faz | Não faz |
|---|---|---|
| **Controller** (`src/controllers/`) | parse/valida HTTP, resolve o service via factory, traduz erro | regra de negócio, acesso a dados |
| **Service** (`features/*/services`) | orquestra a regra, consulta policy, lança `AppError` | tocar `req/res`, SQL/Prisma |
| **Repository** (`features/*/repositories`) | CRUD via Prisma; esconde colunas sensíveis (ex: password) | regra de negócio, autorização |
| **Policy** (`features/*/policies`) | decide *quem pode o quê* (booleano) | acessar dados, lançar HTTP |
| **DTO** (`features/*/dtos`) | validar input (Zod) + `is<Dto>()` guards | lógica |
| **Model** (`features/*/models`) | interfaces de domínio | comportamento |

Exemplo de fluxo (criar usuário): `userController.createUser` → valida `CreateUserSchema` →
`getFactory().getUserService().createUser(dto, actor)` → `UserService` chama
`userPolicy.canCreate(actor)`, faz `bcrypt.hash`, chama `userRepository.createUser`, retorna
`SafeUserProfile` (sem senha).

---

## 5. Injeção de dependência — `ApplicationFactory`

`src/lib/factory.ts` é um **singleton** que monta o grafo de dependências uma vez, na ordem
repositories → policies → services (resolvendo dependências entre services):

```typescript
// uso típico num controller
import { getFactory } from '@/lib/factory';
const service = getFactory().getUserService();
```

- Cada `getXService()` devolve a instância já cabeada (repository + policy injetados).
- Adicionar uma feature = registrar seu repository, policy e service no construtor do
  `ApplicationFactory` e expor um getter.

---

## 6. Convenções transversais (`src/lib/`)

> `src/lib/` tem seu próprio [README](./src/lib/README.md) com o detalhe de cada utilitário.

- **Erros** (`lib/errors.ts`): `AppError` (base, com `statusCode` + `errorCode`) e subclasses
  `NotFoundError` (404), `ForbiddenError` (403), `UnauthorizedError` (401), `ValidationError` (400),
  `ServiceError` (500). O domínio **lança** essas classes; nunca devolve HTTP direto.
- **Tradução HTTP** (`lib/apiUtils.ts`): `handleApiError(err, res)` mapeia `AppError`/`ZodError` para o
  status e corpo `{ code, message }`. Controllers chamam isso no `catch`.
- **Logging** (`lib/logger.ts`): `logger.info/warn/error/debug(message, context)` — saída JSON.
- **Auth** (`lib/jwt.ts` + `lib/authUtils.ts`): `generateToken`/`verifyToken`/`getAuthToken` e
  `getUserContextFromRequest(req)` (lê os headers `x-user-*` injetados pelo middleware).
- **Validação:** DTOs Zod por feature + guards `is<Dto>(obj)`.
- **Config** (`config/env.ts`): carrega `.env` (com fallback robusto). Keys: `NODE_ENV`,
  `DATABASE_URL`, `JWT_SECRET`, `OPENAI_API_KEY`, `QDRANT_URL`, `QDRANT_API_KEY`, `REDIS_URL`.
- **Prisma** (`database/prisma.ts`): `PrismaClient` singleton com cache global em dev.

---

## 7. Plugando uma nova feature

1. Crie `src/features/<feature>/` com `services/`, `repositories/` (+ interface), `policies/`
   (+ interface), `dtos/`, `models/`.
2. Crie o controller em `src/controllers/<feature>Controller.ts` (use `getFactory()`,
   `getUserContextFromRequest`, `handleApiError`).
3. Crie `src/routes/<feature>.ts` e **monte-o** em `src/routes/index.ts` (`router.use('/<feature>', ...)`).
4. Registre repository/policy/service no `ApplicationFactory` (`lib/factory.ts`) + getter.
5. Proteja a rota no `authMiddleware` (lista de paths) se exigir autenticação.
6. Documente: README da feature (ver §9).

---

## 8. Índice de features

| Feature | Papel | Doc |
|---|---|---|
| `users` | Usuários, roles (USER/ADMIN), perfil | [README](./src/features/users/README.md) |
| `dynamicTables` | Tabelas dinâmicas dirigidas por schema + governança declarativa + presets | [README + docs/](./src/features/dynamicTables/README.md) |
| `analytics` | KPIs/charts sobre as tabelas do usuário (templates, CORE definitions, pipelines) | [README](./src/features/analytics/README.md) |
| `chat` | Geração de resposta: modos RAG e Agent ERP (tools, action proposals) | [README](./src/features/chat/README.md) |
| `chatInstances` | Instâncias de chat (DOCUMENT/GENERIC) por widget | [README](./src/features/chatInstances/README.md) |
| `chatMessages` | Persistência de mensagens (CRUD; IA fica no `/api/chat`) | [README](./src/features/chatMessages/README.md) |
| `documents` | Upload, processamento e busca de documentos (RAG/vetores) | [README](./src/features/documents/README.md) |
| `structuredData` | Dados estruturados extraídos de documentos | [README](./src/features/structuredData/README.md) |
| `dashboardLayout` | Configurações de layout do dashboard (upsert por usuário) | [README](./src/features/dashboardLayout/README.md) |
| `reports` | Geração de dados de relatórios/charts | [README](./src/features/reports/README.md) |
| `interview` | Customização guiada (serviços de entrevista/campos) | [READMEs](./src/features/interview/) |

---

## 9. Convenções de documentação

- **Template = `dynamicTables`.** Feature simples → um `README.md`. Feature complexa → `README.md`
  enxuto (índice) + pasta `docs/` por concern (ex: architecture / validation / rules).
- **Todo README de feature deve ter:** responsabilidade (1 parágrafo), **métodos públicos do service**
  (a API real), modelos/DTOs principais, regras de **policy**, e a **fronteira com outras features**.
- **Regra de manutenção:** atualize o README da feature **no mesmo PR** que muda a API pública dela.
  Docs congelam quando o código anda e a doc não — o objetivo é evitar isso.
- **Idioma:** prosa em PT; identificadores/`label` permanecem como no código.
