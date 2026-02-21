import { useEffect, useRef, useState } from 'react';
import { useMatch, Link } from 'react-router-dom';
import { useChat } from '../../hooks/useChat';
import { getAuthStatus } from '../../api/settings';
import MessageBubble from './MessageBubble';
import StreamingMessage from './StreamingMessage';
import ChatInput from './ChatInput';

export default function ChatWindow() {
  const match = useMatch('/chat/:id');
  const id = match?.params?.id;
  const { messages, isStreaming, streamingContent, sendMessage, stopStreaming, loadConversation, newConversation } = useChat();
  const bottomRef = useRef<HTMLDivElement>(null);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const prevIdRef = useRef<string | undefined>();

  useEffect(() => {
    if (id && id !== prevIdRef.current) {
      loadConversation(id);
    } else if (!id && prevIdRef.current) {
      newConversation();
    }
    prevIdRef.current = id;
  }, [id, loadConversation, newConversation]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingContent]);

  useEffect(() => {
    getAuthStatus()
      .then((status) => setIsAuthenticated(status.logged_in))
      .catch(() => setIsAuthenticated(false));
  }, []);

  return (
    <div className="flex flex-col h-full">
      {isAuthenticated === false && (
        <div className="bg-amber-900/50 border-b border-amber-700 px-4 py-3 text-amber-200 text-sm flex items-center justify-between">
          <span>
            인증이 설정되지 않았습니다. 채팅을 사용하려면 먼저 인증을 설정하세요.
          </span>
          <Link
            to="/settings"
            className="ml-4 px-3 py-1 bg-amber-700 hover:bg-amber-600 rounded text-white text-xs whitespace-nowrap"
          >
            Settings에서 설정
          </Link>
        </div>
      )}
      <div className="flex-1 overflow-y-auto px-4 py-6">
        {messages.length === 0 && !isStreaming && (
          <div className="flex items-center justify-center h-full text-gray-500">
            <div className="text-center">
              <h3 className="text-xl mb-2">Claude Code Platform</h3>
              <p className="text-sm">Send a message to start a conversation</p>
              {isAuthenticated === false && (
                <p className="text-xs text-amber-400 mt-2">
                  Settings에서 OAuth 로그인 또는 API 키를 먼저 설정하세요
                </p>
              )}
            </div>
          </div>
        )}
        <div className="max-w-3xl mx-auto space-y-4" data-testid="message-list">
          {messages.map((msg) => (
            <MessageBubble key={msg.id} message={msg} />
          ))}
          {isStreaming && !streamingContent && (
            <div className="flex justify-start">
              <div className="max-w-[80%] rounded-lg px-4 py-3 bg-gray-700 text-gray-400 flex items-center gap-2">
                <div className="flex gap-1">
                  <span className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
                <span className="text-sm">응답을 생성하고 있습니다...</span>
              </div>
            </div>
          )}
          {isStreaming && streamingContent && (
            <StreamingMessage content={streamingContent} />
          )}
          <div ref={bottomRef} />
        </div>
      </div>
      <ChatInput onSend={sendMessage} disabled={isStreaming} isStreaming={isStreaming} onStop={stopStreaming} />
    </div>
  );
}
