import React from 'react';

interface CreatingAnimationProps {
  message?: string;
}

export default function CreatingAnimation({ message }: CreatingAnimationProps) {
  return (
    <div className="flex flex-col items-center justify-center text-center p-8 bg-white dark:bg-neutral-800 rounded-lg shadow-xl">
      <div className="relative flex items-center justify-center w-24 h-24 mb-6">
        <div className="absolute w-full h-full bg-blue-500 rounded-full animate-ping opacity-75"></div>
        <div className="relative w-20 h-20 bg-blue-600 rounded-full flex items-center justify-center">
          <svg className="w-12 h-12 text-white animate-spin-slow" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
        </div>
      </div>
      <h3 className="text-2xl font-bold text-gray-800 dark:text-white mb-2">
        {message || 'Um momento...'}
      </h3>
      <p className="text-gray-600 dark:text-gray-400">
        Estou configurando tudo para você. Isso pode levar alguns segundos.
      </p>
    </div>
  );
}
