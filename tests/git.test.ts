import { describe, it, expect } from 'vitest';
import {
  parseConventionalCommit,
  determineVersionBump,
} from '../packages/git/src/commit-parser.js';

describe('Git Conventional Commit Parser', () => {
  it('should parse feat commit as minor bump', () => {
    const commit = parseConventionalCommit('feat(auth): add biometrics login', 'abc1234');
    expect(commit.type).toBe('feat');
    expect(commit.scope).toBe('auth');
    expect(commit.message).toBe('add biometrics login');
    expect(commit.isBreakingChange).toBe(false);

    const bump = determineVersionBump([commit]);
    expect(bump).toBe('minor');
  });

  it('should parse fix commit as patch bump', () => {
    const commit = parseConventionalCommit('fix: correct calculation in cart', 'def5678');
    expect(commit.type).toBe('fix');
    expect(commit.scope).toBeNull();
    expect(commit.message).toBe('correct calculation in cart');

    const bump = determineVersionBump([commit]);
    expect(bump).toBe('patch');
  });

  it('should detect breaking changes as major bump', () => {
    const commit = parseConventionalCommit('feat!: remove deprecated checkout api', 'ghi9012');
    expect(commit.isBreakingChange).toBe(true);

    const bump = determineVersionBump([commit]);
    expect(bump).toBe('major');
  });

  it('should correctly parse SSH and HTTPS remote URLs for GitHub', async () => {
    const { parseRemoteWebUrl } = await import('../packages/git/src/operations.js');

    const sshResult = parseRemoteWebUrl('git@github.com:webicro/piyyuu.git');
    expect(sshResult.webUrl).toBe('https://github.com/webicro/piyyuu');
    expect(sshResult.ownerRepo).toBe('webicro/piyyuu');
    expect(sshResult.provider).toBe('github');

    const httpsResult = parseRemoteWebUrl('https://github.com/webicro/piyyuu.git');
    expect(httpsResult.webUrl).toBe('https://github.com/webicro/piyyuu');
    expect(httpsResult.ownerRepo).toBe('webicro/piyyuu');
    expect(httpsResult.provider).toBe('github');
  });
});
