// Server-only: Anthropic client + model choice. The browser extension never sees the key.
import Anthropic from '@anthropic-ai/sdk';

export class AiNotConfiguredError extends Error {
  constructor() {
    super('AI not configured');
  }
}

export const DRAFT_MODEL = process.env.ANTHROPIC_MODEL_DRAFT || 'claude-sonnet-5-5';
export const FAST_MODEL = process.env.ANTHROPIC_MODEL_FAST || 'claude-haiku-4-5-20251001';

let client: Anthropic | null = null;

/** Throws AiNotConfiguredError when ANTHROPIC_API_KEY is missing. */
export function anthropic(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) throw new AiNotConfiguredError();
  client ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: 60_000, maxRetries: 1 });
  return client;
}

/** Maps SDK errors to an HTTP status + safe message (never leaks request contents or keys). */
export function aiErrorResponse(error: unknown): { status: number; error: string } {
  if (error instanceof AiNotConfiguredError) return { status: 503, error: 'AI not configured' };
  if (error instanceof Anthropic.AuthenticationError) return { status: 503, error: 'AI not configured (invalid API key)' };
  if (error instanceof Anthropic.RateLimitError) return { status: 429, error: 'AI is busy, try again in a moment' };
  if (error instanceof Anthropic.BadRequestError) return { status: 502, error: 'AI request was rejected' };
  if (error instanceof Anthropic.APIConnectionError) return { status: 502, error: 'Could not reach the AI service' };
  if (error instanceof Anthropic.APIError) return { status: 502, error: `AI service error (${error.status ?? 'unknown'})` };
  return { status: 500, error: 'AI request failed' };
}
