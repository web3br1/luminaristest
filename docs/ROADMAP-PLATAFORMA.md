# Roadmap da Plataforma — do fechamento do trilho contábil à fábrica de verticais

> **Relação com o master map:** `docs/accounting/ACCOUNTING-MASTER-MAP.md` continua sendo a **fonte de
> verdade operacional** do módulo contábil (nós, gates, decisões travadas §1, rejeitadas §4, diferidos §5).
> Este documento é a **camada de horizonte**: (A) consolida o que "terminar o roadmap atual" significa, em
> ordem; (B) define as fases **pós-roadmap** que materializam a tese de produto. Nenhuma fase daqui é
> roteável sem o fluxo de governança normal (PRE-ADR → parecer accounting-architect quando contábil →
> ADR → incremento → review independente). Quando uma fase daqui virar incremento, ela entra no master
> map como nó ⏳ — este doc não substitui o map, aponta para ele.
>
> **Tese de produto (fixada pelo dono, 2026-07-13):** Luminaris é um SaaS multi-tenant cujos módulos
> canônicos + onboarding com IA **geram sistemas de setores diferentes**. O salão é o molde, não o produto.
> A contabilidade é a peça **setor-invariante e imutável** que todo vertical herda. O contador **não é
> persona**: o dono exporta a ECD ou o produto a envia por e-mail. A ligação vertical→contabilidade é
> **compilada na geração do sistema** (engine de binding roda SÓ na geração; runtime executa artefato
> estático contra o `PostingService` imutável). Aspiração nomeada: "o Shopify dos sistemas de empresa" —
> a analogia é merecida quando as 3 provas da Parte B fecharem.
>
> Criado: 2026-07-13 · Base: master map reconciliado 2026-07-12 (HEAD `1088e32`) + auditoria de código da
> mesma data (581/581 testes accounting, 51 rotas, 108 paths openapi; 7 áreas de backend sem UI).

---

## Parte A — Terminar o roadmap atual (o que "até o fim" significa)

Estado de partida: **não há incremento ⏳ em voo** (master map §3). Backend do trilho contábil/SPED
completo em `main`. O que resta do roadmap decidido, em ordem de valor:

### A1 — FE do fluxo de compliance, owner-facing ⚡ maior destrava de valor
O dono (única persona) precisa operar sozinho: **mapear contas referenciais → verificar cobertura →
gerar ECD/ECF → baixar o arquivo**. Hoje esse fluxo existe só em API (0 consumidores FE para
`referential/*`, `sped/*`, `closing/*`). Sem isso, os ~70% de compliance do §7 não são operáveis.
- Escopo: aba/painéis para referential (list/set/batch/copy/skeleton/coverage), geração SPED (ECD+ECF,
  com relatório de lacunas quando a cobertura bloqueia), encerramento de exercício, download de artefatos.
- Reuso: `GenericTable`/`Modal`/`StandardPagination` + padrão das 11 panels contábeis existentes.
- Governança: FE-INCR próprio; browser sign-off humano como residual padrão.

### A2 — Rodada única de PVA (o teste que pode falsear o trilho inteiro)
Gerar ECD, ECF e apuração de um tenant real/fixture e **importar no PGE/PVA oficial**. É sign-off
humano (ferramenta desktop RFB, fora do agente). Todos os incrementos SPED carregam esse residual — uma
rodada fecha todos de uma vez, ou revela o gap campo-a-campo que nenhum teste interno pega.
- Pré-requisito prático: A1 (gerar pelo produto, não por curl).
- Saída: `PVA-SIGNOFF-<data>.md` em `docs/accounting/` registrando resultado por arquivo.

### A3 — Landar o que está pronto e solto
- **Recibos/comprovantes (PDF puppeteer):** Fases A+B completas e commitadas fora de `main`
  (`accounting-receipts-phaseA`) — review PASS; falta merge + browser sign-off. Não reiniciar
  (lição do PR #72: checar `git ls-tree origin/main` antes de "começar").
- **Backlog de browser sign-offs** dos FE-INCRs anteriores (validação humana ao vivo).

### A4 — Fork 2 do catálogo RFB (dado externo)
Importar o arquivo oficial "PJ em Geral" da RFB via o conversor já pronto
(`server/scripts/rfb-referential-to-catalog.mjs` + spec B0). Liga a validação analytic-only de destino
(INCR-9B Track B) que hoje está dormente. Depende de obter o arquivo oficial — tarefa de contador/dono.

### A5 — FE dos relatórios de gestão (Núcleo 4 chega ao usuário)
DFC, balancete comparativo e Livro Diário estão em `main` sem nenhum consumidor FE. Painéis read-only
sobre as rotas `reports/*` existentes. Sem isso o Núcleo 4 é ~70% de backend e ~40% de produto.

### A6 — Complementos menores do trilho
- **Envio da ECD por e-mail ao contador** (canal de entrega decidido pelo dono; outbound ⇒ confirmação
  explícita por envio; pequeno, depende de A1).
- **ECF Fase 3** (candidato ⚫ do §5 — só com ADR próprio e demanda).

### A7 — Diferidos que PERMANECEM demand-gated (não puxar por completude)
Torre de aprovação (maker-checker/SoD) · Dimensões · **Subrazões (AR/AP/estoque/imobilizado/folha/
fiscal)** · NF-e · inbox/outbox (só se sair de single-process, T11) · IA/analytics · LGPD granular.
Gatilhos de AR já registrados (memória `luminaris-product-thesis` + parecer do orquestrador 2026-07-13):
posição por cliente/título, parcelamento/baixa parcial real, aging pedido pelo contador, volume de
não-liquidadas. **Sem gatilho real, ficam onde estão.**

**Critério de "roadmap terminado":** A1–A5 fechados + PVA verde (A2). A6/A7 são pós-gate ou demand-gated.

---

## Parte B — Pós-roadmap: as fases da fábrica (a tese vira produto)

As três provas que separam "ter a anatomia" de "ser a fábrica de verticais". Ordem é dependência real.

### Fase P1 — A prensa: engine de binding na geração do sistema
**Objetivo:** substituir mappers escritos à mão por **1 intérprete fixo de runtime + N bindings
compilados na geração do preset**. A engine (dinâmica como as DynamicTables, com IA) roda **apenas** na
geração; o caminho do dinheiro nunca vê engine.
- **Entrada:** roadmap atual terminado (Parte A) — a fábrica se constrói sobre um vertical 1 completo e
  validado (PVA verde), senão compila-se um molde não-provado.
- **Escopo:** catálogo de **arquétipos de lançamento em código** (extraído dos mappers de salão —
  finalized/settled/reversed/package-sold são o corpus); schema do **binding** (campo-do-preset → slot do
  arquétipo; papel→conta validado contra o chart, padrão INCR-9); **validador determinístico** que aprova
  o binding proposto pela IA antes de ativar (princípio PROPOSED do chat agent); **versionamento** do
  binding (customização de campo bound = re-compilar, nunca editar).
- **Invariante anti-erosão (o ADR trava):** o intérprete de runtime **não contém branch de decisão de
  negócio** — toda condicional pertence à engine de geração e vira dado no binding. Cada decisão que
  migrar para o runtime é regressão ao rule-engine rejeitado (master map §4).
- **Onde vive:** pipeline de geração (ao lado de `PresetMatcher`/`CustomizationService`) — nunca em
  `features/accounting`, nunca no motor DynamicTable (Contrato §2.1 dos dois lados).
- **Prova de saída:** os mappers de salão re-expressos como binding compilado produzem lançamentos
  **byte-idênticos** aos atuais (golden test contra o corpus real) — a prensa reproduz o molde antes de
  prensar coisa nova.
- **Governança:** PRE-ADR → parecer accounting-architect → ADR reconciliando explicitamente com §4/T10 →
  incremento. DECISÃO ARQUITETURAL por definição (toca a fronteira dos dois mundos).

### Fase P2 — O segundo vertical: provar a prensa
**Objetivo:** um setor novo sai da máquina **sem nenhum diff no motor, no ledger ou no intérprete** —
só preset + binding compilado + (se preciso) contas novas no chart via papel.
- **Critério de escolha do setor:** serviço, Presumido, shape operacional adjacente ao salão
  (barbearia/clínica estética = anel mais próximo; petshop/clínica = anel seguinte). Maximiza reuso de
  arquétipo e isola a variável que se quer provar (a prensa, não um domínio novo).
- **Prova de saída (a definição de "Shopify de sistemas de empresa"):** o tenant do setor 2 percorre
  entrevista → ERP operante → fechamento mensal → **gera a própria ECD** — e `git diff` do motor/ledger/
  intérprete entre antes e depois do vertical é **vazio**.
- **Métrica a instaurar:** *time-to-first-ECD* (do onboarding ao primeiro arquivo validável) — o análogo
  do "minutes to first sale" da Shopify.

### Fase P3 — Escala de plataforma (só quando os tenants existirem)
**Gatilho:** contagem real de tenants/concorrência doendo — não antes.
- Revisitar **T11** (single-process) e, se necessário, **T1** (SQLite) — ambas são decisões travadas/
  rejeitadas (§1/§4): reabrir = ADR + sinal humano, com os dados de carga na mão.
- **Unidades compartilhadas / multi-operador:** ativar a separação `ownerUserId`≠`actorUserId` que o
  `AccountingScope` já reserva (membership check é stub `ponytail:` declarado) — e com ela a **torre de
  aprovação** (ACC-016/017) deixa de ser YAGNI, porque passa a existir mais de um operador por tenant.
- inbox/outbox/DLQ só aqui (T11 hoje as torna desnecessárias).

### Fase P4 — Profundidade por demanda (os módulos que a fábrica pede)
Entram **um a um, por gatilho registrado**, nunca por completude de diagrama:
- **Módulo operacional de Compras / Contas a Pagar** — o único bloco perpétuo genuinamente **ausente**
  do kit de módulos (auditoria 2026-07-13): hoje `Suppliers` e `Expenses` existem, mas `Expenses` é
  registro de custo (descrição/categoria/valor/planejado) **sem vencimento, sem vínculo de liquidação
  com fornecedor, sem documento de compra**. Salão não precisa; um vertical com **estoque comprado**
  (petshop/varejo) precisa do fluxo `compra → título a pagar → vencimento → baixa`. É um módulo de
  DynamicTable/preset (operacional, setor-variável). **Gatilho:** primeiro vertical com compra de
  estoque a prazo.
- **Contas a Receber — nota de estado:** o **fluxo operacional de AR já existe e é genérico** — o
  `SalesModule` carrega `paymentTermDays`, `paidAt`, `paidByUserId`, `paymentReference`, `paidWithPackageId`
  (venda "recebo depois" com estado de liquidação), e o `RegisterPaymentService` resolve por
  `internalName:'sales'` (zero salão). Logo **P4-AR NÃO é "criar AR" — é só promover a SUBRAZÃO com
  invariante**: `Σ títulos em aberto === saldo da conta GL 1.1.2.x`, aging, posição por cliente,
  baixa parcial. Precedente técnico do invariante: `CustomerPackageBalance`. Gatilhos em A7. Depois AP
  como subrazão; estoque/imobilizado/folha/fiscal são domínios pesados isolados, cada um seu trilho.
- **NF-e** (ingestão fiscal) — destrava classe de origem nova para os bindings.
- **IA/analytics contábil** (sugestão de conta/conciliação, anomalias) — sobre um ledger já confiável;
  IA sugere, humano contabiliza.
- **LGPD/RBAC granular** — obrigatório antes de escala comercial séria (P3 o puxa).
- **Assinatura digital + transmissão SPED** (ICP-Brasil/Receitanet) — completa o "fisco invisível";
  ADR próprio, alto invariante externo.

### Fase P-i18n — Localização por país (o terceiro eixo, transversal)
Eixo **ortogonal** a setor (P1/P2) e origem (parsers/bridges): o mesmo desenho "periferia varia, centro
invariante" aplicado a jurisdição. **Verificado por código (2026-07-13):** o núcleo do ledger
(`PostingService`/`PeriodService`/`AuditService`/`PostingRepository`) **não importa nada** de
`sped`/`ecf`/`referential`/`cnab` — a dependência flui só `compliance → núcleo`, nunca o contrário. A
anatomia para desacoplar por país **já está correta**; falta só o crachá. Três camadas:
- **Núcleo universal** (partidas dobradas, períodos, numeração, estorno, audit, conciliação, relatórios,
  centavos): país-livre hoje. Não tocar.
- **Pacote de localização** (Brasil como DADO, quase todo já em slots): `baseCurrencyCode`/`timeZone` no
  `AccountingScope` (o comentário do código já diz que o slot foi reservado para "future multi-ledger/
  currency"); `StatementMappingFixture` versionado (`'BP'/'DRE'` = vocabulário BR de balanço/resultado);
  chart fixture; derivação `fiscalYear` (ano-calendário BR).
- **Pacote de compliance** (100% Brasil, já isolado na borda como consumidor read-only downstream): SPED
  ECD/ECF, referencial RFB, CNAB, NF-e. Outro país = outro pacote na mesma borda — **SAF-T** (PT/UE),
  **DATEV** (DE), **MTD** (UK) — sem tocar o núcleo.

**Cuidados reais (o ADR trata):** (1) **país ≠ multi-moeda** — um tenant DE seria EUR-only, mono-moeda
igual ao BR; muda o *valor* do slot, não a existência de câmbio (mas alargar os literais do
`AccountingScope` reabre **T9 BRL-only** → ADR + sinal humano); (2) **minor-unit awareness** — centavos
assumem 2 decimais (JPY=0, BHD=3); (3) **ano fiscal ≠ ano-calendário** (UK/US) afeta a partição da
numeração; (4) generalizar o vocabulário `'BP'|'DRE'` espalhado nos tipos dos relatórios.
**Custo honesto:** a camada de compliance é **cara** — o pacote Brasil consumiu o Núcleo 5 inteiro;
cada país é um trilho SPED-equivalente com seu próprio validador. **Gatilho:** primeiro tenant não-BR
real — nunca por completude de mapa. **Lei preventiva (custo zero hoje):** o núcleo do ledger nunca
importa de localização/compliance; jurisdição entra como dado (fixture/slot), jamais como branch no
núcleo — regra que já é verdade de fato, agora explícita.

### Fase P5 — Ecossistema (horizonte, opcional por ora)
O fosso final da analogia Shopify é o ecossistema de terceiros. Aqui: API pública/webhooks por tenant,
marketplace de presets de setor, integrações de pagamento. **Nenhum trabalho agora** — registrado só
para que P1–P4 não tomem decisões que o inviabilizem (ex.: bindings e presets já versionados e
serializáveis são, de graça, o formato de um futuro marketplace).

---

## Regras de uso deste documento

1. **Ordem entre fases é dependência, não cronograma.** Dentro de cada fase, incrementos seguem o fluxo
   de governança normal e entram no master map como nós.
2. **Nenhuma fase reabre decisão travada/rejeitada sem ADR + sinal humano** (T11/T1 em P3; §4 em P1 —
   o ADR de P1 deve provar que binding-compilado ≠ rule-engine rejeitado, pelas 5 condições acima).
3. **Demand-gated significa demand-gated:** A7/P4 têm gatilhos nomeados; "seria bom ter" não é gatilho.
4. Ao fechar cada fase, atualizar: master map (nós/§7), este doc (marcar prova cumprida), memória
   (`luminaris-product-thesis`).
