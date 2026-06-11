/**
 * Chart Constants
 *
 * Centralized constants for chart rendering (colors, margins, tooltips).
 */

import React from 'react';

export const CHART_COLORS = {
  primary: [
    '#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#ef4444',
    '#6366f1', '#14b8a6', '#f97316', '#84cc16', '#06b6d4', '#a855f7',
  ],
  soft: [
    '#93c5fd', '#c4b5fd', '#f9a8d4', '#fcd34d', '#6ee7b7', '#fca5a5',
    '#a5b4fc', '#5eead4', '#fdba74', '#bef264', '#67e8f9', '#d8b4fe',
  ],
  negative: '#ef4444', // Vermelho para valores negativos
  positive: '#10b981', // Verde para valores positivos
  neutral: '#6b7280',  // Cinza para valores neutros
  gradient: {
    start: '#3b82f6',
    end: '#10b981',
  },
} as const;

export const CHART_MARGINS = { top: 10, right: 20, left: 0, bottom: 24 } as const;

/**
 * Get standard Recharts tooltip styles based on current theme
 */
export function getTooltipStyles(isDark: boolean): React.CSSProperties {
  if (isDark) {
    // Dark mode: light background with dark text for contrast
    return {
      backgroundColor: 'rgba(249, 250, 251, 0.98)', // gray-50
      border: '1px solid rgba(229, 231, 235, 0.5)', // gray-200 border
      borderRadius: '8px',
      color: '#111827', // gray-900
      padding: '8px 12px',
      boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.3), 0 2px 4px -1px rgba(0, 0, 0, 0.2)',
    };
  } else {
    // Light mode: dark background with light text
    return {
      backgroundColor: 'rgba(17, 24, 39, 0.95)', // gray-900
      border: 'none',
      borderRadius: '8px',
      color: '#f3f4f6', // gray-100
      padding: '8px 12px',
      boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
    };
  }
}
