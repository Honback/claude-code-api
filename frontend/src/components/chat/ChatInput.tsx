import { useState, useRef, useEffect } from 'react';

interface Props {
  onSend: (message: string) => void;
  disabled: boolean;
  isStreaming?: boolean;
  onStop?: () => void;
}

export default function ChatInput({ onSend, disabled, isStreaming, onStop }: Props) {
  const [input, setInput] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 200) + 'px';
    }
  }, [input]);

  const handleSubmit = () => {
    const trimmed = input.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="border-t border-gray-700 px-4 py-4 bg-gray-800">
      <div className="max-w-3xl mx-auto flex gap-3">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Send a message... (Shift+Enter for new line)"
          rows={1}
          className="flex-1 bg-gray-700 text-white rounded-lg px-4 py-3 border border-gray-600 focus:outline-none focus:border-blue-500 resize-none"
          disabled={disabled}
          data-testid="chat-input"
        />
        {isStreaming ? (
          <button
            onClick={onStop}
            className="bg-red-600 hover:bg-red-700 text-white px-6 rounded-lg font-medium transition-colors self-end"
            data-testid="stop-button"
          >
            Stop
          </button>
        ) : (
          <button
            onClick={handleSubmit}
            disabled={disabled || !input.trim()}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-6 rounded-lg font-medium transition-colors self-end"
            data-testid="send-button"
          >
            Send
          </button>
        )}
      </div>
    </div>
  );
}
