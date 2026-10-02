import { describe, it, expect } from 'vitest';
import { parseVersion, formatVersion, bumpVersion } from '../packages/versioning/src/semver.js';
import { VersionResolver } from '../packages/versioning/src/resolver.js';
import type { ParsedCommit } from '../packages/git/src/types.js';

describe('Versioning & SemVer', () => {
  it('should correctly parse and format semantic versions', () => {
    const semver = parseVersion('2.4.1+240');
    expect(semver.major).toBe(2);
    expect(semver.minor).toBe(4);
    expect(semver.patch).toBe(1);
    expect(semver.buildNumber).toBe(240);

    const formatted = formatVersion(semver);
    expect(formatted).toBe('2.4.1+240');
  });

  it('should correctly bump version', () => {
    const semver = parseVersion('2.4.1+240');
    const bumped = bumpVersion(semver, 'minor');
    expect(bumped.major).toBe(2);
    expect(bumped.minor).toBe(5);
    expect(bumped.patch).toBe(0);
  });

  it('should resolve next version using conventional commits', () => {
    const resolver = new VersionResolver();
    const commits: ParsedCommit[] = [
      {
        hash: '123',
        type: 'feat',
        scope: 'courier',
        message: 'courier pool settings',
        body: null,
        isBreakingChange: false,
        raw: 'feat(courier): courier pool settings'
      }
    ];

    const resolution = resolver.resolve({
      currentVersion: '2.4.0+249',
      commits
    });

    expect(resolution.next.major).toBe(2);
    expect(resolution.next.minor).toBe(5);
    expect(resolution.next.patch).toBe(0);
    expect(resolution.next.buildNumber).toBe(250);
    expect(resolution.formatted).toBe('2.5.0+250');
  });
});
