# PRE-ADR-INCR-COUNTERPARTY — Contraparte (Fornecedor/Cliente) first-class × ref DynamicTable

- **Data:** 2026-07-15
- **Status:** **Accepted — RATIFICADO POR SINAL HUMANO FORK-A-FORK 2026-07-15 (via AskUserQuestion).**
  Decisões: **F-CP0 → (a) SIM**, aging/posição por contraparte é requisito de horizonte; **F-CP1 → A1**,
  `Counterparty` **Prisma first-class + FK**. O humano escolheu a integridade máxima **sobre** a recomendação
  A2 do par (identidade barata) — decisão de dono registrada. **BACKEND IMPLEMENTADO + REVIEW INDEP. PASS
  2026-07-15** (branch `claude/incr-counterparty-a1` @ `81093dc`, off `origin/main`; tsc limpo, jest 1135/1135;
  gates SEC-A1-1..5 verificados no review). **Pendente: smoke-migration-gate (dev.db real) + merge; FE
  diferido; NOT NULL da FK num 2º migration.** Levantado pelo debate de personas pós-`eeb33c1` (CBM-001).
- **Autores:** par `luminaris-orchestrator` + `luminaris-accounting-architect` (mesmo formato de
  `ADR-INCR-AP`/`ADR-INCR-AR`/`ADR-INCR-DIM`).
- **Nó do master map:** §7 Núcleo 2 (nota de dívida "contraparte AP/AR não-first-class") + §5 "Subrazões".
  Colisão com §1/§4 verificada em §3 — **não colide** (não é torre multi-empresa §4; é catálogo de
  contraparte, o mesmo tipo de entidade que `unit`/cliente já são).

## TLDR (2 linhas)

Hoje o subledger AP/AR identifica o fornecedor/cliente por um **snapshot do nome de exibição** (`supplierName`
/`customerName`, string), com um `supplierRef`/`customerRef` **opcional e não-FK** apontando para uma linha
DynamicTable. Consequência: o **aging por contraparte** (saldo "quanto o Fornecedor X me deve/eu devo",
expectativa fiscal/gerencial de qualquer razão auxiliar) **não é invariante garantido** — renomear a
contraparte fragmenta o histórico, e não há FK que force integridade. Como o **aging ainda não foi construído**
(`dueDate // aging is a later increment — F3`), a hora de decidir o modelo de identidade da contraparte é
**agora, antes** de empilhar aging sobre uma chave frágil.

---

## 1. Contexto e objetivo

O propósito de um razão auxiliar (subledger) AP/AR não é só lançar no ledger — é responder **"quem deve
quanto, e há quanto tempo"** (aging, posição por contraparte). Esse é o valor operacional que separa "Contas
a Pagar" de "só mais lançamentos". Para que o saldo-por-contraparte seja confiável, a **identidade da
contraparte** precisa ser estável e íntegra ao longo do tempo. A pergunta desta ADR: essa identidade deve ser
uma **entidade first-class** (Prisma, com FK), ou continua sendo o **nome de exibição em string** (status quo)?

## 2. Evidência de código (CBM-001 — confirmado por leitura de `schema.prisma`)

| Claim | Grau | Evidência |
|---|---|---|
| `Payable` chaveia identidade da contraparte em `supplierName` **string** (snapshot do nome), não em entidade | verificado | `schema.prisma` model `Payable`: `supplierName String // snapshot ... never resolved from supplierRef at read time`; `@@unique([userId, unitId, supplierName, documentNumber])` |
| `supplierRef` existe mas é **string opcional não-FK** (ref a linha DynamicTable, "precedent CustomerPackageBalance.customerId") — nunca resolvido no read | verificado | `schema.prisma` `Payable.supplierRef String? // ... plain string, not a FK` |
| `Receivable` é espelho idêntico: `customerName`/`customerRef`, mesma `@@unique` por `customerName` | verificado | `schema.prisma` model `Receivable` (mesma forma) |
| **Aging ainda não construído** — a decisão de identidade precede o consumidor que a torna crítica | verificado | comentário `dueDate // ... aging is a later increment — F3` em ambos os models |
| A contraparte-como-DynamicTable-ref foi decisão ratificada (AP F1→(c) / AR F1→(c)) — reabrir é `DECISÃO ARQUITETURAL` | verificado | `ADR-INCR-AP` F1→(c); `ADR-INCR-AR` F1→(c) |

**Consequência técnica do status quo:** o aging agruparia por `supplierName`. Se o operador corrigir o nome
("Fornec. ACME" → "ACME Ltda"), as duas grafias viram **duas contrapartes** no aging; o `supplierRef`
opcional não conserta porque metade das linhas pode ter `NULL` e ele não tem integridade referencial. Não há
bug hoje (aging não existe) — é uma **dívida latente** que vira defeito no momento em que o aging for lido.

## 3. Colisão com decisões travadas (§1) e rejeitadas (§4)

- **§4 torre multi-empresa (`LegalEntity`/`Establishment`) — NÃO é isto.** Uma contraparte (fornecedor/cliente)
  é a mesma classe de entidade que `unit` e o cliente do salão **já são**; promovê-la a Prisma não reintroduz
  a torre de tenancy rejeitada. Sem colisão.
- **§4 contábil-como-DynamicTable — a favor de promover.** A dívida existe justamente porque a contraparte
  vive como ref DynamicTable. Promover a Prisma **alinha** com T3 (first-class), não colide.
- **T7 idempotência / T3 first-class:** a chave de negócio do AP/AR (`documentNumber`) não muda; muda só como a
  contraparte é identificada. Compatível.

## 4. Forks (decisão do dono — ratificar fork-a-fork)

**F-CP0 — Precisamos de aging/posição por contraparte no horizonte?** (porta de entrada)
- **(a) Sim, é requisito próximo** → decidir F-CP1 agora (antes de construir aging).
- **(b) Não / indefinido** → aceitar A0 abaixo (status quo) e re-abrir esta ADR quando o aging for agendado.
  *YAGNI legítimo se o aging não tem data.*

**F-CP1 — Modelo de identidade da contraparte** (só se F-CP0→a)
- **A0 — Status quo (`supplierName` string + ref não-FK).** Subledger é **nível-documento**; aging é
  best-effort name-keyed. Custo zero. Aceita explicitamente que "saldo-por-fornecedor" não é garantido.
- **A1 — `Counterparty` Prisma first-class + FK.** Nova tabela `Counterparty` (escopo `userId`+`unitId`,
  tipo supplier/customer), `Payable.counterpartyId`/`Receivable.counterpartyId` como **FK**. Aging por FK
  estável, rename-safe, íntegro. Custo: migração aditiva (`CREATE TABLE` + coluna FK **nullable** para não
  quebrar linhas existentes) + backfill das linhas string-keyed + tocar os create paths AP/AR + FE de seleção
  de contraparte. Maior integridade; maior blast radius.
- **A2 — Identidade estável sem entidade (meio-termo ponytail).** Manter `supplierName` como display, mas
  adicionar `counterpartyKey` **imutável** (cuid gerado no create, nunca re-derivado do nome) e agrupar o
  aging por ele. Rename do display **não** fragmenta o histórico. Sem tabela nova, sem FK, sem catálogo.
  Fecha a fragilidade #1 (rename) com ~1 coluna; **não** dá catálogo/dedupe de contraparte (dois cadastros do
  mesmo fornecedor ainda são duas chaves) nem integridade referencial.

## 5. Recomendação do par (não-vinculante) e decisão do dono

**Recomendação do par:** A2 como piso, A1 só com demanda de catálogo. **Decisão do dono (ratificada): A1.**
O humano optou por resolver a identidade de contraparte de vez com entidade first-class, aceitando o blast
radius (migração + backfill + create paths + FE) em troca de aging íntegro por FK, catálogo/dedupe e base
para dados cadastrais. Racional aceito: o subledger AP/AR **é** para vender "quem deve quanto"; meia-solução
(A2) pagaria a dívida de novo quando o catálogo chegasse.

**Guardas de implementação (herdadas de T-locks):** FK `counterpartyId` **nullable** na migração (não quebra
linhas existentes) + backfill idempotente das linhas string-keyed (uma `Counterparty` por `supplierName`/
`customerName` distinto por escopo) → depois a coluna pode virar obrigatória num 2º passo. `Counterparty`
carrega `userId`+`unitId` (AccountingScope, T2); soft-delete + rename-on-key como AP/AR; **sem** cascade que
apague histórico (T8). Smoke-migration-gate sobre cópia do dev.db real antes de deploy.

## 5.1 Gates de segurança (red-team 2026-07-15 — VINCULANTES ao BRIEF/impl)

> Red-team aterrado no código: A1 **não tem falha de design** (é disciplina de escopo + migração, e todos os
> controles já existem como padrão no codebase), mas os controles abaixo são **pré-condição** — sem eles, o
> increment nasce com IDOR/vazamento cross-tenant.

- **[SEC-A1-1] Resolver `counterpartyId` DENTRO do create** AP/AR via `counterpartyRepo.findById(scope, id)`
  (mesmo padrão do `expenseAccountId`/`revenueAccountId` atual), `null` → `ValidationError`. **Nunca** confiar
  no `counterpartyId` do body nem validar no DTO Zod (o DTO não conhece o escopo) ⇒ senão AP/AR de um tenant
  liga a `Counterparty` de outro (vaza nome/dedupe cross-tenant). É o IDOR #1 deste increment.
- **[SEC-A1-2] Backfill dedupe por `(userId, unitId, name)`, JAMAIS por nome só.** Dois tenants com "ACME"
  **não** podem colapsar numa `Counterparty`. `@@unique([userId, unitId, type, name])` + upsert idempotente
  (`INSERT OR IGNORE`) para rodar 2× sem P2002; inclui linhas canceladas/soft-deleted (aging histórico) com
  escopo correto.
- **[SEC-A1-3] Smoke-migration-gate anti-vazamento.** Sobre cópia do dev.db real, o gate **falha** se existir
  qualquer `counterpartyId` cujo `Counterparty` tenha `userId/unitId` ≠ do payable/receivable, e assere
  `#counterparties por escopo == #nomes distintos por escopo`.
- **[SEC-A1-4] Soft-delete × `@@unique`** (class bug conhecido, memória `unique-de-idempotencia-x-soft-delete`):
  `Counterparty` com unique por nome reintroduz P2002 no arquivar+recriar. → Mesma disciplina rename-on-delete
  do `Payable.deletedDocumentNumber`, ou definir que archive não libera o nome.
- **[SEC-A1-5] Passo NOT NULL** num 2º migration que **assere** zero `counterpartyId` NULL in-scope **antes**
  de aplicar (a FK só endurece depois do backfill provar cobertura total).

## 6. Fora de escopo

Dados cadastrais ricos da contraparte (CNPJ, endereço, condições), dedupe/merge de contrapartes, portal do
fornecedor, alçada/RBAC. Cada um é seu próprio incremento se A1 for escolhido.
