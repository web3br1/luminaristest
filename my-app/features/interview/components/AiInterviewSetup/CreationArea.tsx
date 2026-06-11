import React from 'react';
import CreatingAnimation from '../../setup/CreatingAnimation';

interface CreationAreaProps {
  isCreating: boolean;
  creationError: string | null;
  onRetry: () => void;
}

function CreationArea({ isCreating, creationError, onRetry }: CreationAreaProps) {
  if (!isCreating && !creationError) {
    return null;
  }

  return (
    <div className="fixed inset-0 bg-gray-800 bg-opacity-75 flex justify-center items-center z-50">
      <div className="bg-white dark:bg-neutral-800 p-8 rounded-lg shadow-xl max-w-lg w-full">
        {isCreating ? (
          <>
            <h2 className="text-2xl font-bold text-center mb-6 dark:text-white">
              Criando seu projeto
            </h2>
            <CreatingAnimation />
            <p className="text-center text-gray-600 dark:text-gray-300 mt-6">
              Aguarde enquanto configuramos seu projeto. Isso pode levar alguns instantes...
            </p>
          </>
        ) : (
          <>
            <h2 className="text-2xl font-bold text-center text-red-600 mb-6">
              Erro ao criar projeto
            </h2>
            <p className="text-center text-gray-800 dark:text-gray-200 mb-4">
              {creationError}
            </p>
            <div className="flex justify-center">
              <button
                onClick={onRetry}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Tentar novamente
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default CreationArea;
