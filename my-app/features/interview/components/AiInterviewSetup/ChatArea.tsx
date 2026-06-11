import React from 'react';
import ReactMarkdown from 'react-markdown';
import { IMessage } from '../../types/InterviewTypes';

interface ChatAreaProps {
  messages: IMessage[];
  isLoading: boolean;
  chatEndRef: React.RefObject<HTMLDivElement | null>;
}

function ChatArea({ messages, isLoading, chatEndRef }: ChatAreaProps) {
  return (
    <div className="flex-grow overflow-y-auto p-4 space-y-4">
      {messages.map((msg, index) => (
        <div key={index} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
          <div className={`max-w-lg px-4 py-2 rounded-2xl ${msg.sender === 'user' ? 'bg-blue-500 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white'}`}>
            {msg.sender === 'ai' ? (
              <div className="markdown-content">
                <ReactMarkdown>{msg.text}</ReactMarkdown>
              </div>
            ) : (
              msg.text
            )}
          </div>
        </div>
      ))}
      {isLoading && (
        <div className="flex justify-start">
          <div className="max-w-lg px-4 py-2 rounded-2xl bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white">
            <span className="animate-pulse">...</span>
          </div>
        </div>
      )}
      <div ref={chatEndRef} />
    </div>
  );
}

export default ChatArea;
