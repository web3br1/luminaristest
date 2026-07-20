Verificação completa. Todos os achados mais severos da rodada 2 confirmados em código. Segue o board.

---

# BOARD CONSULTIVO v2 — Design Council do CRM (rodada 2, complementar)
**Chairman consultivo · 2026-07-20 · nada aqui é ratificado — ratificação é humana. Este board COMPLEMENTA o v1, não o substitui.**

## Duas linhas de verdade (rodada 2)
1. **A cobertura complementar não abala o veredito de qualidade do v1 — ela move o gargalo de "provar o código" para "operar o produto":** as 4 lentes analíticas do v1 convergiram sobre um artefato de engenharia lido como texto; os 5 assentos novos mostram que o risco vinculante não é desenho de seam, é que o seam é **inoperável** (falha sem sinal durável, rede de durabilidade que é ela própria um full-scan nunca load-testado) e que o molde **nunca foi usado por ninguém** — pôr 1 negócio real no app por 2 semanas descobre mais que qualquer §6.
2. **Achado NOVO mais agudo (segurança, verificado em código):** o oráculo de enumeração 403-vs-404 que o projeto fechou explicitamente em `convertLead`/`advanceOpportunity`/`convertLeadToOpportunity` (guard FIX-1) **continua ABERTO em 3 dos 6 métodos do mesmo serviço** — `advanceStage`, `createProposal` e `recordNoShow` passam o `leadId` do cliente direto para `updateTableData` sem o guard `dynamicTableId`. Assimetria intra-serviço, não inferência.

---

## SUPERFÍCIE NOVA POR ASSENTO

**Operadora de salão (usuária final).** Preencheu o ponto cego "as 5 lentes leram arquitetura, nunca sentaram no balcão". Achado mais forte, **verificado**: `nextActionAt` — o dado do job número um da recepcionista ("quem ligar/atender hoje?") — é gravado em dois caminhos (`CrmPipelineService.ts:50` no advance com reunião, `:255` no reagendamento de no-show) e tem **zero consumidores no frontend** (grep `nextActionAt` em `my-app` = 0 arquivos, confirmado). A landing ordena por *score* (pergunta de SDR de software), não pela fila do dia. É a classe "param aceito-e-ignorado", só que na LEITURA.

**Red-team / segurança adversarial.** Preencheu "as lentes marcaram DEFENDIDO de fora, sem sentar na cadeira do atacante". Abriu dois guardas que o v1 dera por fechados e — de igual valor — **confirmou que o núcleo segura**: `user.id === table.userId` protege o CRUD genérico, path-traversal fechado por regex, `__isSystem` stripado. Achado mais forte: o no-op de magic-bytes (abaixo) que **derruba** a defesa v1 "anexos fechados em 2 camadas".

**SRE / ciclo de vida de dados.** Preencheu "leram caminhos estaticamente e concluíram code-complete". Achado mais forte, **verificado**: a única rede de durabilidade (job reconcile, `accountingSyncReconcile.job.ts:749-803`) faz `findMany` cross-tenant de todas as tabelas `sales`/`crmOpportunities`, depois `findRowsByFieldValue` **sem paginação** (tudo em memória), e `loadSalePackageInfo` **por linha** (N+1) — rodando a cada 300s (`AccountingSyncScheduler.ts:21`), nunca load-testada. O backbone de dinheiro é o gêmeo backend do CA4 (fetch-all), pior porque re-roda para sempre.

**Estrategista de produto/mercado (anti-groupthink).** Preencheu "as 5 lentes são engenharia julgando engenharia — ninguém perguntou se o CRM DEVE existir ou QUEM paga". Achado mais forte (julgamento de persona, ancorado em docs lidos): as DUAS direções do v1 (exercitar o gerador / congelar 22 gaps) são fuga voltada para dentro; a restrição vinculante é distribuição/1º usuário, que o v1 rebaixou a nota de rodapé T8. Reframe: exercitar o gerador sobre um molde não-validado **compila os erros do molde** em todo vertical futuro.

**QA / validação.** Preencheu "as lentes param em 'rode o §6' sem desenhar o COMO". Achado mais forte, **verificado**: a pirâmide de teste está invertida no seam de dinheiro — `CrmPipelineService.test.ts` mocka a transação e o DTS (`tx` = objeto falso `{__tx:true}`), então o bug tx-aware que só apareceu vivo é **estruturalmente indetectável**; nenhum teste E2E cruza `advanceOpportunity → DTS real → postEntry real`. Converteu cada achado v1 numa prova numerada executável (o KIT abaixo).

---

## ACHADOS NOVOS (rodada 2) — dedupe + verificação de código

Ordenado por severidade. Veredito = leitura de código nesta sessão (ainda **não-runtime** — ver vieses).

| # | Achado (personas) | Evidência lida | Veredito |
|---|---|---|---|
| **1 — SEGURANÇA** | **Oráculo de enumeração aberto em 3/6 métodos do pipeline** (REDTEAM-1). `advanceStage`, `createProposal`, `recordNoShow` passam `input.leadId` do cliente direto a `updateTableData` sem guard de tabela | `CrmPipelineService.ts:40-76` (advanceStage sem guard `dynamicTableId`), `:212-237` (createProposal), `:240-259` (recordNoShow) **vs** `:126` (convertLead FIX 1), `:282` (advanceOpportunity), `:344` (convertLeadToOpportunity) — os 3 blindados têm o guard, os 3 não | **CONFIRMED**. Não é breach de escrita (policy 403 bloqueia cross-tenant), é vazamento de existência-de-id (403≠404) + escrever campos de lead em qualquer linha do próprio tenant tratada como lead. Explorabilidade prática baixa (cuid não-sequencial), mas o padrão é do próprio projeto e 3 endpoints ficaram de fora |
| **2 — SEGURANÇA (derruba defesa v1)** | **A "2ª camada" de magic-bytes é no-op para image/png, image/jpeg, text/csv, text/plain** (REDTEAM-2). `validateMagicBytes` retorna `true` incondicional para imagens/texto | `uploadSecurity.ts:42-44` (`return true` para imagens/texto); só PDF (`:28`), office/xlsx (`:31`) e octet-stream (`:37`) têm assinatura | **CONFIRMED**. **DERRUBA** o "CA8 anexos DEFENDIDO em 2 camadas" do v1 (linha 90): para os tipos mais comuns a 2ª camada NÃO EXISTE. Blast radius contido por `Content-Disposition: attachment` no download (força download, não render inline) → stored-XSS mitigado; residual real = armazenar payload arbitrário (polyglot/malware) sob rótulo image/png + qualquer futuro consumidor que renderize inline |
| **3 — high** | **Rede de durabilidade (reconcile) é full-scan cross-tenant + N+1 a cada 5min, nunca load-testada** (SRE-1) | `accountingSyncReconcile.job.ts:749-762` (findMany todos tenants + findRowsByFieldValue sem paginação), `:783-803` (loadSalePackageInfo por linha = N+1); `AccountingSyncScheduler.ts:21` (300_000ms) | **CONFIRMED** a estrutura O(tenants × linhas) em memória. Comportamento sob volume real = ainda não medido (não-runtime) |
| **4 — high** | **CA4 fetch-all: duplicação byte-a-byte CONFIRMADA** (QA-4) — o v1 marcou PLAUSIBLE, é técnica re-inlinada | `dynamic-tables.client.ts:55-64` (PAGE_SIZE=200, MAX_PAGES=1000, loop `page=2..totalPages`, comentário `:61` literalmente "mirrors crmFetch.ts") **vs** `crmFetch.ts:13-27` (`fetchAllRows` idêntico, não chamado) | **CONFIRMED — upgrade do v1 (PLAUSIBLE→CONFIRMED)**. O loader canônico do dashboard re-inlina o loop em vez de chamar `fetchAllRows`; acumula todas as linhas num array e pagina no cliente. Colapsar = patch (T6), não rewrite |
| **5 — high** | **Falha do seam é invisível: Won imbookável vira loop silencioso sem dead-letter** (SRE-2 / QA-3) | `crmController.ts:116-121` (Won sem unitId → `logger.warn` + `return`, nunca booka; resposta segue success), `:134-139` (erro só logado); reconcile re-drive sem max-retry/backoff/quarentena; falhas só afloram em `summary.failed` (`AccountingSyncScheduler.ts:111`) | **CONFIRMED**. Os 80 leads seed com unitId nulo são o gerador desse cenário: qualquer um que chegue a Won = trabalho desperdiçado a cada 5min, receita não-reconhecida que ninguém percebe sem grep no log. É um **4º caminho cego do seam** que o v1 não nomeou (v1 tinha 3: duplo-cego, mutável, hardcode) |
| 6 — high (UX) | **`nextActionAt` gravado, nunca mostrado** (SALAO-1) — a recepcionista não vê a fila do dia | escrito em `CrmPipelineService.ts:50,255`; grep `nextActionAt` em `my-app` = **0 arquivos** (confirmado) | **CONFIRMED** (write + zero consumidor). Mesma classe de `reminderAt` (v1-E): grep `reminderAt` em `my-app` = 0 |
| 7 — low (integridade) | **`updateTableData` trata `req.params.tableId` como decorativo mas o repassa AUTORITATIVO às pontes contábeis** (REDTEAM-3) | `dynamicTablesController.ts:111-137` + `SalonSalesAccountingBridge.ts:50-53` (gate `salesTable.id !== tableId`) | **PLAUSIBLE / não re-verificado nesta sessão** (li a assimetria, não exercitei o disparo). Confinado ao próprio tenant/razão → smell de correção, não escalonamento. Correção: derivar tableId da linha persistida, não da URL |

**Defesa do v1 CONFIRMADA (alto valor):** o isolamento de tenant no CRUD genérico **segura** (REDTEAM-4) — `canView`/`canManageData` exigem `user.id === table.userId`; os guards FIX-1 em `convertLead`/`advanceOpportunity` são consistentes; nenhuma das 4 superfícies óbvias de breach cross-tenant abriu. O red-team confirmou o alvo nº1 e ele resistiu.

---

## ONDE UMA PERSONA COMPLEMENTAR DESAFIA O v1 (parte de maior valor)

**Eixo 1 — Direção estratégica: "exercitar o gerador ERP-gen" (v1-B) vs "operar 1 negócio real primeiro" (MARKET-1/3, QA-6).**
O v1 elegeu como direção mais forte "congelar profundidade manual e usar o seam como 1º teste do compilador". O estrategista **refuta frontalmente**: ambas as direções do v1 são engenharia validando engenharia sobre um molde que nunca reconheceu um centavo de verdade; a convergência das 4 lentes é o próprio groupthink que o v1 confessou (T8-2), porque as 4 lentes que convergiram são todas de engenharia lendo um doc de tese de engenharia — **não havia lente de mercado na sala**. O QA reforça pela sequência: não ratifique A nem B com o §6 vermelho, ambos pressupõem um seam que booka e nenhum teste prova isso. **Isto NÃO se ratifica aqui** (reabrir direção B = ADR + parecer + sinal humano); o que muda é a ORDEM: usuário real → kit verde → só então a escolha A×B.

**Eixo 2 — Escopo do molde: Lead+Opportunity é "separação nominal a corrigir" (v1-CA1) ou "aparato enterprise a REMOVER" (SALAO-2)?**
O v1 (CA1) quer colapsar elevando a Opportunity a única portadora de valor. A operadora de salão **reenquadra na direção oposta**: um salão de bairro tem UM funil (interessado→cliente), não pré-qualificação + pipeline de receita; o Lead360 mostra dois botões concorrentes ("Converter Lead" E "Criar Oportunidade") + aba "Oportunidades" separada — ruído puro para a recepcionista. A correção pró-molde pode ser **remover a 2ª pipeline**, não elevá-la. O estrategista (MARKET-2) fecha o cerco: a Parte B benchmarka contra Salesforce Sales Cloud (software de equipe B2B), e o comprador do molde não é comprador de CRM B2B. **Eixo em disputa: o par Lead+Opportunity e o filtro de vendedor são requisito de produto ou aparato B2B importado a remover do molde e reintroduzir só quando um tenant enterprise pedir?** Decisão de produto sobre o molde → ADR + sinal humano.

**Eixo 3 — Congelar TODOS os 22 gaps (v1-C) esconde o único canal de aquisição do molde (SALAO-4).**
O v1 converge em congelar o Bloco B em bloco. A operadora **desafia parcialmente**: o congelamento em bloco não é neutro — preserva features B2B (territórios, quotas, forecast) e sepulta web-to-lead (#20), e a lista de 22 nem menciona WhatsApp, O canal real de um salão brasileiro. Não pede reabrir decisão travada; pede que a triagem use **lente de canal-do-molde** antes de congelar #20. Concorda com o resto do congelamento (SALAO-5: só tarefa+lembrete, notas e captura WhatsApp sobrevivem).

**Eixo 4 — O seam CRM→razão é defeito contábil (v1-CA-SEAM) ou o ÚNICO fosso de mercado (MARKET-4)?**
O v1 tratou o hardcode 1.1.2/3.1 como defeito de invariante. O estrategista **reframe**: "fechou negócio → booka receita automaticamente" é exatamente o que Salesforce NÃO tem nativo; das 22 features, nenhuma diferencia — a integração CRM+contabilidade num só SaaS é o fosso, e um seam hardcoded/duplo-cego/mutável **quebra a demo que vende**. Isso dá peso de MERCADO (não só de tie-out) à decisão travada de `postEntry` e ao ADR pendente do v1-Seção1-item1.

---

## QUADRO DE DECISÃO ATUALIZADO AO DONO

Como a cobertura complementar move as três direções do v1:

| Direção v1 | Status após rodada 2 |
|---|---|
| **A. Provar antes de aprofundar (§6)** | **Reforçada e tornada concreta.** O QA entregou o kit executável (abaixo); o red-team acrescenta a matriz adversarial de 2 tenants; o SRE acrescenta que o backfill de unitId é pré-requisito **sob regra de tenancy explícita** (não cego — atribuir unidade errada mis-roteia receita). Bloqueio de dado do v1 confirmado. |
| **B. Exercitar o gerador ERP-gen** | **Contestada na ordem, não no mérito.** MARKET + QA: não ratifique B com o seam nunca-bookado-de-verdade; exercitar o gerador sobre molde não-validado compila os erros. Sequência correta: usuário real → kit verde → ADR + sinal humano. |
| **C. Congelar os 22 gaps** | **Confirmada, com uma exceção e um porquê novo.** SALAO defende o congelamento MAS retira #20 (web-to-lead/WhatsApp) do bloco e acrescenta o porquê de mercado (o gargalo é zero usuários, não features). Reclassificar 22 gaps é o 2º passo, não o 1º. |

**Antídoto ao gargalo declarado — KIT DE VALIDAÇÃO (desenhado pelo QA, endurecido pelo red-team e SRE).** Custo ~1 dia, falsifica de uma vez os 4 achados de dinheiro do seam + os 2 furos de segurança. Ordem obrigatória:

1. **Pré-requisito de dado.** Backfill dos 80 `unitId` nulos via Prisma direto no dev.db real (`server/prisma/prisma/dev.db` — o aninhado é o populado, per memória); semear >200 linhas em UMA tabela DynamicTable; semear >1 pipeline com etapas. Aceite: `SELECT count(*) ... WHERE unitId IS NULL` = 0.
2. **Seam duplo-cego (CA-SEAM).** (a) advanceStage de um lead até Won → GET no razão da unidade → ASSERTAR: nenhum lançamento. (b) convertLeadToOpportunity + advanceOpportunity(closed_won) → GET razão → ASSERTAR: UM lançamento 1.1.2/3.1. Lead-Won não booka + Opp-Won booka = duplo-cego provado.
3. **Seam mutável / re-Won (CB-MONEY-SEAM).** advanceOpportunity(closed_won, amount=1000); repetir com amount=9999 (sem guard terminal, `:291-297`) → GET razão → ASSERTAR: qualquer resultado ≠ "1 lançamento a 9999" confirma drift (dedup por sourceId congela o 1º).
4. **4º furo — Won sem unitId (SRE-2/QA-3).** Criar opp sem unit → Won → ASSERTAR: resposta HTTP success MAS nenhum lançamento + `summary.failed` incrementa em loop a cada reconcile. Confirma a receita silenciosamente não-reconhecida.
5. **Idempotência de proposta (CA-IDEMP).** advanceStage stageType='proposal' DUAS vezes (double-click) → contar `leadProposals` por (leadId,stageId) → ASSERTAR count: se 2, duplicata confirmada.
6. **Fetch-all (CA4/QA-4).** `npm run build && npm start` (prod, não dev — regra my-app); abrir a aba da tabela >2000 linhas com DevTools → N=ceil(linhas/200) round-trips SEQUENCIAIS antes do 1º paint + heap do array completo. Aceite: paint>2s ou heap linear → ADR + guard server-side.
7. **Matriz adversarial de 2 tenants (red-team).** (a) cuid do tenant B em TODO endpoint de escrita CRM → ASSERTAR 404 (não 403) — pega o oráculo item 1; (b) upload de polyglot HTML declarado image/png → confirma `Content-Disposition: attachment` — pega item 2; (c) não-admin em install-table/sync-preset → 403; (d) update de linha não-venda com tableId=sales → pega REDTEAM-3.

**Patches de baixo risco que não dependem do kit (T6, sem ADR):** aplicar o guard FIX-1 em `advanceStage`/`createProposal`/`recordNoShow` (fecha o oráculo — item 1); colapsar `dynamic-tables.client.ts` para chamar `fetchAllRows` (fecha a duplicação — item 4). Ambos são simetria com código que já existe no mesmo repositório.

---

## VIESES DA RODADA 2 (T8)

- **Verificação segue não-runtime.** Confirmei em código os 6 achados mais severos (oráculo, magic-bytes, reconcile N+1, fetch-all duplicado, seam invisível, nextActionAt) — mas nenhum foi exercido vivo; o próprio kit que prescrevo ainda está vermelho. "CONFIRMED" aqui = leitura de caminho de código, não execução. REDTEAM-3 fica PLAUSIBLE (não disparei a ponte).
- **As personas de mercado e UX opinam por JULGAMENTO, não por código.** MARKET-1/2/3 (comprador, demanda por gerador, ordem usuário-primeiro) e SALAO-2/4 (remover Lead+Opportunity, priorizar WhatsApp) são leitura de mercado/molde ancorada em docs lidos, não fatos verificáveis no repositório — o dono deve pesá-las como opinião estratégica, não como defeito provado. Elas podem estar sobrepesando "1 usuário real" contra profundidade concreta de produto.
- **Risco de inversão de moldura.** A rodada 1 podia impor lente accounting-shaped a um módulo DynamicTable; a rodada 2 pode impor uma lente **salão-solo B2C** a um produto cuja tese é gerar ERPs para verticais que podem ser B2B — tratar Lead+Opportunity e filtro de vendedor como "aparato a remover" pode estar amputando exatamente a superfície que um tenant enterprise futuro precisa. O eixo em disputa (SALAO-2/MARKET-2) é genuinamente não-resolvido, não uma recomendação.
- **O red-team confirmou tanto quanto derrubou.** Registrar que o núcleo de tenancy segura é tão parte do parecer quanto os dois furos — evitar que "2 furos de segurança" seja lido como "CRM inseguro"; o breach cross-tenant não abriu.
- **Meu próprio viés de chairman:** dei destaque de manchete à segurança (itens 1-2) porque é o mais falsificável em código; isso pode subvalorizar os achados de mercado (menos verificáveis, potencialmente de EV maior) por serem menos "provados". A ausência de runtime favorece sistematicamente os achados que consigo ler sobre os que precisaria operar para ver.