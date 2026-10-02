import type { ReleaseNotesMap } from '@webicro/validation';
import type { AIProvider, AIContext } from '../types.js';

function capItemsToLimit(items: string[], maxTotalChars = 450): string[] {
  const result: string[] = [];
  let currentLen = 0;
  for (const item of items) {
    const itemLen = item.length + (result.length > 0 ? 1 : 0);
    if (currentLen + itemLen > maxTotalChars) {
      break;
    }
    result.push(item);
    currentLen += itemLen;
  }
  if (result.length === 0 && items.length > 0 && items[0]) {
    result.push(items[0].slice(0, maxTotalChars));
  }
  return result;
}

export class ConventionalReleaseNotesProvider implements AIProvider {
  public readonly name = 'conventional-commits';

  public async generateReleaseNotes(context: AIContext): Promise<ReleaseNotesMap> {
    const notes: ReleaseNotesMap = {};

    const features: string[] = [];
    const fixes: string[] = [];
    const improvements: string[] = [];

    for (const c of context.commits) {
      const firstLine = c.message.split('\n')[0]?.trim() || '';
      if (!firstLine) continue;

      let cleanMsg = firstLine;
      const match = firstLine.match(/^[a-z]+(?:\([a-z0-9_-]+\))?:\s*(.+)$/i);
      if (match && match[1]) {
        cleanMsg = match[1].trim();
      }

      cleanMsg = cleanMsg.charAt(0).toUpperCase() + cleanMsg.slice(1);

      if (c.type === 'feat') {
        features.push(cleanMsg);
      } else if (c.type === 'fix') {
        fixes.push(cleanMsg);
      } else {
        improvements.push(cleanMsg);
      }
    }

    for (const lang of context.languages) {
      if (lang === 'tr') {
        const fullItems: string[] = [];
        for (const f of features) fullItems.push(`Yeni Özellik: ${f}`);
        for (const f of fixes) fullItems.push(`Düzeltme: ${f}`);
        for (const i of improvements) fullItems.push(`İyileştirme: ${i}`);

        if (fullItems.length === 0) {
          fullItems.push('Performans iyileştirmeleri ve hata düzeltmeleri yapıldı.');
        }

        const capped = capItemsToLimit(fullItems, 450);
        const short = `Sürüm ${context.version}: ${capped.slice(0, 2).join(' ')}`.slice(0, 450);
        notes['tr'] = {
          short,
          full: capped,
        };
      } else {
        const fullItems: string[] = [];
        for (const f of features) fullItems.push(`Feature: ${f}`);
        for (const f of fixes) fullItems.push(`Fix: ${f}`);
        for (const i of improvements) fullItems.push(`Improvement: ${i}`);

        if (fullItems.length === 0) {
          fullItems.push('General performance enhancements and bug fixes.');
        }

        const capped = capItemsToLimit(fullItems, 450);
        const short = `Release ${context.version}: ${capped.slice(0, 2).join(' ')}`.slice(0, 450);
        notes[lang] = {
          short,
          full: capped,
        };
      }
    }

    return notes;
  }
}
