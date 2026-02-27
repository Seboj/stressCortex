import { useTestStore } from '../store/useTestStore';
import type { ConvRow, ConvStatus } from '../store/useTestStore';

function StatusBadge({ status }: { status: ConvStatus }) {
  switch (status) {
    case 'active':
      return (
        <span className="bg-green-600/20 text-green-400 px-2 py-0.5 rounded text-xs font-medium">
          Active
        </span>
      );
    case 'completed':
      return (
        <span className="bg-gray-600/20 text-gray-400 px-2 py-0.5 rounded text-xs font-medium">
          Completed
        </span>
      );
    case 'errored':
      return (
        <span className="bg-red-600/20 text-red-400 px-2 py-0.5 rounded text-xs font-medium">
          Errored
        </span>
      );
    case 'idle':
    default:
      return <span className="text-gray-600 text-xs">Idle</span>;
  }
}

function ConvTableRow({ row }: { row: ConvRow }) {
  return (
    <tr className="hover:bg-gray-800/30 transition-colors">
      <td className="px-4 py-2 text-sm text-gray-300 font-mono">{row.conversationId}</td>
      <td className="px-4 py-2">
        <StatusBadge status={row.status} />
      </td>
      <td className="px-4 py-2 text-sm text-gray-300 font-mono">
        {row.turnsTotal > 0 ? `${row.currentTurn}/${row.turnsTotal}` : row.currentTurn}
      </td>
      <td className="px-4 py-2 text-sm text-gray-300 font-mono">
        {row.lastLatencyMs > 0 ? `${row.lastLatencyMs}ms` : '—'}
      </td>
      <td className="px-4 py-2 text-sm text-gray-300 font-mono">
        {row.totalTokens > 0 ? row.totalTokens.toLocaleString() : '—'}
      </td>
      <td className="px-4 py-2 text-sm font-mono">
        {row.errors > 0 ? (
          <span className="text-red-400">{row.errors}</span>
        ) : (
          <span className="text-gray-600">0</span>
        )}
      </td>
    </tr>
  );
}

export function ConversationTable() {
  const conversations = useTestStore((s) => s.conversations);

  const rows = Array.from(conversations.values()).sort(
    (a, b) => a.conversationId - b.conversationId,
  );

  return (
    <div className="bg-gray-800/50 border border-gray-700 rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-700">
        <h3 className="text-sm font-medium text-gray-400">Conversations</h3>
      </div>
      <div className="max-h-80 overflow-y-auto">
        <table className="w-full">
          <thead className="sticky top-0 bg-gray-800">
            <tr>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                #
              </th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                Status
              </th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                Current Turn
              </th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                Last Latency
              </th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                Total Tokens
              </th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                Errors
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-700/50">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-600">
                  No conversations yet
                </td>
              </tr>
            ) : (
              rows.map((row) => <ConvTableRow key={row.conversationId} row={row} />)
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
