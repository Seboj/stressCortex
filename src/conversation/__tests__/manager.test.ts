/**
 * Tests for ConversationManager — N concurrent conversations with stagger and stop.
 */

import { jest } from '@jest/globals';
import { createConversationManager } from '../manager.js';
import { eventBus } from '../../core/event-bus.js';
import type { CortexResponse } from '../../types/api.js';
import type { ManagerConfig } from '../../types/conversation.js';
import type {
  ConversationStartEvent,
  TestLifecycleEvent,
} from '../../types/events.js';

// Helper: create a mock makeRequest with configurable delay
function createMockMakeRequest(delayMs = 0) {
  let callCount = 0;

  const makeRequest = jest.fn(
    async (messages: Array<{ role: string; content: string }>): Promise<CortexResponse> => {
      callCount++;
      if (delayMs > 0) {
        await new Promise((resolve) => global.setTimeout(resolve, delayMs));
      }
      return {
        content: `Response ${callCount}`,
        model: 'test-model',
        promptTokens: messages.length * 10,
        completionTokens: 5,
        latencyMs: 50,
      };
    },
  );

  return { makeRequest, getCallCount: () => callCount };
}

// Helper: create a basic manager config
function createManagerConfig(overrides: Partial<ManagerConfig> = {}): ManagerConfig {
  const { makeRequest } = createMockMakeRequest();
  return {
    numConversations: 3,
    turnsPerConversation: 2,
    rampUpDelayMs: 0, // no stagger by default in tests for speed
    makeRequest,
    ...overrides,
  };
}

describe('ConversationManager', () => {
  afterEach(() => {
    eventBus.removeAllListeners();
  });

  describe('concurrent execution', () => {
    it('runs N conversations and returns results for all', async () => {
      const { makeRequest } = createMockMakeRequest();
      const config = createManagerConfig({
        numConversations: 5,
        turnsPerConversation: 2,
        makeRequest,
      });

      const manager = createConversationManager(config);
      const result = await manager.start();

      expect(result.totalConversations).toBe(5);
      expect(result.conversations).toHaveLength(5);
      // 5 conversations x 2 turns = 10 API calls
      expect(makeRequest).toHaveBeenCalledTimes(10);
    });

    it('each conversation gets a sequential ID', async () => {
      const starts: ConversationStartEvent[] = [];
      eventBus.on('conversation:start', (evt) => starts.push(evt));

      const { makeRequest } = createMockMakeRequest();
      const config = createManagerConfig({
        numConversations: 5,
        makeRequest,
      });

      const manager = createConversationManager(config);
      await manager.start();

      const ids = starts.map((s) => s.conversationId).sort((a, b) => a - b);
      expect(ids).toEqual([1, 2, 3, 4, 5]);
    });
  });

  describe('staggered launch', () => {
    it('launches conversations with visible time gaps when rampUpDelayMs > 0', async () => {
      const starts: ConversationStartEvent[] = [];
      eventBus.on('conversation:start', (evt) => starts.push(evt));

      const { makeRequest } = createMockMakeRequest();
      const config = createManagerConfig({
        numConversations: 3,
        turnsPerConversation: 1,
        rampUpDelayMs: 50, // 50ms base delay
        makeRequest,
      });

      const manager = createConversationManager(config);
      await manager.start();

      // With 50ms base delay + jitter, there should be measurable gaps
      expect(starts).toHaveLength(3);
      // Second conversation should start after first
      const gap1 = starts[1].timestamp - starts[0].timestamp;
      // Third conversation should start after second
      const gap2 = starts[2].timestamp - starts[1].timestamp;
      // Gaps should be at least 50ms (base delay)
      expect(gap1).toBeGreaterThanOrEqual(40); // allow small timer imprecision
      expect(gap2).toBeGreaterThanOrEqual(40);
    });

    it('launches all conversations at once when rampUpDelayMs is 0', async () => {
      const starts: ConversationStartEvent[] = [];
      eventBus.on('conversation:start', (evt) => starts.push(evt));

      const { makeRequest } = createMockMakeRequest();
      const config = createManagerConfig({
        numConversations: 3,
        turnsPerConversation: 1,
        rampUpDelayMs: 0,
        makeRequest,
      });

      const manager = createConversationManager(config);
      await manager.start();

      expect(starts).toHaveLength(3);
      // All should start within a very small window (< 20ms)
      const maxGap = starts[starts.length - 1].timestamp - starts[0].timestamp;
      expect(maxGap).toBeLessThan(50);
    });
  });

  describe('error isolation', () => {
    it('one failing conversation does not affect others', async () => {
      let callNum = 0;
      const makeRequest = jest.fn(
        async (_messages: Array<{ role: string; content: string }>): Promise<CortexResponse> => {
          callNum++;
          // Fail every 4th call to simulate one conversation erroring
          if (callNum === 4) {
            throw new Error('Simulated failure');
          }
          return {
            content: `Response ${callNum}`,
            model: 'test-model',
            promptTokens: 10,
            completionTokens: 5,
            latencyMs: 50,
          };
        },
      );

      const config = createManagerConfig({
        numConversations: 3,
        turnsPerConversation: 2,
        makeRequest,
      });

      const manager = createConversationManager(config);
      const result = await manager.start();

      // At least some conversations should complete
      expect(result.completedConversations).toBeGreaterThanOrEqual(1);
      // And at least one should have errored
      expect(result.erroredConversations).toBeGreaterThanOrEqual(1);
      // Total should equal numConversations
      expect(result.completedConversations + result.erroredConversations).toBe(3);
    });
  });

  describe('graceful stop', () => {
    it('stops new turns from starting after stop is called', async () => {
      const { makeRequest } = createMockMakeRequest(50); // 50ms per API call
      const config = createManagerConfig({
        numConversations: 2,
        turnsPerConversation: 10, // many turns so we can stop mid-way
        makeRequest,
      });

      const manager = createConversationManager(config);

      // Start the manager but don't await yet
      const resultPromise = manager.start();

      // Wait a bit then stop
      await new Promise((resolve) => global.setTimeout(resolve, 200));
      await manager.stop();

      const result = await resultPromise;

      // Should have completed fewer than the full 20 turns (2 x 10)
      expect(result.totalTurns).toBeLessThan(20);
      expect(result.stoppedEarly).toBe(true);
    });

    it('emits lifecycle events in correct order', async () => {
      const events: TestLifecycleEvent[] = [];
      eventBus.on('test:lifecycle', (evt) => events.push(evt));

      const { makeRequest } = createMockMakeRequest();
      const config = createManagerConfig({
        numConversations: 1,
        turnsPerConversation: 1,
        makeRequest,
      });

      const manager = createConversationManager(config);
      await manager.start();

      const types = events.map((e) => e.type);
      // Must include starting, running, stopped
      expect(types).toContain('starting');
      expect(types).toContain('running');
      expect(types).toContain('stopped');

      // starting must come before running
      expect(types.indexOf('starting')).toBeLessThan(types.indexOf('running'));
      // running must come before stopped
      expect(types.indexOf('running')).toBeLessThan(types.indexOf('stopped'));
    });

    it('emits stopping and draining events when stop is called', async () => {
      const events: TestLifecycleEvent[] = [];
      eventBus.on('test:lifecycle', (evt) => events.push(evt));

      const { makeRequest } = createMockMakeRequest(100); // slow enough to stop mid-run
      const config = createManagerConfig({
        numConversations: 2,
        turnsPerConversation: 5,
        makeRequest,
      });

      const manager = createConversationManager(config);
      const resultPromise = manager.start();

      await new Promise((resolve) => global.setTimeout(resolve, 150));
      await manager.stop();
      await resultPromise;

      const types = events.map((e) => e.type);
      expect(types).toContain('stopping');
      expect(types).toContain('draining');
    });
  });

  describe('drain timeout', () => {
    it('stop resolves within drain timeout even if API calls are slow', async () => {
      // Use a makeRequest that respects an abort signal via closure
      let aborted = false;
      const makeRequest = jest.fn(
        async (_messages: Array<{ role: string; content: string }>): Promise<CortexResponse> => {
          // Wait up to 5 seconds, but check abort flag
          const start = Date.now();
          while (Date.now() - start < 5000 && !aborted) {
            await new Promise((resolve) => global.setTimeout(resolve, 50));
          }
          if (aborted) {
            throw new Error('Aborted');
          }
          return {
            content: 'Slow response',
            model: 'test-model',
            promptTokens: 10,
            completionTokens: 5,
            latencyMs: 5000,
          };
        },
      );

      const config = createManagerConfig({
        numConversations: 1,
        turnsPerConversation: 5,
        drainTimeoutMs: 200,
        makeRequest,
      });

      const manager = createConversationManager(config);
      const resultPromise = manager.start();

      // Give it a moment to start, then stop
      await new Promise((resolve) => global.setTimeout(resolve, 50));

      const stopStart = Date.now();
      await manager.stop();
      const stopDuration = Date.now() - stopStart;

      // stop() should resolve within ~drainTimeoutMs, not wait for 5s API calls
      expect(stopDuration).toBeLessThan(500);

      // Abort the slow mock so test cleanup is fast
      aborted = true;
      await resultPromise;
    }, 10000);
  });

  describe('result structure', () => {
    it('returns correct TestRunResult', async () => {
      const { makeRequest } = createMockMakeRequest();
      const config = createManagerConfig({
        numConversations: 3,
        turnsPerConversation: 2,
        makeRequest,
      });

      const manager = createConversationManager(config);
      const result = await manager.start();

      expect(result.totalConversations).toBe(3);
      expect(result.completedConversations).toBe(3);
      expect(result.erroredConversations).toBe(0);
      expect(result.totalTurns).toBe(6); // 3 x 2
      expect(result.totalLatencyMs).toBeGreaterThan(0);
      expect(result.stoppedEarly).toBe(false);
      expect(result.conversations).toHaveLength(3);
    });
  });
});
