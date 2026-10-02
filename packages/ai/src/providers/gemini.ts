import { GoogleGenerativeAI } from '@google/generative-ai';
import type { ReleaseNotesMap } from '@webicro/validation';
import type { AIProvider, AIContext, AIProviderConfig } from '../types.js';
import { BaseProvider, SYSTEM_PROMPT } from './base.js';

export class GeminiProvider extends BaseProvider implements AIProvider {
  public readonly name = 'gemini';
  private ai: GoogleGenerativeAI;
  private modelName: string;

  constructor(config: AIProviderConfig) {
    super();
    if (!config.apiKey) {
      throw new Error('Gemini API key is required');
    }
    this.ai = new GoogleGenerativeAI(config.apiKey);
    this.modelName = config.model ?? 'gemini-1.5-pro';
  }

  public async generateReleaseNotes(context: AIContext): Promise<ReleaseNotesMap> {
    const model = this.ai.getGenerativeModel({
      model: this.modelName,
      systemInstruction: SYSTEM_PROMPT,
      generationConfig: {
        responseMimeType: 'application/json',
      }
    });

    const prompt = this.buildPrompt(context);
    const result = await model.generateContent(prompt);
    const text = result.response.text();

    return this.parseJsonSafely(text) as ReleaseNotesMap;
  }
}
