# Luminaris — Critério Reuse-vs-Bespoke (shape + posse)

> **Fonte única da decisão "criar bespoke ou reusar o canônico?".** Carregada *só quando essa decisão está viva*: um gerador prestes a criar tabela/board/card/chart/modal próprio; o reviewer avaliando se um arquivo é "ilha"; o orquestrador planejando "construir X novo". Complementa `_ARCHITECTURE-CONTRACT.md` §0 — o §0 lista **quais** são os canônicos; este arquivo diz **como decidir** se o que você vai criar deveria ser um deles.
>
> Existe porque a causa-raiz da revisão reprovada do CRM foi *módulo ilha* (bespoke onde havia canônico) — e isso o lint **não pega**. A exortação "reuse antes de recriar" não diz como decidir; este critério transforma esse julgamento em **repetível** (qualquer execução chega à mesma resposta).

São **duas etapas. NUNCA colapse a Etapa 2 na Etapa 1** — senão a regra recomenda consolidar coisas que deviam divergir por estado, não por domínio.

## Etapa 1 — DETECTOR (quase mecânico): é o mesmo objeto de domínio?
Responda pelo par **(shape, posse)**, não por aparência visual:
- **MESMO objeto** ⟺ mesmo **shape de dados** **E** mesma **derivação** (mesma fonte/tabela).
- **DIFERENTE em espécie** ⟺ difere no **shape** **OU** em **quem possui o dado** (self-derives vs recebe por prop/evento).

Sinal barato mais afiado: **uma chave de domínio aparece no shape?** Dois impls carregando `leadId` e derivando a mesma tabela = mesmo objeto. Um sem chave de domínio / prop-driven / schema-aware = genérico, diferente em espécie.

→ **Diferente em espécie:** divergência sancionada. **Pode criar bespoke.** Pare aqui.
→ **Mesmo objeto:** vá à Etapa 2 (mesmo-objeto **≠** "consolide já").

## Etapa 2 — DECISOR (factual, NÃO mecanizável): os dois lados estão vivos?
Mesmo objeto não implica reusar cegamente. Cheque **estado**:
- Algum lado é **legacy/morto**? Estão em **ciclos de vida divergentes**?
- Se um está morrendo, **não clone o morto** — reuse o vivo (ele herda; o morto some com a ilha dele).
- Se ambos vivos e mesmo objeto: **reuse o canônico**, não crie o segundo.

## Casos validados (decida por analogia a estes)
| Par | Etapa 1 | Etapa 2 | Decisão |
|---|---|---|---|
| dois `MeetingsCalendar` | mesmo shape + `leadId` → mesmo objeto | um é legacy (`category-views/leads` island) | NÃO consolidar — morre com a ilha |
| `PlanningCalendar` vs `MeetingsCalendar` | sem chave de domínio, prop-driven, schema-aware → diferente | — | manter separado (sancionado) |
| `InternalKanbanView` vs `CrmPipelineBoard` | shape/posse diferentes → diferente | — | divergência sancionada, separados |
| `RecordTable` vs `GenericTable` | mesmo objeto (registros DynamicTable) | `RecordTable` morto (deletado) | reusar `GenericTable` — era ilha |

## A pergunta executável (responda ANTES de criar)
> "O que vou criar tem o **mesmo shape e a mesma fonte** de um canônico existente (§0)?
> • Sim e ambos vivos → **reuse o canônico**.
> • Diverge em shape ou em posse → **bespoke sancionado** (pode criar; justifique no relatório).
> • Mesmo objeto mas o outro é legacy → **reuse o vivo, não clone o morto**."

## Como o codebase-memory dá a evidência (pare de adivinhar)

A decisão continua sua — mas o grafo responde os **sinais baratos** das duas etapas, em vez de memória tribal:

- **Etapa 1 (detector):** `search_graph` (name/label/file) acha impls com nome/forma parecidos; edges
  `SIMILAR_TO` (quase-clone por MinHash) e `SEMANTICALLY_RELATED` revelam a **ilha que o nome não denuncia**.
  Grafo aponta par com mesmo shape derivando a mesma fonte → mesmo objeto.
- **Etapa 2 (decisor):** `trace_path` inbound (**in-degree 0 = sem chamadores**) + `change_count` /
  `last_modified` (parado = candidato a legacy) dão o sinal vivo-vs-morto. Dead-code via
  `query_graph` (`WHERE NOT EXISTS { (f)<-[:CALLS]-() }`) lista ilhas órfãs; `detect_changes` confirma o
  blast radius do que você toca.

O grafo **informa**, não decide a Etapa 2 (segue não-mecanizável). Mas "RecordTable morto" ou
"MeetingsCalendar legacy" deixam de ser conhecimento de cabeça e viram in-degree + change_count observáveis.

---

Não-mecanizável por CI — por isso vive aqui, não no lint. O **reviewer** aplica isto como check do veredicto de ilha; os **geradores** aplicam antes de escrever; o **orquestrador** aplica ao planejar "construir X novo". Relacionado: `_ARCHITECTURE-CONTRACT.md` §0.
