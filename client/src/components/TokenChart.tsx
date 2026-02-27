import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { useTestStore } from '../store/useTestStore';

export function TokenChart() {
  const tokenHistory = useTestStore((s) => s.tokenHistory);

  return (
    <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
      <h3 className="text-sm font-medium text-gray-400 mb-3">Token Usage</h3>
      {tokenHistory.length === 0 ? (
        <div className="flex items-center justify-center h-[240px] text-gray-600 text-sm">
          Waiting for data...
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart data={tokenHistory}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis dataKey="time" stroke="#6B7280" tick={false} />
            <YAxis stroke="#6B7280" tick={{ fill: '#9CA3AF', fontSize: 11 }} />
            <Tooltip
              contentStyle={{
                background: '#1F2937',
                border: '1px solid #374151',
                borderRadius: '4px',
              }}
              labelFormatter={(label) => `Update #${String(label)}`}
            />
            <Legend />
            <Area
              type="monotone"
              dataKey="promptTokens"
              stackId="tokens"
              stroke="#3B82F6"
              fill="#1D4ED8"
              fillOpacity={0.6}
              name="Prompt Tokens"
              isAnimationActive={false}
            />
            <Area
              type="monotone"
              dataKey="completionTokens"
              stackId="tokens"
              stroke="#10B981"
              fill="#065F46"
              fillOpacity={0.6}
              name="Completion Tokens"
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
