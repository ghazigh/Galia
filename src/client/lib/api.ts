export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string,
  ) {
    super(message);
  }
}

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';

/** JSON fetch against the app's own API; errors surface the server's message. */
export async function api<T>(path: string, init: { method?: Method; body?: unknown } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method: init.method ?? (init.body === undefined ? 'GET' : 'POST'),
      headers: init.body === undefined ? undefined : { 'content-type': 'application/json' },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      credentials: 'same-origin',
    });
  } catch {
    throw new ApiError(0, 'You appear to be offline.');
  }
  if (res.status === 204) return undefined as T;
  const data = (await res.json().catch(() => null)) as { error?: string; code?: string } | null;
  if (!res.ok) {
    throw new ApiError(res.status, data?.error ?? `Something went wrong (${res.status}).`, data?.code);
  }
  return data as T;
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError || error instanceof Error) return error.message;
  return 'Something went wrong.';
}
