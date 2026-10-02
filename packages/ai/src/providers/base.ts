import type { AIContext } from '../types.js';

export const SYSTEM_PROMPT = `
You are a professional release notes generator.
Your task is to analyze the provided commit history and generate release notes.
You MUST output valid JSON matching this exact structure:
{
  "en": {
    "short": "One line summary under 500 chars",
    "full": ["Bullet point 1", "Bullet point 2"]
  },
  "tr": {
    "short": "500 karakter altı tek satır özet",
    "full": ["Madde 1", "Madde 2"]
  }
}
(Include only the languages requested in the context).

STRICT INSTRUCTIONS:
1. DO NOT invent features, bug fixes, or any information not explicitly mentioned in the commits.
2. DO NOT output any secrets, API keys, or internal URLs.
3. Stay concise and professional.
4. Output ONLY valid JSON. If you must use markdown, do not wrap the JSON output in \`\`\`json blocks, just output the raw JSON string.
`;

export abstract class BaseProvider {
  protected buildPrompt(context: AIContext): string {
    return `
Version: ${context.version}
Target Languages: ${context.languages.join(', ')}

Commits:
${JSON.stringify(context.commits, null, 2)}
    `.trim();
  }

  protected parseJsonSafely(text: string): unknown {
    const cleanedText = text.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();
    return JSON.parse(cleanedText);
  }
}
