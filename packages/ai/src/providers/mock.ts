import type { ReleaseNotesMap } from '@webicro/validation';
import type { AIProvider, AIContext } from '../types.js';

export class MockAIProvider implements AIProvider {
  public readonly name = 'mock';

  public async generateReleaseNotes(context: AIContext): Promise<ReleaseNotesMap> {
    const notes: ReleaseNotesMap = {};

    for (const lang of context.languages) {
      notes[lang] = {
        short: `Mocked release for version ${context.version} in ${lang}`,
        full: context.commits.map(c => `Mocked: ${c.message.split('\\n')[0]}`)
      };
    }

    return notes;
  }
}
