# 🧠 Relatório Técnico Sênior: Motor de Analytics

> Análise completa da pasta `server/src/features/analytics/` — arquitetura, fluxo de dados, independência e qualidade da implementação.

---

## 1. Estrutura Geral da Pasta

```
analytics/
├── index.ts                          # Porta de saída pública (Public API)
├── core/                             # Infraestrutura pura (sem lógica de negócio)
│   ├── ProcessorRegistry.ts          # Registro central de todos os processadores
│   ├── TemplateRegistry.ts           # Registro central de todos os templates
│   ├── models/                       # Tipos/Interfaces compartilhados
│   ├── engine/                       # (Subpastas de engine internas)
│   └── pipeline/
│       ├── Pipeline.ts               # Tipos declarativos do sistema Pipeline
│       └── Compiler.ts               # Compilador de pipelines declarativos
├── engine/                           # Camada de execução e resolução
│   ├── AnalyticsResolver.ts          # Orquestrador principal (O "Motor")
│   └── FieldMapper.ts                # Mapeador de configurações para params
├── services/
│   ├── AnalyticsService.ts           # Service: gera os grupos de KPIs do usuário
│   ├── AnalyticsValidator.ts         # Valida configurações de analytics
│   └── AnalyticsDefinitionValidator.ts
├── kpis/                             # Processadores ESPECIALIZADOS (KPIs fixos)
│   ├── revenue/                      # 17 KPIs de Receita
│   ├── cost/                         # KPIs de Custo
│   ├── profit/                       # KPIs de Lucro/Margem
│   ├── sales/                        # KPIs de Vendas
│   └── cashflow/
├── dynamic/                          # Processadores GENÉRICOS (Analytics livres)
│   ├── processors/                   # ex: aggregatePipeline
│   └── templates/
└── utils/
    ├── DataSanitizer.ts              # Higienizador de dados brutos (moedas)
    └── DateUtils.ts                  # Funções de timezone e janelas temporais
```

---

## 2. Como os KPIs Rodam: Fluxo Completo

O fluxo percorre **5 camadas** sempre nesta ordem:

```
[HTTP Request]
     │
     ▼
[analyticsController.ts]        ← Fora do módulo (porta de entrada)
     │ chama
     ▼
[AnalyticsResolver.ts]          ← MOTOR PRINCIPAL (engine/)
     │ 1. Busca lista de KPIs disponíveis (AnalyticsService)
     │ 2. Encontra o KPI solicitado
     │ 3. Lê dados da tabela dinâmica via STREAM (DynamicTableService via Factory)
     │ 4. Injeta rows + streamRows no contexto
     │ chama
     ▼
[Processor Function]            ← kpis/revenue/RevenueKpiProcessor.ts
     │ (ex: revenueKpiProcessor)
     │ 1. Lê parâmetros de campo (amountField, dateField, etc.)
     │ 2. Itera via `for await (batch of streamRows)` - SINGLE PASS
     │ 3. Acumula somas, contadores, IDs de drilldown
     │ retorna
     ▼
[ChartDataPoint[]]              ← Array de KPIs calculados
     │ (com value, recordIds, tableSource)
     ▼
[AnalyticsResolver] enriquece os dados com fullRecords (se pequeno o suficiente)
     ▼
[HTTP Response: JSON]
```

---

## 3. Técnicas Utilizadas (e para que serve cada uma)

### A. Registry Pattern (Registro Central)
**Arquivo:** `core/ProcessorRegistry.ts` e `core/TemplateRegistry.ts`

O sistema NOT acopla os processadores diretamente. Em vez disso, cada processador se registra em um "catálogo central" na inicialização do servidor:

```typescript
// No kpis/revenue/index.ts:
registerProcessor('revenueKpis', revenueKpiProcessor);
registerTemplate('revenueKpis', revenueTemplate);
```

Quando o motor precisa executar, ele chama `getProcessor('revenueKpis')` e obtém a função. **Benefício:** Adicionar um novo KPI não muda NADA no motor. Zero acoplamento entre processadores.

---

### B. Cursor-Based Stream (Prevenção OOM)
**Arquivo:** `DynamicTableRepository.ts` (dependência externa gerenciada)

O motor NÃO carrega a tabela inteira em memória. Ele abre um "tubo" com o banco:

```typescript
// Dentro do Resolver:
async function* getTableStream() {
  for await (const batch of service.getTableDataStream(user, tableId)) {
    yield batch.map(r => ({ id: r.id, data: r.data }));
  }
}
// O processador recebe: context.streamRows = getTableStream
```

Cada processador decide se usa `rows` (array simples, para poucos dados em testes) ou `streamRows` (generator assíncrono, para produção). **O RevenueKpiProcessor usa streamRows com fallback automático.**

---

### C. Cents-Safe Arithmetic (Precisão de Moeda)
**Arquivo:** `kpis/revenue/RevenueKpiProcessor.ts`

Toda soma financeira usa a função `addMoney`:

```typescript
function addMoney(a: number, b: number): number {
  return (Math.round(a * 100) + Math.round(Number(b || 0) * 100)) / 100;
}
```

Isso converte centavos para inteiros (multiplica por 100), soma os inteiros e divide. Elimina o famoso erro de ponto flutuante: `0.1 + 0.2 = 0.30000000000004`.

---

### D. DataSanitizer (Higienização de Moedas Dinâmicas)
**Arquivo:** `utils/DataSanitizer.ts`

Como os campos são definidos pelo usuário (tabelas dinâmicas), um valor de "Valor Total" pode ser `"R$ 1.500,00"`, `"1500"` ou `"$1,500.50"`. O DataSanitizer normaliza tudo:

```typescript
DataSanitizer.extractCurrency("R$ 1.500,00") // → 1500.00
DataSanitizer.extractCurrency("$1,500.50")   // → 1500.50
DataSanitizer.extractCurrency(null)           // → 0 (nunca NaN)
```

---

### E. DateUtils (Fuso Horário e Janelas Temporais)
**Arquivo:** `utils/DateUtils.ts`

Todos os cálculos de data respeitam o timezone do usuário (`x-user-timezone` no header). O motor usas funções como `getPeriodBoundaries()` para definir:
- **Período Atual:** Ex: mês corrente em São Paulo (UTC-3)
- **Período Anterior:** Para calcular % de crescimento
- **Janela de 12 meses:** Para Receita Anual e Séries Históricas

---

### F. Declarative Pipeline (Analytics Livres sem Código)
**Arquivos:** `core/pipeline/Pipeline.ts` e `dynamic/processors/`

Um segundo sistema coexiste com os KPIs fixos: o **Pipeline Declarativo**. Permite criar análises personalizadas via JSON sem escrever código TypeScript:

```json
{
  "source": { "kind": "presetTable", "key": "@@PRESET_TABLE_KEY::sales" },
  "measures": [{ "type": "sum", "field": "totalAmount" }],
  "dimensions": [{ "type": "period", "dateField": "date", "period": "month" }]
}
```

O processador `aggregatePipeline` compila e executa esse JSON. **Esta é a base para os "Custom KPIs" futuros** que o usuário criará sem precisar de programação.

---

## 4. Avaliação de Independência do Módulo

| Dependência | Tipo | Arquivo | Avaliação |
|---|---|---|---|
| `@/lib/factory` | **Serviço de Dados** | `AnalyticsService.ts`, `AnalyticsResolver.ts` | ⚠️ Necessária mas controlável |
| `../../dynamicTables/presets` | **Metadados** | `AnalyticsService.ts` | ⚠️ Acoplamento de preset |
| `../../dynamicTables/models` | **Tipagem** | `AnalyticsService.ts` | ✅ Apenas `import type` (seguro) |
| `express` (Request) | **HTTP** | `AnalyticsResolver.ts` | ⚠️ Leve, apenas pelo contexto do usuário |

### Veredicto de Independência: **7/10 — Bom, mas não perfeito**

**O núcleo puro (`core/`, `kpis/`, `utils/`, `dynamic/`) é 100% independente.** Os processadores e templates não importam absolutamente nada externo ao módulo analytics.

O ponto de acoplamento real está no `AnalyticsService.ts` e `AnalyticsResolver.ts`:
- Eles precisam buscar dados reais via `getFactory().getDynamicTableService()` — inevitável.
- O `AnalyticsService` importa diretamente `../../dynamicTables/presets` para saber quais KPIs o usuário tem disponíveis — esse é o acoplamento mais **forte** e poderia ser abstraído.

---

## 5. Pontos de Melhoria Pendentes

| Item | Prioridade | Status |
|---|---|---|
| Cache/Snapshot de KPIs processados | 🔴 Alta | Documentado em `reports/kpi_engine_roadmap.md` |
| Sanitização nos demais processadores (Cost, Lead) | 🟡 Média | Pendente |
| Injetar presets via interface (desacoplar `tablePresetSuites`) | 🟢 Baixa | Arquitetural |
| Testes unitários para `DateUtils` e `DataSanitizer` | 🟡 Média | Pendente |

---

## 6. Resumo Final

O motor é **robusto, bem estruturado e tecnicamente sólido** para um produto B2B. 
O fluxo é previsível, os processadores são isolados e a single-pass com streaming garante que ele não vai cair por OOM. A nota técnica atual é **7.5/10** — o principal gap é a ausência de cache, que transforma o sistema de "confiável" para "performático de verdade".

---
*Relatório gerado por Antigravity em 06/04/2026.*
