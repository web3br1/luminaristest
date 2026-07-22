## Título
`feat(accounting): INCR-COUNTERPARTY (A1) — Counterparty first-class + FK em AP/AR`

## Corpo

### Resumo
Promove a contraparte (Fornecedor/Cliente) das subrazões AP/AR de um **snapshot de nome em string** para uma **entidade Prisma first-class** com FK, fechando o aging-por-contraparte como invariante garantido. Decisão ratificada fork-a-fork (`ADR-INCR-COUNTERPARTY`, F-CP1→A1 — o dono escolheu integridade máxima sobre a recomendação A2 mais leve). **Backend only** (FE diferido → `FE-INCR-COUNTERPARTY`).

`origin/main` (`eeb33c1`) → `claude/incr-counterparty-a1` (`81093dc`) — **24 arquivos, +1111/−2**.

### O que muda
- **Model `Counterparty`** (Prisma first-class): tenancy `userId`+`unitId`, `type` (SUPPLIER|CUSTOMER), `name`, `ref?` (link opcional não-FK à linha DynamicTable), soft-delete. `@@unique([userId,unitId,type,name])`.
- **FK `counterpartyId String?` (NULLABLE)** em `Payable` e `Receivable` (não quebra linhas existentes).
- **Migração aditiva** — `CREATE TABLE counterparties` + ADD COLUMN + **backfill idempotente** (uma Counterparty por `(userId,unitId,name)` distinto, dedupe estrito, `INSERT OR IGNORE`).
- Service/Repository/Policy/DTO(`.strict()`)/rota-3-toques/controller + wiring no Factory; resolução re-escopada do `counterpartyId` **dentro** do create AP/AR.

### Gates de segurança (verificados no review)
- **SEC-A1-1 (IDOR):** `counterpartyId` do body resolvido via `counterpartyRepo.findById(scope,id)` dentro do service; `null`→`ValidationError`; type validado (payable↔SUPPLIER). Nenhum caminho persiste o valor cru.
- **SEC-A1-2/3 (backfill):** dedupe por `(userId,unitId,name)` — **nunca** por nome só; FK correlaciona mesmo escopo → **zero FK cross-scope**; idempotente (roda 2× sem P2002). Provado em SQLite real ("2 tenants ACME = 2 linhas" + guarda raw cross-scope = 0).
- **SEC-A1-4:** soft-delete + rename-on-key `name→deleted:<id>:<name>` (archive+recadastro não trip P2002).
- **SEC-A1-5:** FK mantida NULLABLE (NOT NULL fica p/ um 2º migration pós-cobertura).

### Testes
`tsc` limpo; **jest 1135/1135** (inclui `CounterpartyService.test.ts` + `CounterpartyBackfill.integration.test.ts` em SQLite real). Migração aplica limpa em dev.db fresco, `migrate diff` migrations→schema = vazio.

### Review
Review independente (agente separado, inspeção via git) = **PASS — pronto p/ smoke-migration-gate + merge**. Nenhum defeito bloqueante. Notas menores: OpenAPI dos 4 endpoints a documentar no closeout; query DTOs sem `.strict()` (padrão do projeto).

### Pendente antes de deploy
- **Smoke-migration-gate** sobre cópia do `dev.db` real (T12): provar `#counterparties por escopo == #nomes distintos por escopo` e **zero** `counterpartyId` cross-scope. ⚠️ Hoje bloqueado por um **drift pré-existente** no dev.db (migração `20260627150000_add_entry_numbering`) — resolver antes (`prisma migrate resolve` ou investigar).
- FE (`FE-INCR-COUNTERPARTY`); 2º migration `NOT NULL` da FK.

### Merge / integração
- Mergear **depois** do PR de segurança (`sec-hardening-auth`) — este toca `middleware/auth.ts` (adiciona `/api/counterparties` ao `protectedApiPaths`) e vai conflitar com a reescrita do auth; rebase e re-aplique sobre a nova estrutura.
- Conflita com o PR de **B1 (dim-completeness)** em `schema.prisma` e `lib/factory.ts` (ambos adicionam model/wiring) — resolver por união.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
