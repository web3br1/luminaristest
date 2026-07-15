# ADR-LGPD — LGPD / RBAC granular (proteção de dado)

- **Data:** 2026-07-15
- **Status:** **Accepted — RATIFICADO POR SINAL HUMANO EM REVISÃO FORK-A-FORK 2026-07-15 (via AskUserQuestion).**
  Decisões confirmadas: **F0 → (a)** três fatias independentes (RBAC fino · mascaramento · retenção/esquecimento);
  **F1 → (a)** papéis + permissões sobre a **camada Policy** existente; **F2 → (a)** **pseudonimização +
  crypto-shred** com base legal de retenção contábil (**T8 preservado — nada deletado da trilha**); **F3 → (a)**
  mascaramento **na leitura/exportação**, dirigido por papel. Nenhum fork ficou aberto. **Fatia A (RBAC)
  IMPLEMENTADA** (backend): módulo Prisma first-class `AccessRole`/`AccessRolePermission`/`AccessRoleAssignment`
  + `AccessControlService.assertPermission` (owner-bypass) plugado no seam do `EntryApprovalService`
  (`accounting.entry.approve`); migração aditiva `CREATE TABLE ×3, zero ALTER`; `tsc` limpo + suíte accounting
  690/690 + openapi 139 paths. **Review independente FAIL→fix→PASS** — pegou 2 bugs reais da classe
  `unique-de-idempotencia-x-soft-delete` (B1 revoke→re-assign, M1 archive→re-create), corrigidos por
  **revive-on-recreate/reassign** + testes de regressão. Residual: commit/PR + **smoke-migration-gate sobre
  dev.db real** + FE (`FE-INCR-LGPD`) + **Fatias B (mascaramento) e C (retenção/crypto-shred)**. O nó permanece
  **⚫ Parcial** até o closeout de cada fatia (ORCH-007 promove). Fila §5.1 item **14**.
- **Autores:** enquadramento do orquestrador (ORCH-006); ratificação fork-a-fork pelo dono do produto.
- **Nó do master map:** §5.1 Bloco B item **14 — "LGPD/RBAC granular"**; §5 *"Parcial — autorização no servidor
  já vale; mascaramento/retenção/papéis finos = incremento próprio."* Este ADR **abre** o nó. Colisão com §1
  (T8) verificada em §2 e **resolvida** em F2→(a) sem reabrir a trava.

## TLDR (2 linhas)

A autorização de servidor (`withAuth`, escopo por `userId`/`unitId`) já existe. Este ADR adiciona, em **três
fatias independentes**: **RBAC de papéis finos** sobre a camada Policy, **mascaramento de PII** por papel na
leitura/exportação, e **retenção/direito ao esquecimento** resolvido por **pseudonimização/crypto-shred** — a
única via que atende a LGPD **sem** apagar a trilha de auditoria imutável (T8). Delete físico da trilha ficou
**rejeitado** (reabriria uma trava).

---

## 1. Contexto e objetivo

Hoje: `withAuth` protege rotas; toda tabela accounting carrega `userId`+`unitId`; audit é append-only hash-chain
(T8) e **exceção ao `onDelete:Cascade`** (`audit-log-no-fk-cascade`) — deletar um usuário **não** apaga a
trilha. Isso é correto para contabilidade e **diretamente em tensão** com o direito de apagamento da LGPD.

**Objetivo:** dar ao sistema controles de privacidade (papéis finos, mascaramento, retenção) **sem** quebrar os
invariantes contábeis que exigem trilha imutável. A LGPD reconhece que **obrigação legal/contábil** é base para
retenção — mas exige mascaramento e minimização.

## 2. Rails que DEVE respeitar (T1–T12) + a colisão central

| Rail | Como se aplica |
|---|---|
| **T8 auditoria append-only, no-cascade** | A trilha **não pode** ser apagada por um pedido de esquecimento. Resolução ratificada (F2a) = **crypto-shred/pseudonimização** (apagar a chave/o vínculo ao titular, preservando o fato contábil), não `DELETE`. |
| **T5 imutabilidade do post** | Lançamento postado é fato congelado; PII nele (ex. nome em descrição) se resolve por mascaramento na **leitura/exportação** (F3a), não por edição do post. |
| **T3 Prisma first-class** | Modelo de papéis/permissões, persistido, é first-class próprio — não DynamicTable. |
| **T2 tenancy** | RBAC fino refina, não substitui, o escopo `userId`+`unitId` já existente. |
| **Contrato §2/§3 (Policy)** | O ponto de enforcement já é a camada **Policy**; RBAC fino (F1a) estende as Policies, não inventa um gate paralelo. |

**Colisão resolvida (o coração deste ADR):** *direito ao esquecimento (LGPD art. 18) × trilha imutável (T8)*.
**Não** é resolvível por delete (F2b rejeitado). É resolvível por (F2a): (1) reconhecer a **base legal de
retenção contábil/fiscal** (o titular não pode exigir apagar um lançamento que a lei obriga guardar 5+ anos);
(2) **pseudonimizar** o dado pessoal não essencial ao fato contábil (mascarar nome/CPF em relatórios); (3)
**crypto-shred** onde o apagamento é devido (destruir a chave que liga o pseudônimo ao titular). Isso **preserva
T8** e atende a LGPD pela via correta.

## 3. Decisões fixadas (RATIFICADAS)

### D1 — Três fatias independentes (F0→a)
LGPD/RBAC é entregue como **três incrementos separados**, cada um com ADR-filho/brief e ratificação de
implementação próprios se necessário, na ordem de prontidão: **(A) RBAC de papéis** → **(B) mascaramento de
PII** → **(C) retenção/esquecimento**. A ordem não é arbitrária: (B) e (C) **dependem** de (A) (mascaramento e
crypto-shred são dirigidos por papel). Fatias independentes evitam um monólito e permitem parar após (A) se
o valor já bastar.

### D2 — RBAC = papéis + permissões sobre a camada Policy (F1→a)
Modelo Prisma first-class de `Role` + `Permission` (ou `RoleAssignment` por `userId`+`unitId`), consumido
**dentro das Policies** do Contrato §2/§3 — que já são o ponto de enforcement. **Não** se cria um gate paralelo.
Alinha-se com a **Emenda F3 da Torre de Aprovação** (`enforcesSegregationOfDuties = owner≠actor`, que "endurece
via membership futuro"): **este RBAC é essa membership**. ACL por-registro (F1b) descartada como YAGNI.

### D3 — Retenção/esquecimento por pseudonimização + crypto-shred, base legal de retenção (F2→a)
O direito ao esquecimento **nunca** deleta linha de `audit_events`/`journal_entries` (T8 intocado). Em vez disso:
PII não-essencial ao fato contábil é **pseudonimizada**; o vínculo pseudônimo↔titular vive atrás de uma **chave
que pode ser destruída** (crypto-shred) quando o apagamento for devido e não colidir com a base legal de
retenção contábil/fiscal (5+ anos). O fato contábil sobrevive; a identificação do titular, não. **F2b (delete
físico + tombstone) rejeitado** — quebra a hash-chain e a exceção no-cascade; reabri-lo seria `DECISÃO
ARQUITETURAL` contra T8, não parte desta fatia.

### D4 — Mascaramento na leitura/exportação, por papel (F3→a)
O dado no ledger permanece **íntegro**; o mascaramento acontece na **camada de leitura/serialização** (relatórios,
SPED, CSV/XLSX) conforme o papel (D2). Mascaramento no armazenamento (F3b) descartado — destruiria dado que a
contabilidade precisa manter íntegro. **Requisito de teste central:** o mascaramento tem de cobrir os
**arquivos exportados** (SPED/CSV), não só a tela — vazar PII no arquivo é a falha clássica (§5.3).

### D5 — Invariantes de ledger e tenancy inalterados (T2/T5/T8)
`Σdébito=Σcrédito`, período, numeração, idempotência e a hash-chain de audit **não** mudam. Tenancy continua
`AccountingScope` (`userId`+`unitId`); RBAC **refina** o acesso dentro do escopo, não cria torre nova (§4/T2).
Migrações das fatias são aditivas (`CREATE TABLE` para Role/Permission; nenhuma coluna nova em `journal_entries`
ou `audit_events`).

---

## 4. Plano de implementação (Task pós-ADR — só após esta ratificação)

**Fatiamento por incremento (D1), NÃO por PAR-004 dentro de um PR.** Cada fatia é seu próprio ciclo
`BRIEF → impl → test → review independente → PR → smoke-gate → closeout` (T12). Ordem obrigatória: **A → B → C**
(B e C dependem do papel de A). 1 worktree isolado por fatia (`npm ci`, nunca junction do client Prisma —
`worktree-deps-stale-prisma-client`). Golden refs: Torre de Aprovação (Policy + enforcement condicional) e o
padrão first-class AP/AR.

- **Fatia A — RBAC de papéis (habilita B e C):**
  - `Role`/`Permission`/`RoleAssignment` Prisma first-class (migração aditiva `CREATE TABLE`, tenancy
    `userId`+`unitId`); DTO Zod `.strict()`; Repo tx-aware; Service por comandos (auditado in-tx, T8).
  - Consumo **dentro das Policies** existentes (Contrato §3) — não um gate paralelo. Reusa o seam de membership
    que a Emenda F3 da Torre de Aprovação já antecipa.
  - Testes: papel sem permissão barra a ação; escopo `userId`+`unitId` preservado; SoD via papel casa com a
    Torre de Aprovação; tenancy isolada.
- **Fatia B — mascaramento de PII por papel (depende de A):**
  - Camada de mascaramento na **serialização de leitura** (relatórios INCR-4, exportação INCR-6, SPED
    ECD/ECF). Dirigido pelo papel de A.
  - Testes: **exercer a exportação real** (SPED/CSV), não só a tela — PII mascarada no arquivo para papel sem
    permissão; dado íntegro no banco; papel com permissão vê tudo.
- **Fatia C — retenção / crypto-shred (depende de A):**
  - Vínculo pseudônimo↔titular atrás de chave destruível; comando de esquecimento que **pseudonimiza + destrói
    a chave**, respeitando a base legal de retenção (bloqueia apagamento onde a lei obriga guardar).
  - Testes: **T8 preservado** — nenhuma linha de `audit_events`/`journal_entries` removida; hash-chain intacta
    após um esquecimento; fato contábil sobrevive, identificação do titular não; retenção legal bloqueia
    apagamento indevido.
- **Gates por fatia:** tsc×2 limpo; jest da fatia + suíte accounting; **review independente**
  (`reviewer-independence-separate-agent`); `skill-audit wiring`; openapi baseline; **smoke-migration-gate**;
  merge via `loop-auto-merge-after-review`; browser sign-off humano onde houver FE.

## 5. FORKS — RATIFICADOS POR SINAL HUMANO EM REVISÃO FORK-A-FORK (2026-07-15)

> Ratificação coletada via AskUserQuestion (2026-07-15). **Resultado: F0→(a), F1→(a), F2→(a), F3→(a)** — todos
> na recomendação. Nenhum fork ficou aberto.

### F0 — Escopo-mestre / fatiamento  **[RATIFICADO → (a) três fatias independentes]**
- ✅ **(a) Três incrementos independentes** (RBAC · mascaramento · retenção) — prontidões distintas; evita
  monólito; permite parar após a fatia A.
- (b) Um incremento único — **descartada** (acopla decisões de ritmos diferentes).

### F1 — RBAC granular  **[RATIFICADO → (a) papéis sobre a camada Policy]**
- ✅ **(a) Papéis + permissões sobre as Policies existentes** — estende o enforcement do Contrato §2/§3; é a
  "membership" que a Emenda F3 da Torre de Aprovação já previu.
- (b) ACL por registro — **descartada** (mais cara; YAGNI para o molde atual).

### F2 — Direito ao esquecimento × T8  **[RATIFICADO → (a) pseudonimização + crypto-shred]**
- ✅ **(a) Pseudonimização + crypto-shred, base legal de retenção contábil** — única via que **preserva T8**;
  destrói o vínculo ao titular, não o fato contábil.
- (b) Delete físico com tombstone — **REJEITADA**: quebra a hash-chain e a exceção no-cascade; reabri-la é
  `DECISÃO ARQUITETURAL` contra T8, fora desta fatia.

### F3 — Mascaramento  **[RATIFICADO → (a) na leitura/exportação, por papel]**
- ✅ **(a) Na leitura/exportação, dirigido por papel (F1)** — dado íntegro no ledger; PII mascarada em
  relatórios/SPED/CSV. Teste **exerce a exportação**, não só a tela.
- (b) Mascaramento no armazenamento — **descartada** (destrói dado que a contabilidade precisa).

---

## 6. Riscos e vieses nomeados (T8)

1. **[verificado] Esquecimento × imutabilidade é colisão real, não detalhe** — a resposta "é só deletar" viola
   T8 e a lei contábil. A checagem que falha se eu errar: qualquer caminho de apagamento que remova linha de
   `audit_events`/`journal_entries`. F2→(a) é a única saída que não reabre uma trava; o teste da Fatia C
   (hash-chain intacta pós-esquecimento) é o que falha se vazar.
2. **[verificado] RBAC fino é a "membership" que a Torre de Aprovação já previu** — construir RBAC ad-hoc
   ignoraria que a Emenda F3 (SoD-off single-user) *aponta* para ele. Fatia A reusa essa direção, não paraleliza.
3. **[verificado] Mascaramento tem de cobrir os exports SPED/CSV** — mascarar na tela e vazar no arquivo é falha
   clássica; o teste da Fatia B exerce a exportação, não só a leitura (D4/§5.3).
4. **[assumido] "Autorização de servidor já vale"** — o mapa marca Parcial; o gap é fino-grão + privacidade,
   não autorização básica. Fatia A **estende** as Policies, não reconstrói o que já protege.
5. **[inferido] Base legal de retenção × pedido de apagamento pode conflitar caso a caso** — a Fatia C precisa
   de uma regra clara de quando a retenção contábil (5+ anos) **bloqueia** o crypto-shred; sem ela, o comando de
   esquecimento pode apagar o que a lei manda guardar. Nomeado como requisito da Fatia C.
6. **[verificado] Revive-on-recreate reativa atribuições vivas sob o NOVO conjunto de permissões (Fatia A).**
   Como o revive reusa o mesmo `role.id`, re-criar um papel arquivado com o mesmo `code` reativa quaisquer
   atribuições ainda não-revogadas apontando pra ele — agora com o conjunto de permissões redefinido. É
   owner-authored, mesmo escopo (sem escalonamento de delegado, sem cross-tenant — confirmado no review), e
   coerente com "re-create É o unarchive" (schema). **Custo de UX nomeado** para quem escrever a tela de
   archive/unarchive de papéis (FE-INCR-LGPD): deixar explícito que re-criar um code arquivado ressuscita o
   papel e suas atribuições vivas. Não bloqueia a Fatia A.

## 7. Checklist de invariantes que a implementação DEVE provar

- **T8 preservado (Fatia C):** nenhuma linha de `audit_events`/`journal_entries` deletada por esquecimento;
  hash-chain intacta após crypto-shred; fato contábil sobrevive, identificação do titular não.
- **Mascaramento cobre o arquivo (Fatia B):** PII mascarada nos **exports** (SPED/CSV/XLSX) para papel sem
  permissão, não só na tela; dado íntegro no banco.
- **RBAC dentro da Policy (Fatia A):** enforcement pela camada Policy existente; sem gate paralelo; casa com a
  membership da Torre de Aprovação; tenancy `userId`+`unitId` preservada.
- **Migrações aditivas:** `CREATE TABLE` para Role/Permission; **zero** coluna nova em `journal_entries`/
  `audit_events`; smoke-migration-gate sobre dev.db real.
- **Retenção legal (Fatia C):** apagamento bloqueado onde a base de retenção contábil/fiscal obriga guardar.

---

**RATIFICADO POR SINAL HUMANO EM REVISÃO FORK-A-FORK 2026-07-15** (F0→(a) três fatias; F1→(a) papéis sobre
Policy; F2→(a) pseudonimização/crypto-shred — T8 preservado; F3→(a) mascaramento na leitura/exportação). A fase
PRE-ADR está encerrada. **Próximo gate = Task de implementação da Fatia A (RBAC)** — habilita B e C. O nó do
master map permanece **⚫ Parcial** até cada fatia fechar; a promoção é o closeout de cada Task (ORCH-007), não
deste ADR. **F2→(b) reabriria T8 = DECISÃO ARQUITETURAL.**
