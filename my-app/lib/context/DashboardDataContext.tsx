'use client';

import React, { createContext, useContext, useState, ReactNode } from 'react';

interface ChartData {
  [key: string]: any;
}

interface DashboardDataContextType {
  chartData: ChartData[];
  setChartData: (data: ChartData[]) => void;
}

const DashboardDataContext = createContext<DashboardDataContextType | undefined>(
  undefined
);

export function DashboardDataProvider({ children }: { children: ReactNode }) {
  const [chartData, setChartData] = useState<ChartData[]>([]);

  const value = {
    chartData,
    setChartData,
  };

  return (
    <DashboardDataContext.Provider value={value}>
      {children}
    </DashboardDataContext.Provider>
  );
}

export function useDashboardData() {
  const context = useContext(DashboardDataContext);
  if (context === undefined) {
    throw new Error('useDashboardData must be used within a DashboardDataProvider');
  }
  return context;
}
