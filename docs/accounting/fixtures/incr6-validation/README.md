# Fixtures — INCR-6 Import/Export functional validation (Bloco A/B/C)

Pré-condição: período ABERTO cobrindo `2026-06`; plano de contas default já seedado
(`ensureChartOfAccounts` — códigos folha `1.1.1` Banco, `1.1.3` Caixa, `3.1` Receita, `4.1` Despesa, etc.).

| Arquivo | Caso do roteiro | Uso |
|---|---|---|
| `chart-of-accounts.csv` | A1 | Import plano de contas — 2 contas novas (`1.1.5`, `1.4.1`) |
| `chart-of-accounts.xlsx` | A2 | Mesmo conteúdo de A1, formato XLSX (paridade) |
| `opening-balances.csv` | A3 / **B1** | Saldos iniciais balanceados (Σd=Σc=500000). B1: re-upload deste MESMO arquivo como novo job → deve ficar em 1 único lançamento |
| `journal-entries.csv` | A4 / **B2** | 2 grupos `entryKey` (JE-001, JE-002), `externalReference` vazio. B2: re-upload do MESMO arquivo → sem duplicar (dedup por `hash(fileSha\|entryKey)`) |
| `journal-entries.xlsx` | A5 | Mesmo conteúdo de A4, formato XLSX |
| `journal-entries-with-ref.csv` | B3 | Grupo JE-101 com `externalReference=NF-00101` preenchido — testar dedup por referência de negócio |
| `opening-balances-altered.csv` | B5 | Mesma estrutura de A3, valores alterados em 1 centavo (500001) — deve gerar hash diferente e commitar como lançamento novo (prova que dedup é por conteúdo) |

B4 (re-commit do mesmo job) não precisa de fixture nova — reusa qualquer arquivo do Bloco A/B.

## Bloco C — validação e rejeição (feedback por linha)

Todo arquivo abaixo é **deliberadamente inválido**; o esperado é a mensagem/código específico, não o commit.

| Arquivo | Caso | Código esperado |
|---|---|---|
| `c1-missing-header.csv` | C1 | `ImportHeaderError` — falta a coluna obrigatória `accountCode` no cabeçalho de Lançamentos |
| `c2-account-not-found.csv` | C2 | `ACCOUNT_NOT_FOUND` na linha com `9.9.9` (conta que não existe no plano) |
| `c3-account-not-leaf.csv` | C3 | `ACCOUNT_NOT_LEAF` na linha com conta `3` (raiz "Receita", `acceptsEntries=false`) |
| `c4-not-single-sided.csv` | C4 | `NOT_SINGLE_SIDED` — linha 1 tem `debitCents` e `creditCents` preenchidos ao mesmo tempo |
| `c5-bad-cents.csv` | C5 | grupo `JE-C05A` → `BAD_DEBIT` (vírgula `"100,00"`); grupo `JE-C05B` → `BAD_CREDIT` (negativo `-10000`) |
| `c6-bad-date.csv` | C6 | `BAD_DATE` — `postingDate` como `05/06/2026` (fora de `YYYY-MM-DD`) |
| `c7-file-unbalanced.csv` | C7 | `FILE_UNBALANCED` — saldos iniciais com Σd(500000) ≠ Σc(499000); **nada** deve commitar (tudo-ou-nada) |
| `c8-group-too-few-lines.csv` | C8 | `GROUP_TOO_FEW_LINES` — `entryKey=JE-C08` com uma única partida |
| `c9-group-unbalanced.csv` | C9 | `GROUP_UNBALANCED` — grupo `JE-C09` com débito 10000 ≠ crédito 9000 |
| `c10-parent-not-found.csv` | C10 | `PARENT_NOT_FOUND` — `parentCode=9.9` não existe no plano nem no próprio arquivo |
| — (reusa `c2-account-not-found.csv`) | C11 | subir → conferir preview com 1 INVALID → **não** clicar Confirmar → ledger inalterado |

Demais blocos (D período, F plano, G export, H tenancy, I reconciliação, J dinheiro) não precisam de fixture nova —
testam via UI/API diretamente (ex.: D usa qualquer arquivo do Bloco A contra um período fechado).
