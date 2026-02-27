import { create } from 'zustand';

export type ConvStatus = 'idle' | 'active' | 'completed' | 'errored';

export interface ConvRow {
  conversationId: number;
  status: ConvStatus;
  currentTurn: number;
  turnsTotal: number;
  lastLatencyMs: number;
  totalTokens: number;
  errors: number;
}

export interface LatencyPoint {
  time: number; // sequence counter (incrementing integer per SSE flush)
  p50: number;
  p95: number;
  p99: number;
}

export interface TokenPoint {
  time: number; // sequence counter
  promptTokens: number;
  completionTokens: number;
}

export interface TestConfig {
  numConversations: number;
  turnsPerConversation: number;
  concurrency: number;
}

export type TestStatus = 'idle' | 'running' | 'stopping' | 'stopped';

interface TestStore {
  // State
  config: TestConfig;
  testStatus: TestStatus;
  conversations: Map<number, ConvRow>;
  latencyHistory: LatencyPoint[];
  tokenHistory: TokenPoint[];
  errorCounts: Record<string, number>;
  summary: unknown | null;
  throughput: { requestsPerSecond: number; tokensPerSecond: number } | null;

  // Actions
  setConfig: (cfg: Partial<TestConfig>) => void;
  setTestStatus: (s: TestStatus) => void;
  upsertConversation: (partial: Partial<ConvRow> & { conversationId: number }) => void;
  addLatencyPoint: (pt: LatencyPoint) => void;
  addTokenPoint: (pt: TokenPoint) => void;
  incrementError: (type: string) => void;
  setThroughput: (t: { requestsPerSecond: number; tokensPerSecond: number }) => void;
  setSummary: (s: unknown) => void;
  reset: () => void;
}

const defaultConfig: TestConfig = {
  numConversations: 5,
  turnsPerConversation: 5,
  concurrency: 5,
};

const initialState = {
  config: defaultConfig,
  testStatus: 'idle' as TestStatus,
  conversations: new Map<number, ConvRow>(),
  latencyHistory: [] as LatencyPoint[],
  tokenHistory: [] as TokenPoint[],
  errorCounts: {} as Record<string, number>,
  summary: null,
  throughput: null,
};

export const useTestStore = create<TestStore>()((set) => ({
  ...initialState,

  setConfig: (cfg) => set((s) => ({ config: { ...s.config, ...cfg } })),

  setTestStatus: (s) => set({ testStatus: s }),

  upsertConversation: (partial) =>
    set((s) => {
      const convs = new Map(s.conversations);
      const existing = convs.get(partial.conversationId) ?? {
        conversationId: partial.conversationId,
        status: 'idle' as ConvStatus,
        currentTurn: 0,
        turnsTotal: 0,
        lastLatencyMs: 0,
        totalTokens: 0,
        errors: 0,
      };
      convs.set(partial.conversationId, { ...existing, ...partial });
      return { conversations: convs };
    }),

  addLatencyPoint: (pt) => set((s) => ({ latencyHistory: [...s.latencyHistory, pt] })),

  addTokenPoint: (pt) => set((s) => ({ tokenHistory: [...s.tokenHistory, pt] })),

  incrementError: (type) =>
    set((s) => ({
      errorCounts: {
        ...s.errorCounts,
        [type]: (s.errorCounts[type] ?? 0) + 1,
      },
    })),

  setThroughput: (t) => set({ throughput: t }),

  setSummary: (s) => set({ summary: s }),

  reset: () =>
    set({
      testStatus: 'idle',
      conversations: new Map<number, ConvRow>(),
      latencyHistory: [],
      tokenHistory: [],
      errorCounts: {},
      summary: null,
      throughput: null,
    }),
}));
