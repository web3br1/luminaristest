## Título
`docs(accounting): reconciliar master map (eeb33c1) + 2 ADRs de integridade ratificados + lente de segurança`

## Corpo

### Resumo
Atualização documental do módulo contábil, produto de uma sessão de reconciliação + debate de personas + auditoria de segurança. **Só docs** (`docs/accounting/` + `docs/adr/`) — nenhum código. Acompanha (e referencia) os 3 PRs de código: segurança, INCR-COUNTERPARTY (A1), INCR-DIM-COMPLETENESS (B1).

`origin/main` (`eeb33c1`) → `claude/grafo-mestre-contabil-7da2e6` (`5b4be88`) — **4 arquivos, +323/−18**, 6 commits.

### Conteúdo
1. **Master map reconciliado** a `eeb33c1` (FE-INCR-DIM #116 mergeado, painel = 16 abas, §3/§5/§5.1/§7).
2. **Debate de personas** (arquiteto / orquestrador / cético) sintetizado: o backlog de código está drenado; o gargalo real é **validação humana** (nenhum SPED no PVA, nenhum browser sign-off, deploy nunca rodado).
3. **2 ADRs de integridade ratificados fork-a-fork** e com status de implementação:
   - `ADR-INCR-COUNTERPARTY` (A1) — contraparte first-class + FK. Backend implementado + review PASS.
   - `ADR-INCR-DIM-COMPLETENESS` (B1) — etiqueta obrigatória por conta (emenda `ADR-INCR-DIM` F5). Backend implementado + review PASS.
   - Ambos carregam a seção **"Gates de segurança (VINCULANTES)"** do red-team.
4. **Lente de segurança** — `RISK-SEC-AUTH-001` (crítico) documentado + os 4 follow-ups; status "fix implementado + review PASS" (código no PR de segurança).

### Merge
- Sem risco de código. Pode mergear a qualquer momento (idealmente por último, para as referências de commit/branch dos outros 3 PRs ficarem estáveis).
- `docs/adr/INDEX.md` atualizado (2 ADRs novos + emenda de F5).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
