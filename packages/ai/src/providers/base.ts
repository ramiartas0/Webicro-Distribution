import type { AIContext } from '../types.js';

export const SYSTEM_PROMPT = `
You are an expert mobile app release notes copywriter for Google Play and Apple App Store.
Analyze the provided commit history and produce clean, customer-facing, high quality release notes.

You MUST output valid JSON matching this exact structure:
{
  "en": {
    "short": "One line summary under 500 characters",
    "full": [
      "• New: Added new courier dispatch features",
      "• Improvement: Faster order sync and smoother UI",
      "• Fix: Resolved printer Bluetooth connection issue"
    ]
  },
  "tr": {
    "short": "500 karakter altı tek satır özet",
    "full": [
      "• Yeni: Kurye havuz yönetimi özellikleri eklendi",
      "• İyileştirme: Sipariş senkronizasyonu hızlandırıldı ve arayüz akıcı hale getirildi",
      "• Düzeltme: Yazıcı Bluetooth bağlantı kopma sorunu giderildi"
    ]
  }
}
(Include only the languages requested in the context).

STRICT INSTRUCTIONS:
1. Every bullet item in the "full" array MUST begin with "• " (bullet character followed by space).
2. Use professional, customer-friendly store language (avoid raw git commit hashes, ticket IDs, or internal developer jargon).
3. The total characters of combined items in "full" should not exceed 480 characters to comply with Google Play 500-char limits.
4. DO NOT invent features or fixes not grounded in the commits.
5. DO NOT output any credentials, tokens, or internal URLs.
6. Output ONLY valid JSON, with no wrapping markdown code fences if possible.
`;

export abstract class BaseProvider {
  protected buildPrompt(context: AIContext): string {
    const commitLines = context.commits
      .map((c) => `- [${c.type}${c.scope ? `(${c.scope})` : ''}] ${c.message}`)
      .join('\n');

    return `
Version: ${context.version}
Target Languages: ${context.languages.join(', ')}

Recent Changes:
${commitLines}
    `.trim();
  }

  protected parseJsonSafely(text: string): unknown {
    const cleanedText = text
      .replace(/^```json\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();
    return JSON.parse(cleanedText);
  }
}
