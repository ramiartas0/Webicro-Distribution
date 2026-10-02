import type { ParsedCommit } from '@webicro/git';
import type { AIContext } from './types.js';

const MEANINGFUL_TYPES = new Set(['feat', 'fix', 'perf', 'refactor']);
const MAX_COMMITS_FOR_AI = 25;

export function buildAIContext(version: string, commits: ParsedCommit[], languages?: string[]): AIContext {
  // 1. Kullanıcıya dönük ve mağaza notu için anlamlı commit'leri önceliklendir
  const meaningful = commits.filter(
    (c) => c.isBreakingChange || MEANINGFUL_TYPES.has(c.type?.toLowerCase() ?? '')
  );

  // Anlamlı commit varsa onları, yoksa en son yapılan commit'leri seç
  const selectedCommits = (meaningful.length > 0 ? meaningful : commits).slice(0, MAX_COMMITS_FOR_AI);

  const normalizedCommits = selectedCommits.map((commit) => {
    // Mesajı sade ve tek satırlık tut, gereksiz uzun commit body'leri buda
    const firstLine = commit.message.split('\n')[0]?.trim() || commit.message;
    return {
      type: commit.type ?? 'chore',
      scope: commit.scope ?? null,
      message: firstLine,
      isBreakingChange: commit.isBreakingChange,
    };
  });

  return {
    version,
    commits: normalizedCommits,
    languages: languages ?? ['en'],
  };
}
