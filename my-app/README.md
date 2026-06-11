# Luminaris — Frontend (my-app)

Cliente **Next.js (Pages Router) + TypeScript** da plataforma Luminaris. É a interface que consome a
API do backend (`../server`, em `:3001/api`): autenticação, dashboard customizável, e a renderização
**dirigida por schema** de formulários e tabelas das *dynamic tables*.

> Para entender **como o front é montado** (providers, camada de dados, render por schema, widgets,
> i18n), leia **[`ARCHITECTURE.md`](./ARCHITECTURE.md)**.

---

## 🚀 Quick start

```bash
cd my-app
npm install
npm run dev          # desenvolvimento (http://localhost:3000)
npm run build && npm start   # produção
```

### Variáveis de ambiente (principais)
| Variável | Uso |
|---|---|
| `NEXT_PUBLIC_API_BASE_URL` | base da API do backend (padrão `http://localhost:3001/api`) |

> O backend (Express + Prisma) vive em `../server` e roda separadamente — o front é apenas o cliente.

---

## 🛠️ Stack

Next.js (Pages Router) · TypeScript · Tailwind CSS · next-i18next (en/pt) · react-grid-layout
(dashboard) · cookies-next (auth token) · Context API (estado global).

---

## 📁 Estrutura (resumo)

```
my-app/
├── ARCHITECTURE.md        # arquitetura detalhada (comece por aqui)
├── pages/                 # rotas (Pages Router): index, users/*, documents/*, dashboard/*
├── features/              # domínios: dashboard, documents, interview, dev
│   └── dashboard/         # category-views, components/forms (DynamicForm), shared
├── components/            # ui/ (primitivos), widgets/ (dashboard-grid, chat, analytics, ...), layout/
├── lib/                   # api/ (ApiClient), services/, context/, hooks/, utils/
├── public/locales/{en,pt} # traduções i18n
└── styles/                # Tailwind
```

> Estrutura completa e contrato de cada camada em [`ARCHITECTURE.md`](./ARCHITECTURE.md).

---

## 🗺️ Mapa de documentação

| Você quer… | Leia |
|---|---|
| Arquitetura geral (providers, dados, render por schema, widgets, i18n) | [`ARCHITECTURE.md`](./ARCHITECTURE.md) |
| As views de dashboard por categoria (gold standard) | [`features/dashboard/category-views/`](./features/dashboard/category-views/) |
| O grid de widgets customizável | [`components/widgets/dashboard-grid/`](./components/widgets/dashboard-grid/README.md) |
| Os widgets de chat (Document/Generic) | [`components/widgets/chat/`](./components/widgets/chat/README.md) |
| Primitivos de UI (Galaxy theme, Modal, feedback, wizard) | [`components/ui/`](./components/ui/README.md) |
| Utilitários/serviços compartilhados | [`lib/`](./lib/README.md) |
| Onboarding/Setup (entrevista + criação do sistema) | [`features/interview/setup/`](./features/interview/setup/README.md) |

---

## ✨ O que o front faz (visão de produto)

- **Autenticação** (login/signup/perfil) com token em cookie, consumida via `AuthContext`.
- **Dashboard** com sidebar de categorias e **views especializadas** (finance, inventory, people,
  products, services, planning) + um padrão genérico (`GenericTabbedView`) para o resto.
- **Render dirigido por schema:** `DynamicForm` monta o formulário a partir dos `fields` do schema;
  relações (FK) são resolvidas para texto legível; busca/ordenação respeitam `searchable`/schema.
- **Dashboard customizável:** grid de widgets (chat, analytics, ERP view) com layout persistido.
- **Documentos** (upload/processamento) e **onboarding** guiado por IA (interview/setup).
- **i18n** en/pt, com labels de campo dirigidos por schema (`database:fields.<name>`).
