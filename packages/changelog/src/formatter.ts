import fs from 'node:fs/promises';
import { dirname } from 'node:path';
import type { ChangelogRelease } from './types.js';

export function formatReleaseMarkdown(release: ChangelogRelease): string {
  const parts: string[] = [];
  
  parts.push(`## ${release.version} (${release.date})`);
  
  for (const section of release.sections) {
    if (section.items.length === 0) continue;
    parts.push(`\n### ${section.title}`);
    for (const item of section.items) {
      parts.push(`- ${item}`);
    }
  }
  
  return parts.join('\n') + '\n';
}

export async function prependToChangelogFile(filePath: string, newContent: string): Promise<void> {
  try {
    await fs.mkdir(dirname(filePath), { recursive: true });
    
    let existingContent = '';
    try {
      existingContent = await fs.readFile(filePath, 'utf-8');
    } catch (error: unknown) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
        existingContent = '# Changelog\n\nAll notable changes to this project will be documented in this file.\n\n';
      } else {
        throw error;
      }
    }
    
    const headerPattern = /^# Changelog[^\n]*\n+All notable changes[^\n]*\n+/i;
    const match = headerPattern.exec(existingContent);
    
    if (match) {
      const before = existingContent.substring(0, match[0].length);
      const after = existingContent.substring(match[0].length);
      await fs.writeFile(filePath, `${before}${newContent}\n${after}`, 'utf-8');
    } else {
      await fs.writeFile(filePath, `${newContent}\n${existingContent}`, 'utf-8');
    }
  } catch (error: unknown) {
    throw new Error(`Failed to prepend to changelog file: ${error instanceof Error ? error.message : String(error)}`);
  }
}
