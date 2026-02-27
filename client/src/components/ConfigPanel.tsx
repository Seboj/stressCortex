import { useTestStore } from '../store/useTestStore';

export function ConfigPanel() {
  const config = useTestStore((s) => s.config);
  const testStatus = useTestStore((s) => s.testStatus);
  const setConfig = useTestStore((s) => s.setConfig);
  const setTestStatus = useTestStore((s) => s.setTestStatus);
  const reset = useTestStore((s) => s.reset);

  const isRunning = testStatus === 'running' || testStatus === 'stopping';
  const canStart = testStatus === 'idle' || testStatus === 'stopped';
  const canStop = testStatus === 'running';

  async function handleStart() {
    reset();
    setTestStatus('running');
    try {
      const res = await fetch('/api/test/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      if (res.status === 409) {
        console.error('Test already running');
        setTestStatus('idle');
      }
    } catch (err) {
      console.error('Failed to start test:', err);
      setTestStatus('idle');
    }
  }

  async function handleStop() {
    setTestStatus('stopping');
    try {
      await fetch('/api/test/stop', { method: 'POST' });
    } catch (err) {
      console.error('Failed to stop test:', err);
    }
  }

  return (
    <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-400 uppercase tracking-wide whitespace-nowrap">
            Conversations
          </label>
          <input
            type="number"
            min={1}
            value={config.numConversations}
            disabled={isRunning}
            onChange={(e) => setConfig({ numConversations: Number(e.target.value) })}
            className="w-20 bg-gray-800 border border-gray-700 text-white rounded px-2 py-1 text-sm font-mono disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:border-blue-500"
          />
        </div>

        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-400 uppercase tracking-wide whitespace-nowrap">
            Turns
          </label>
          <input
            type="number"
            min={1}
            value={config.turnsPerConversation}
            disabled={isRunning}
            onChange={(e) => setConfig({ turnsPerConversation: Number(e.target.value) })}
            className="w-20 bg-gray-800 border border-gray-700 text-white rounded px-2 py-1 text-sm font-mono disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:border-blue-500"
          />
        </div>

        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-400 uppercase tracking-wide whitespace-nowrap">
            Concurrency
          </label>
          <input
            type="number"
            min={1}
            value={config.concurrency}
            disabled={isRunning}
            onChange={(e) => setConfig({ concurrency: Number(e.target.value) })}
            className="w-20 bg-gray-800 border border-gray-700 text-white rounded px-2 py-1 text-sm font-mono disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:border-blue-500"
          />
        </div>

        <div className="flex items-center gap-2 ml-auto">
          <button
            onClick={() => void handleStart()}
            disabled={!canStart}
            className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Start Test
          </button>
          <button
            onClick={() => void handleStop()}
            disabled={!canStop}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Stop Test
          </button>
        </div>
      </div>
    </div>
  );
}
