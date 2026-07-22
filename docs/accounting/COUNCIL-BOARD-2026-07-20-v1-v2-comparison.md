# Retificação do Council — v1 → v2 (comparação)

**Consultivo · 2026-07-20 · base worktree @ `32b059c` · Ratificação = humana (mapa-mestre §5.1)**

A rodada 2 não substituiu a rodada 1: **retificou-a**. Esta peça mostra só o *delta*. A direção
central sobreviveu; a manchete não. Boards completos: `COUNCIL-BOARD-2026-07-20-decisions-review.md`
(v1) e `COUNCIL-BOARD-2026-07-20-v2-rebuttal.md` (v2).

## A manchete que virou

| Rodada 1 dizia | Réplica v2 (verificado à mão) |
|---|---|
| Risco mais agudo = `/api/package-balances` sem auth em `main`, vazamento aberto | **Falso — fail-closed:** `auth.ts:62` stripa a identidade forjada de toda request; endpoint chega ao controller sem contexto. O furo real é **dinheiro**: o razão manual posta "1.234,56" como R$ 1,23. |

## §1 — Itens que viraram ou foram emendados

| Item v1 | Status | Rodada 1 dizia | Réplica v2 (verificado) |
|---|---|---|---|
| 1.1 A9 auth | **Parc. derrubado** | package-balances vaza; patch = pôr na allowlist | Fail-closed (strip incondicional). Allowlist seria *ativação, não fechamento*. HEAD→GET sobrevive rebaixado; deny-by-default vale por robustez |
| 1.3 Tie-out | **Emendado ×2** | diagnóstico cobrindo 1.1.5 + 2.1.2 | **3ª posição invisível**: CRM debita a mesma 1.1.2 do salão sem settlement → cobrir 1.1.2 (salão+CRM) + 1.1.5 + 2.1.2. Zero UI nova |
| 1.5 MAX_CENTS | **Emendado ×3** | mover guard ao postEntry | Sozinho = loop de evento-veneno (bridges só skipam período-fechado). Mudança única: guard + skip-list + poison + deleção dos guards de borda |
| 1.7 Dimensões | **Emendado (defeito novo)** | desenho certo, sequência cara | `requiresDimension` **deadlocka o encerramento** (encerramento compõe legs sem tag; gate in-tx rejeita; estorno tem isenção, encerramento não). Pré-condição: isentar escritores-máquina antes de adoção |
| 2.3 Estoque/CMV | **Subclaim derrubado 5/5** | gap CMV = correção urgente | **Não urgente** sob Presumido (PVA computa só receita bruta; CMV não afeta imposto). Antes de tocar fixture, centralizar bindings conta→papel |
| 2.6 Gate de reuso | **Emendado (subestimava)** | 2 clones vivos; gate antes do 3º | Dano **ocorreu no 2º clone** (bug N1). Espelho FE 565=565/368=368, `resolveError` ×14. Gate cobre backend + FE + técnica |

## §2 — O que resistiu ao ataque (cada lente tinha o dever de derrubar)

| Item v1 | Placar | Por que resistiu |
|---|---|---|
| 1.2 Counterparty A0.5 → executar ADR até o fim | 5/5 | FE mergeado não muda o resíduo (FK NULLABLE, @@unique no nome) |
| 1.4 Travar código fiscal até 1 ECD no PVA | 5/5 | — |
| 2.1 Congelar o Bloco B (direção) | 5/5 | Só o raio das exceções virou memo; a direção sobreviveu íntegra |
| 2.2 ERP-gen = próximo esforço grande | 5/5 | Cada clone novo da R2 reforça: mais uma linha p/ o compilador absorver |
| 2.4 ECF gateado em "ECD aceito no PVA" | 5/5 | Único item com a forma correta de gate |
| A6/T11 single-process | hold | minimal leu o scheduler tentando derrubar e **falhou** — confirmação (T5) |

## §3 — Achados novos (fora do docket)

- **N1 · CONFIRMED (à mão) · HIGH** — corrupção de dinheiro no razão manual (`JournalEntryModal.tsx:76-79` `parseBrl` frágil; "1.234,56" → R$ 1,23; balanceia e posta). Bug em `main`. Fix em execução (chip `task_0977dda8`).
- **N2 · CONFIRMED · HIGH** — kits de redução-de-gate apodrecem sem convocar humano (2 artefatos nunca rodados) → sprint deve *executar* deploy, não escrever roteiros.
- **N4 · CONFIRMED · MED** — seam CRM defeituoso em 3 eixos (recebível órfão em 1.1.2; ignora split de natureza; guard `isSafeInteger`). Nunca revisitado pós-REVENUE-SPLIT.
- **N5 · CONFIRMED · MED** — DRE-por-dimensão não exclui closing (`DimensionReportService.ts:286-294` sem `excludeSourceTypes`). Fix de 1 linha; elegível ao freeze.
- **N6–N10 · MED** — `requiresDimension` deadlocka escritores-máquina (latente); clone de técnica ×14; tab bar sem overflow (17 abas); tenancy por regex fuzzy `/unidade|units/i` + paginação 50 sem fetch-all; reconcile job sem filtro `deletedAt`.
- **N11–N15 · baixa/registro** — canônico latente `ACCOUNT_ROLES`; classe UTC-hoje em 9+ inputs; comparativo sem rótulo closing-aware; regra da fixture-joint canônica; **T5**: i18n 732=732, formatDate canônico, scheduler sadio.

## §4 — As 3 decisões que continuam do dono

- **E1 — Raio do freeze.** 5/5 rejeitam freeze total *e* raio maior; 5/5 aceitam **lista fechada de 5 exceções** (as 3 do v1 + fix parseBrl + one-liner `excludeSourceTypes`), não-renovável, caduca em 30 dias sem sessão humana. Resto do esforço = **executar** 1 deploy real. Custo de recusar (d)/(e) = sign-off validando valores errados.
- **E2 — Fork Estoque.** Fork A/D/DEFER ratificado 5/5 (B/C ilegais por contrato); **leg D (regime periódico) lidera 4/5**, execução demand-gated (vertical-2 ou 1º tenant com revenda). Gap CMV-urgente derrubado 5/5. Zero fixture sob freeze.
- **E3 — Política "sem incremento até uso real".** Versão dura rejeitada 4/5; ratificar como **default de roteamento registrável** (não bloqueio) — dono fura com 1 linha registrada. Prova empírica: o deadlock DIM×APURAÇÃO (2 increments sem uso, ambos reviewer-PASS isolados).

## Viés que sobrevive às duas rodadas (T8)

Tudo — nas duas rodadas — foi verificado por leitura de código e greps; **nenhum achado por request
ou render real**, inclusive o "fail-closed" que virou a manchete. Num sistema cujo gargalo declarado é
a ausência de execução real, essa é a limitação central — e é por isso que a recomendação convergente
das duas rodadas é a mesma: parar de ler e começar a executar (1 deploy, 1 PVA, 1 sessão de browser).
