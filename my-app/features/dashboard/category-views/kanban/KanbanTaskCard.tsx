'use client';

import React from 'react';
import type { Task } from '../../../../types/Task.types';
import { ITableSchema } from '../../components/shared/dynamic-tables.client';
import EditRecordButton from '../../components/shared/EditRecordButton';
import { RelationLookups } from './hooks/useRelationLookups';
import { MdOutlinePerson } from 'react-icons/md';

interface KanbanTaskCardProps {
  task: Task;
  tableId: string;
  tableSchema: ITableSchema;
  onSuccess: () => void;
  isOverlay?: boolean;
  onClick?: () => void;
  relationLookups?: RelationLookups;
}

const priorityColors: Record<string, string> = {
  'Low': 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 ring-1 ring-blue-500/20',
  'Medium': 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 ring-1 ring-amber-500/20',
  'High': 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300 ring-1 ring-red-500/20',
  'Urgent': 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300 ring-1 ring-purple-500/20',
};

function KanbanTaskCard({ task, tableId, tableSchema, onSuccess, isOverlay, onClick, relationLookups }: KanbanTaskCardProps) {
  const priorityColor = task.priority ? priorityColors[task.priority] : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && onClick) { e.preventDefault(); onClick(); } }}
      aria-label={task.name}
      className={`relative bg-white dark:bg-neutral-800 rounded-xl p-4 shadow-sm border border-gray-200 dark:border-neutral-700/60 cursor-pointer hover:shadow-md hover:border-blue-500/30 dark:hover:border-blue-500/30 transition-all duration-200 ${isOverlay ? 'shadow-2xl ring-2 ring-blue-500 rotate-2 scale-105' : ''}`}
    >
      <div className="absolute top-2 right-2 z-10">
        <EditRecordButton
          tableId={tableId}
          tableSchema={tableSchema}
          record={{
            id: task.id,
            data: task as any,
          } as any}
          onSuccess={onSuccess}
        />
      </div>
      <div className="flex justify-between items-start">
        <h3 className="font-semibold text-gray-800 dark:text-gray-100">{task.name}</h3>
      </div>
      {task.priority && (
        <div className="flex items-center mt-2">
          <span className={`px-2 py-1 text-xs font-medium rounded-full ${priorityColor}`}>
            {task.priority}
          </span>
        </div>
      )}

      {/* Relation Badges (e.g. Assignee) */}
      {relationLookups && (
        <div className="flex flex-wrap gap-2 mt-3">
          {Object.entries(relationLookups).map(([fieldName, map]) => {
            const value = (task as any)[fieldName];
            if (!value) return null;

            const displayValue = map.get(String(value));
            if (!displayValue) return null;

            const isAssignee = fieldName.toLowerCase().includes('assignee');

            return (
              <div
                key={fieldName}
                className={`flex items-center gap-1.5 px-2 py-1 rounded bg-gray-50 dark:bg-neutral-900 border border-gray-100 dark:border-neutral-700/50 text-[10px] font-bold uppercase tracking-tight ${isAssignee ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500 dark:text-gray-400'}`}
              >
                {isAssignee && <MdOutlinePerson size={14} className="opacity-70" />}
                <span className="max-w-[120px] truncate">{displayValue}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default KanbanTaskCard;
