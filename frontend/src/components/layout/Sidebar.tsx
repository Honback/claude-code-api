import { useNavigate } from 'react-router-dom';
import { useChat } from '../../hooks/useChat';

function formatTokenCount(count: number): string {
  if (count >= 1000) {
    return (count / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
  }
  return String(count);
}

export default function Sidebar() {
  const { conversations, currentConversationId, newConversation, deleteConversation } = useChat();
  const navigate = useNavigate();

  const handleSelect = (id: string) => {
    navigate(`/chat/${id}`);
  };

  const handleNew = () => {
    newConversation();
    navigate('/chat');
  };

  return (
    <aside className="w-64 bg-gray-800 border-r border-gray-700 flex flex-col">
      <div className="p-4">
        <button
          onClick={handleNew}
          className="w-full py-2 px-4 bg-blue-600 hover:bg-blue-700 rounded text-sm font-medium transition-colors"
        >
          + New Chat
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-2">
        {conversations.map((conv) => (
          <div
            key={conv.id}
            className={`group flex items-center justify-between px-3 py-2 rounded cursor-pointer mb-1 text-sm ${
              currentConversationId === conv.id
                ? 'bg-gray-700 text-white'
                : 'text-gray-300 hover:bg-gray-700/50'
            }`}
            onClick={() => handleSelect(conv.id)}
          >
            <span className="truncate flex-1 flex items-center gap-1.5">
              {conv.hasSummary && (
                <span className="inline-block w-2 h-2 rounded-full bg-green-400 flex-shrink-0" title="Context summarized" />
              )}
              {conv.title}
            </span>
            {conv.totalTokens != null && conv.totalTokens > 0 && (
              <span className="text-xs text-gray-500 flex-shrink-0" title={`${conv.totalTokens.toLocaleString()} tokens`}>
                {formatTokenCount(conv.totalTokens)}
              </span>
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                deleteConversation(conv.id);
              }}
              className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-400 ml-2"
            >
              x
            </button>
          </div>
        ))}
      </div>
    </aside>
  );
}
