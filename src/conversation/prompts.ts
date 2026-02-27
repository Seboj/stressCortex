/**
 * System prompts for the self-talking medical conversation loop.
 *
 * Doctor and patient are the two LLM personas. Each turn, one persona's
 * system prompt is prepended to the shared conversation history, and the
 * LLM responds as that persona.
 *
 * Prompts are intentionally short — this is a load tester, not a medical simulation.
 * "Keep responses concise" controls token output per turn.
 */

/** System prompt for the medical professional (doctor) role */
export const DOCTOR_SYSTEM_PROMPT =
  'You are a medical doctor conducting a patient consultation. ' +
  "Ask follow-up questions based on the patient's responses to understand their condition. " +
  'Keep responses concise (2-3 sentences).';

/** System prompt for the patient role */
export const PATIENT_SYSTEM_PROMPT =
  'You are a patient visiting a doctor. ' +
  "Describe your symptoms naturally and answer the doctor's questions honestly. " +
  'Keep responses concise (2-3 sentences).';

/** The doctor's opening message that starts every conversation */
export const DOCTOR_OPENING = 'How are you feeling today?';
