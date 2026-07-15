# ADR-INBOX — Inbox / Outbox / DLQ (integração assíncrona)

- **Data:** 2026-07-15
- **Status:** **PROPOSED — NÃO ratificado.** Enquadramento (passo `PLAN → ADR`). Este ADR documenta
  principalmente **por que o item permanece um NÃO-OBJETIVO** hoje, e sob qual gatilho ele deixa de ser. FORKS
  abertos; nada travado até revisão fork-a-fork + sinal humano (G0). Nó do master map **⚫ diferido**. **Nenhum
  código autorizado.**
- **Autores:** enquadramento do orquestrador (ORCH-006).
- **Nó do master map:** §5.1 Bloco B item **16 — "Inbox/outbox/DLQ"**; §5 *"Condicionado a sair de
  single-process (T11) — hoje é não-objetivo por decisão travada."*

## TLDR (2 linhas)

Inbox/outbox/DLQ resolve entrega confiável entre processos. O projeto tem **T11 (deploy single-process, SQLite
local, scheduler in-process, sem fila/outbox/DLQ)** como **decisão travada** — as bridges pós-commit (T10)
cobrem a escala atual. Construir outbox/DLQ agora **colide com T11** e é infraestrutura para um problema que não
existe. Este ADR fixa o **gatilho** que o torna necessário, não a implementação.

---

## 1. Contexto e objetivo

Integração origem→ledger hoje é **bridge pós-commit explícita, in-process** (ADR-C01, AccountingSync, T10). Não
há segundo processo, fila, nem entrega "pelo menos uma vez" entre serviços. T11 registra isso como escolha, não
acidente: `accounting-sync-b1-merged` — scheduler in-process é correto para deploy de arquivo-SQLite local.

Outbox/DLQ só entrega valor quando há **fronteira de processo não confiável**: um consumidor externo que pode
falhar/reprocessar, uma fila que desacopla produtor de consumidor. Nenhum existe.

**Objetivo deste ADR:** **não** desbloquear a construção — é enquadrar honestamente que o item é um não-objetivo
por T11, e **nomear o gatilho** que o reabriria, para que a decisão futura seja consciente e não improvisada.

## 2. Rails / a trava central

| Rail | Como se aplica |
|---|---|
| **T11 single-process (TRAVADA)** | Reabrir este item **é reabrir T11** → `DECISÃO ARQUITETURAL` (ADR + sinal humano), não feature. Este ADR não a reabre; documenta o gatilho. |
| **T10 bridge pós-commit** | Cobre a escala atual; enquanto tudo é in-process, a bridge síncrona pós-commit é mais simples e mais confiável que um outbox. |
| **T1 SQLite** | Um "outbox" sobre SQLite local (tabela de eventos + poller) é *possível* e barato, mas resolve um problema (crash entre commit e efeito colateral) que hoje é marginal — YAGNI até medir a perda real. |
| **T6/T8** | Se um dia existir outbox, o registro do evento tem de ser **na mesma tx** do fato (padrão outbox transacional) para não perder/duplicar — mesma disciplina de `tx` propagado. |

## 3. FORKS abertos (recomendação NÃO ratificada)

### F0 — Existencial (o único que importa hoje)
- (a) **MANTER como não-objetivo (T11)** — *recomendação forte*: sem segundo processo nem consumidor externo
  não-confiável, outbox/DLQ é infra sem cliente. As bridges bastam.
- (b) Construir um outbox transacional leve sobre SQLite agora (durabilidade do efeito colateral pós-commit) —
  só se houver evidência de perda real (bridge que falhou após o commit e deixou o ledger e o efeito
  dessincronizados). **Requer reabrir/emendar T11.**

### F1 — Gatilho que reabre o item (documental, não decisão)
Reabrir passa a fazer sentido quando **qualquer** um for verdade:
1. Deploy deixa de ser single-process (múltiplas instâncias / worker separado).
2. Surge um **consumidor externo** que precisa de entrega "pelo menos uma vez" (webhook de terceiro, fila).
3. Mede-se **perda real** de efeito colateral pós-commit (bridge que morre depois do commit) com impacto
   contábil observável.

Até um desses, F0→(a).

## 4. Escopo provável / FORA

**Provável hoje:** nada — o item fica documentado como não-objetivo com gatilho explícito.
**FORA:** broker/fila (Kafka/Rabbit/SQS); reprocessamento com DLQ; retry distribuído; qualquer coisa que
pressuponha multi-processo — tudo condicionado a reabrir T11.

## 5. Riscos e vieses nomeados (T8)

1. **[verificado] Viés de "sistema sério tem outbox/DLQ"** — é infra de escala que impressiona no papel e não
   serve o deploy atual. A checagem que expõe o erro: apontar o segundo processo ou o consumidor externo que
   justificaria — hoje **não existe** (T11). Construir seria over-engineering clássico (ponytail).
2. **[verificado] Reabrir aqui é reabrir T11** — tratar isto como feature comum violaria a governança (§1
   travadas). Nomeado para que qualquer retomada passe por ADR de reabertura de T11.
3. **[inferido] Outbox transacional é o padrão certo SE reabrir** — quando o gatilho vier, o registro do evento
   na mesma tx do fato (não um segundo commit) é a única forma de não perder/duplicar; deixado como nota, não
   pré-construído.

---

**PROPOSED — na prática, um "não fazer ainda" fundamentado.** Próximo gate = **gatilho F1** ocorrer, e então
revisão fork-a-fork que **também emenda T11**. Nó ⚫ / não-objetivo até lá.
