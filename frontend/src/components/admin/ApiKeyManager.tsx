import { useState } from 'react';
import * as adminApi from '../../api/admin';
import type { ApiKeyData } from '../../types';

interface Props {
  apiKeys: ApiKeyData[];
  onRefresh: () => void;
}

export default function ApiKeyManager({ apiKeys, onRefresh }: Props) {
  const [newKeyName, setNewKeyName] = useState('');
  const [createdKey, setCreatedKey] = useState<string | null>(null);

  const handleCreate = async () => {
    if (!newKeyName.trim()) return;
    try {
      const key = await adminApi.createApiKey(newKeyName);
      setCreatedKey(key.fullKey || null);
      setNewKeyName('');
      onRefresh();
    } catch (err) {
      console.error('Failed to create API key:', err);
    }
  };

  const handleRevoke = async (id: string) => {
    try {
      await adminApi.revokeApiKey(id);
      onRefresh();
    } catch (err) {
      console.error('Failed to revoke API key:', err);
    }
  };

  return (
    <div>
      {/* Create Key */}
      <div className="flex gap-2 mb-4">
        <input
          type="text"
          value={newKeyName}
          onChange={(e) => setNewKeyName(e.target.value)}
          placeholder="Key name"
          className="flex-1 bg-gray-700 text-white rounded px-3 py-2 border border-gray-600 focus:outline-none focus:border-blue-500 text-sm"
        />
        <button
          onClick={handleCreate}
          className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded text-sm font-medium"
        >
          Create Key
        </button>
      </div>

      {createdKey && (
        <div className="bg-green-500/20 border border-green-500 text-green-300 px-4 py-3 rounded mb-4 text-sm">
          <p className="font-medium mb-1">New API Key (copy now - won't be shown again):</p>
          <code className="bg-gray-800 px-2 py-1 rounded block mt-1 break-all">{createdKey}</code>
          <button
            onClick={() => setCreatedKey(null)}
            className="text-xs mt-2 text-green-400 hover:text-green-300"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Key List */}
      <div className="space-y-2">
        {apiKeys.map((key) => (
          <div
            key={key.id}
            className="flex items-center justify-between bg-gray-700/50 rounded px-4 py-3"
          >
            <div>
              <span className="font-medium text-sm">{key.name}</span>
              <span className="text-gray-400 text-xs ml-3">{key.keyPrefix}...</span>
              <span className="text-gray-500 text-xs ml-3">
                Created: {new Date(key.createdAt).toLocaleDateString()}
              </span>
            </div>
            <button
              onClick={() => handleRevoke(key.id)}
              className="text-red-400 hover:text-red-300 text-sm"
            >
              Revoke
            </button>
          </div>
        ))}
        {apiKeys.length === 0 && (
          <p className="text-gray-500 text-sm">No API keys yet</p>
        )}
      </div>
    </div>
  );
}
