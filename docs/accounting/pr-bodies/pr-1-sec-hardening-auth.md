## Título
`fix(security): close RISK-SEC-AUTH-001 auth bypass + 4 hardening follow-ups`

## Corpo

### Resumo
Fecha uma vulnerabilidade **CRÍTICA de bypass de autenticação + impersonação de tenant** na borda HTTP (RISK-SEC-AUTH-001), descoberta por auditoria de segurança e **verificada em código**, mais 4 follow-ups de menor severidade da mesma auditoria. A vulnerabilidade **não foi introduzida pelo código contábil** — vive na plataforma (`middleware/auth.ts`) — mas os increments contábeis recentes estacionaram atrás dela os endpoints de mutação de maior valor (`/api/accounting`, `/api/payables`, `/api/receivables`, `/api/dimensions`, `/api/entry-approvals`).

`origin/main` (`eeb33c1`) → `claude/sec-hardening-auth` — **8 arquivos, +214/−4**, 2 commits.

### O crítico (RISK-SEC-AUTH-001)
`authMiddleware` casava o prefixo protegido com `req.originalUrl.startsWith('/api/accounting')` **case-sensitive**, mas o Express roteia **case-insensitive** e decodifica `%`-escapes, e a identidade vinha de headers `x-user-*` **não-stripados**. Exploração (sem JWT): `POST /api/ACCOUNTING/post` (ou `/api/%61ccounting/post`) + headers `x-user-id/username/role` forjados → guarda pulada → rota casa → controller age como a vítima. Escrita/leitura irrestrita nos livros de **qualquer tenant**.

**Fix (defesa em profundidade, `middleware/auth.ts`):**
1. **Strip incondicional** dos headers `x-user-*` de entrada no topo do middleware — identidade só vem de token verificado (controle autoritativo; mata o spoof mesmo em path não-casado).
2. Match do prefixo no **`req.path` decodificado + lowercase** (fecha caixa + percent-encode; exclui a query string).

### Follow-ups
- **ALTA** — import do catálogo RFB (global, cross-tenant) agora **admin-only** (`referentialCatalogController`); read segue aberto.
- **MÉDIA** — CSV formula-injection no export neutralizado (`serializeTable` prefixa `'` em `= + @` e `-` não-numérico; números intactos).
- **MÉDIA** — zip-bomb XLSX: teto de células (2M) no `parseTable` (resíduo honesto: cap em tempo de descompressão via streaming reader diferido).
- **BAIXA** — magic-bytes aplicado nos imports data-exchange/reconciliation/catálogo, **só para tipos declarados binários** (XLSX/office/PDF) — OFX/CNAB/CSV como octet-stream não são rejeitados.

### Testes
`tsc` limpo nos arquivos editados; **auth 12/12, spreadsheet 9/9, uploadSecurity 5/5** verdes. 5 testes de regressão (path maiúsculo, percent-encode, strip de header, token sobrescreve spoof; teto do zip-bomb realmente disparado).

### Review
Review independente (agente separado, re-derivou o exploit pela diff) = **PASS-com-ressalvas não-bloqueantes**: sem bypass remanescente (dupla-codificação, `..`, cobertura dos 7 headers de identidade — tudo checado), zero regressão. Ressalva de deployment: o import RFB admin-only pressupõe **existir conta ADMIN** no ambiente-alvo.

### Merge / integração
- **Não toca schema/migração** → não precisa de smoke-migration-gate.
- ⚠️ **Mergear ESTE PR PRIMEIRO.** Ele reescreve `middleware/auth.ts`; os PRs de A1 (Counterparty) tocam o mesmo arquivo (adicionam `/api/counterparties` ao `protectedApiPaths`) e vão conflitar. Após mergear este, rebase os increments e re-aplique a adição de prefixo sobre a nova estrutura.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
