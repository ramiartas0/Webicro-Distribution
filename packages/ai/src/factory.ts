import type { AIProvider, AIProviderConfig, AIProviderType } from './types.js';
import { GeminiProvider } from './providers/gemini.js';
import { OpenAIProvider } from './providers/openai.js';
import { AnthropicProvider } from './providers/anthropic.js';
import { ConventionalReleaseNotesProvider } from './providers/conventional.js';

export function createAIProvider(config?: AIProviderConfig): AIProvider {
  const providerType: AIProviderType = config?.provider || 'conventional';
  const customKey = config?.apiKey?.trim();
  const customModel = config?.model?.trim();

  switch (providerType) {
    case 'gemini': {
      const apiKey = customKey || process.env['GEMINI_API_KEY'];
      if (apiKey) {
        return new GeminiProvider({ apiKey, model: customModel || 'gemini-1.5-flash' });
      }
      return new ConventionalReleaseNotesProvider();
    }

    case 'openai': {
      const apiKey = customKey || process.env['OPENAI_API_KEY'];
      if (apiKey) {
        return new OpenAIProvider({ apiKey, model: customModel || 'gpt-4o-mini' });
      }
      return new ConventionalReleaseNotesProvider();
    }

    case 'anthropic': {
      const apiKey = customKey || process.env['ANTHROPIC_API_KEY'];
      if (apiKey) {
        return new AnthropicProvider({ apiKey, model: customModel || 'claude-3-5-sonnet-20241022' });
      }
      return new ConventionalReleaseNotesProvider();
    }

    case 'conventional':
    default: {
      // Eğer spesifik bir sağlayıcı seçilmemiş ama ortam değişkenlerinde anahtar varsa akıllı tespit:
      if (!config?.provider) {
        const geminiKey = process.env['GEMINI_API_KEY'];
        if (geminiKey) return new GeminiProvider({ apiKey: geminiKey });

        const openAiKey = process.env['OPENAI_API_KEY'];
        if (openAiKey) return new OpenAIProvider({ apiKey: openAiKey });

        const anthropicKey = process.env['ANTHROPIC_API_KEY'];
        if (anthropicKey) return new AnthropicProvider({ apiKey: anthropicKey });
      }

      return new ConventionalReleaseNotesProvider();
    }
  }
}
