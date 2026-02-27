import { useTestStore } from '../store/useTestStore';

interface LatencyPercentiles {
  p50: number;
  p95: number;
  p99: number;
}

interface ThroughputMetrics {
  requestsPerSecond: number;
  tokensPerSecond: number;
  totalRequests: number;
  totalTokens: number;
  durationMs: number;
}

interface TestSummary {
  latencyPercentiles: LatencyPercentiles;
  throughput: ThroughputMetrics;
  totalErrors: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  durationMs: number;
  conversationsTotal: number;
  conversationsCompleted: number;
  conversationsErrored: number;
}

function isTestSummary(value: unknown): value is TestSummary {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v['durationMs'] === 'number' &&
    typeof v['totalErrors'] === 'number' &&
    typeof v['latencyPercentiles'] === 'object' &&
    typeof v['throughput'] === 'object'
  );
}

function formatMs(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;
}

interface MetricCardProps {
  label: string;
  value: string;
  subtext?: string;
}

function MetricCard({ label, value, subtext }: MetricCardProps) {
  return (
    <div className="flex flex-col">
      <span className="text-xs text-gray-500 uppercase tracking-wide mb-1">{label}</span>
      <span className="text-xl font-mono font-bold text-white">{value}</span>
      {subtext !== undefined && <span className="text-xs text-gray-500 mt-0.5">{subtext}</span>}
    </div>
  );
}

export function SummaryPanel() {
  const summary = useTestStore((s) => s.summary);
  const testStatus = useTestStore((s) => s.testStatus);

  const shouldShow =
    summary !== null && (testStatus === 'stopped' || testStatus === 'idle');

  if (!shouldShow || !isTestSummary(summary)) return null;

  const totalTokens = summary.totalPromptTokens + summary.totalCompletionTokens;
  const errorRate =
    summary.throughput.totalRequests > 0
      ? ((summary.totalErrors / summary.throughput.totalRequests) * 100).toFixed(1)
      : '0.0';

  return (
    <div className="bg-gray-800 border border-gray-600 rounded-lg p-6 mb-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-bold text-white">Test Complete</h2>
        <span className="text-xs text-gray-500">
          {summary.conversationsCompleted}/{summary.conversationsTotal} conversations completed
        </span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        <MetricCard
          label="Duration"
          value={formatMs(summary.durationMs)}
        />
        <MetricCard
          label="Requests"
          value={summary.throughput.totalRequests.toLocaleString()}
        />
        <MetricCard
          label="Latency p50/p95/p99"
          value={`${summary.latencyPercentiles.p50}ms`}
          subtext={`${summary.latencyPercentiles.p95}ms / ${summary.latencyPercentiles.p99}ms`}
        />
        <MetricCard
          label="Total Tokens"
          value={totalTokens.toLocaleString()}
          subtext={`${summary.totalPromptTokens.toLocaleString()} prompt`}
        />
        <MetricCard
          label="Error Rate"
          value={`${errorRate}%`}
          subtext={`${summary.totalErrors} errors`}
        />
        <MetricCard
          label="Throughput"
          value={`${summary.throughput.requestsPerSecond.toFixed(1)} r/s`}
          subtext={`${summary.throughput.tokensPerSecond.toFixed(0)} tok/s`}
        />
      </div>
    </div>
  );
}
