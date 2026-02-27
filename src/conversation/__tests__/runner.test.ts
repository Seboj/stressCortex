/**
 * Tests for ConversationRunner — single conversation turn loop.
 */

import { jest } from '@jest/globals';
import { createConversationRunner } from '../runner.js';
import { eventBus } from '../../core/event-bus.js';
import type { CortexResponse } from '../../types/api.js';
import type { ConversationConfig } from '../../types/conversation.js';
import type {
  ConversationStartEvent,
  ConversationTurnCompleteEvent,
  ConversationCompleteEvent,
} from '../../types/events.js';

// Helper: create a mock makeRequest that returns predictable responses
function createMockMakeRequest(responses?: string[]) {
  const defaultResponses = [
    'I have been having headaches lately.',
    'Can you describe the headaches? Where exactly do you feel the pain?',
    'The pain is mostly behind my eyes and gets worse in the afternoon.',
  ];
  const responseList = responses ?? defaultResponses;
  let callCount = 0;
  const calls: Array<Array<{ role: string; content: string }>> = [];

  const makeRequest = jest.fn(
    async (messages: Array<{ role: string; content: string }>): Promise<CortexResponse> => {
      calls.push([...messages]); // snapshot the messages at time of call
      const content = responseList[callCount % responseList.length] ?? 'Default response';
      callCount++;
      return {
        content,
        model: 'test-model',
        promptTokens: messages.length * 10,
        completionTokens: 5,
        latencyMs: 100 + callCount * 10,
      };
    },
  );

  return { makeRequest, calls };
}

// Helper: create a basic config
function createConfig(
  overrides: Partial<ConversationConfig> = {},
): ConversationConfig {
  const { makeRequest } = createMockMakeRequest();
  return {
    conversationId: 1,
    turnsPerConversation: 3,
    makeRequest,
    ...overrides,
  };
}

describe('ConversationRunner', () => {
  afterEach(() => {
    eventBus.removeAllListeners();
  });

  describe('turn count', () => {
    it('makes exactly M API calls for M turns', async () => {
      const { makeRequest } = createMockMakeRequest();
      const config = createConfig({ turnsPerConversation: 3, makeRequest });
      const runner = createConversationRunner(config);

      const result = await runner.run();

      expect(makeRequest).toHaveBeenCalledTimes(3);
      expect(result.turnsCompleted).toBe(3);
    });

    it('makes 1 API call for 1 turn', async () => {
      const { makeRequest } = createMockMakeRequest();
      const config = createConfig({ turnsPerConversation: 1, makeRequest });
      const runner = createConversationRunner(config);

      const result = await runner.run();

      expect(makeRequest).toHaveBeenCalledTimes(1);
      expect(result.turnsCompleted).toBe(1);
    });
  });

  describe('message history growth', () => {
    it('each successive call includes more messages than the previous', async () => {
      const { makeRequest, calls } = createMockMakeRequest();
      const config = createConfig({ turnsPerConversation: 3, makeRequest });
      const runner = createConversationRunner(config);

      await runner.run();

      // Each successive call should have more messages
      for (let i = 1; i < calls.length; i++) {
        expect(calls[i].length).toBeGreaterThan(calls[i - 1].length);
      }
    });
  });

  describe('doctor opening', () => {
    it('first API call includes "How are you feeling today?" in messages', async () => {
      const { makeRequest, calls } = createMockMakeRequest();
      const config = createConfig({ turnsPerConversation: 1, makeRequest });
      const runner = createConversationRunner(config);

      await runner.run();

      const firstCallMessages = calls[0];
      const hasOpening = firstCallMessages.some(
        (msg) => msg.content === 'How are you feeling today?',
      );
      expect(hasOpening).toBe(true);
    });
  });

  describe('role alternation', () => {
    it('turns alternate between patient and doctor roles', async () => {
      const { makeRequest } = createMockMakeRequest();
      const config = createConfig({ turnsPerConversation: 4, makeRequest });

      const turnRoles: string[] = [];
      eventBus.on('conversation:turn:complete', (evt: ConversationTurnCompleteEvent) => {
        turnRoles.push(evt.role);
      });

      const runner = createConversationRunner(config);
      await runner.run();

      // First turn should be patient (responding to doctor's opening)
      expect(turnRoles[0]).toBe('patient');
      // Second turn should be doctor
      expect(turnRoles[1]).toBe('doctor');
      // Third turn should be patient
      expect(turnRoles[2]).toBe('patient');
      // Fourth turn should be doctor
      expect(turnRoles[3]).toBe('doctor');
    });
  });

  describe('self-talking loop', () => {
    it('each API response content appears in the next turn messages', async () => {
      const responses = ['Response A', 'Response B', 'Response C'];
      const { makeRequest, calls } = createMockMakeRequest(responses);
      const config = createConfig({ turnsPerConversation: 3, makeRequest });
      const runner = createConversationRunner(config);

      await runner.run();

      // Call 2 should contain "Response A" (from call 1)
      const call2Messages = calls[1].map((m) => m.content);
      expect(call2Messages).toContain('Response A');

      // Call 3 should contain "Response A" AND "Response B"
      const call3Messages = calls[2].map((m) => m.content);
      expect(call3Messages).toContain('Response A');
      expect(call3Messages).toContain('Response B');
    });
  });

  describe('event emissions', () => {
    it('emits conversation:start once at beginning', async () => {
      const starts: ConversationStartEvent[] = [];
      eventBus.on('conversation:start', (evt) => starts.push(evt));

      const config = createConfig({ conversationId: 42, turnsPerConversation: 2 });
      const runner = createConversationRunner(config);
      await runner.run();

      expect(starts).toHaveLength(1);
      expect(starts[0].conversationId).toBe(42);
      expect(starts[0].turnsTotal).toBe(2);
    });

    it('emits conversation:turn:complete M times', async () => {
      const turns: ConversationTurnCompleteEvent[] = [];
      eventBus.on('conversation:turn:complete', (evt) => turns.push(evt));

      const config = createConfig({ turnsPerConversation: 3 });
      const runner = createConversationRunner(config);
      await runner.run();

      expect(turns).toHaveLength(3);
      expect(turns[0].turnNumber).toBe(1);
      expect(turns[1].turnNumber).toBe(2);
      expect(turns[2].turnNumber).toBe(3);
    });

    it('turn events include latency, tokens, and message count', async () => {
      const turns: ConversationTurnCompleteEvent[] = [];
      eventBus.on('conversation:turn:complete', (evt) => turns.push(evt));

      const config = createConfig({ turnsPerConversation: 1 });
      const runner = createConversationRunner(config);
      await runner.run();

      expect(turns[0].latencyMs).toBeGreaterThan(0);
      expect(turns[0].promptTokens).toBeGreaterThan(0);
      expect(turns[0].completionTokens).toBeGreaterThan(0);
      expect(turns[0].messageCount).toBeGreaterThan(0);
      expect(turns[0].conversationId).toBe(1);
    });

    it('emits conversation:complete once at end', async () => {
      const completes: ConversationCompleteEvent[] = [];
      eventBus.on('conversation:complete', (evt) => completes.push(evt));

      const config = createConfig({ turnsPerConversation: 2 });
      const runner = createConversationRunner(config);
      await runner.run();

      expect(completes).toHaveLength(1);
      expect(completes[0].status).toBe('completed');
      expect(completes[0].turnsCompleted).toBe(2);
    });
  });

  describe('error handling', () => {
    it('marks conversation as errored when makeRequest throws', async () => {
      let callNum = 0;
      const makeRequest = jest.fn(async (): Promise<CortexResponse> => {
        callNum++;
        if (callNum === 1) {
          return {
            content: 'Turn 1 ok',
            model: 'test',
            promptTokens: 10,
            completionTokens: 5,
            latencyMs: 100,
          };
        }
        throw { type: 'server_error', statusCode: 500, message: 'Internal server error' };
      });

      const config = createConfig({ turnsPerConversation: 3, makeRequest });
      const runner = createConversationRunner(config);
      const result = await runner.run();

      expect(result.status).toBe('errored');
      expect(result.turnsCompleted).toBe(1); // completed 1 turn before error
      expect(result.errorMessage).toBeDefined();
    });

    it('does not throw — always returns a result', async () => {
      const makeRequest = jest.fn(async (): Promise<CortexResponse> => {
        throw new Error('Network failure');
      });

      const config = createConfig({ turnsPerConversation: 2, makeRequest });
      const runner = createConversationRunner(config);

      // Should NOT throw
      const result = await runner.run();
      expect(result).toBeDefined();
      expect(result.status).toBe('errored');
    });

    it('emits conversation:complete with errored status on failure', async () => {
      const completes: ConversationCompleteEvent[] = [];
      eventBus.on('conversation:complete', (evt) => completes.push(evt));

      const makeRequest = jest.fn(async (): Promise<CortexResponse> => {
        throw new Error('API down');
      });
      const config = createConfig({ turnsPerConversation: 2, makeRequest });
      const runner = createConversationRunner(config);
      await runner.run();

      expect(completes).toHaveLength(1);
      expect(completes[0].status).toBe('errored');
    });
  });

  describe('stop signal', () => {
    it('stops early when shouldStop returns true', async () => {
      let stopAfter = 2;
      const { makeRequest } = createMockMakeRequest();
      const config = createConfig({
        turnsPerConversation: 5,
        makeRequest,
        shouldStop: () => {
          stopAfter--;
          return stopAfter < 0;
        },
      });

      const runner = createConversationRunner(config);
      const result = await runner.run();

      // shouldStop is checked before each turn
      // Turn 1: stopAfter becomes 1 (false), runs
      // Turn 2: stopAfter becomes 0 (false), runs
      // Turn 3: stopAfter becomes -1 (true), stops
      expect(result.turnsCompleted).toBe(2);
      expect(result.status).toBe('completed');
    });
  });

  describe('result structure', () => {
    it('returns correct ConversationResult', async () => {
      const { makeRequest } = createMockMakeRequest();
      const config = createConfig({
        conversationId: 7,
        turnsPerConversation: 2,
        makeRequest,
      });
      const runner = createConversationRunner(config);
      const result = await runner.run();

      expect(result.conversationId).toBe(7);
      expect(result.turnsCompleted).toBe(2);
      expect(result.status).toBe('completed');
      expect(result.totalLatencyMs).toBeGreaterThan(0);
      expect(result.turns).toHaveLength(2);
      expect(result.turns[0].turnNumber).toBe(1);
      expect(result.turns[1].turnNumber).toBe(2);
    });
  });
});
