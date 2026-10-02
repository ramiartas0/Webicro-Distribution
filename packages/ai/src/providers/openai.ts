import OpenAI from 'openai';
import type { ReleaseNotesMap } from '@webicro/validation';
import type { AIProvider, AIContext, AIProviderConfig } from '../types.js';
import { BaseProvider, SYSTEM_PROMPT } from './base.js';

export class OpenAIProvider extends BaseProvider implements AIProvider {
  public readonly name = 'openai';
  private client: OpenAI;
  private modelName: string;

  constructor(config: AIProviderConfig) {
    super();
    if (!config.apiKey) {
      throw new Error('OpenAI API key is required');
    }
    this.client = new OpenAI({ apiKey: config.apiKey });
    this.modelName = config.model ?? 'gpt-4o';
  }

  public async generateReleaseNotes(context: AIContext): Promise<ReleaseNotesMap> {
    const prompt = this.buildPrompt(context);
    const response = await this.client.chat.completions.create({
      model: this.modelName,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: prompt }
      ]
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No response from OpenAI');
    }

    return this.parseJsonSafely(content) as ReleaseNotesMap;
  }
}
