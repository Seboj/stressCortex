import { useState } from 'react';
import { useTestStore } from '../store/useTestStore';

export function ConfigPanel() {
  const config = useTestStore((s) => s.config);
  const testStatus = useTestStore((s) => s.testStatus);
  const summary = useTestStore((s) => s.summary);
  const setConfig = useTestStore((s) => s.setConfig);
  const setTestStatus = useTestStore((s) => s.setTestStatus);
  const reset = useTestStore((s) => s.reset);

  const [generating, setGenerating] = useState(false);

  const isRunning = testStatus === 'running' || testStatus === 'stopping';
  const canStart = testStatus === 'idle' || testStatus === 'stopped';
  const canStop = testStatus === 'running';
  const canRestart = testStatus === 'running';
  const hasData = summary !== null || useTestStore.getState().latencyHistory.length > 0;
  const canClear = !isRunning && hasData;
  const canGenerate = summary !== null && !isRunning && !generating;

  function getClearTooltip(): string | undefined {
    if (isRunning) return 'Stop the test before clearing data';
    if (!hasData) return 'No data to clear — run a test first';
    return undefined;
  }

  function getReportTooltip(): string | undefined {
    if (generating) return 'Report is being generated...';
    if (isRunning) return 'Wait for the test to finish before generating a report';
    if (summary === null) return 'Run a test to completion first — report needs final metrics';
    return 'Download a PDF report with LLM-powered analysis';
  }

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

  async function handleRestart() {
    setTestStatus('stopping');
    try {
      await fetch('/api/test/stop', { method: 'POST' });
      reset();
      setTestStatus('running');
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
      console.error('Failed to restart test:', err);
      setTestStatus('idle');
    }
  }

  async function handleGenerateReport() {
    if (!summary) return;
    setGenerating(true);
    try {
      const res = await fetch('/api/report/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ summary }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Unknown error' }));
        console.error('Report generation failed:', err);
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `stresscortex-report-${new Date().toISOString().slice(0, 10)}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to generate report:', err);
    } finally {
      setGenerating(false);
    }
  }

  function getStatusHint(): string {
    if (testStatus === 'running') return 'Test running — wait for completion to generate a report';
    if (testStatus === 'stopping') return 'Test stopping — draining in-flight requests...';
    if (testStatus === 'stopped' && summary !== null) return 'Test complete — you can now generate a report or clear data';
    if (testStatus === 'stopped' && summary === null) return 'Test stopped — no summary available';
    return 'Configure parameters and start a test';
  }

  return (
    <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4 space-y-2">
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
            onClick={() => reset()}
            disabled={!canClear}
            title={getClearTooltip()}
            className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white text-sm font-medium rounded disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Clear All
          </button>
          <button
            onClick={() => void handleGenerateReport()}
            disabled={!canGenerate}
            title={getReportTooltip()}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {generating ? 'Generating...' : 'Generate Report'}
          </button>

          <div className="w-px h-6 bg-gray-600" />

          <button
            onClick={() => void handleStart()}
            disabled={!canStart}
            className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Start Test
          </button>
          <button
            onClick={() => void handleRestart()}
            disabled={!canRestart}
            className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium rounded disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Restart
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
      <p className="text-xs text-gray-500 text-right">{getStatusHint()}</p>
    </div>
  );
}
