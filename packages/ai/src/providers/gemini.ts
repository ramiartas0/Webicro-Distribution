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
    this.modelName = config.model ?? 'gemini-3.1-flash-lite';
    if (this.modelName.startsWith('gemini-1.5') || this.modelName === 'gemini-2.5-flash') {
      this.modelName = 'gemini-3.1-flash-lite';
    }
  }

  public async generateReleaseNotes(context: AIContext): Promise<ReleaseNotesMap> {
    const prompt = this.buildPrompt(context);

    const candidateModels = [this.modelName, 'gemini-3.1-flash-lite', 'gemini-3.5-flash'];
    const uniqueCandidates = Array.from(new Set(candidateModels));

    let lastError: unknown;
    for (const candidate of uniqueCandidates) {
      try {
        const model = this.ai.getGenerativeModel({
          model: candidate,
          systemInstruction: SYSTEM_PROMPT,
          generationConfig: {
            responseMimeType: 'application/json',
            maxOutputTokens: 600,
            temperature: 0.1,
          }
        });
        const result = await model.generateContent(prompt);
        const text = result.response.text();
        return this.parseJsonSafely(text) as ReleaseNotesMap;
      } catch (err: unknown) {
        lastError = err;
        const errMsg = err instanceof Error ? err.message : String(err);

        if (errMsg.includes('404') || errMsg.includes('503') || errMsg.includes('not found') || errMsg.includes('high demand')) {
          continue;
        }
        throw err;
      }
    }
    throw lastError;
  }
}
