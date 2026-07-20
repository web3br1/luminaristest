Verificação concluída. Todos os cinco achados mais severos checados contra código/memória nesta sessão. Segue o BOARD final.

---

# BOARD DO COUNCIL — Contabilidade Luminaris
**Chairman consultivo · 2026-07-20 · base: worktree @ 32b059c (fila drenada) · Ratificação = humana (mapa-mestre §5.1)**

**Duas linhas de verdade:** O council converge 5/5 lentes em que o próximo esforço deve ser validação humana (deploy + PVA + sign-off), não mais código — e o risco mais agudo VERIFICADO é `/api/package-balances` sem auth em main com o fix deny-by-default pronto e parado fora dela. A divergência mais valiosa está em Estoque (B3): o fork apresentado ao humano estava mal-posto — duas legs são barradas por contrato e a resposta contábil mínima (regime periódico) nem constava.

## Nota de verificação (5 mais severos)

| Achado | Veredito | O que a checagem viu |
|---|---|---|
| A9 auth (package-balances + HEAD→GET) | **CONFIRMED** | `auth.ts:5-28` sem `/api/package-balances`; `routes/index.ts:72` monta a rota; `auth.ts:42` compara `method === rule.method` sem dobrar HEAD; `decodeURIComponent` presente em `:73` |
| Closeout A1 contraparte incompleto | **CONFIRMED** | `schema.prisma:854/:924` FK NULLABLE com comentário SEC-A1-5; `@@unique` segue chaveada em `supplierName`/`customerName` (`:869/:939`); `supplierRef`/`customerRef` persistem (`:846/:916`) |
| Conta de controle aceita lançamento manual / tie-out sem checagem | **CONFIRMED** | `ChartOfAccountsFixture.ts:35/:45` — 1.1.5 e 2.1.2 `acceptsEntries:true`; `PostingService.ts:151` único gate por conta é sintética-vs-analítica; `:182` `sourceType` default `'manual'` sem restrição; `AgingReportService` lê só os repos de subrazão |
| MAX_CENTS ausente do choke-point | **CONFIRMED** | grep `MAX_CENTS|isInteger` em `PostingService.ts` = **0 hits**; postEntry só checa Σdébito=Σcrédito (`:176-179`) |
| Gargalo humano / tese nunca exercitada (base de B1/A8/B4) | **CONFIRMED** (como estado) | memória `accounting-gargalo-is-human-validation.md` atualizada 2026-07-16 bate com o delta: PVA, browser sign-off e deploy seguem não descarregados; smoke-gates provaram estrutura, não uso |
| (subclaim) "DRE superavalia resultado da revenda 3.3 em 100%" | **PLAUSIBLE** (rebaixado) | CONFIRMADO que o plano não tem conta Estoque nem CMV (fixture só tem `4.1`); mas compras via AP podem estar sendo despesadas em 4.x na compra — o erro real é de regime/competência, não necessariamente 100% de superavaliação |

---

## SEÇÃO 1 — DECISÕES TOMADAS: aberturas para questionamento

### 1.1 [HIGH · CONFIRMED] A9 — Borda de auth: furo aberto com fix pronto fora de main
- **Decisão original:** #118 mergeado mantendo allowlist como mecanismo; deny-by-default (PASS em review 2-eixos) não mergeado.
- **Quem levantou:** INVARIANT (com apoio de todas as lentes via B1).
- **Abertura:** três fatos verificados — (1) `/api/package-balances` montado e fora da allowlist (controller lê contexto de usuário sem auth); (2) `isAdminOnly` keyed por método sem dobrar HEAD→GET — `HEAD /api/users` com token USER executa handler ADMIN-only; (3) o mecanismo segue sendo a allowlist que comprovadamente gera a classe de furo. Nota: o merge do deny-by-default deve **remover** o `decodeURIComponent` (defende vetor inexistente sob allowlist; seria errado sob deny-by-default).
- **Ação proposta:** não é reabrir travada — é fechar risco declarado (RISK-SEC-AUTH-001). Sinal humano para mergear o deny-by-default ANTES de qualquer novo endpoint; enquanto não merge, patch mínimo em main = allowlist + package-balances e fold HEAD→GET. **É a ação de maior urgência/menor custo do board.**

### 1.2 [HIGH · CONFIRMED] A2/NEW — Counterparty A1: pago por integridade máxima, operando em ~A0.5
- **Decisão original:** F-CP1→A1 (first-class + FK), dono recusou a alternativa barata.
- **Quem levantou:** REUSE (high) + BOUNDARY (2 achados) — **convergência de 2 lentes, mesma essência**.
- **Abertura:** o desenho está DEFENDIDO (a FK não cruza a fronteira DT — verificado), mas o estado de transição não tem data: FK NULLABLE, `counterpartyId` opcional no DTO, `@@unique` ainda chaveada no NOME (invariante "um payable vivo por fornecedor×documento" é por-grafia), e TRÊS ponteiros para a mesma entidade (name snapshot + supplierRef/customerRef legado + FK). O aging já embutiu o balde "(Sem contraparte)" como feature — o incentivo de fechar cai a cada dia.
- **Ação proposta:** sem ADR novo para o grosso — **executar o ADR até o fim** (fila §5.1): 2º migration NOT NULL (SEC-A1-5) + `counterpartyId` obrigatório nos DTOs + smoke-gate no dev.db real. Emenda leve de ADR (sinal humano, custo ~zero): deprecar escrita de `supplierRef`/`customerRef` novos e decidir se a `@@unique` migra para `counterpartyId+documentNumber`.

### 1.3 [MEDIUM · CONFIRMED] NEW — Tie-out subrazão↔GL existe só como comentário; contas de controle aceitam lançamento manual
- **Decisão original:** derivada de A4/F7 (a razão de ser do 1.1.5 é o tie-out) — nunca materializada.
- **Quem levantou:** REUSE + accounting-architect — **convergência de 2 lentes, achado novo (não estava no docket)**.
- **Abertura:** Σ open Receivables == saldo(1.1.5) vale só por convenção: nada impede `postEntry` manual debitando 1.1.5/2.1.2 (verificado), nenhum relatório reconcilia, e o aging só enxerga a subrazão — recebível do salão (1.1.2) é invisível a ele. Duas "posições de recebível" podem divergir em silêncio.
- **Ação proposta:** incremento pequeno read-only, sem reabrir nada: diagnóstico de tie-out (Σ subrazão aberta vs saldo 1.1.5/2.1.2, padrão dos diagnostics INCR-4) + rótulo na UI ("aging cobre AR-formal; posição do salão vive no vertical"). A opção dura (gate no postEntry rejeitando `manual` em conta controlada, flag no Account estilo `requiresDimension`) exige ADR curto (emenda AR/AP) + sinal humano.

### 1.4 [HIGH · CONFIRMED via memória] A8 — Ramo SPED inteiro construído antes de 1 import no PVA
- **Quem levantou:** minimal + accounting-architect — **convergência 2 lentes, mesma severidade**.
- **Abertura:** o critério de aceite de 5+ increments nunca rodou; o próprio projeto já provou a classe de erro (I052; 3 pontos inferidos da ECF Fase 1 derrubados pelo manual). Rejeição no PVA contamina a família de registros compartilhada ECD→Apuração→ECF. Núcleo 5 "~70%" é, para o fisco, 0% certificado.
- **Ação proposta:** sunk — manter o código. TRAVAR: nenhum código fiscal novo até 1 ECD aceito no PVA (de-riska os 3 de uma vez). Agente prepara o kit-PVA (gerar o .txt do dev.db real + roteiro numerado) para reduzir o gate humano a minutos. Promover "PVA verde" a pré-condição de roteamento no mapa = ADR-nota + sinal humano.

### 1.5 [MEDIUM · CONFIRMED] A5 — T4 Int32: teto certo, enforcement no lugar errado
- **Quem levantou:** INVARIANT (abertura) + minimal e accounting (DEFENDIDA) — divergência só de ênfase.
- **Abertura:** T4 em si defendido por 3 lentes (não reabrir BigInt). Mas o guard MAX_CENTS está em ~20 pontos de borda e **ausente do choke-point `postEntry`** (verificado, grep=0); leg acima do teto via bridge vira erro opaco/evento-veneno no reconcile; `ExerciseClosingService` já replicou o guard por conta própria (anti-padrão class-fix). Bônus da lente contábil: o breach-point mais precoce é a perna do encerramento anual (fatura anual da conta), não a venda diária.
- **Ação proposta:** manter T4; incremento pequeno sem ADR: mover MAX_CENTS + `Number.isInteger` para dentro de `postEntry` com `code` específico skipável pelos jobs. Registrar o gatilho "receita anual por conta ~R$15M" como sinal de reabertura.

### 1.6 [MEDIUM · CONFIRMED] A1 — SoD: a emenda F3 é correta, mas a chave nunca constrangerá o dono
- **Quem levantou:** accounting-architect (DEFENDIDA integral) vs INVARIANT (furo estrutural) — **divergência parcial genuína**.
- **Abertura:** metade mecânica (ACC-022/023) é incondicional e real — verificado. Mas `owner !== actor` significa que, MESMO com membership, o dono operando os próprios livros terá SoD OFF para sempre; "endurece sozinha" vale só para delegados. Numa firma real, o dono é exatamente quem o maker-checker clássico constrange.
- **Ação proposta:** não reabrir F3 agora. ADR-nota no ADR-INCR-APPROVAL: chave da SoD sob membership = "existe aprovador elegível distinto no escopo", não owner≠actor; + teste de que o período SoD-off fica distinguível na trilha (`approvedById==createdById` é fato histórico legítimo).

### 1.7 [HIGH · divergência real] A3 — INCR-DIM: desenho defendido, sequência atacada
- **Quem levantou:** minimal (HIGH contra) vs REUSE e BOUNDARY (DEFENDIDA) — **a divergência mais nítida do Bucket A**.
- **Abertura:** as duas leituras são compatíveis e ambas verdadeiras: o desenho está certo (catálogo Prisma é o caso-limite onde a linha de integridade do §2.1 vence; o par DIM+COMPLETENESS é o padrão-ouro de reconciliação Σ-dimensão==total) E a sequência foi cara (enforcement empilhado sobre feature que nenhum humano jamais usou; o bucket "(Não alocado)" existe porque não há alocação real).
- **Ação proposta:** não reverter (ACC-024 protege o ledger). ADR curto + sinal humano: `requiresDimension` permanece default-off e NENHUM incremento novo de dimensões até evidência de uso real da etiqueta (≥1 tenant etiquetando). Registrar no contrato a nota do caso-limite §2.1.

### DEFENDIDAS (uma linha cada — refutação tem valor)
- **A4 (1.1.5 dedicada):** DEFENDIDA por 3 lentes (REUSE, BOUNDARY, accounting) — é a única forma de ter tie-out; elevar a regra "toda subrazão futura nasce com conta de controle dedicada" ao mapa §6. Resíduo → item 1.3.
- **A7 (TaxRegime transiente):** DEFENDIDA por 2 lentes — artefato persiste byte-a-byte com sha256 no hash-chain; 1 linha no ADR: "D4 expira quando o regime deixar de ser constante de código (ECF F3 re-decide)".
- **A5 (teto Int32 em si):** DEFENDIDA por 2 lentes — limite explícito com gatilho auto-anunciante; só o enforcement muda (item 1.5).
- **A2 (desenho first-class do counterparty):** DEFENDIDA pela BOUNDARY — a FK não cruza a fronteira; o problema é execução incompleta (item 1.2).
- **A6/T11 (single-process/SQLite):** nenhuma lente atacou o desenho; o ataque unânime é que ele **nunca foi exercitado por deploy** — vai para B1.

---

## SEÇÃO 2 — PASSOS FUTUROS: mudanças de direção (por impacto)

### 2.1 [HIGH · convergência 5/5] B1 — Congelar Bloco B; sprint de validação (deploy + PVA + sign-off)
- **Quem:** TODAS as lentes, cada uma pelo próprio argumento (REUSE: "vivo?" é indecidível sem uso; BOUNDARY: o backlog legítimo sem-ADR é pequeno; INVARIANT: cada increment empilha superfície sobre allowlist furada; minimal: estoque acumulando na frente da estação parada; accounting: razão nunca certificado não é ativo).
- **Divergência de GRAU (única):** freeze total (minimal, accounting) vs ordenação mínima permitindo código sem rota nova (INVARIANT) vs só resíduos de ADRs ratificados (BOUNDARY).
- **Recomendação do chairman:** freeze com duas exceções nomeadas e finitas — (a) merge do deny-by-default + patch A9 (pré-condição de expor qualquer coisa); (b) resíduos deste board que reduzem risco sem rota nova (1.2 NOT NULL, 1.3 diagnóstico tie-out, 1.5 guard no choke-point). Todo o resto do esforço de agente vira **redução do custo do gate humano**: 1 deploy real single-process (valida T11+auth+Chromium juntos), kit-PVA, roteiro de sessão única de browser sign-off. Descongelamento por evento observável: 1 ECD aceito no PVA OU 1 sessão de sign-off concluída.

### 2.2 [HIGH · convergência 4/5] B4 — Exercitar a tese ERP-gen antes de nova profundidade contábil
- **Quem:** REUSE + BOUNDARY + minimal + accounting (ângulos distintos que somam): cada subrazão nova é clone manual que o futuro compilador terá de absorver; todo o aparato de enforcement do §2.1 foi construído para proteger a GERAÇÃO e nunca foi exercitado por ela; a contabilidade está ~95/80/85/70% e o diferencial do produto está em 0% de evidência; gerar o vertical 2 é também o teste do próprio ledger (N=2 da invariância).
- **Direção:** após o sprint 2.1, o próximo esforço GRANDE = PRE-ADR do spike ERP-gen (2º vertical mínimo: preset + binding compilado + intérprete fixo → AccountingEvent → PostingService imutável, condições 1–5 da memória da tese). NF-e/Folha/Estoque passam a ser **puxados pela demanda do vertical 2**, não pela completude contábil. Frente ⚫ ⇒ ADR + sinal humano.

### 2.3 [HIGH · divergência real — escala ao dono] B3 — Estoque: o fork apresentado estava mal-posto
- **Quem:** 4 posições distintas — a divergência mais rica do council:
  - BOUNDARY: legs B/C são **barradas por contrato** (§2.1/§4) — mantê-las no fork cria ratificação-por-comparação contra alternativa ilegal; fork correto é binário A vs DEFER.
  - minimal: default DEFER até demanda real; **B4 decide B3**, nunca o contrário.
  - accounting: nenhuma leg era a resposta mínima legítima — falta a **leg D (regime periódico)**: contas Estoque/CMV no fixture + ajuste por contagem via postEntry, zero tabela nova. E nomeou o furo que ninguém viu: **não existe conta CMV/Estoque no plano (CONFIRMED)** — a receita 3.3 não tem custo pareado (grau: erro de regime/competência PLAUSIBLE, ver nota de verificação).
  - REUSE: qualquer leg deve abrir com a pergunta de posse (fonte única de quantidade — nunca dual-write).
- **Recomendação do chairman:** reescrever o fork antes de qualquer ratificação: **A (perpétuo first-class) vs D (periódico, mínimo contábil) vs DEFER** — C/B eliminadas por contrato, não por voto. D1 segue do humano. Independente do fork, avaliar o gap CMV como correção de demonstração (começa por confirmar onde as compras de revenda estão sendo lançadas hoje).

### 2.4 [MEDIUM · convergência 3/5, defendida] B2 — ECF Fase 3: manter gated, e generalizar o gate
- **Quem:** INVARIANT + minimal + accounting — todas DEFENDEM o gate atual (único da fila com a forma correta: código novo condicionado a validação EXTERNA do anterior).
- **Direção:** manter; refinamento contábil: o gate certo é "**ECD aceito no PVA**" (de-riska a família toda), não só ECF F2. Elevar a regra de classe: nenhuma Fase N+1 SPED sem validação externa da Fase N. Escrever na fila item 10: o ADR da F3 DEVE re-decidir D4.

### 2.5 [MEDIUM · convergência 3/5] B5 — Membership: não antecipar a construção; antecipar só a semântica
- **Quem:** INVARIANT + minimal + accounting convergem em NÃO antecipar (segregação serve a pessoas que existem). O que antecipa é decisão, não código: a nota da chave SoD (item 1.6) + corolário A10: **FE-INCR-APPROVAL fica atrás de membership** (UI de ciclo que ninguém pode exercer = vitrine). Pacote único quando o gatilho disparar: membership + FE-APPROVAL + teste de trilha SoD-off→on.

### 2.6 [MEDIUM · lente única] NEW-B1 — Gate de reuso antes do 3º clone de subrazão
- **Quem:** REUSE. AP×AR já são 2 clones vivos quase idênticos (~3 campos de diferença; o aging já precisou de um normalizador `OutstandingLine` — sinal clássico de canônico latente). O 3º clone (Estoque leg A ou Folha) não pode nascer sem rodar o _REUSE-CRITERION sobre o par e registrar no ADR: extrair esqueleto canônico de subledger OU sancionar a divergência por escrito.

### 2.7 [LOW] B6 — LGPD/RBAC/inbox-outbox: manter diferidos
- **Quem:** INVARIANT. Diferimento são; a premissa "autorização no servidor já vale" só volta a ser verdadeira com o fold HEAD→GET (dentro do item A9, não como frente nova).

---

## DIVERGÊNCIAS DO COUNCIL (o que escala ao dono)

1. **B3 Estoque — a maior.** Não é "A vs C": duas legs do fork original são ilegais por contrato e a resposta contábil mínima (regime periódico) nem estava no menu. **Eixo real em disputa:** o que conta como "mínimo" — mínimo de *código* (DEFER, minimal) vs mínimo *contabilmente legítimo* (leg D, accounting) vs mínimo *estrutural correto* (binário A/DEFER, boundary). Decisões do dono: D1 (perpétuo agora?) + aceitar o fork reescrito A/D/DEFER.
2. **A3 DIM — desenho vs sequência.** REUSE/BOUNDARY defendem o desenho; minimal ataca a alocação de esforço (enforcement antes de adoção). Não são contraditórias — mas a regra que resolve ("nenhum incremento novo de X até evidência de uso de X") é uma política de roteamento que só o dono pode ratificar, porque contradiz o apetite dele demonstrado (ele recusou DIFERIR duas vezes).
3. **B1 grau do freeze.** Consenso na direção, dissenso no raio das exceções ("ortogonal" é racionalização auto-renovável? — minimal diz sim, INVARIANT/BOUNDARY aceitam exceções nomeadas). O chairman propôs a lista fechada de 3 exceções como compromisso; o dono arbitra o raio.
4. **A1 SoD.** accounting defende a emenda integralmente; INVARIANT mostrou que a chave `owner≠actor` exclui o dono para sempre. Convergem na ação (nota de ADR), divergem no quanto a promessa "endurece sozinha" era verdadeira quando ratificada.

## VIÉSES DO PRÓPRIO COUNCIL (T8)

Todas as 5 lentes são agentes lendo as mesmas memórias — o consenso 5/5 em B1 pode ser eco da memória do gargalo (escrita pela mesma linhagem de agentes), não 5 medições independentes. A verificação foi estrutural (arquivos/greps), não de runtime: "furo de auth" foi confirmado por leitura, não por request real. E nenhuma lente representa demanda de usuário/mercado — o council enxerga custo de código com nitidez e valor de produto por inferência, o que enviesa sistematicamente contra construir e a favor de congelar.