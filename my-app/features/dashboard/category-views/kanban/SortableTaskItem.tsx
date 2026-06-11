import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import KanbanTaskCard from './KanbanTaskCard';
import { Task } from '../../../../types/Task.types';
import { ITableSchema } from '../../components/shared/dynamic-tables.client';
import { RelationLookups } from './hooks/useRelationLookups';

interface SortableTaskItemProps {
  id: string;
  task: Task;
  tableId: string;
  tableSchema: ITableSchema;
  onSuccess: () => void;
  onTaskClick: (task: Task) => void;
  relationLookups?: RelationLookups;
}

function SortableTaskItem({ id, task, tableId, tableSchema, onSuccess, onTaskClick, relationLookups }: SortableTaskItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    opacity: isDragging ? 0 : 1,
    transition
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <KanbanTaskCard
        task={task}
        tableId={tableId}
        tableSchema={tableSchema}
        onSuccess={onSuccess}
        onClick={() => onTaskClick(task)}
        relationLookups={relationLookups}
      />
    </div>
  );
}

export default SortableTaskItem;
