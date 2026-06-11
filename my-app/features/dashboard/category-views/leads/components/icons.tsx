'use client';

import React from 'react';

export function MonoIcon(type: string, className?: string) {
  const cls = className || 'w-4 h-4';
  if (type === 'phone') return (<svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M2 5a2 2 0 012-2h2.28a1 1 0 01.95.68l1.2 3.6a1 1 0 01-.27 1.06L7.6 10.73a14.5 14.5 0 006.67 6.67l2.39-1.56a1 1 0 011.06-.27l3.6 1.2a1 1 0 01.68.95V20a2 2 0 01-2 2h-1C9.163 22 2 14.837 2 6V5z"/></svg>);
  if (type === 'email') return (<svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 7l9 6 9-6"/><rect x="3" y="5" width="18" height="14" rx="2"/></svg>);
  if (type === 'handshake') return (<svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 12l3 3a2 2 0 003-3l-4-4a3 3 0 00-4.24 0L7 10m5 2l-3 3a2 2 0 11-3-3l1-1"/></svg>);
  if (type === 'calendar') return (<svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="3" y="4" width="18" height="18" rx="2"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M16 2v4M8 2v4M3 10h18"/></svg>);
  if (type === 'chat') return (<svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M21 15a4 4 0 01-4 4H7l-4 3V7a4 4 0 014-4h10a4 4 0 014 4v8z"/></svg>);
  if (type === 'warning') return (<svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 9v4m0 4h.01"/><path strokeWidth={1.8} d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg>);
  // default: note
  return (<svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 20h9"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>);
}




