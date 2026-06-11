# 📈 Roadmap: Evolução do Motor de KPIs (Escala B2B)

Este documento registra o estado atual, as melhorias de infraestrutura já realizadas e os próximos passos críticos para transformar o motor de analytics em uma "usina de dados" de alta performance.

---

## ✅ Concluído (Fase 1: Estabilização e Precisão)

- **Sanitização de Dados:** Implementação do `DataSanitizer` para tratar moedas dinâmicas (R$ 1.500,00) e garantir precisão matemática.
- **Prevenção de OOM (Out-Of-Memory):** Refatoração do `DynamicTableRepository` para uso de **Cursor-Based Loop (Streaming)**. O Node.js não carrega mais a tabela inteira na RAM.
- **Single-Pass Loop:** O `RevenueKpiProcessor` foi otimizado para rodar todas as métricas (incluindo heurísticas de clientes novos/leais) em apenas uma passagem pelos dados.
- **Drilldown Cirúrgico:** APIs de detalhes agora buscam apenas os IDs necessários via banco (`id IN (...)`), eliminando filtragem pesada no backend.

---

## ⏳ Pendente (Fase 2: Performance e Snapshots)

Abaixo estão as atualizações planejadas que devem ser aplicadas antes do lançamento em larga escala (Big Data):

### 1. Camada de Persistence Cache (Snapshots)
- **Objetivo:** Zerar o uso de CPU nas visualizações repetitivas do Dashboard.
- **Ação:** Criar a tabela `AnalyticsCache` no Prisma para salvar o JSON final do processamento.
- **Benefício:** Gráficos carregarão em milissegundos, independente do tamanho da tabela de origem.

### 2. Atualizações Atômicas (Deltas Real-time)
- **Objetivo:** Manter os totais financeiros (Revenue/Cost) atualizados sem precisar re-varrer o banco de dados.
- **Ação:** Implementar gatilhos (Hooks) no `DynamicTableService` que disparam `prisma.kpiCache.update` usando a função **`{ increment: value }`**.
- **Regra de Ouro:** Tratar edições (Novo Valor - Antigo Valor) e deleções para manter o delta matemático sempre íntegro.

### 3. Estratégias de Invalidação
- **Passiva:** Cache com validade de 1 a 6 horas (padrão Google Analytics).
- **Ativa:** Invalidação disparada por alteração no CRUD (padrão Real-time ERP).

### 4. Expansão do DataSanitizer
- **Ação:** Aplicar o padrão de sanitização rigorosa nos demais processadores pendentes: `CostKpiProcessor`, `LeadKpiProcessor` e `ConversionKpiProcessor`.

---

## 🛠️ Notas de Manutenção (Sênior)
- **Banco de Dados:** O motor atual está preparado para a transição SQLite -> PostgreSQL. Todas as chamadas de banco no repositório já respeitam os tipos escaláveis.
- **Tipagem:** Manter a interface `AnalyticsProcessorContext` sempre atualizada com o suporte a `streamRows`.

---
*Documento gerado por Antigravity em 06/04/2026 para acompanhamento técnico.*
