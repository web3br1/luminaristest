'use client';

import React, { useState, useEffect } from 'react';
import type { IDynamicTable } from '../../components/shared/dynamic-tables.client';
import { useKanbanData } from './hooks/useKanbanData';
import InternalKanbanView from './InternalKanbanView';

interface KanbanViewProps {
  tables: IDynamicTable[];
}

export default function KanbanView({ tables }: KanbanViewProps) {
  const { kanbanTables, tasks, isLoading, error: kanbanError, refetch, schemaByTableId } = useKanbanData(tables);
  const error = kanbanError ? new Error(kanbanError) : null;
  const [activeTabId, setActiveTabId] = useState<string>('');

  useEffect(() => {
    if (kanbanTables.length > 0 && !activeTabId) {
      setActiveTabId(kanbanTables[0].id);
    }
  }, [kanbanTables, activeTabId]);

  return (
    <InternalKanbanView
      tables={kanbanTables}
      tasks={tasks}
      activeTabId={activeTabId}
      setActiveTabId={setActiveTabId}
      schemaByTableId={schemaByTableId}
      isLoading={isLoading}
      error={error}
      refetch={refetch}
    />
  );
}
