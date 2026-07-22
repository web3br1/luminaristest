## Título
`feat(accounting): INCR-DIM-COMPLETENESS (B1) — etiqueta obrigatória por conta + bucket "(Não alocado)"`

## Corpo

### Resumo
Fecha o buraco de completude da DRE por dimensão: uma partida a uma conta de despesa/receita sem centro de custo desaparecia silenciosamente do recorte, e a soma dos recortes não batia com a DRE total. Torna a etiqueta **condicionalmente obrigatória por classe de conta** (flag `Account.requiresDimension`) + adiciona o bucket **"(Não alocado)"** read-time. Decisão ratificada fork-a-fork (`ADR-INCR-DIM-COMPLETENESS`, F-DC0→B1). **Emenda `ADR-INCR-DIM` F5** (dimensão sempre-opcional → opcional por padrão, obrigatória por flag). **Não reintroduz o §4 "Motor de Regras"** — é um gate de validação que *rejeita*, não um motor que *gera* lançamento. **Backend only** (FE diferido → `FE-INCR-DIM-COMPLETENESS`).

`origin/main` (`eeb33c1`) → `claude/incr-dim-completeness-b1` (`f3313b6`) — **17 arquivos, +516/−50**.

### O que muda
- `Account.requiresDimension Boolean @default(false)` (migração `ALTER TABLE ADD COLUMN` pura — ver nota de migração).
- **Gate compartilhado** `dimensionTagging.ts::assertLegDimensions` invocado por **todos os 3 escritores de partida**: `postEntry` e `EntryApprovalService.approve` (hard-gate **in-tx T6**, relê flag+tags do DB, autoritativo); `reverseEntry` **copia** as tags do original para o espelho (isento do hard-gate).
- Aprovação passa a **persistir** dimensões (draft/update) — conta obrigatória fica satisfazível via approve.
- Toggle `setAccountRequiresDimension` atrás de `canManage` + `AuditEvent` hash-chain (`account.requires_dimension_changed`); rota-3-toques + DTO `.strict()`.
- Report: bucket **"(Não alocado)"** na DRE por dimensão (`Σ recortes + não-alocado == total` por construção).

### Gates de segurança (verificados no review)
- **SEC-B1-1:** gate cobre os **3** únicos escritores de `Posting` (enumerados); postEntry+approve in-tx.
- **SEC-B1-2 (reverse não é bypass — verificado adversarialmente):** `reverseEntry` só espelha lançamento **já postado** (falha em entry inexistente/não-postado), inverte o sinal e copia as tags. A única perna sem tag que produz é o espelho *sinal-invertido* de uma perna histórica → efeito líquido **zero** no bucket. Não abre caminho para partida nova não-etiquetada.
- **SEC-B1-3:** approve persiste tags (não fica insatisfazível).
- **SEC-B1-4:** toggle audita + `canManage`.
- **SEC-B1-5:** gate só prospectivo (nunca retro-rejeita histórico).

### Nota de migração (importante)
O `prisma migrate dev` default gerou um **table-rebuild** de `accounts` (DROP+CREATE) que **quebrava o cascade de `user.delete`** (P2003 na FK RESTRICT `referential_mappings.accountId`). Substituído por **`ALTER TABLE "accounts" ADD COLUMN "requiresDimension" BOOLEAN NOT NULL DEFAULT false`** puro — aditiva, preserva o grafo de FKs, drift zero vs schema.

### Testes
`tsc` limpo; **jest 676/676 accounting** (52 suites); 11 testes novos (gate rejeita em post+approve; estorno herda tags e passa; draft persiste tags; toggle audita; conta sem flag 100% opcional; bucket soma e Σ==total).

### Review
Review independente (agente separado) = **PASS — pronto p/ smoke-migration-gate + merge**. Os dois pontos de risco (isenção do reverse; troca para ALTER TABLE) verificados corretos. Notas menores: string `'(Não alocado)'` hardcoded PT (herda padrão pré-existente); verificar se `deleteByEntryId` cascateia as pontes `PostingDimension` na edição de draft (concern pré-INCR-DIM, **não** é bypass).

### Pendente antes de deploy
- **Smoke-migration-gate** sobre cópia do dev.db real (aplicar o ALTER, confirmar cascade intacto). ⚠️ Mesmo bloqueio do drift pré-existente do dev.db (ver PR do A1).
- FE (`FE-INCR-DIM-COMPLETENESS`).

### Merge / integração
- Conflita com o PR de **A1** em `schema.prisma` e `lib/factory.ts` (ambos adicionam model/wiring) — resolver por união.
- Independente do PR de segurança (não toca `middleware/auth.ts`).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
