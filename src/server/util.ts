import { createHash, randomBytes } from 'node:crypto';

/** URL-safe random id (96 bits). */
export function newId(): string {
  return randomBytes(12).toString('base64url');
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('base64url');
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function parseJson<T>(value: string | null, fallback: T): T {
  if (value === null || value === '') return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

/** Errors with an HTTP status that route handlers can throw. */
export class HttpError extends Error {
  constructor(
    readonly status: 400 | 401 | 403 | 404 | 409 | 410 | 422 | 429 | 500 | 503,
    message: string,
    readonly code?: string,
  ) {
    super(message);
  }
}
