# ADR-ECF-FASE3 — ECF Fase 3 (blocos remanescentes · Presumido)

- **Data:** 2026-07-15
- **Status:** **PROPOSED — NÃO ratificado.** Documento de enquadramento (passo `PLAN → ADR` do fluxo T12).
  Os FORKS abaixo são decisões **abertas**; nenhuma vale como travada até revisão fork-a-fork + sinal humano
  (gate G0). O nó do master map permanece **⚫ diferido** até ratificação. **Nenhum código autorizado por este
  arquivo.**
- **Autores:** enquadramento do orquestrador (ORCH-006). Sucessor natural de `ADR-INCR-SPED-ECF-file-generation.md`.
- **Nó do master map:** §5.1 Bloco B item **10 — "ECF Fase 3"**. Gate declarado no mapa: *"Só faz sentido após
  o sign-off PVA da Fase 2 (item 3) provar a base."* Este ADR **não** desbloqueia esse gate — depende do humano
  validar a Fase 2 no PVA oficial primeiro.

## TLDR (2 linhas)

A ECF Fase 2 já segrega **receita bruta** por atividade nas linhas `E` do Bloco P e deixa o PVA computar o
imposto (Presumido). A **Fase 3** fecha os blocos ainda vazios/diferidos do leiaute — principalmente **Bloco Y
(informações econômicas/cadastrais da PJ)** e **Bloco 0 (abertura/cadastro completo)** — que exigem **dado
cadastral novo** (sócios, CNAE, qualificação) que hoje o sistema não modela. O fork central é *quanto* desse
cadastro entra e *onde* ele vive.

---

## 1. Contexto e objetivo

A Fase 2 (PR #78, mergeada) provou o caminho crítico: `lib/ecf.ts` serializa o arquivo, o gate é de
**exaustividade da receita** (não referencial), e o **PVA computa a presunção + imposto** — Luminaris só
entrega receita bruta segregada (3.1→P200(8)/P400(4), 3.3→P200(4)/P400(2)). O que ficou **fora**:

- **Bloco 0** parcialmente preenchido (identificação mínima; falta qualificação completa da PJ).
- **Bloco Y** (Y520, Y540, Y600 sócios/administradores, Y612, informações econômicas) — **não emitido**.
- **Bloco Q** (livro-caixa) — só relevante se a PJ optar; hoje fora.
- Confirmação, contra o PVA real, do **conjunto exato de blocos vazios** aceitos (S001/S990 vazio já emitido).

**Objetivo da Fase 3:** completar os blocos que faltam para o arquivo passar limpo no PVA **sem erro de
estrutura**, decidindo quanto do dado cadastral (Bloco Y) o Luminaris passa a modelar como first-class vs.
aceitar como DTO transiente informado no momento da geração.

## 2. Rails que a Fase 3 DEVE respeitar (T1–T12) + colisões

| Rail | Como se aplica aqui |
|---|---|
| **T3 Prisma first-class** | Se o cadastro da PJ (sócios/qualificação) virar persistente, é Model+Service+Repo+Policy próprios — nunca DynamicTable, nunca no motor de plugins. |
| **T2 Tenancy `AccountingScope`** | Dado cadastral é por `userId`+`unitId`; **sem** torre `LegalEntity` (§4). O "Bloco Y" descreve a PJ do escopo, não uma entidade nova. |
| **T4 dinheiro = cents** | Valores econômicos do Bloco Y em centavo inteiro. |
| **Reuso** | `lib/ecf.ts` + `lib/sped.ts` (serializers puros, 2-passadas) e o padrão job/artefato/download do INCR-6 já existem — Fase 3 **estende registros**, não cria pipeline novo. |
| **Colisão §4 (Motor de Regras)** | Nenhuma — geração é read/export determinístico, sem template gerando lançamento. |
| **Precedente ECD/APURACAO** | Identidade transiente via DTO (D3 do ECD) é o caminho de menor migração; a Fase 3 só foge dele se o cadastro precisar ser reusado por outros consumidores. |

**Dependência dura:** o gate §5.1 item 3 (sign-off PVA da Fase 2) tem de fechar **antes** — importar um arquivo
Fase 3 no PVA sobre uma base Fase 2 não-validada mistura duas fontes de erro.

## 3. FORKS abertos (recomendação NÃO ratificada)

### F0 — Existencial / momento (YAGNI + gate PVA)
- (a) **DIFERIR até o sign-off PVA da Fase 2** — *recomendação*. O mapa é explícito; sem a base provada, a Fase 3
  otimiza contra um alvo não confirmado.
- (b) Construir já, em paralelo ao sign-off — descartável: retrabalho se o PVA reprovar a estrutura da Fase 2.

### F1 — Onde vive o cadastro do Bloco Y (sócios/qualificação da PJ)
- (a) **DTO transiente informado na geração** (espelha D3 do ECD/APURACAO) — *recomendação para MVP*: zero
  migração; o contador informa os campos no momento de exportar.
- (b) Model Prisma first-class (`CompanyProfile`/`Partner`) — só se o dado for reusado por outro consumidor
  (NF-e emissão, recibos com CNPJ completo). Custo: migração + cadastro; ganho: não redigitar.

### F2 — Escopo de blocos
- (a) **Bloco 0 completo + Bloco Y (sócios/informações econômicas)** — o mínimo para estrutura PVA-limpa.
- (b) (a) + Bloco Q livro-caixa — só se houver PJ optante; descartável no MVP.

## 4. Escopo provável / FORA

**Provável:** completar Bloco 0, emitir Bloco Y, confirmar conjunto de blocos vazios contra o PVA.
**FORA:** Lucro Real (Blocos M/N/L — regime diferente, ADR próprio); DIPJ/outras obrigações; qualquer cálculo de
imposto (o PVA computa — invariante da Fase 2).

## 5. Riscos e vieses nomeados (T8)

1. **[inferido] Conjunto de blocos vazios só se prova no PVA** — a lista "aceita vazia" é suposição até rodar o
   validador oficial. A checagem que falharia se eu estivesse errado é o próprio import PVA (gate humano).
2. **[assumido] Cadastro do Bloco Y é dado novo** — se parte já existir (ex. recibos guardam CNPJ), reusar antes
   de modelar (Contrato §0). Verificar por `grep` antes de qualquer Model.
3. **[verificado] Depende de gate humano externo** — este ADR não pode "fechar" sozinho; nomear isso evita
   falsa sensação de prontidão.

---

**PROPOSED.** Próximo gate = (1) sign-off PVA da Fase 2, depois (2) revisão fork-a-fork deste ADR. Nó ⚫ até lá.
