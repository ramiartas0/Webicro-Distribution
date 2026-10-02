import type { ReleaseNotesMap } from '@webicro/validation';
import type { AIProvider, AIContext, AIProviderConfig } from '../types.js';
import { BaseProvider, SYSTEM_PROMPT } from './base.js';

export class AnthropicProvider extends BaseProvider implements AIProvider {
  public readonly name = 'anthropic';
  private apiKey: string;
  private modelName: string;

  constructor(config: AIProviderConfig) {
    super();
    if (!config.apiKey) {
      throw new Error('Anthropic API key is required');
    }
    this.apiKey = config.apiKey;
    this.modelName = config.model ?? 'claude-3-5-sonnet-20241022';
  }

  public async generateReleaseNotes(context: AIContext): Promise<ReleaseNotesMap> {
    const prompt = this.buildPrompt(context);

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: this.modelName,
        max_tokens: 1500,
        system: SYSTEM_PROMPT,
        messages: [
          { role: 'user', content: prompt },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Anthropic API error (${response.status}): ${errorText}`);
    }

    const data = await response.json() as {
      content?: Array<{ type: string; text?: string }>;
    };

    const textContent = data.content?.find((c) => c.type === 'text')?.text;
    if (!textContent) {
      throw new Error('No text content in Anthropic response');
    }

    return this.parseJsonSafely(textContent) as ReleaseNotesMap;
  }
}
