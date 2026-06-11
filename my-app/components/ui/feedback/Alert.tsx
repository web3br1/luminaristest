import React from 'react';

interface AlertProps {
  type: 'error' | 'success' | 'info' | 'warning';
  message: string;
  onRetry?: () => void;
}

function Alert({ type, message, onRetry }: AlertProps) {
  const bgColors = {
    error: 'bg-red-50 border-red-200',
    success: 'bg-green-50 border-green-200',
    info: 'bg-blue-50 border-blue-200',
    warning: 'bg-yellow-50 border-yellow-200',
  };

  const textColors = {
    error: 'text-red-800',
    success: 'text-green-800',
    info: 'text-blue-800',
    warning: 'text-yellow-800',
  };

  return (
    <div className={`p-4 mb-4 border rounded-md ${bgColors[type]} ${textColors[type]}`}>
      <div className="flex items-center">
        <span className="mr-2">
          {type === 'error' && '❌'}
          {type === 'success' && '✅'}
          {type === 'info' && 'ℹ️'}
          {type === 'warning' && '⚠️'}
        </span>
        <span>{message}</span>
        {onRetry && (
          <button
            onClick={onRetry}
            className="ml-auto px-3 py-1 text-sm bg-white rounded hover:bg-gray-100"
          >
            Tentar novamente
          </button>
        )}
      </div>
    </div>
  );
}

export default React.memo(Alert);
