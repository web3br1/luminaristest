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
| Board de fluxo de trabalho (Kanban drag-drop entre etapas) | `features/dashboard/category-views/kanban/InternalKanbanView.tsx` (+ `hooks/useKanbanLogic.tsx`, `components/KanbanCardDetailModal.tsx`). Transição com efeitos colaterais → serviço no padrão `server/src/features/crm/services/CrmPipelineService.ts`. Skills: `frontend-kanban-workflow-generator` + `backend-workflow-transition-generator`. **Anti-exemplo (histórico, já remediado): o board estático que existia em `pages/crm/pipeline.tsx` — hoje o arquivo é um wrapper fino de `CrmPipelineBoard`; não recriar o estático.** |
| Erro de API (controller) | `handleApiError` de `lib/apiUtils` |
| Erros tipados (service) | `lib/errors` (`ForbiddenError`, `NotFoundError`, …) |
| Field presets (preset gen) | `server/.../presets/fields/*` |
| Money math | `addMoney` / `DataSanitizer` / `DateUtils` de `features/analytics/utils` |
| Formatação de exibição (data/hora/moeda no **frontend**) | `features/dashboard/shared/utils/formatters.ts` (`formatCurrency` — fan-in 14, `formatDate`, `formatDateBR`) + `useFormatCurrency` de `lib/context/CurrencyContext`. **NÃO** re-rolar `formatTimestamp`/`formatDate`/`formatDayLabel` local em panel/modal. (≠ a linha "Money math", que é cálculo backend/analytics.) **Anti-exemplo: `formatTimestamp` clonado em `LeadTimelinePanel`/`LeadNotesPanel`/`LeadAttachmentsPanel` (jaccard 1.0); `finance/utils/formatters.ts` duplicando `formatDateBR`.** |

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
- [ ] **Registro de rota = 2 toques** — conteúdo da regra em `docs/claude-skills/GENERATION_CONTRACTS.md` § Backend Route Contract (**fonte única**; não transcrever aqui):
  1. mount em `server/src/routes/index.ts` (`app.use('/api/<resource>', router)`)
  2. bloco `@openapi` em `server/src/routes/docs.paths.ts` (tsc-cego — pular = endpoint fora da doc)
- [ ] **Auth não é toque de registro:** `middleware/auth.ts` é deny-by-default (tudo sob `/api` exige JWT ao ser montado). Não existe allowlist de rotas protegidas. Editar `auth.ts` só para tornar uma rota **pública** (regra em `publicApiRoutes`) — decisão de segurança, não scaffolding.
- [ ] **Exclusão de campos sensíveis** (password etc.) via `select` explícito em queries públicas.
- [ ] **Domínios DynamicTable (leads/ERP/CRM):** service orquestra `DynamicTableService` (não Repository/Policy próprios); resolve tabelas por `internalName` (preset key), nunca por índice `[0]`; o `DynamicTableService` já força `canManageData` em toda escrita.
- [ ] **Money:** acumular com `addMoney()` (nunca `+=` — float drift); excluir negativos e status configurados; `previousValue = count>0 ? total/count : undefined` (**undefined quando sem dados, nunca 0**). Single-pass: iterar `rows` uma vez só.
- [ ] **Escritas via agente de chat** retornam `{ status: 'PROPOSED', proposalId }` — nunca escrevem direto no banco.

### 2.1 DynamicTable vs Módulos ERP first-class Prisma — fronteira inviolável

> **Esta seção é gate obrigatório antes de qualquer decisão de onde um novo módulo ou integração vai viver.**

#### O que é DynamicTable

DynamicTable é um **motor de tabelas definidas pelo usuário em tempo de execução.** O operador do negócio cria uma tabela, define campos, e usa. O dado mora em `DynamicTableData.data: Json`. Presets (Vendas, Agendamentos, Produtos…) são tabelas DynamicTable pré-configuradas — o motor por baixo é o mesmo. Plugins (`SalesPlugin`, `AppointmentsPlugin`…) adicionam lógica de domínio *sobre* esses dados dinâmicos.

**DynamicTable serve para:** CRM, formulários configuráveis pelo usuário, fluxos que o operador adapta sem código.

#### O que é um módulo ERP first-class Prisma

Um módulo first-class Prisma tem **tabelas definidas pelo desenvolvedor com invariantes que o banco deve garantir.** O usuário não configura o esquema — ele opera dentro do módulo. Contabilidade (`Account`, `JournalEntry`, `Posting`) é o módulo canônico: `Σdébito = Σcrédito` exige inteiros reais, `@@unique` real e atomicidade de transação real — impossível em `data: Json`.

**Módulos first-class servem para:** Contabilidade, Folha de Pagamento, Fiscal/NF-e, RH, qualquer domínio com invariantes financeiros/legais/regulatórios.

#### Teste de decisão (obrigatório antes de modelar qualquer novo módulo)

| Pergunta | Sim → |
|---|---|
| O usuário cria ou configura o esquema em runtime? | DynamicTable |
| Tem invariante financeiro/legal que o banco deve garantir? | Prisma first-class |
| A integridade depende de `@@unique`, FK ou tipos reais? | Prisma first-class |
| É dado de infraestrutura do negócio (não configurável pelo usuário)? | Prisma first-class |

Em caso de dúvida: **Prisma first-class.** DynamicTable é exceção justificada, não default.

#### ANTI-PADRÕES PROIBIDOS — gate reprovado se qualquer um aparecer

> Cada regra tem **ID estável** (`AC-2.1-Bn`), referenciado pelos `governance.md` das skills e verificado pelo `skill-audit governance-check`. Não renumere IDs existentes — são chave de enforcement.

- [ ] **[AC-2.1-B1] NUNCA injete um serviço Prisma first-class (`PostingService`, `PayrollService`, etc.) dentro de `DynamicTableService`, `RuleContext` ou qualquer `RulePlugin`.** Integração entre os dois mundos não acontece dentro do motor DynamicTable.
- [ ] **[AC-2.1-B2] NUNCA modele uma entidade financeira, legal ou regulatória como linha de DynamicTable.** `JournalEntry`, `Posting`, `PayrollEntry`, `FiscalDocument` são Prisma first-class — ponto final.
- [ ] **[AC-2.1-B3] NUNCA use preset DynamicTable como camada de persistência de módulo ERP.** O preset é UI/entrada; o dado autoritativo fica nas tabelas Prisma do módulo.
- [ ] **[AC-2.1-B4] NUNCA modifique `DynamicTableService.ts` para acomodar integração cross-módulo.** Se você está editando `DynamicTableService` para conectar dois domínios, o design está errado — pare e redesenhe.
- [ ] **[AC-2.1-B5] NUNCA confie em `unique`/`compositeUnique` de preset para idempotência financeira.** É scan em JS dentro do tx (TOCTOU). Idempotência real = `@@unique` no model Prisma do módulo.

#### Onde a integração entre DynamicTable e módulos Prisma deve acontecer

A integração (ex.: "venda finalizada → lançamento contábil") sobe ao **nível de aplicação** — controller, route handler, ou serviço de integração dedicado — nunca dentro do motor DynamicTable. O módulo Prisma first-class expõe sua própria API/rota; quem orquestra decide quando chamá-la.

---

### 2.2 Limites da plataforma DynamicTable (caminho de dinheiro / unicidade / hierarquia)

Toda linha de DynamicTable mora em `DynamicTableData.data Json` sobre **SQLite**. Isso impõe quatro limites que **nenhuma skill remove** — assumir o contrário foi o que furou o primeiro plano do módulo de Contabilidade. Respeite-os ou o gate reprova:

- [ ] **[AC-2.2-1] Dinheiro = inteiro em centavos** (`numberFormat:'integer'`), nunca decimal/float. Não existe tipo Decimal; `number` é IEEE-754 e `0.1+0.2` deriva. Invariantes monetários (ex.: `Σdébito=Σcrédito` de um razão) são **igualdade inteira exata, sem epsilon**. (A linha "Money/`addMoney()`" da §2 continua valendo para somatórios de **exibição**; centavos é para **armazenamento** e para qualquer **invariante de fechamento**.)
- [ ] **[AC-2.2-2] `unique`/`compositeUnique` de preset NÃO é constraint de banco.** É um scan `json_extract` em app-layer dentro do tx (TOCTOU) — pega re-post já commitado, **não** pega dois writes concorrentes da mesma chave. Para idempotência (ex.: `unique(sourceType,sourceId)`), use `compositeUnique` + check no service e **nomeie o teto** com um comentário `ponytail:`. Upgrade = promover a model Prisma com `@@unique` real — que **porém** perde o path de lentes schema-driven (`@@PRESET_TABLE_KEY::`), então é trade-off, não upgrade grátis. Não trate como garantia de corrida.
- [ ] **[AC-2.2-3] Sem self-relation provada.** Nenhum preset aponta uma `relation` para a **própria** tabela; a resolução self-`@@PRESET_TABLE_KEY` é não-testada e não há componente de árvore no frontend (`GenericTable` é plano). Modele hierarquia por **chave codificada** (`1.1.2` → pai = prefixo do code), não por `parentId` auto-relacional; renderize com `GenericTabbedView` plano indentado pela profundidade do code. Relations **cross-table** (por id) continuam normais/provadas.
- [ ] **[AC-2.2-4] Soft-delete ignora `immutableAfter`/`lifecycle`.** Esses guards declarativos só rodam em `updateTableData`, **não** em `deleteTableData`. Tornar um registro postado/terminal de fato imutável exige guarda de status na **camada de serviço** (ou `deleteConstraints` RESTRICT no pai) — o edit-block sozinho não cobre o delete.

> Evidência de grafo (2026-06-22): money em `data Json`/SQLite sem Decimal; `unique` enforced via `countByFieldValue`/`findAllDataByTableId` em JS dentro do tx; zero preset com self-relation; `deleteTableData` não consulta `immutableAfter`. Detalhe na memória `dynamictable-money-and-uniqueness-limits`.

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
