# Luminaris — Contrato de Arquitetura & Qualidade de Código

> **Fonte única das regras cross-cutting.** Toda skill de geração/orquestração deste conjunto referencia este arquivo. Ele encoda o que vale para **qualquer** código gerado, independentemente da camada. Cada skill adiciona, por cima, o checklist específico da sua camada — nunca repete estas regras (evita drift, como o `zinc` que divergiu do `neutral`).
>
> **Como usar (implementador/skill):** antes de gerar qualquer arquivo, leia este contrato e o bloco da(s) camada(s) que vai tocar. Ao final, todo item aplicável aqui é um gate — se algo deste contrato não foi cumprido, o trabalho não está pronto. O `luminaris-reviewer` valida contra exatamente estas regras.
>
> Documentos irmãos: `docs/claude-skills/GENERATION_CONTRACTS.md` (scaffolding de arquivos por camada — nomes/paths) e `.claude/skills/frontend-design-system/SKILL.md` (linguagem visual detalhada). Este contrato é o **bar de qualidade**; aqueles são o **como/onde**.

---

## 0. Princípio-mestre: reuse antes de recriar

Antes de escrever qualquer componente, classe, helper ou padrão, **procure o canônico que o projeto já tem e reuse-o**. Construir paralelos bespoke produz "módulos ilha" fora do padrão — foi a causa-raiz da revisão reprovada do CRM (`RecordTable`, `CrmKpiCard`, `CrmBarChart`, páginas com `max-w-*` divergentes, detalhe em rota). Se um canônico genuinamente não atende, espelhe o layout dele e justifique o desvio no relatório.

| Necessidade | Canônico a reusar (NÃO recriar) |
|---|---|
| Tabela de registros (CRUD inline) | `features/dashboard/category-views/shared/components/GenericTable.tsx` + `GenericRow.tsx` + `RowActionsCell.tsx` (via `GenericTabbedView.tsx`). Skill: `frontend-table-screen-generator`. Golden ref verificada: `features/crm/components/CrmTableScreen.tsx`. **Anti-exemplo: `RecordTable.tsx` (deletado).** |
| Paginação | `features/dashboard/shared/components/StandardPagination.tsx` |
| Modal / detalhe de registro | `components/ui/Modal.tsx` (portal) + estado local (padrão `KanbanCardDetailModal.tsx`). Skill: `frontend-modal-generator`. Golden refs verificadas: `features/crm/components/Lead360Modal.tsx` (detalhe), `ProposalCaptureModal.tsx` (captura), `ConfirmDeleteModal.tsx` (confirmação). **Regra: detalhe/edição = modal, nunca `router.push`.** |
| Board/KPIs/charts de analytics | `.../finance/components/analytics/dashboard/AnalyticsDashboard.tsx` + `DashboardKpiCard.tsx` + `charts/ChartRenderer.tsx` + `widgets/analytics/GoldKpiWidgetView.tsx` |
| Board de fluxo de trabalho (Kanban drag-drop entre etapas) | `features/dashboard/category-views/kanban/InternalKanbanView.tsx` (+ `hooks/useKanbanLogic.tsx`, `components/KanbanCardDetailModal.tsx`). Transição com efeitos colaterais → serviço no padrão `server/src/features/crm/services/CrmPipelineService.ts`. Skills: `frontend-kanban-workflow-generator` + `backend-workflow-transition-generator`. **Anti-exemplo: `pages/crm/pipeline.tsx` (board estático).** |
| Erro de API (controller) | `handleApiError` de `lib/apiUtils` |
| Erros tipados (service) | `lib/errors` (`ForbiddenError`, `NotFoundError`, …) |
| Field presets (preset gen) | `server/.../presets/fields/*` |
| Money math | `addMoney` / `DataSanitizer` / `DateUtils` de `features/analytics/utils` |

---

## 1. Qualidade de código universal (toda linguagem, toda camada)

- [ ] **`tsc` limpo é gate, não meta.** `cd server && npx tsc --noEmit` e `cd my-app && npx tsc --noEmit` devem passar **sem novos erros**. Não avance de passo com `tsc` vermelho.
- [ ] **Zero `any` evitável.** Tipe com interfaces locais mínimas ou `unknown` + narrowing. Exceção contratual única: `Record<string, any>` dos dados dinâmicos da DynamicTable (contrato do engine). Em `catch`, use `catch (e)` (`e: unknown`) com narrowing — `e instanceof Error ? e.message : 'Falha…'`. Nunca `catch (e: any)`.
- [ ] **Imports reais.** Todo import aponta para path existente do repositório — nunca inventado. Se não achar, `Grep` para localizar; não chute.
- [ ] **Nada de segredos no código.** Sem credenciais/keys hardcoded; segredos via `process.env`/`.env`.
- [ ] **Nomes seguem a convenção da camada** (ver bloco da camada). PascalCase para classes/components, `use<X>` para hooks, `I<X>` para interfaces de repo/policy/model.
- [ ] **Sem lógica morta / TODO falso.** Não deixe stubs vazios que aparentam funcionar.
- [ ] **`logger.error(msg, { context })`** — string primeiro, objeto de contexto depois. Nunca `logger.error(msg, errorObjDireto)`.

---

## 2. Arquitetura backend (cross-cutting)

A arquitetura é em camadas estritas. **Cada camada só fala com a adjacente.**

```
Route → Controller → Service → Repository → Prisma
                        ↘ Policy
```

- [ ] **Separação de responsabilidades é inviolável:**
  - **Route**: só declara `router.<verbo>` + handler. Zero lógica.
  - **Controller**: valida (Zod), extrai actor, chama service, formata resposta, `handleApiError`. Zero regra de negócio. Zero `prisma.*`.
  - **Service**: regra de negócio. Policy-check **primeiro**. Zero `prisma.*` direto (só via repository). Zero `res.json`/Express.
  - **Repository**: único lugar com `prisma.*`. Zero regra de negócio.
  - **Policy**: só decisões `boolean`. Zero `throw`, zero acesso a dados.
- [ ] **Injeção de dependências via Factory.** Service recebe repo + policy por construtor. **Nunca** `new Repository()`/`new Policy()` dentro do service. Registrar em `lib/factory.ts` (repo/policy antes do service) + getter `get<Resource>Service()`.
- [ ] **Policy-first.** Toda operação de service começa com `if (!this.policy.canXxx(actor, id)) throw new ForbiddenError()` **antes** de qualquer acesso a dados.
- [ ] **Erros tipados de `lib/errors`** (`ForbiddenError`, `NotFoundError`, `ValidationError`, `UnauthorizedError`, `ServiceError`) — nunca `res.status(500)` manual no service, nunca `throw new Error('...')` cru.
- [ ] **Cross-tenant = `NotFoundError`, NÃO `ForbiddenError`** (recurso de outro usuário deve parecer inexistente — previne enumeration attack).
- [ ] **Soft-delete universal.** Todo `findMany`/`findFirst` filtra `where: { …, deletedAt: null }`. Delete = `update({ data: { deletedAt: new Date() } })`. **Nunca** `prisma.<model>.delete()`.
- [ ] **`findAll` usa `prisma.$transaction([findMany, count])`** — não duas queries sequenciais.
- [ ] **Validação Zod no controller** antes de qualquer lógica: `const parse = Schema.safeParse(req.body); if (!parse.success) return res.status(400).json({ success:false, error: parse.error.flatten() })`.
- [ ] **Actor:** `getUserContextFromRequest(req)` no controller; services aceitam `actor: IUser | null` (importar `IUser` de `features/users/models/User.model`, **NÃO** de `@prisma/client`).
- [ ] **Tipos Prisma importam de `'generated/prisma'`, NUNCA `@prisma/client`** (output path customizado).
- [ ] **Resposta padrão:** `{ success: true, data }` (200) ou `.status(201)` em criação. Erro via `handleApiError(error, res)`.
- [ ] **Registro de rota = 3 toques** (senão 401 com token válido — bug silencioso que o `tsc` NÃO pega):
  1. mount em `server/src/routes/index.ts` (`app.use('/api/<resource>', router)`)
  2. `'/api/<resource>'` no array `protectedApiPaths` de `server/src/middleware/auth.ts` (exceto rota 100% pública)
  3. bloco `@openapi` em `server/src/routes/docs.paths.ts`
- [ ] **Exclusão de campos sensíveis** (password etc.) via `select` explícito em queries públicas.
- [ ] **Domínios DynamicTable (leads/ERP/CRM):** service orquestra `DynamicTableService` (não Repository/Policy próprios); resolve tabelas por `internalName` (preset key), nunca por índice `[0]`; o `DynamicTableService` já força `canManageData` em toda escrita.
- [ ] **Money:** acumular com `addMoney()` (nunca `+=` — float drift); excluir negativos e status configurados; `previousValue = count>0 ? total/count : undefined` (**undefined quando sem dados, nunca 0**). Single-pass: iterar `rows` uma vez só.
- [ ] **Escritas via agente de chat** retornam `{ status: 'PROPOSED', proposalId }` — nunca escrevem direto no banco.

---

## 3. Arquitetura frontend (cross-cutting)

- [ ] **Pages Router + auth guard.** `withAuth` HOC ou `useAuth()` + redirect. Toda página com `getServerSideProps` incluindo `await serverSideTranslations(locale ?? 'en', [...namespaces])`.
- [ ] **Service layer.** Componentes/hooks chamam `lib/services/*.service.ts` (que usa `apiClient`), **nunca** `fetch`/`apiClient` direto no componente/hook. Tipos de retorno explícitos; tipos locais (não importar tipos do backend); zero `any` em retornos.
- [ ] **Reuse canônicos** (ver §0): tabela → `GenericTable`; paginação → `StandardPagination`; detalhe → `Modal`; analytics → `AnalyticsDashboard`/`ChartRenderer`/`DashboardKpiCard`. Não recrie.
- [ ] **Detalhe/edição de registro = MODAL, não rota.** O padrão dominante é modal (`Modal.tsx` + estado local na view). Reserve `pages/<x>/[id].tsx` só para páginas genuinamente standalone/deep-linkáveis — nunca para "ver um registro da lista".
- [ ] **Paginação ao ler DynamicTable.** `GET /dynamic-tables/:id/data` retorna **máx. 50 por padrão** (cap 200). Hooks que alimentam KPIs/listas/boards buscam **todas as páginas** (fetch-all iterando `page` até `totalPages`, `limit=200`). Referência: `features/crm/lib/crmFetch.ts` (`fetchAllRows`). Sem isso, a view trunca silenciosamente em 50. Sempre validar com **>50 registros**.
- [ ] **`useMemo([deps])` em todo dado derivado** no corpo de render/hook (`filter`/`sort`/`group`/`find`/`reduce`/lookups/agregações). Sem isso recalcula a cada render (inclusive em context updates não relacionados), O(n)/O(n log n).
- [ ] **Container consistente entre telas irmãs.** Use o container full-height do shell (`flex h-full … flex-col`, scroll interno). **Não** fixe `max-w-*` divergentes por página (telas "mudam de tamanho" ao navegar — defeito do CRM).
- [ ] **Dynamic imports** para componentes pesados (`dynamic(() => import(...), { ssr: false })`); manter libs pesadas (FullCalendar/recharts/dnd-kit/grid-layout) fora do `_app`.
- [ ] **SSR-safe.** Sem `localStorage`/`document` no SSR sem `typeof window !== 'undefined'`. Sem `getStaticProps`.
- [ ] **Views agrupadas (Kanban/board)** filtram colunas pelo **registro-pai ativo** (etapas DO pipeline selecionado), nunca todas as etapas da tabela-pai (gera colunas duplicadas/vazias). Default = pai com mais filhos + seletor. Validar com **>1 pai**.
- [ ] **Resolver DynamicTables por `internalName`**, nunca por posição `[0]` (a ordem da API varia).
- [ ] **i18n:** strings em `public/locales/{en,pt}/<namespace>.json`; nada hardcoded em UI nova.

---

## 4. Design system (qualidade visual — cross-cutting)

Detalhe completo em `frontend-design-system/SKILL.md`. Regras-gate:

- [ ] **`neutral-*`, NUNCA `zinc-*`** para superfícies dark (`grep -rn "zinc-" <pasta>` deve retornar **nada**). Borda dark padrão = `dark:border-neutral-800`.
- [ ] **Cards = `rounded-2xl`/`3xl`** (não `rounded-xl`). Inputs/botões/filtros = `rounded-xl`/`lg` (corretos — não confundir). Wrappers de libs e containers de lista/timeline **também são cards**.
- [ ] **Dark mode em toda classe de cor** (`dark:` sempre presente).
- [ ] **Tipografia:** `font-semibold` = corpo; `font-black` = ênfase (títulos/valores KPI/labels uppercase). Labels de seção/KPI = `text-[10px] font-black uppercase tracking-widest`.
- [ ] **Badges** = `color/10` (fundo) + `color/20` (borda) + `color-600` (texto), não sólidos.
- [ ] **Paleta:** acento blue, positivo emerald, negativo rose, warning amber. Não inventar cores.

---

## 5. Testes (cross-cutting)

- [ ] **`beforeEach(() => jest.clearAllMocks())`** sempre.
- [ ] **Floats monetários com `toBeCloseTo(value, 2)`** — nunca `toBe`/`toEqual`.
- [ ] **`referenceDate` fixo** (data hardcoded) — nunca `new Date()` sem âncora.
- [ ] **Cross-tenant testa `NotFoundError`** (não `ForbiddenError`).
- [ ] **Factory `buildService(overrides?)`** em testes de service.
- [ ] **KPI processor:** suíte de Empty Safety (rows vazios → 0, nunca `NaN`).

---

## 6. Hierarquia de verificação

`tsc < build/SSR (200) < hidratação (use PROD) < interatividade`. Cada nível esconde defeitos do anterior.

- [ ] Para telas atrás de `withAuth`, verifique contra **build de produção** (`next build && next start`) — o `next dev` tem hidratação não-determinística e pode travar no gate "Authenticating…".
- [ ] Prove cor/raio/conteúdo por **estilos computados** (`preview_inspect`/`preview_snapshot`), não por screenshot: superfície on-brand = `rgb(23,23,23)` (neutral-900); `zinc-900` = `rgb(24,24,27)` = off-brand.
- [ ] Backend: rodar os testes da feature (`npx jest features/<x>`) além do `tsc`.

---

## Anti-omissão — checklist de fechamento

Antes de declarar qualquer geração "pronta", confirme que **nenhum** item aplicável acima ficou sem resposta. Se a skill que você executou não menciona um ponto deste contrato que se aplica à sua camada, **o contrato prevalece** — implemente-o mesmo assim. Omissão na skill nunca é desculpa para omissão no código.
