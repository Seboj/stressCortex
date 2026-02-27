import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { useTestStore } from '../store/useTestStore';

export function LatencyChart() {
  const latencyHistory = useTestStore((s) => s.latencyHistory);

  return (
    <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
      <h3 className="text-sm font-medium text-gray-400 mb-3">Latency (ms)</h3>
      {latencyHistory.length === 0 ? (
        <div className="flex items-center justify-center h-[280px] text-gray-600 text-sm">
          Waiting for data...
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={latencyHistory}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis dataKey="time" stroke="#6B7280" tick={false} />
            <YAxis
              unit="ms"
              stroke="#6B7280"
              tick={{ fill: '#9CA3AF', fontSize: 11 }}
            />
            <Tooltip
              contentStyle={{
                background: '#1F2937',
                border: '1px solid #374151',
                borderRadius: '4px',
              }}
              labelFormatter={(label) => `Update #${String(label)}`}
            />
            <Legend />
            <Line
              type="monotone"
              dataKey="p50"
              stroke="#3B82F6"
              name="p50"
              dot={false}
              strokeWidth={2}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="p95"
              stroke="#F59E0B"
              name="p95"
              dot={false}
              strokeWidth={2}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="p99"
              stroke="#EF4444"
              name="p99"
              dot={false}
              strokeWidth={2}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
