import { useTestStore } from '../store/useTestStore';

const ERROR_LABELS: Record<string, { label: string; colorClass: string }> = {
  rate_limited: {
    label: 'Rate Limited',
    colorClass: 'text-amber-400 bg-amber-600/10 border-amber-600/20',
  },
  server_error: {
    label: 'Server Error',
    colorClass: 'text-red-400 bg-red-600/10 border-red-600/20',
  },
  client_error: {
    label: 'Client Error',
    colorClass: 'text-orange-400 bg-orange-600/10 border-orange-600/20',
  },
  timeout: {
    label: 'Timeout',
    colorClass: 'text-gray-400 bg-gray-600/10 border-gray-600/20',
  },
};

export function ErrorPanel() {
  const errorCounts = useTestStore((s) => s.errorCounts);

  const allTypes = ['rate_limited', 'server_error', 'client_error', 'timeout'];
  const totalErrors = allTypes.reduce((sum, t) => sum + (errorCounts[t] ?? 0), 0);

  return (
    <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
      <h3 className="text-sm font-medium text-gray-400 mb-3">Errors</h3>
      {totalErrors === 0 ? (
        <div className="flex items-center gap-2 text-green-400 text-sm">
          <span className="text-base">✓</span>
          <span>0 errors</span>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {allTypes.map((type) => {
            const count = errorCounts[type] ?? 0;
            if (count === 0) return null;
            const meta = ERROR_LABELS[type] ?? { label: type, colorClass: 'text-gray-400 bg-gray-600/10 border-gray-600/20' };
            return (
              <div
                key={type}
                className={`border rounded p-2 ${meta.colorClass}`}
              >
                <div className="text-xs uppercase tracking-wide opacity-70 mb-1">
                  {meta.label}
                </div>
                <div className="text-xl font-mono font-bold">{count}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
