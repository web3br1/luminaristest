# ADR-IA — IA / analytics (sugestão de conta/conciliação, anomalias)

- **Data:** 2026-07-15
- **Status:** **PROPOSED — NÃO ratificado.** Enquadramento (passo `PLAN → ADR`). FORKS abertos; nada travado até
  revisão fork-a-fork + sinal humano (G0). Nó do master map **⚫ diferido**. **Nenhum código autorizado.**
- **Autores:** enquadramento do orquestrador (ORCH-006).
- **Nó do master map:** §5.1 Bloco B item **15 — "IA/analytics"**; §5 *"Sobre um ledger já confiável; IA sugere,
  humano contabiliza. Última camada."*

## TLDR (2 linhas)

IA aqui é **assistência**, nunca autoridade: sugerir conta para transação não classificada, propor matches de
conciliação, sinalizar anomalias. O invariante-mestre é **IA sugere, humano contabiliza** — a sugestão **nunca**
posta sozinha (espelha o espírito do §4: nada gera lançamento por regra automática). O fork sensível é
**privacidade do dado do ledger** enviado a um modelo (cruza LGPD, item 14).

---

## 1. Contexto e objetivo

O ledger é confiável (Núcleo 1 fechado) e há dado estruturado: transações, histórico de classificação, extratos
de conciliação (INCR-7). IA pode reduzir trabalho repetitivo **propondo** — sem tocar a autoridade do humano
sobre o que vira lançamento.

**Objetivo:** camada de sugestão que acelera classificação/conciliação e destaca anomalias, mantendo o humano
como único que confirma. É a **última camada** (o mapa) — só sobre fundação pronta.

## 2. Rails que DEVE respeitar (T1–T12) + colisões

| Rail | Como se aplica |
|---|---|
| **§4 "IA sugere, humano contabiliza"** | Nenhuma sugestão vira `postEntry` sem confirmação humana explícita. A IA **não** é o motor de regras rejeitado por outro nome — ela propõe, não decide. |
| **T10 fora do caminho crítico** | Sugestão é assistência lateral, nunca no caminho transacional do ledger; falha da IA não pode bloquear um post. |
| **LGPD (item 14)** | Enviar dado de ledger (com PII) a um LLM externo é tratamento de dado pessoal — precisa da base do item 14 (mascaramento/consentimento) ou de inferência local/opt-in. **Colisão dura.** |
| **Precedente do projeto** | Já existe agente de chat (RAG + AGENT ERP) e skills de IA no repo — reusar a infra de chat/ferramentas, não montar pipeline novo. Modelo padrão do stack = Claude (`claude-api`). |
| **T4/T8** | Sugestão não é dinheiro nem fato; não entra em cents/audit até o humano confirmar (aí é `postEntry` normal). |

## 3. FORKS abertos (recomendação NÃO ratificada)

### F0 — Existencial / momento
- (a) **DIFERIR — última camada, sobre demanda** — *recomendação*: o mapa é explícito; valor real só quando o
  volume de classificação/conciliação manual doer. Construir antes é solução à procura de problema.
- (b) MVP de uma sugestão (a mais dolorosa) — justificável se a conciliação (INCR-7) já gerar volume manual alto.

### F1 — Qual assistência primeiro (se F0→b)
- (a) **Sugestão de match de conciliação** — dado mais estruturado (extrato × lançamento), menos PII livre,
  ganho claro sobre o volume do INCR-7. *Recomendação se construir.*
- (b) Sugestão de conta para transação não classificada — útil, mas depende de histórico rico de classificação.
- (c) Detecção de anomalia — maior risco de falso-positivo; valor difuso; por último.

### F2 — Onde a inferência roda (o fork de privacidade)
- (a) **Heurística/estatística local primeiro** (regras de similaridade, histórico) — *recomendação*: resolve
  boa parte do match sem enviar dado a lugar nenhum; zero exposição LGPD. Só sobe para LLM se medir que falta.
- (b) LLM (Claude) com dado **mascarado** e opt-in — só após o item 14 dar a base de mascaramento; nunca dado
  cru de terceiros a serviço externo sem consentimento.

### F3 — Confirmação
- (a) **Humano confirma sempre; sugestão é rascunho** — *recomendação forte* (invariante do nó). Casa com a
  Torre de Aprovação (rascunho → aprovação).

## 4. Escopo provável / FORA

**Provável (se F0→b):** sugestão de conciliação (F1a) por heurística local (F2a), apresentada como rascunho que
o humano confirma (F3a).
**FORA:** qualquer auto-posting; envio de PII crua a serviço externo (bloqueado até item 14); "contador
automático"; treino de modelo com dado do cliente.

## 5. Riscos e vieses nomeados (T8)

1. **[verificado] IA que posta sozinha reabre §4 disfarçado** — "a IA classificou com 99%, deixa postar" é o
   motor de regras automático por outro nome. A checagem que falha: qualquer caminho onde sugestão→post sem
   confirmação humana. F3→(a) é o invariante.
2. **[verificado] Privacidade cruza LGPD (item 14)** — F2→(b) não pode preceder a base de mascaramento do item
   14; F2→(a) local evita a colisão e provavelmente já entrega o valor. Ordem: item 14 antes de LLM sobre ledger.
3. **[inferido] Falso-positivo de anomalia custa confiança** — por isso F1 põe anomalia por último; sugestão
   ruim que interrompe o fluxo é pior que ausência de sugestão.
4. **[assumido] Última camada** — construir IA sobre um núcleo não 100% confiável amplifica erro; o mapa
   condiciona a "ledger já confiável", que está fechado, mas os diferidos de operação (folha/estoque) não.

---

**PROPOSED.** Próximo gate = revisão fork-a-fork + sinal humano. Nó ⚫ até lá. F2→(b) exige o item 14 primeiro.
