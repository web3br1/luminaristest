# PRE-ADR-INCR-COUNTERPARTY — Contraparte (Fornecedor/Cliente) first-class × ref DynamicTable

- **Data:** 2026-07-15
- **Status:** **PRE-ADR — aguardando ratificação humana fork-a-fork.** Nenhuma linha de código até o sinal.
  Levantado pelo debate de personas (Arquiteto Contábil) sobre o estado pós-`eeb33c1`, aterrado no código
  (CBM-001). Este documento **abre a decisão**; não a decide.
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

## 5. Recomendação do par (não-vinculante)

**F-CP0 → (a)** se o produto pretende vender "Contas a Pagar/Receber" como subledger de verdade (aging é a
razão de existir do módulo); senão **(b)** e YAGNI honesto. Se **(a)**: **A2 como piso** (rename-safety é a
dívida concreta e custa uma coluna), **A1 só quando** houver demanda real de *catálogo* de contraparte
(dedupe, dados cadastrais, seleção reutilizável) — aí a entidade first-class se paga. Evitar A1 preventivo:
é a construção especulativa que o Cético (corretamente) alerta, enquanto A2 mata o defeito latente barato.

## 6. Fora de escopo

Dados cadastrais ricos da contraparte (CNPJ, endereço, condições), dedupe/merge de contrapartes, portal do
fornecedor, alçada/RBAC. Cada um é seu próprio incremento se A1 for escolhido.
