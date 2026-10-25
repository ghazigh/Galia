import type { z } from 'zod';

export type AiErrorCode = 'auth' | 'rate_limited' | 'unavailable' | 'refused' | 'invalid' | 'upstream';

/** Provider-agnostic failure, mapped to an HTTP status by the route. */
export class AiError extends Error {
  constructor(
    readonly code: AiErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export interface GenerateRequest<T> {
  system: string;
  user: string;
  schema: z.ZodType<T>;
  /** Identifier for the output schema (required by some providers). */
  schemaName: string;
  /** Reasoning depth: quick extraction vs. considered advice. */
  effort: 'low' | 'medium';
}

/** An LLM hosted on Azure that can return JSON matching a schema. */
export interface AiProvider {
  readonly name: string;
  generate<T>(request: GenerateRequest<T>): Promise<T>;
}
