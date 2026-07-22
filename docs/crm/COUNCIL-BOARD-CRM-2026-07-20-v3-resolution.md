# RESOLUÇÃO DE FECHAMENTO DO CONSELHO — CRM/Seam de Receita
**Data:** 2026-07-20 · **Chair:** Presidente do Conselho · **Status:** RECOMENDADA para assinatura do dono (§5.1) — o Conselho NÃO ratifica sozinho

## Resolução em duas linhas
A diretoria **fecha por unanimidade a sequência de-risco**: executar JÁ o kit de validação de ~1 dia (D6) + os dois patches de simetria T6 e o chip de segurança (D5), congelar os 22 gaps exceto WhatsApp/#20 e o piso (D4), e abrir o PRE-ADR do seam de receita antes de qualquer código novo que toque dinheiro (D1) — nada disso compromete direção de produto nem gasta caixa especulativo.
Fica **reservado à assinatura do dono (§5.1)**: a aposta estratégica da tese ERP-gen e a ordem exercitar-gerador × aprofundar-à-mão (D2, escolha A×B), o modelo de produto Lead × Opportunity (D3) e a **ratificação** do desenho do seam (D1 abre o desenho; a decisão contábil-estrutural é do dono) — três escolhas que nenhuma cadeira executiva pode fechar por ele.

---

## APURAÇÃO DA CÉDULA

| # | Decisão | CEO | CTO | CFO | CISO | COO | Status consolidado | Dono | Condição / Gatilho |
|---|---|---|---|---|---|---|---|---|---|
| **D1** | PRE-ADR do seam de receita antes de trabalho novo de CRM que toque receita | ratify | ratify | ratify | ratify (adv.) | ratify | **RATIFICADO-recomendado** (abre o desenho; ratificação do desenho é do dono) | luminaris-accounting-architect + CTO (desenho) | PRE-ADR com parecer accounting-architect **antes de qualquer commit de receita**; decidir explícito: (a) receita-de-opp via subrazão AR 1.1.5 vs direta, (b) binding conta-por-papel como **DADO** não runtime, (c) dead-letter/quarentena p/ Won-sem-unitId. **Não segura o kit (D6).** |
| **D2** | Gate "operar 1 negócio real primeiro"; escolha exercitar-gerador (v1-B) × aprofundar-à-mão | ratify | ratify | ratify | ratify | ratify | **RATIFICADO-recomendado** para o GATE; **DEVOLVIDO-AO-DONO** para a escolha A×B | CEO (aposta) | Gate só abre com **kit D6 verde + 1 negócio real bookando receita ponta-a-ponta** em build de produção. CFO/CISO: **D5+D6 são pré-requisitos** (matriz 2-tenants verde antes de tenant real). Escolha A×B → ADR posterior, assinatura do dono. |
| **D3** | Modelo Lead × Opportunity: (a) elevar Opp [v1] · (b) remover 2ª pipeline [v2-salão] · (c) manter-e-adiar | defer | defer | defer | **abstain** | defer | **DEVOLVIDO-AO-DONO** (produto §5.1) / adiado-com-gatilho | Dono (produto) | **Divergência registrada:** CEO interino = *ocultar 2ª pipeline no preset do salão sem deletar código*; CTO/CFO recomendam **(c) reversível** (remover é irreversível, ampu­ta superfície B2B futura); CISO nota que D5 é ortogonal, não espera por isto. Reabrir após kit verde + sinal do 1º operador real. |
| **D4** | Congelar os 22 gaps vs Salesforce, exceto #20 (web-to-lead/WhatsApp) + piso (tarefa+lembrete, notas/anexos) | ratify | ratify | ratify | ratify | ratify | **RATIFICADO-recomendado** | CEO / CTO | Triar #20 com lente **canal-do-molde (WhatsApp explícito)**, não paridade Salesforce. CTO: reminderAt/nextActionAt (grep=0 consumidor FE) ganham consumidor OU são ocultados (patch T6). **CISO:** #20 = ingestão não-autenticada → exige validação de input + rate-limit/anti-spam como requisito, não gap P2. |
| **D5** | Segurança: chip do oráculo + magic-bytes de imagem + kit como gate pré-deploy | ratify | ratify | ratify | **ratify (dono)** | ratify | **RATIFICADO-recomendado** | **CISO** | Chip só fecha se cobrir os **3 métodos** (advanceStage/createProposal/recordNoShow) — merge parcial não conta. **Divergência magic-bytes:** CEO/CTO/CFO = **adicionar** assinatura PNG/JPEG (fix custa 1 função, espelha checks já no uploadSecurity.ts); CISO = adicionar **OU** registrar RISK-SEC-UPLOAD com dependência de Content-Disposition documentada — nunca dívida invisível; COO = aceita risco mitigado agora, assinatura antes do 1º consumidor inline. Kit = gate pré-deploy: unânime. |
| **D6** | Executar o kit de validação (~1 dia) como PRÓXIMA ação concreta | ratify | ratify | ratify | ratify | ratify | **RATIFICADO-recomendado — PRÓXIMA AÇÃO** | **COO** (+ CISO dono do item 7, matriz 2-tenants) | Backfill dos 80 unitId nulos **sob regra de tenancy EXPLÍCITA** (unidade errada mis-roteia receita), não cego; rodar contra o dev.db real aninhado `server/prisma/prisma/dev.db`; **build de produção** (não next dev) p/ a prova de fetch-all; 7 provas numeradas na ordem; **matriz adversarial de 2 tenants (item 7) roda ANTES de declarar verde**. Aceite = `SELECT count WHERE unitId IS NULL = 0` + provas #2-#4 tratadas como aceite de reporte. |

**Placar global:** D1 5-0 · D2 5-0 (gate) · D3 0 ratify / 4 defer / 1 abstain · D4 5-0 · D5 5-0 · D6 5-0.

---

## RESOLUÇÃO (sequência executável)

### Bloco A — executa JÁ (sem ADR, sem cruzar fronteira, sem assinatura do dono)
1. **[D6 · COO] Kit de validação de ~1 dia — a PRÓXIMA ação, de maior EV do board.** Backfill dos 80 leads com unitId nulo sob regra de tenancy explícita → seed >200 linhas → 7 provas numeradas rodadas em build de produção contra `server/prisma/prisma/dev.db`. Falsifica de uma vez os 4 furos de dinheiro do seam (#2 duplo-cego, #3 re-Won/drift, #4 Won-sem-unitId) + os 2 furos de segurança + fetch-all. Aceite objetivo por prova, não smoke informal.
2. **[D5 · CISO/CTO] Mergear o chip do oráculo** cobrindo os **3 métodos** abertos (advanceStage/createProposal/recordNoShow) — simetria T6 com os 3 já blindados, risco de desenho zero.
3. **[D5/D4 · CTO] Colapsar `dynamic-tables.client.ts`** para chamar `fetchAllRows` em vez do loop re-inlinado (patch T6, fecha a duplicação byte-a-byte do fetch-all).
4. **[D5 · CISO] Magic-bytes:** adicionar assinatura PNG/JPEG a `validateMagicBytes` (espelha os checks PDF/office que já existem no arquivo). *Fallback ratificado se adiado:* registrar **RISK-SEC-UPLOAD** com a dependência "segurança depende de Content-Disposition:attachment — qualquer consumidor que renderize inline reabre o vetor". Nunca dívida silenciosa.
5. **[D1/D6 · COO] Patch de observabilidade no loop de reconcile** (dead-letter + max-retry/backoff + alerta em `summary.failed`) para o Won-imbookável parar de queimar trabalho a cada 300s sem sinal — **independente** do desenho de subrazão AR.
6. **[D4] Congelar o Bloco B (22 gaps)** exceto: triar #20 web-to-lead/WhatsApp (com validação + rate-limit, per CISO) e manter o piso (tarefa+lembrete, notas/anexos). reminderAt/nextActionAt ganham consumidor ou são ocultados.

### Bloco B — abre o desenho, espera sinal humano (§5.1)
7. **[D1 · accounting-architect/CTO] Abrir o PRE-ADR do seam** — só o desenho, não compromete implementação. Decidir: receita-de-opp via subrazão AR vs direta; binding conta-por-papel como DADO; guard terminal em advanceOpportunity; dead-letter. **Gatilho de implementação:** PRE-ADR assinado **E** kit verde. Nenhuma linha de receita CRM→razão ship antes disso.
8. **[D2] Escolha exercitar-gerador (v1-B) × aprofundar-à-mão** → ADR posterior. **Gatilho:** kit verde + 1 negócio real bookando receita ponta-a-ponta. **Requer assinatura do dono** (aposta da tese).
9. **[D3] Modelo Lead × Opportunity** → ADR de produto. **Interino ratificado:** ocultar 2ª pipeline no preset do salão sem deletar código. **Gatilho:** kit verde + sinal do 1º operador de salão real. **Requer decisão do dono** (produto §5.1).

---

## NÃO-NEGOCIÁVEIS DO CONSELHO (honrados pela resolução)
- **CEO:** não exercitar o gerador ERP-gen (v1-B) sobre o molde até UM negócio real reconhecer UM centavo de verdade pelo seam, com o kit verde. Compilar um molde não-validado propaga seus erros a todo vertical futuro. → **Honrado por D2 gate + D6 antes de D2.**
- **CTO:** nada que toque o caminho receita CRM→razão (mapper hardcode, guard terminal, subrazão AR) ship antes do PRE-ADR (D1) assinado E do kit verde (D6); a fronteira DynamicTable×Prisma não reabre slice-a-slice. → **Honrado por Bloco B item 7.**
- **CFO:** nenhum trabalho de CRM que toque receita fecha até o seam provar (kit #2/#3/#4, não inferência) que reconhece receita uma vez, imutável pós-Won, com falha durável — razão sobre seam duplo-cego/mutável é demonstração financeira falsa. → **Honrado por D6 como aceite de reporte.**
- **CISO:** nada com consequência de segurança fecha como dívida invisível — chip cobre os 3 métodos (não parcial); magic-bytes ganha assinatura OU vira RISK-SEC registrado; matriz de 2 tenants roda como gate antes de qualquer deploy/tenant real. Núcleo de tenancy fica como está (resistiu ao red-team). → **Honrado por D5 itens 2/4 + D6 item 7.**
- **COO:** nenhum trabalho novo de CRM que toque receita, e nenhum deploy, antes do kit rodar verde em app vivo buildado em produção, com backfill sob tenancy explícita. → **Honrado por D6 + gate de D2.**

---

## O QUE A DIRETORIA NÃO PODE FECHAR (devolvido ao dono)
1. **A aposta da tese ERP-gen e a ordem A×B (D2).** O gate "operar 1 negócio real primeiro" é ratificado, mas *qual caminho* seguir depois — exercitar o gerador sobre o molde vs aprofundar CRM à mão — é a aposta de caixa e de go-to-market do fundador. O v2-mercado contesta a **ordem**, não o **mérito**; a diretoria resolve a ordem, o dono resolve a aposta.
2. **O modelo Lead × Opportunity (D3).** Único item sem voto de ratify: 4 defer + 1 abstain. O eixo (a)/(b)/(c) é genuinamente não-resolvido por falta de fato — precisa de um operador real na cadeira. Nenhuma cadeira executiva decide se o molde salão é B2C-solo ou porta B2B. Interino reversível ratificado; a decisão é do dono.
3. **A ratificação do desenho do seam (D1).** O Conselho abre o PRE-ADR e o declara bloqueante; a **decisão contábil-estrutural** (subrazão AR vs direta, binding como dado) cruza decisões travadas do mapa-mestre §5.1 e é ratificada pelo dono com o parecer do accounting-architect, não pela diretoria.

---

## VIÉSES DA DIRETORIA (T8)
1. **Decisão sobre código nunca exercitado em runtime.** Todos os 4 furos do seam, o oráculo, o fetch-all e o bloqueio dos 80 unitId estão CONFIRMED por leitura de código e testes que **mockam tx/DTS** — nenhum foi observado num app vivo. Toda a cédula decide sobre comportamento inferido; o próprio D6 existe porque a diretoria reconhece que o kit verde é o que converte "CONFIRMED em código" em "provado em runtime". Até lá, D1/D2 são teoria fundamentada, não fato operacional.
2. **Convergência por deferência ao Chair.** A unanimidade em D1/D4/D5/D6 é real, mas parte dela vem de cadeiras **assessorando fora do próprio mandato** (CTO/CFO/CISO/COO ratificando julgamentos de negócio que "o CEO carrega"). A convergência 5-0 pode superestimar independência — o único item onde as cadeiras genuinamente se recusaram a fechar (D3) é o sinal de que o resto teve baixa fricção, possivelmente porque de-risco barato é fácil de aprovar, não porque foi adversarialmente testado entre cadeiras.
3. **A tese nunca foi exercitada.** Toda aposta na ERP-gen (salão=molde que gera verticais) é sob incerteza estrutural: zero usuários, zero deploy, zero centavo reconhecido. O gate de D2 protege contra compilar um molde falso, mas não elimina o risco de que a **própria premissa** (um molde de salão generaliza para verticais B2B/fiscais) esteja errada — e nenhuma decisão desta cédula pode falsificar isso; só um tenant real pagante pode.
4. **Viés de ação da cadeira COO/de-risco.** D6 foi eleito "maior EV" por 5 cadeiras; o risco é que a nitidez de um plano executável de ~1 dia faça a diretoria confundir *atividade mensurável* (7 provas verdes) com *validação da tese* (um cliente que paga). Kit verde prova que o seam booka; não prova que alguém quer comprar o produto.