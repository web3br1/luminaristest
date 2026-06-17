---
name: frontend-kanban-workflow-generator
description: Gera tela de fluxo de trabalho (workflow) como board Kanban reusando os primitivos canônicos — drag-drop entre etapas, modal de detalhe do card, colunas por status/etapa filtradas pelo pai ativo
argument-hint: "[nome-do-modulo] [status-enum|stage-relation]"
allowed-tools: Read, Grep, Glob, Write, Edit
---

# Frontend Kanban Workflow Generator

## Purpose

Gera uma tela de **fluxo de trabalho** (mover registros por etapas) como um board **Kanban** que **REUSA os primitivos canônicos** do app (`InternalKanbanView`/`KanbanColumn`/`KanbanCardDetailModal` + `@dnd-kit`). É a skill correta para qualquer entidade com etapas/estados que o usuário avança: funil de vendas (pipeline), pedidos, tickets, aprovações, onboarding, tarefas. Garante drag-drop, modal de detalhe e container full-height — em vez de um board estático reimplementado.

> **Por que esta skill existe:** o pipeline do CRM (`my-app/pages/crm/pipeline.tsx`) reimplementou um board **estático** (sem drag-drop, clique = troca de tela) ignorando o `InternalKanbanView` canônico que já tinha tudo. Esta skill impede esse "módulo ilha".

## Contrato obrigatório

Antes de gerar, leia `.claude/skills/_ARCHITECTURE-CONTRACT.md` — as regras cross-cutting (reuse de canônicos §0, paginação DynamicTable, modal-não-rota, `useMemo`, container full-height, design system) são **gate** e não se repetem aqui. Esta skill adiciona apenas o checklist específico de **Kanban Workflow**. Para transições com **efeitos colaterais no backend** (criar registro relacionado, atualizar snapshot, logar atividade, guardar transição), use junto a skill `backend-workflow-transition-generator`.

## When to use

- Tela onde o usuário **arrasta** registros entre etapas/estados (pipeline, board, esteira, funil)
- Entidade com um campo de estado (`select`) OU com etapas numa **tabela relacionada** (pipeline → stages)
- Substituir um board estático/lista por um Kanban interativo

## Inputs

- `$ARGUMENTS[0]`: nome do módulo em kebab-case (ex: `pipeline`, `orders-board`)
- `$ARGUMENTS[1]`: origem das colunas: `status-enum` (campo select no próprio registro) | `stage-relation` (etapas numa tabela-pai, ex. `leadStages` filtradas por `leadPipelines`)

## Repository patterns to inspect first

```
my-app/features/dashboard/category-views/kanban/InternalKanbanView.tsx        ← board canônico (REUSE — não recrie)
my-app/features/dashboard/category-views/kanban/KanbanColumn.tsx              ← coluna droppable
my-app/features/dashboard/category-views/kanban/KanbanTaskCard.tsx            ← card draggable
my-app/features/dashboard/category-views/kanban/components/KanbanCardDetailModal.tsx ← detalhe do card em MODAL
my-app/features/dashboard/category-views/kanban/hooks/useKanbanLogic.tsx      ← drag-start/drag-end + colunas + optimistic update
my-app/features/dashboard/category-views/kanban/hooks/useRelationLookups.ts   ← resolução de campos relação
my-app/pages/crm/pipeline.tsx                                                 ← ⚠️ ANTI-EXEMPLO (board estático) — NÃO copie; veja o que falta
```

## ⭐ Exemplo de referência canônico (espelhe este arquivo)

`my-app/features/dashboard/category-views/kanban/InternalKanbanView.tsx` — exemplo perfeito de board Kanban: `DndContext` + `PointerSensor` + `DragOverlay`, colunas via `useKanbanLogic`, criação por `FloatingActionButton`, filtros por `KanbanFilterBar`, clique → `KanbanCardDetailModal`, container `flex h-full … flex-col`. Leia-o (e `useKanbanLogic.tsx` para o `handleDragEnd`) ANTES de gerar. **NUNCA** espelhe o antigo `pages/crm/pipeline.tsx` estático — é o anti-exemplo que esta skill substitui.

**Golden ref de stage-relation com efeitos colaterais (verificada, em produção):** `my-app/features/crm/components/CrmPipelineBoard.tsx` + `my-app/features/crm/hooks/useCrmPipelineBoard.ts` — reusa os primitivos dnd-kit com colunas por `leadStages` filtradas pelo pipeline ativo, `handleDragEnd` que resolve o stage destino por **id da coluna OU stage do card sob o cursor** (`closestCenter` retorna id de card quando a coluna tem itens), chama a transição atômica `CrmService.advanceStage` (optimistic + rollback) e abre `ProposalCaptureModal` quando a etapa exige input. Use-a como modelo quando a transição tem efeitos colaterais (par com `backend-workflow-transition-generator`) e o detalhe é um modal rico (`Lead360Modal` via `frontend-modal-generator`).

## Generation contract

1. **Reuse os primitivos canônicos** — `DndContext`/sensores/`DragOverlay` (padrão `InternalKanbanView`), `KanbanColumn`, `KanbanCardDetailModal`, container full-height. **NUNCA** construa um board estático com `flex gap-x overflow-x-auto` + cards sem drag.
2. **Colunas:**
   - `status-enum`: colunas = opções do campo `select` (padrão `useKanbanLogic.columns`).
   - `stage-relation`: colunas = etapas da tabela-pai **filtradas pelo registro-pai ativo** (ex.: stages DO pipeline selecionado), ordenadas por `order`. Defaulte para o pai com mais filhos + seletor quando houver >1 (preserve a lógica correta que já existe em `pipeline.tsx`).
3. **Drag-end (a transição):**
   - **Sem efeitos colaterais:** update otimista + `DynamicTableService.updateRecord(tableId, id, { data: { [stageField]: target } })` + `refetch()` + rollback no catch (padrão `useKanbanLogic.handleDragEnd`).
   - **Com efeitos colaterais (workflow):** chamar o **endpoint de transição** gerado por `backend-workflow-transition-generator` (ex.: `advanceStage`) — que faz transição + efeitos atomicamente. Abrir um **modal de captura** quando a etapa de destino exige input extra (ex.: `amount`/`winProbability` numa etapa de proposta).
4. **Clique no card → MODAL** (padrão `KanbanCardDetailModal`, estado local). **Nunca** `router.push` para uma página de detalhe.
5. **Criar** → `FloatingActionButton`; **filtros** → `KanbanFilterBar` (ou `GenericFilterBar`).
6. **Container full-height** + design system (`neutral`, cards `rounded-2xl`). Resolver tabelas por `internalName`; paginar (fetch-all) ao ler.

## Checklist obrigatório — Kanban Workflow

- [ ] Reusa `InternalKanbanView`/`KanbanColumn`/`KanbanCardDetailModal` + `@dnd-kit` — **zero** board estático bespoke
- [ ] Drag-drop funcional (`DndContext` + `DragOverlay` + optimistic update + rollback)
- [ ] Drag-end: `updateRecord` (simples) OU endpoint de transição (com efeitos colaterais) — nunca escrita parcial não-atômica no caso de efeitos
- [ ] Colunas filtradas pelo **pai ativo** (stage-relation) ou pelas opções do enum (status-enum); validar com **>1 pai**
- [ ] Clique no card abre **modal**, não troca de rota
- [ ] Criar via `FloatingActionButton`; filtros via filter bar
- [ ] Container `flex h-full … flex-col`; `neutral`/`rounded-2xl`; resolve por `internalName`; pagina ao ler

## Files usually created or changed

```
my-app/features/<module>/<Name>Board.tsx                 ← NEW (reusa primitivos do Kanban)
my-app/features/<module>/hooks/use<Name>Board.ts         ← NEW (colunas + drag-end → transição)
my-app/pages/<module>/index.tsx ou registro no dashboard  ← EDIT
```

## Required checks

```bash
cd my-app && npx tsc --noEmit
```
Verificação visual (contrato §6): build de produção, arrastar um card persiste a etapa, clique abre modal. Validar com **>1 pipeline/pai** e **>50 registros**.

## Anti-patterns

- **Não reimplemente um board estático** (`flex gap-4 overflow-x-auto` + cards sem drag) — foi o erro de `pages/crm/pipeline.tsx`. Reuse `InternalKanbanView`.
- **Não troque de rota no clique do card** — abra `KanbanCardDetailModal`.
- **Não renderize todas as etapas de todos os pais** — filtre pelo pai ativo (senão colunas duplicadas/vazias).
- **Não faça `updateRecord` simples quando a transição tem efeitos colaterais** — use o endpoint de transição atômico (`backend-workflow-transition-generator`).
- **Não fixe `max-w-*`** no board — herde o container full-height.
