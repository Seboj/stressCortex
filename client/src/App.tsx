import { useSSE } from './hooks/useSSE';
import { ConfigPanel } from './components/ConfigPanel';
import { SummaryPanel } from './components/SummaryPanel';
import { LatencyChart } from './components/LatencyChart';
import { TokenChart } from './components/TokenChart';
import { ErrorPanel } from './components/ErrorPanel';
import { ThroughputPanel } from './components/ThroughputPanel';
import { ConversationTable } from './components/ConversationTable';

export default function App() {
  useSSE();

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100">
      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Header */}
        <header className="mb-6">
          <h1 className="text-2xl font-bold text-white">StressCortex</h1>
          <p className="text-gray-400 text-sm">Load Testing Dashboard</p>
        </header>

        {/* Config + controls */}
        <div className="mb-4">
          <ConfigPanel />
        </div>

        {/* Summary panel — appears after test completion */}
        <SummaryPanel />

        {/* Charts section */}
        <div className="space-y-4 mb-6">
          {/* Latency chart — hero element, full width */}
          <LatencyChart />

          {/* Secondary metrics row */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <TokenChart />
            <ErrorPanel />
            <ThroughputPanel />
          </div>
        </div>

        {/* Conversation table */}
        <ConversationTable />
      </div>
    </div>
  );
}
