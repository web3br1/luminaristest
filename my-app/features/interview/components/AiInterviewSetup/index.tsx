import React from 'react';
import { useAiInterview } from '../../hooks/useAiInterview';
import ChatArea from './ChatArea';
import InputArea from './InputArea';
import CreationArea from './CreationArea';
import LeftSidebar from '../LeftSidebar';
import RightSidebar from '../RightSidebar';

const markdownStyles = `
  .markdown-content h1 {
    font-size: 1.5rem;
    font-weight: 600;
    margin-top: 1rem;
    margin-bottom: 0.5rem;
  }
  .markdown-content h2 {
    font-size: 1.25rem;
    font-weight: 600;
    margin-top: 1rem;
    margin-bottom: 0.5rem;
  }
  .markdown-content h3 {
    font-size: 1.125rem;
    font-weight: 600;
    margin-top: 0.75rem;
    margin-bottom: 0.5rem;
  }
  .markdown-content p {
    margin-bottom: 0.5rem;
  }
  .markdown-content ul, .markdown-content ol {
    padding-left: 1.5rem;
    margin-bottom: 0.5rem;
  }
  .markdown-content li {
    margin-bottom: 0.25rem;
  }
  .markdown-content strong {
    font-weight: 600;
  }
  .markdown-content blockquote {
    border-left: 3px solid #d1d5db;
    padding-left: 1rem;
    margin-left: 0;
    margin-right: 0;
    font-style: italic;
  }
`;

function AiInterviewSetup() {
  const {
    messages,
    userInput,
    setUserInput,
    isLoading,
    isCreating,
    creationError,
    customizationState,
    showCustomizationPanel,
    setShowCustomizationPanel,
    showRightPanel,
    setShowRightPanel,
    selectedTable,
    chatEndRef,
    inputRef,
    sessionId,
    handleSendMessage,
    handleSelectTable,
    handleUpdateTable,
    logState,
    handleRetry,
    presetKey
  } = useAiInterview();

  if (isCreating || creationError) {
    return (
      <CreationArea
        isCreating={isCreating}
        creationError={creationError}
        onRetry={handleRetry}
      />
    );
  }

  return (
    <div className="w-full relative">
      <style>{markdownStyles}</style>

      <LeftSidebar
        customizationState={customizationState}
        isVisible={showCustomizationPanel}
        onSelectTable={handleSelectTable}
        selectedTableName={selectedTable?.name}
      />

      <RightSidebar
        selectedTable={selectedTable}
        isVisible={showRightPanel}
        sessionId={sessionId}
        onUpdateTable={handleUpdateTable}
        presetKey={presetKey}
      />

      {customizationState && (
        <button
          onClick={() => setShowCustomizationPanel(!showCustomizationPanel)}
          className={`fixed top-1/2 -translate-y-1/2 z-50 bg-blue-600 hover:bg-blue-700 text-white p-3 rounded-full shadow-lg transition-all duration-300 ease-in-out focus:outline-none`}
          style={{ left: showCustomizationPanel ? '405px' : '20px' }}
          aria-label={showCustomizationPanel ? "Ocultar painel de funcionalidades" : "Mostrar painel de funcionalidades"}
        >
          {showCustomizationPanel ? (
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          )}
        </button>
      )}

      {customizationState && (
        <button
          onClick={() => setShowRightPanel(!showRightPanel)}
          className={`fixed top-1/2 -translate-y-1/2 z-50 bg-blue-600 hover:bg-blue-700 text-white p-3 rounded-full shadow-lg transition-all duration-300 ease-in-out focus:outline-none`}
          style={{ right: showRightPanel ? '505px' : '20px' }}
          aria-label={showRightPanel ? "Ocultar painel de customização" : "Mostrar painel de customização"}
        >
          {showRightPanel ? (
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19l7-7-7-7" />
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 5l-7 7 7 7" />
            </svg>
          )}
        </button>
      )}

      <div className="mx-auto w-full max-w-2xl bg-white dark:bg-neutral-800 shadow-lg rounded-xl p-6 border border-gray-200 dark:border-gray-700 flex flex-col h-[600px]">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white text-center flex-grow">Entrevista com IA</h2>
          <button
            onClick={logState}
            className="text-xs bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 px-2 py-1 rounded hover:bg-gray-300 dark:hover:bg-gray-600"
          >
            Debug
          </button>
        </div>
        <ChatArea
          messages={messages}
          isLoading={isLoading}
          chatEndRef={chatEndRef}
        />
        <InputArea
          userInput={userInput}
          setUserInput={setUserInput}
          handleSendMessage={handleSendMessage}
          isLoading={isLoading}
          isCreating={isCreating}
          inputRef={inputRef}
        />
      </div>
    </div>
  );
}

export default AiInterviewSetup;
