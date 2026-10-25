import type { Config } from '../config';
import { createAzureOpenAiProvider } from './azure-openai';
import { createFoundryProvider } from './foundry';
import type { AiProvider } from './types';

/** Builds the configured provider, or null when AI features are switched off. */
export function createAiProvider(config: Config): AiProvider | null {
  const { ai } = config;
  if (ai.provider === 'foundry') {
    if (!ai.foundry.apiKey || (!ai.foundry.resource && !ai.foundry.baseUrl)) {
      console.warn(
        '[ai] AI_PROVIDER=foundry needs ANTHROPIC_FOUNDRY_API_KEY and ANTHROPIC_FOUNDRY_RESOURCE (or ANTHROPIC_FOUNDRY_BASE_URL); AI features disabled.',
      );
      return null;
    }
    return createFoundryProvider({
      apiKey: ai.foundry.apiKey,
      resource: ai.foundry.resource,
      baseUrl: ai.foundry.baseUrl,
      model: ai.model,
      fallbackModel: process.env.AI_FALLBACK_MODEL?.trim() || null,
    });
  }
  if (ai.provider === 'azure-openai') {
    const { endpoint, apiKey, deployment, apiVersion } = ai.azureOpenAi;
    if (!endpoint || !apiKey || !deployment) {
      console.warn(
        '[ai] AI_PROVIDER=azure-openai needs AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_API_KEY and AZURE_OPENAI_DEPLOYMENT; AI features disabled.',
      );
      return null;
    }
    return createAzureOpenAiProvider({ endpoint, apiKey, deployment, apiVersion });
  }
  return null;
}
