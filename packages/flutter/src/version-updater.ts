import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { parse } from 'yaml';
import type { PubspecInfo } from './types.js';

export class PubspecVersionUpdater {
  async readPubspec(cwd: string = process.cwd()): Promise<PubspecInfo> {
    const pubspecPath = join(cwd, 'pubspec.yaml');
    const content = await readFile(pubspecPath, 'utf8');
    const parsed = parse(content);
    
    if (typeof parsed !== 'object' || parsed === null) {
      throw new Error('Invalid pubspec.yaml format');
    }

    return {
      name: (parsed as Record<string, unknown>).name as string,
      version: (parsed as Record<string, unknown>).version as string,
      description: (parsed as Record<string, unknown>).description as string | undefined,
    };
  }

  async updateVersion(versionString: string, cwd: string = process.cwd()): Promise<void> {
    const pubspecPath = join(cwd, 'pubspec.yaml');
    const content = await readFile(pubspecPath, 'utf8');
    
    // Updates version line e.g. version: 2.5.0+250 preserving comments and structure in pubspec.yaml
    const updatedContent = content.replace(/^version:\s*.*$/m, `version: ${versionString}`);
    
    await writeFile(pubspecPath, updatedContent, 'utf8');
  }
}
