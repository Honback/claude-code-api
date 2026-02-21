import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import type { ModelUsage } from '../../types';

interface Props {
  modelUsage: ModelUsage[];
}

const MODEL_COLORS: Record<string, string> = {
  input: '#60A5FA',
  output: '#F59E0B',
};

function shortModelName(model: string): string {
  if (model.includes('haiku')) return 'Haiku';
  if (model.includes('sonnet')) return 'Sonnet';
  if (model.includes('opus')) return 'Opus';
  // Fallback: take the part before the first dash-digit
  const parts = model.split('-');
  return parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
}

export default function UsageChart({ modelUsage }: Props) {
  if (!modelUsage || modelUsage.length === 0) {
    return <p className="text-gray-500 text-sm">No model usage data available.</p>;
  }

  const data = modelUsage.map((m) => ({
    name: shortModelName(m.model),
    inputTokens: m.inputTokens,
    outputTokens: m.outputTokens,
    requests: m.requestCount,
  }));

  return (
    <div className="h-40">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} barCategoryGap="20%">
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
          <XAxis dataKey="name" stroke="#9CA3AF" fontSize={12} />
          <YAxis stroke="#9CA3AF" fontSize={11} tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}K` : String(v)} />
          <Tooltip
            contentStyle={{
              backgroundColor: '#1F2937',
              border: '1px solid #374151',
              borderRadius: '8px',
              color: '#F3F4F6',
            }}
            formatter={(value: number) => value.toLocaleString()}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Bar dataKey="inputTokens" name="Input" fill={MODEL_COLORS.input} radius={[4, 4, 0, 0]} />
          <Bar dataKey="outputTokens" name="Output" fill={MODEL_COLORS.output} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
