# lib — Núcleo compartilhado do frontend

Utilitários transversais do cliente: o **API client**, a camada de **services**, os **contexts** de
estado global, hooks e helpers. É o que o [`ARCHITECTURE.md`](../ARCHITECTURE.md) referencia como
camada de dados/estado.

> Frontend-only. Não há factory/DI nem acesso a banco aqui (isso é do backend `../server`).
> Os módulos são importados por path (o `lib/index.ts` é intencionalmente vazio).

## `api/` — cliente HTTP

`api/api-client.ts` exporta o singleton **`apiClient`** (`ApiClient`):
- Base: `NEXT_PUBLIC_API_BASE_URL` (padrão `http://localhost:3001/api`).
- `get/post/put/patch/delete<T>()` sobre `fetch`, com parsing seguro de JSON.
- Injeta automaticamente `Authorization: Bearer <auth_token>` (cookie via `cookies-next`) e
  `x-user-timezone` (timezone do navegador).
- Em resposta de erro, dispara `notify(...)` (toast) automaticamente.

## `services/` — wrappers de API por domínio

Cada arquivo encapsula chamadas ao backend sobre o `apiClient`:

| Service | Domínio |
|---|---|
| `auth.service.ts` | login/logout/sessão |
| `user.service.ts` | usuários/perfil |
| `document.service.ts` | documentos |
| `finance.service.ts` | vendas/despesas |
| `analytics.service.ts` | KPIs/charts |
| `location.service.ts` | CEP/endereço |
| **`dynamic-table.service.ts`** | **hub** das tabelas dinâmicas: `getTables`/`getTableById`/`getSubTables`, `getTableData`/`getRecordById`, CRUD de registros, `performLookup` (FK→display), `getSidebar`/`getSystem`. |

> Regra: componentes chamam **services**, nunca `fetch` direto.

## `context/` — estado global (Context API)

| Context | Conteúdo |
|---|---|
| `AuthContext` | usuário/sessão (`login`/`logout`, `auth_token` em cookie, sincroniza `locale`/`currency`). |
| `CurrencyContext` | moeda ativa para formatação. |
| `DashboardDataContext` | dados globais compartilhados entre as views do dashboard. |
| `ToastContext` | `showToast(...)` via portal; ouve `app:notify`. |

## Outros

- `hooks/useTheme.ts` — alterna/persiste o tema (light/dark).
- `hoc/withAuth.tsx` — HOC que protege páginas exigindo autenticação.
- `notifications/notify.ts` — dispara notificações globais (consumido pelo `apiClient` em erros).
- `utils/error-handler.ts` — normalização/tradução de erros de API.

## Estrutura

```
lib/
├── api/           api-client.ts        # apiClient (singleton)
├── services/      *.service.ts         # wrappers por domínio (dynamic-table = hub)
├── context/       Auth/Currency/DashboardData/Toast Context
├── hooks/         useTheme.ts
├── hoc/           withAuth.tsx
├── notifications/ notify.ts
├── utils/         error-handler.ts
└── index.ts       (vazio — sem barrel)
```
