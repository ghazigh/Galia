import { z } from 'zod';
import { AiError, type AiProvider, type GenerateRequest } from './types';

export interface AzureOpenAiOptions {
  endpoint: string;
  apiKey: string;
  deployment: string;
  apiVersion: string;
}

type JsonSchema = Record<string, unknown>;

/** Strict-mode JSON schema: every object closed, every property required, no numeric bounds. */
export function strictJsonSchema(schema: z.ZodType): JsonSchema {
  const visit = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(visit);
    if (!node || typeof node !== 'object') return node;
    const out: JsonSchema = {};
    for (const [key, value] of Object.entries(node)) {
      if (['$schema', 'minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'format'].includes(key)) {
        continue;
      }
      out[key] = visit(value);
    }
    if (out.type === 'object' && out.properties && typeof out.properties === 'object') {
      out.additionalProperties = false;
      out.required = Object.keys(out.properties);
    }
    return out;
  };
  return visit(z.toJSONSchema(schema)) as JsonSchema;
}

/** Alternative provider: an Azure OpenAI deployment with JSON-schema structured outputs. */
export function createAzureOpenAiProvider(options: AzureOpenAiOptions): AiProvider {
  const url =
    `${options.endpoint}/openai/deployments/${encodeURIComponent(options.deployment)}` +
    `/chat/completions?api-version=${encodeURIComponent(options.apiVersion)}`;

  return {
    name: 'Azure OpenAI',
    async generate<T>(request: GenerateRequest<T>): Promise<T> {
      let res: Response;
      try {
        res = await fetch(url, {
          method: 'POST',
          headers: { 'api-key': options.apiKey, 'content-type': 'application/json' },
          body: JSON.stringify({
            messages: [
              { role: 'system', content: request.system },
              { role: 'user', content: request.user },
            ],
            response_format: {
              type: 'json_schema',
              json_schema: {
                name: request.schemaName,
                strict: true,
                schema: strictJsonSchema(request.schema),
              },
            },
          }),
          signal: AbortSignal.timeout(90_000),
        });
      } catch {
        throw new AiError('unavailable', 'Could not reach Azure OpenAI.');
      }
      if (res.status === 401 || res.status === 403 || res.status === 404) {
        throw new AiError('auth', 'Azure OpenAI rejected the request — check the endpoint, key and deployment.');
      }
      if (res.status === 429) throw new AiError('rate_limited', 'Azure OpenAI is busy. Try again in a minute.');
      if (!res.ok) throw new AiError('upstream', `Azure OpenAI returned an error (${res.status}).`);
      const body = (await res.json()) as {
        choices?: { message?: { content?: string | null; refusal?: string | null } }[];
      };
      const message = body.choices?.[0]?.message;
      if (message?.refusal) throw new AiError('refused', 'The assistant declined this request.');
      try {
        return request.schema.parse(JSON.parse(message?.content ?? ''));
      } catch {
        throw new AiError('invalid', 'The assistant returned an answer in an unexpected shape.');
      }
    },
  };
}
