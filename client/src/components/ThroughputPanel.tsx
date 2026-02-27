import { useTestStore } from '../store/useTestStore';

export function ThroughputPanel() {
  const throughput = useTestStore((s) => s.throughput);

  const reqPerSec =
    throughput !== null ? throughput.requestsPerSecond.toFixed(2) : '—';
  const tokPerSec =
    throughput !== null ? throughput.tokensPerSecond.toFixed(0) : '—';

  return (
    <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
      <h3 className="text-sm font-medium text-gray-400 mb-3">Throughput</h3>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col">
          <span className="text-2xl font-mono font-bold text-blue-400">{reqPerSec}</span>
          <span className="text-xs text-gray-500 mt-1">Requests/sec</span>
        </div>
        <div className="flex flex-col">
          <span className="text-2xl font-mono font-bold text-blue-400">{tokPerSec}</span>
          <span className="text-xs text-gray-500 mt-1">Tokens/sec</span>
        </div>
      </div>
    </div>
  );
}
