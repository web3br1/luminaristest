import React, { createContext, useContext, useState, ReactNode } from 'react';

/**
 * CrmContext — module-scoped selection state for the CRM screens
 * (selected unit / pipeline / lead). Isolated from the legacy LeadsView,
 * which keeps all state inside its own `useLeadsView` hook.
 */
interface CrmContextValue {
  selectedUnitId: string | null;
  setSelectedUnitId: (id: string | null) => void;
  selectedPipelineId: string | null;
  setSelectedPipelineId: (id: string | null) => void;
  selectedLeadId: string | null;
  setSelectedLeadId: (id: string | null) => void;
}

const CrmContext = createContext<CrmContextValue | undefined>(undefined);

export function CrmProvider({ children }: { children: ReactNode }) {
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);
  const [selectedPipelineId, setSelectedPipelineId] = useState<string | null>(null);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);

  return (
    <CrmContext.Provider
      value={{
        selectedUnitId,
        setSelectedUnitId,
        selectedPipelineId,
        setSelectedPipelineId,
        selectedLeadId,
        setSelectedLeadId,
      }}
    >
      {children}
    </CrmContext.Provider>
  );
}

export function useCrm(): CrmContextValue {
  const ctx = useContext(CrmContext);
  if (!ctx) {
    throw new Error('useCrm must be used within a CrmProvider');
  }
  return ctx;
}
