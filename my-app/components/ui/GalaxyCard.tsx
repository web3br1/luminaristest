import React from 'react';

interface GalaxyCardProps {
  children: React.ReactNode;
  className?: string;
  maxWidth?: string;
}

export function GalaxyCard({ children, className = '', maxWidth = 'max-w-md' }: GalaxyCardProps) {
  return (
    <div className={`w-full ${maxWidth} space-y-6 bg-white/10 backdrop-blur-md border border-white/20 p-8 rounded-2xl shadow-2xl ${className}`}>
      {children}
    </div>
  );
}
