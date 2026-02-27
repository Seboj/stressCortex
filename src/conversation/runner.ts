/**
 * ConversationRunner — single conversation turn loop.
 *
 * Owns one conversation's message history and runs M turns of self-talking
 * doctor/patient dialogue. Each turn sends the full growing message history
 * to the API.
 *
 * Turn flow:
 *   Turn 1 (patient): doctor opens with "How are you feeling today?",
 *                      API responds as patient
 *   Turn 2 (doctor):  patient's response becomes input,
 *                      API responds as doctor follow-up
 *   Turn 3 (patient): doctor's follow-up becomes input,
 *                      API responds as patient again
 *   ... and so on for M turns
 *
 * The runner emits events on the shared event bus for every turn,
 * so Phase 3 metrics aggregation can subscribe and track.
 */

import { eventBus } from '../core/event-bus.js';
import { logger } from '../core/logger.js';
import { DOCTOR_SYSTEM_PROMPT, PATIENT_SYSTEM_PROMPT, DOCTOR_OPENING } from './prompts.js';
import type { ConversationConfig, ConversationResult, ConversationTurnResult } from '../types/conversation.js';

/**
 * Create a conversation runner for a single conversation.
 *
 * @param config - Conversation configuration with injected makeRequest
 * @returns Object with run() method that executes the full conversation
 */
export function createConversationRunner(config: ConversationConfig) {
  const { conversationId, turnsPerConversation, makeRequest, shouldStop } = config;

  async function run(): Promise<ConversationResult> {
    const turns: ConversationTurnResult[] = [];
    let totalLatencyMs = 0;

    // Emit conversation start
    eventBus.emit('conversation:start', {
      conversationId,
      turnsTotal: turnsPerConversation,
      timestamp: Date.now(),
    });

    // Conversation history — grows each turn.
    // Stored from the "neutral" perspective: doctor messages are 'user',
    // patient messages are 'assistant' (since patient responds to doctor).
    // On each turn, we build the API messages by prepending the right system prompt
    // and potentially flipping roles.
    //
    // Simplified approach:
    // - history stores messages with 'doctor' and 'patient' as role markers
    // - before each API call, we map to user/assistant based on whose turn it is
    const history: Array<{ speaker: 'doctor' | 'patient'; content: string }> = [];

    // Doctor opens with the first message
    history.push({ speaker: 'doctor', content: DOCTOR_OPENING });

    try {
      for (let turn = 1; turn <= turnsPerConversation; turn++) {
        // Check stop signal before each turn
        if (shouldStop?.()) {
          break;
        }

        // Determine who's speaking this turn
        // Turn 1: patient responds to doctor's opening
        // Turn 2: doctor responds to patient
        // Turn 3: patient responds to doctor
        // Pattern: odd turns = patient, even turns = doctor
        const currentRole: 'doctor' | 'patient' = turn % 2 === 1 ? 'patient' : 'doctor';
        const systemPrompt = currentRole === 'patient' ? PATIENT_SYSTEM_PROMPT : DOCTOR_SYSTEM_PROMPT;

        // Build API messages: system prompt + full conversation history
        // From the API's perspective, it IS the currentRole.
        // So the other party's messages are 'user', and its own are 'assistant'.
        const apiMessages: Array<{ role: string; content: string }> = [
          { role: 'system', content: systemPrompt },
        ];

        for (const msg of history) {
          if (msg.speaker === currentRole) {
            // API's own prior responses
            apiMessages.push({ role: 'assistant', content: msg.content });
          } else {
            // The other party's messages
            apiMessages.push({ role: 'user', content: msg.content });
          }
        }

        // Make the API call
        const response = await makeRequest(apiMessages);

        // Add the response to conversation history
        history.push({ speaker: currentRole, content: response.content });

        const turnResult: ConversationTurnResult = {
          conversationId,
          turnNumber: turn,
          role: currentRole,
          latencyMs: response.latencyMs,
          promptTokens: response.promptTokens,
          completionTokens: response.completionTokens,
          content: response.content,
          messageCount: apiMessages.length,
        };

        turns.push(turnResult);
        totalLatencyMs += response.latencyMs;

        // Emit turn complete event
        eventBus.emit('conversation:turn:complete', {
          conversationId,
          turnNumber: turn,
          turnsTotal: turnsPerConversation,
          role: currentRole,
          latencyMs: response.latencyMs,
          promptTokens: response.promptTokens,
          completionTokens: response.completionTokens,
          messageCount: apiMessages.length,
          timestamp: Date.now(),
        });

        logger.debug({
          conversationId,
          turn,
          role: currentRole,
          latencyMs: response.latencyMs,
          tokens: response.promptTokens + response.completionTokens,
        }, `Conv ${conversationId} turn ${turn}/${turnsPerConversation}`);
      }

      // Conversation completed successfully
      const result: ConversationResult = {
        conversationId,
        turnsCompleted: turns.length,
        status: 'completed',
        totalLatencyMs,
        turns,
      };

      eventBus.emit('conversation:complete', {
        conversationId,
        turnsCompleted: turns.length,
        status: 'completed',
        totalLatencyMs,
        timestamp: Date.now(),
      });

      return result;
    } catch (error) {
      // Conversation errored — return result, do NOT throw
      const errorMessage = error instanceof Error
        ? error.message
        : typeof error === 'object' && error !== null && 'message' in error
          ? String((error as { message: unknown }).message)
          : String(error);

      const result: ConversationResult = {
        conversationId,
        turnsCompleted: turns.length,
        status: 'errored',
        errorMessage,
        totalLatencyMs,
        turns,
      };

      eventBus.emit('conversation:complete', {
        conversationId,
        turnsCompleted: turns.length,
        status: 'errored',
        errorMessage,
        totalLatencyMs,
        timestamp: Date.now(),
      });

      logger.warn({
        conversationId,
        turnsCompleted: turns.length,
        error: errorMessage,
      }, `Conv ${conversationId} errored after ${turns.length} turns`);

      return result;
    }
  }

  return { run };
}
