import { useEffect, useState } from 'react';
import * as adminApi from '../../api/admin';
import type { UsageSummary, ApiKeyData, ModelUsage, RateLimitInfo } from '../../types';
import ApiKeyManager from './ApiKeyManager';
import UsageChart from './UsageChart';

export default function Dashboard() {
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [globalUsage, setGlobalUsage] = useState<UsageSummary | null>(null);
  const [apiKeys, setApiKeys] = useState<ApiKeyData[]>([]);
  const [modelUsage, setModelUsage] = useState<ModelUsage[]>([]);
  const [rateLimits, setRateLimits] = useState<RateLimitInfo | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const results = await Promise.allSettled([
      adminApi.getUsageSummary(),
      adminApi.getGlobalUsage(),
      adminApi.getApiKeys(),
      adminApi.getUsageByModel(),
      adminApi.getRateLimits(),
    ]);

    const value = <T,>(r: PromiseSettledResult<T>, fallback: T): T =>
      r.status === 'fulfilled' ? r.value : fallback;

    setUsage(value(results[0], null));
    setGlobalUsage(value(results[1], null));
    setApiKeys(value(results[2], []));
    setModelUsage(value(results[3], []));
    setRateLimits(value(results[4], { error: 'fetch_failed', message: 'Rate limit 정보를 가져올 수 없습니다.' }));

    results.forEach((r, i) => {
      if (r.status === 'rejected') {
        console.error(`Dashboard API call ${i} failed:`, r.reason);
      }
    });
  };

  return (
    <div className="p-6 overflow-y-auto h-full">
      <h2 className="text-2xl font-bold mb-6">Admin Dashboard</h2>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <StatCard
          title="Total Requests"
          value={globalUsage?.totalRequests ?? usage?.totalRequests ?? 0}
        />
        <StatCard
          title="Total Tokens"
          value={(globalUsage?.totalTokens ?? usage?.totalTokens ?? 0).toLocaleString()}
        />
        <StatCard
          title="Input Tokens"
          value={(usage?.totalInputTokens ?? 0).toLocaleString()}
        />
        <StatCard
          title="Avg Response Time"
          value={`${Math.round(usage?.avgResponseTimeMs ?? 0)}ms`}
        />
      </div>

      {/* Model Usage Chart */}
      <div className="bg-gray-800 rounded-lg p-4 mb-6">
        <h3 className="text-sm font-semibold mb-3 text-gray-300">Model Usage</h3>
        <UsageChart modelUsage={modelUsage} />
      </div>

      {/* Rate Limits */}
      <div className="bg-gray-800 rounded-lg p-4 mb-6">
        <h3 className="text-sm font-semibold mb-3 text-gray-300">Claude API Rate Limits</h3>
        <RateLimitsPanel rateLimits={rateLimits} />
      </div>

      {/* API Keys */}
      <div className="bg-gray-800 rounded-lg p-6">
        <h3 className="text-lg font-semibold mb-4">API Keys</h3>
        <ApiKeyManager apiKeys={apiKeys} onRefresh={loadData} />
      </div>
    </div>
  );
}

function StatCard({ title, value }: { title: string; value: string | number }) {
  return (
    <div className="bg-gray-800 rounded-lg p-4">
      <p className="text-sm text-gray-400 mb-1">{title}</p>
      <p className="text-2xl font-bold">{value}</p>
    </div>
  );
}

function RateLimitsPanel({ rateLimits }: { rateLimits: RateLimitInfo | null }) {
  if (!rateLimits) {
    return <p className="text-gray-500 text-sm">Loading rate limits...</p>;
  }

  if (rateLimits.error) {
    return (
      <p className="text-gray-400 text-sm">
        {rateLimits.message || 'Rate limit 정보를 가져올 수 없습니다.'}
      </p>
    );
  }

  const entries = [
    { label: 'Requests/min', data: rateLimits.requests },
    { label: 'Input tokens', data: rateLimits.input_tokens },
    { label: 'Output tokens', data: rateLimits.output_tokens },
  ];

  return (
    <div className="space-y-3">
      {rateLimits.tier && (
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs text-gray-400">Tier:</span>
          <span className="text-sm font-semibold text-blue-400">{rateLimits.tier}</span>
        </div>
      )}
      {entries.map(({ label, data }) => {
        if (!data) return null;
        const used = data.limit - (data.remaining ?? data.limit);
        const pct = data.limit > 0 ? (used / data.limit) * 100 : 0;
        const color = pct > 80 ? 'bg-red-500' : pct > 50 ? 'bg-yellow-500' : 'bg-green-500';

        return (
          <div key={label}>
            <div className="flex justify-between text-xs text-gray-400 mb-1">
              <span>{label}</span>
              <span>
                {formatNumber(data.remaining ?? 0)} / {formatNumber(data.limit)}
              </span>
            </div>
            <div className="w-full bg-gray-700 rounded-full h-2">
              <div
                className={`${color} h-2 rounded-full transition-all`}
                style={{ width: `${Math.min(pct, 100)}%` }}
              />
            </div>
          </div>
        );
      })}
      {rateLimits.cached_at && (
        <p className="text-xs text-gray-500 mt-2">
          Updated: {new Date(rateLimits.cached_at).toLocaleTimeString()}
        </p>
      )}
    </div>
  );
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}
