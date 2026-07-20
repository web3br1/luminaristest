Todas as evidências decisivas verificadas. Segue o BOARD v2.

---

# BOARD DO COUNCIL v2 — Contabilidade Luminaris (Rodada 2: Réplica)
**Chairman consultivo · 2026-07-20 · base: worktree @ 32b059c · Ratificação = humana (mapa-mestre §5.1)**

**Duas linhas de verdade:** A rodada 2 sustenta a direção do v1 (validação humana antes de código novo) mas **derruba a manchete**: o "risco mais agudo" do v1 (`/api/package-balances` vazando dados) está na verdade **fail-closed** — o furo real de dinheiro é outro, novo e verificado: o modal de lançamento manual posta **"1.234,56" como R$ 1,23** silenciosamente (parseBrl sem hardening, balanceia e passa todos os gates). O risco principal desta réplica é o council aprovar exceções ao freeze que nunca convocam o humano — os dois artefatos de "redução de gate" já existentes apodreceram sem uma única sessão.

---

## 1. VEREDITOS SOBRE O BOARD v1

### 1.1 A9-auth — **EMENDADO (parcialmente derrubado)** — a emenda mais importante da rodada
- **Subclaim "package-balances lê contexto sem auth = furo de confidencialidade": DERRUBADO (verificado pelo chairman).** `authMiddleware` **stripa** os headers `x-user-*` de TODA request no topo (`auth.ts:62`) e só os re-injeta após verificar token no ramo protegido (`:96-101`); path não-protegido segue em `:84` sem re-injeção. O controller (`packageBalanceController.ts:16-17`) então recebe `getUserContextFromRequest` = null (`authUtils.ts:21` exige userId+username+role) → **401 sempre**. Grep confirma: `auth.ts:97` é o único injetor; `server.ts:47` aplica o middleware globalmente. O endpoint é **morto/não-funcional**, não vazante. Corolário: o "patch mínimo allowlist+package-balances" do v1 é uma **ativação funcional**, não um fechamento de furo.
- **Subclaim HEAD→GET: SUSTENTADO com severidade rebaixada** (verificado: `auth.ts:42` compara `method === rule.method`; HEAD passa o gate admin, mas resposta HEAD não serializa corpo — vaza status/Content-Length, não dados).
- **Ação permanece a mesma, com racional corrigido:** mergear o deny-by-default para (i) dobrar HEAD→GET e (ii) eliminar a fragilidade de o strip ser a única linha entre um futuro miss de prefixo e um vazamento real — não para "tapar vazamento aberto". A memória `critical-auth-bypass-case-sensitive-guard` deve ser corrigida.

### 1.3 Tie-out subrazão↔GL — **EMENDADO** (2 emendas verificadas)
- **BOUNDARY (verificado):** existe uma **3ª posição de recebível invisível** — o seam CRM debita a MESMA 1.1.2 do salão (`CrmOpportunityWonMapper.ts:16`) e **não existe** bridge/mapper de settlement CRM (listagem de `sync/bridges/` e `sync/mappers/` confirmada: só salon + o Won). O recebível CRM nunca baixa contra caixa. O diagnóstico tie-out deve nascer cobrindo **1.1.2 (salão+CRM) + 1.1.5 + 2.1.2**, senão declara verde um razão com furo conhecido.
- **minimal (verificado):** zero superfície de UI nova — o tab bar já tem 17 abas num flex sem wrap/overflow (`AccountingView.tsx:27-48, :119-137`, verificado). Resultado entra no balancete existente ou endpoint puro.

### 1.5 A5 MAX_CENTS — **EMENDADO** (3 emendas, 2 verificadas)
- **accounting (verificado):** os bridges skipam SÓ `ACCOUNTING_PERIOD_NOT_OPEN` e engolem o resto como "left for reconciliation" (`SalonSalesAccountingBridge.ts:96-103`). Mover MAX_CENTS ao postEntry com code novo SEM dobrar a skip-list dos 4 bridges + poison no re-drive = **loop eterno de evento-veneno**. O 1.5 vira **mudança única**: guard + skip-list + poison.
- **BOUNDARY (verificado):** `CrmOpportunityWonMapper.ts:33` valida `isSafeInteger` (2^53), não MAX_CENTS — mais uma borda com guard inventado, confirma a classe.
- **minimal:** o incremento só completa quando os guards de borda redundantes forem **deletados** (aceito; `assertUnderCeiling` do closing pode ficar — mensagem pré-postEntry acionável).

### 1.7 A3-DIM — **EMENDADO** (defeito concreto novo, verificado)
- **accounting (verificado pelo chairman):** `requiresDimension` **deadlocka o encerramento** — `ExerciseClosingService` compõe legs sem tag (`:74-113`) e o gate in-tx do postEntry rejeita leg sem tag em conta flagada (`PostingService.ts:229-239`). Flag em qualquer conta de resultado = exercício inencerrável = sem ECD PVA-clean. Estorno tem isenção explícita; encerramento não — assimetria esquecida, não decidida. Joint não-testado por um triz: `PostingService.test.ts` flaga exatamente `'3.1'` (verificado ~:1144) e `ExerciseClosingService.test.ts` tem **0** referências a dimensão (grep verificado). A ADR-nota do 1.7 ganha pré-condição: **isenção de escritores-máquina antes de qualquer push de adoção**.

### 2.1 B1-freeze — **EMENDADO** (direção sustentada 5/5; raio e remédio vão ao memo E1)
- **minimal (verificado):** o remédio "agente reduz custo do gate humano" já falhou 2× neste repo — `validate-accounting.sh` @565db61 (2026-07-01, era FE-INCR-1, curl sem Authorization) e `docs/runbooks/DEPLOYMENT.md` @b40cf70 (2026-06-25, nunca executado). **Kit não convoca humano.** Priorizar o que o agente EXECUTA (1 deploy real) sobre o que ESCREVE.

### 2.3 B3-estoque — **EMENDADO** (2 emendas)
- **Subclaim "gap CMV = correção urgente de demonstração": DERRUBADO por 5/5.** Sob Lucro Presumido (ADR-ECF ratificado: PVA computa presunção só de receita bruta 3.1/3.3), CMV não afeta base de imposto nenhuma; distorção é gerencial numa DRE nunca sign-offada. Dobra no fork.
- **REUSE (verificado parcialmente):** qualquer leg que toque o fixture deve antes centralizar os bindings conta→papel — literais duplicados em 7+ sites com drift já ocorrido (`CrmOpportunityWonMapper.ts:17` ainda comenta "Receita de Vendas", nome pré-rename — **verificado**).

### 2.6 NEW-B1 gate de reuso — **EMENDADO** (subestimava o problema; medições verificadas)
- O clone AP×AR tem espelho FE completo: painéis **565=565**, modais **368=368** linhas (**verificado por wc -l**); `resolveError` re-inlinado em **14 componentes** com ≥4 comportamentos (**14 arquivos verificados por grep**); e o dano de drift **não esperou o 3º clone — ocorreu no 2º**: parseBrl divergiu em bug de dinheiro (ver Achado N1). O gate cobre backend+FE+clones de técnica.

### Itens só-sustain (nenhum fato novo contra)

| Item v1 | Placar | Nota |
|---|---|---|
| 1.2 Counterparty A0.5 → executar ADR até o fim | 5/5 sustain | FE de contrapartes mergeado não muda o resíduo (FK NULLABLE etc.) |
| 1.4 A8-SPED: travar código fiscal até 1 ECD no PVA | 5/5 sustain | — |
| 1.6 A1-SoD: ADR-nota da chave sob membership | 5/5 sustain | — |
| 2.2 B4 ERP-gen = próximo esforço grande | 5/5 sustain | Cada clone da R2 é mais uma linha p/ o compilador absorver |
| 2.4 B2-ECF gate "ECD aceito no PVA" | 5/5 sustain | — |
| 2.5 B5 membership: só semântica | 5/5 sustain | — |
| 2.7 B6 diferidos | 5/5 sustain | — |
| A4 (1.1.5 dedicada), A7, A5-teto, A2-desenho | sustain | A6/T11: minimal tentou derrubar lendo o scheduler e **falhou** — registro de confirmação (T5) |

---

## 2. ACHADOS NOVOS DA RODADA 2 (dedupe entre lentes, por severidade)

**N1 [HIGH · CONFIRMED — verificado pelo chairman] Corrupção de dinheiro no lançamento manual** *(REUSE R2-1 ≡ INVARIANT R2-1)*
`JournalEntryModal.tsx:76-80` usa `s.replace(',','.')` + parseFloat — "1.234,56" → parseFloat corta no 2º ponto → **123 centavos (R$ 1,23)**; "1.000" → R$ 1,00. Débito e crédito usam o mesmo parser → **balanceia e posta silenciosamente errado**; postEntry só checa Σd=Σc. O hardening do FE-INCR-AP existe em `CreatePayableModal.tsx:37-49` (verificado, com o comentário anti-100×) mas nunca chegou ao modal do razão; `parseBrl.test.ts:2` importa só a cópia hardened (verificado). Classe `reuse-criterion-blind-to-reinlined-technique` materializada em dinheiro, mergeada em main.

**N2 [HIGH · CONFIRMED — verificado] Artefatos de redução-de-gate apodrecem sem convocar o humano** *(minimal R2-3)*
`validate-accounting.sh` @2026-07-01 (escopo FE-INCR-1, sem auth) e `DEPLOYMENT.md` @2026-06-25 (nunca executado) — datas git verificadas. Modo de falha demonstrado do remédio central do 2.1; muda o desenho do sprint (executar > escrever).

**N3 [MEDIUM · CONFIRMED — verificado] Reclassificação do RISK-SEC-AUTH-001** *(INVARIANT R2-2)*
Ver veredito 1.1: endpoint fail-closed, defeito funcional; memória e board corrigidos.

**N4 [MEDIUM · CONFIRMED — verificado] Seam CRM defeituoso em 3 eixos** *(BOUNDARY R2-1/R2-2 + parte do 1.5)*
(a) Recebível órfão: debita 1.1.2 sem nenhum settlement (verificado por listagem); (b) ignora o split de natureza — credita sempre 3.1 "serviços" mesmo p/ revenda → base de presunção ECF errada quando exercitado (comentário stale verificado); (c) guard fraco isSafeInteger. Nunca revisitado pós-REVENUE-SPLIT.

**N5 [MEDIUM · CONFIRMED — verificado] DRE-por-dimensão não exclui o encerramento** *(accounting R2-1)*
`DimensionReportService.ts:286-294` chama `groupByAccountAndDimension` **sem** `excludeSourceTypes` (verificado), enquanto DRE/DFC/SPED/Closing passam `[CLOSING_SOURCE_TYPE]` (grep verificado). Pós-closeExercise, resultByDimension numa janela com 31/12 vira totais ≈0 + bucket "(Não alocado)" gigante — quebra a identidade ACC-024. **Agravante de sequência:** o kit-PVA roda o encerramento ANTES do sign-off da aba → tela seria sign-offada corrompida. Fix = 1 linha.

**N6 [MEDIUM · CONFIRMED — verificado] `requiresDimension` deadlocka escritores-máquina** *(accounting R2-2)*
Ver veredito 1.7. Latente (flag default-off, zero adoção); pré-condição de adoção, não exceção ao freeze.

**N7 [MEDIUM · CONFIRMED — verificado] Clone sistemático de técnica no FE contábil** *(REUSE R2-2 ≡ BOUNDARY R2-5 + REUSE/minimal R2-3/R2-2)*
`resolveError` 14× com corpos divergentes (14 arquivos verificados); `formatCents` re-inlinado apesar de `lib/formatCents.ts` no mesmo feature; espelho FE AP×AR 565=565/368=368 (verificado). Mesmo erro do apiClient renderiza diferente por aba — exatamente a superfície do sign-off pendente.

**N8 [MEDIUM · CONFIRMED — verificado] 17 abas num tab bar sem overflow/wrap em max-w-5xl** *(minimal R2-1)*
`AccountingView.tsx:27-48` (17 entradas, verificado) + `:119` flex sem wrap (verificado). Defeito de classe UI nunca visto porque zero sessões de browser.

**N9 [MEDIUM · CONFIRMED — verificado] Tenancy do FE contábil resolvida por regex fuzzy sobre DynamicTable** *(BOUNDARY R2-3)*
`useAccountingData.ts:42-44`: fallback `/unidade|units/i` sobre nome de exibição de tabela criável pelo usuário pode fornecer `unitId` espúrio a todas as abas (verificado); + paginação 50 sem fetch-all (`:52`).

**N10 [MEDIUM · CONFIRMED — verificado] Reconcile job descobre tabela CRM sem filtro `deletedAt`** *(BOUNDARY R2-4)*
`accountingSyncReconcile.job.ts:808-811` (verificado): tabela soft-deletada continua dirigindo escrita no razão a cada ciclo; + prisma direto fora de repository no wiring.

**N11 [MEDIUM · PLAUSIBLE] Canônico latente ACCOUNT_ROLES** *(REUSE R2-4)* — 7+ sites de literal conta→papel; drift verificado em 1 site (CRM mapper), demais reportados não re-verificados.

**N12 [LOW · PLAUSIBLE] Classe UTC-hoje no input de datas (9+ painéis)** *(accounting R2-3)*; **N13 [LOW · PLAUSIBLE] Comparativo sem rótulo de closing-awareness** *(accounting R2-4)*; **N14 [processo] Regra da fixture-joint canônica** *(accounting R2-5 — N5/N6 são a prova de que reviewer PASS individual não cobre joints)*; **N15 [registro T5]** i18n 732=732, formatDate no canônico, scheduler sadio — território não-semeado com saúde confirmada.

---

## 3. MEMO DE DECISÃO AO DONO (E1/E2/E3)

### E1 — Raio do freeze
**Placar:** 5/5 rejeitam freeze total E raio maior; 5/5 aceitam **exceções nomeadas como lista fechada**. Divergência só no conteúdo: REUSE quer +parseBrl (lista de 4); INVARIANT quer +parseBrl e reframe da (a); accounting quer +one-liner de dimensão, com critério "falsificaria o sprint"; BOUNDARY quer teste binário (zero rota nova + fecha RISK-*/executa ADR ratificado) e tie-out cobrindo 1.1.2; minimal aceita as 3 com caducidade de 30 dias e teto de 1 kit novo.
**Recomendação do chairman (pronta para ratificar):** freeze do Bloco B com **lista fechada de 5 exceções, não-renovável sem novo council, caducando em 30 dias sem sessão humana**: (a) deny-by-default + fold HEAD→GET — racional corrigido: robustez, não vazamento; (b) NOT NULL counterparty (resíduo de ADR ratificado); (c) diagnóstico tie-out cobrindo **1.1.2 salão+CRM + 1.1.5 + 2.1.2**, zero UI nova + MAX_CENTS no postEntry **como mudança única** (guard + skip-list dos 4 bridges + poison no re-drive + deleção dos guards de borda); (d) **parseBrl canônico em lib/ importado nos 3 modais + teste estendido** — bug de dinheiro verificado, FE-only (N1); (e) **one-liner excludeSourceTypes no DimensionReportService** — sem ele o sprint sign-offa tela corrompida (N5). Critério para qualquer 6ª proposta (substitui "ortogonal"): *zero rota/migration nova E (fecha risco declarado OU falsificaria o próprio sprint de validação)*. Esforço restante do agente: **executar** 1 deploy real single-process + kit-PVA (único kit permitido). **Custo de recusar (d)/(e):** sign-off humano validando valores errados — anula o propósito do sprint. **Custo de aceitar:** ~4 arquivos além das 3 originais; risco de precedente contido pela caducidade + critério.

### E2 — Fork Estoque + gap CMV
**Placar:** fork reescrito **A/D/DEFER ratificado 5/5** (B/C eliminadas por contrato, não por voto). Voto de mérito: **D lidera 4/5** (REUSE, BOUNDARY, INVARIANT-se-construir, accounting-pré-ratificada-demand-gated) vs DEFER-puro (minimal, com D como único fallback aceitável). **Gap CMV como urgência: derrubado 5/5** — sob Presumido não afeta imposto; distorção gerencial em DRE nunca sign-offada.
**Recomendação do chairman:** ratificar a leg **D (regime periódico) como pouso pré-decidido, execução demand-gated** — gatilho: vertical-2 do B4 vender produto OU 1º tenant real com revenda relevante. Zero mudança de fixture durante o freeze; quando executar, pré-condições: centralizar bindings conta→papel (N11) e, se o dono preferir A, rodar antes o gate 2.6 sobre o par AP×AR completo (backend+FE ≈ 2.200 linhas de clone medidas). Ação imediata zero-código: registrar no mapa "DRE sem custo pareado p/ 3.3 — regime pendente". **Custo do DEFER-puro:** re-council futuro; **custo do D-agora:** código+conta+sign-off novos sob freeze para erro que ninguém pode ver. D-pré-ratificada-demand-gated captura o melhor dos dois.

### E3 — Política "sem incremento novo de X até uso real de X"
**Placar:** versão dura **rejeitada 4/5** (só minimal, e mesmo ele com válvula de dispensa do dono — que na prática converge com os enfraquecidos). Convergência real 5/5 em três pontos: (i) o fato "X nunca foi usado" fica **escrito no ADR** no momento da decisão; (ii) o dono **pode sobrepor**, mas o override fica **registrado e contável**; (iii) cláusula de validador-externo — cadeias SPED gateiam em PVA, não em "uso" (INVARIANT/accounting).
**Recomendação do chairman:** ratificar como **default de roteamento, não bloqueio**: todo PRE-ADR de incremento sobre família X apresenta obrigatoriamente "evidência de uso real do antecessor: sim/não+qual"; sem uso, default = DEFER; o dono fura com 1 linha ("construído sem evidência de uso, por apetite declarado — risco de joint não-exercitado aceito"). A rodada 2 produziu a prova empírica da regra: **N6 é um deadlock entre dois increments sem uso (DIM × APURAÇÃO), ambos com reviewer PASS individual** — joints de features não-usadas nunca são exercitados. **Custo da versão dura:** bypass não-registrado (o dono já recusou DIFERIR 2×) e bloqueio indevido de cadeias de compliance; **custo de rejeitar tudo:** perder o rastro auditável que teria pego N6 antes do merge.

---

## 4. O QUE MUDOU DO v1 → v2

1. A manchete do v1 caiu: package-balances é **fail-closed** (strip de headers), não vazamento — o furo verificado de verdade agora é o **parseBrl do razão manual** (R$ 1.234,56 → R$ 1,23, silencioso).
2. O tie-out ganhou uma 3ª posição obrigatória: recebível **CRM órfão em 1.1.2**, sem settlement e ignorando o split de natureza.
3. Dois defeitos de **joint entre increments mergeados** (DIM×APURAÇÃO): dimensão deadlocka o encerramento; DRE-por-dimensão não exclui closing — 1 linha de fix elegível ao freeze.
4. "Kit reduz o gate humano" tem modo de falha demonstrado no próprio repo (2 artefatos apodrecidos) → sprint prioriza **executar** deploy, não escrever roteiros.
5. A família de clones dobrou de tamanho ao incluir o espelho FE (565=565/368=368, resolveError ×14) — o gate 2.6 passa a cobrir backend+FE+técnica.

## VIÉSES (T8)

As 5 réplicas leram o mesmo board v1 e as mesmas memórias — a unanimidade "CMV não urgente" e o quase-consenso em D podem ser ancoragem na reescrita do chairman da rodada 1, não 5 medições. E a rodada 2 continua estrutural: nenhum achado foi confirmado por request/render real — inclusive o "fail-closed" do N3, que é leitura de código, não probe — num sistema cujo gargalo declarado é exatamente a ausência de execução real.