/**
 * Conversation types for multi-turn self-talking dialogue.
 * Used by ConversationRunner (single conversation) and ConversationManager (N concurrent).
 */

import type { CortexResponse } from './api.js';

/** Conversation lifecycle status */
export type ConversationStatus = 'pending' | 'active' | 'completed' | 'errored';

/** Configuration for a single conversation runner */
export interface ConversationConfig {
  /** Sequential conversation ID (1, 2, 3...) */
  conversationId: number;
  /** Number of API calls (turns) per conversation */
  turnsPerConversation: number;
  /** Function to make API calls — injected for testability */
  makeRequest: (messages: Array<{ role: string; content: string }>) => Promise<CortexResponse>;
  /** Optional: check before each turn if we should stop */
  shouldStop?: () => boolean;
}

/** Result of a single turn (one API call) */
export interface ConversationTurnResult {
  conversationId: number;
  turnNumber: number;
  role: 'doctor' | 'patient';
  latencyMs: number;
  promptTokens: number;
  completionTokens: number;
  content: string;
  messageCount: number;
}

/** Result of a complete conversation (all turns) */
export interface ConversationResult {
  conversationId: number;
  turnsCompleted: number;
  status: 'completed' | 'errored';
  errorMessage?: string;
  totalLatencyMs: number;
  turns: ConversationTurnResult[];
}
