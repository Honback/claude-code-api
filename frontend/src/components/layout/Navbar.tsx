import { useNavigate } from 'react-router-dom';
import { useChatStore } from '../../store/chatStore';

export default function Navbar() {
  const { selectedModel, setSelectedModel } = useChatStore();
  const navigate = useNavigate();

  return (
    <nav className="flex items-center justify-between px-6 py-3 bg-gray-800 border-b border-gray-700">
      <div className="flex items-center gap-4">
        <h1 className="text-lg font-semibold">Claude Code Platform</h1>
        <select
          value={selectedModel}
          onChange={(e) => setSelectedModel(e.target.value)}
          className="bg-gray-700 text-sm rounded px-3 py-1.5 border border-gray-600 focus:outline-none focus:border-blue-500"
        >
          <option value="claude-haiku-4-5-20251001">Claude Haiku 4.5</option>
          <option value="claude-sonnet-4-20250514">Claude Sonnet 4</option>
          <option value="claude-opus-4-6">Claude Opus 4.6</option>
        </select>
      </div>
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate('/settings')}
          className="text-sm text-gray-300 hover:text-white"
        >
          Settings
        </button>
        <button
          onClick={() => navigate('/admin')}
          className="text-sm text-gray-300 hover:text-white"
        >
          Admin
        </button>
      </div>
    </nav>
  );
}
