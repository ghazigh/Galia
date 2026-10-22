import { AnthropicFoundry } from '@anthropic-ai/foundry-sdk';
import Anthropic, { betaRefusalFallbackMiddleware } from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { AiError, type AiProvider, type GenerateRequest } from './types';

export interface FoundryOptions {
  apiKey: string;
  /** Foundry resource name → https://{resource}.services.ai.azure.com/anthropic/ */
  resource: string | null;
  /** Full base URL instead of a resource name. */
  baseUrl: string | null;
  /** Model deployment name in Foundry (defaults to the model id). */
  model: string;
  /** Optional second deployment to retry on if the model declines a request. */
  fallbackModel: string | null;
}

function toAiError(err: unknown): AiError {
  if (err instanceof AiError) return err;
  if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
    return new AiError('auth', 'The Foundry API key was rejected.');
  }
  if (err instanceof Anthropic.NotFoundError) {
    return new AiError('auth', 'Model deployment not found — check AI_MODEL and the Foundry resource.');
  }
  if (err instanceof Anthropic.RateLimitError) {
    return new AiError('rate_limited', 'The AI service is busy. Try again in a minute.');
  }
  if (err instanceof Anthropic.APIConnectionError) {
    return new AiError('unavailable', 'Could not reach the AI service.');
  }
  if (err instanceof Anthropic.APIError) {
    return new AiError('upstream', `The AI service returned an error (${err.status ?? 'unknown'}).`);
  }
  if (err instanceof Anthropic.AnthropicError) {
    // Raised by the parser when the output does not match the schema.
    return new AiError('invalid', 'The assistant returned an answer in an unexpected shape.');
  }
  return new AiError('upstream', err instanceof Error ? err.message : 'Unknown AI error');
}

/** Claude on Microsoft Foundry (Azure), via the official Foundry SDK with structured outputs. */
export function createFoundryProvider(options: FoundryOptions): AiProvider {
  const client = new AnthropicFoundry({
    apiKey: options.apiKey,
    ...(options.baseUrl ? { baseURL: options.baseUrl } : { resource: options.resource }),
    timeout: 90_000,
    maxRetries: 2,
    middleware: options.fallbackModel
      ? [betaRefusalFallbackMiddleware([{ model: options.fallbackModel }])]
      : [],
  });

  return {
    name: 'Claude on Microsoft Foundry',
    async generate<T>(request: GenerateRequest<T>): Promise<T> {
      try {
        const message = await client.beta.messages.parse({
          model: options.model,
          max_tokens: 16000,
          system: request.system,
          messages: [{ role: 'user', content: request.user }],
          output_config: { effort: request.effort, format: betaZodOutputFormat(request.schema) },
        });
        if (message.stop_reason === 'refusal') {
          throw new AiError('refused', 'The assistant declined this request.');
        }
        if (message.stop_reason === 'max_tokens' || message.parsed_output == null) {
          throw new AiError('invalid', 'The assistant returned an incomplete answer.');
        }
        return message.parsed_output as T;
      } catch (err) {
        throw toAiError(err);
      }
    },
  };
}
