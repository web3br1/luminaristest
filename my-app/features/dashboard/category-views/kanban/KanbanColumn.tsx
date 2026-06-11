import React from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Task } from '../../../../types/Task.types';
import { IDynamicTable, ITableSchema, isTableSchema } from '../../components/shared/dynamic-tables.client';
import SortableTaskItem from './SortableTaskItem';
import { RelationLookups } from './hooks/useRelationLookups';

interface KanbanColumnProps {
  id: string;
  title: string;
  tasks: Task[];
  table: IDynamicTable;
  onSuccess: () => void;
  onTaskClick: (task: Task) => void;
  relationLookups?: RelationLookups;
}

function KanbanColumn({ id, title, tasks, table, onSuccess, onTaskClick, relationLookups }: KanbanColumnProps) {
  const { setNodeRef } = useDroppable({
    id,
  });

  const validSchema = table && isTableSchema(table.schema) ? table.schema : null;

  return (
    <SortableContext id={id} items={tasks.map(t => t.id)} strategy={verticalListSortingStrategy}>
      <div
        ref={setNodeRef}
        className="bg-gray-50/50 dark:bg-neutral-800/30 border border-transparent dark:border-neutral-800 rounded-2xl p-4 flex flex-col h-full"
      >
        <div className="flex justify-between items-center mb-4 px-1 border-b border-gray-100 dark:border-neutral-800/60 pb-3">
          <h2 className="text-sm font-bold text-gray-800 dark:text-gray-200 uppercase tracking-wide">{title}</h2>
          <span className="text-xs font-bold bg-gray-200 dark:bg-neutral-700 text-gray-700 dark:text-gray-300 rounded-full px-2 py-0.5 min-w-[24px] text-center">
            {tasks.length}
          </span>
        </div>
        <div className="flex-grow flex flex-col gap-4 min-h-[500px] overflow-y-auto pb-2">
          {validSchema && tasks.map(task => (
            <SortableTaskItem
              key={task.id}
              id={task.id}
              task={task}
              tableId={table.id}
              tableSchema={validSchema}
              onSuccess={onSuccess}
              onTaskClick={onTaskClick}
              relationLookups={relationLookups}
            />
          ))}
        </div>
      </div>
    </SortableContext>
  );
}

export default KanbanColumn;
