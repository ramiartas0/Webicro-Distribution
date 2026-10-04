import type { ParsedCommit, VersionBump } from '@webicro/git';
import { determineVersionBump } from '@webicro/git';
import type { SemanticVersion, VersionResolution } from './types.js';
import { parseVersion, formatVersion, bumpVersion } from './semver.js';

export interface VersionResolverOptions {
  strategy?: 'conventional-commits' | 'manual';
}

export class VersionResolver {
  private readonly strategy: 'conventional-commits' | 'manual';

  constructor(options?: VersionResolverOptions) {
    this.strategy = options?.strategy || 'conventional-commits';
  }

  public getStrategy(): 'conventional-commits' | 'manual' {
    return this.strategy;
  }

  resolve(params: {
    currentVersion: string;
    commits: ParsedCommit[];
    manualVersion?: string;
    manualBump?: VersionBump;
  }): VersionResolution {
    const current = parseVersion(params.currentVersion);
    let next: SemanticVersion;
    let bump: VersionBump = 'none';
    let isManual = false;

    if (params.manualVersion) {
      next = parseVersion(params.manualVersion);
      isManual = true;
    } else if (params.manualBump) {
      bump = params.manualBump;
      next = bumpVersion(current, bump);
      isManual = true;
    } else {
      bump = determineVersionBump(params.commits);
      if (bump === 'none') {
        throw new Error('No commits warrant a version bump. Explicit release required.');
      }
      next = bumpVersion(current, bump);
    }

    if (!params.manualVersion || next.buildNumber === 0) {
      next.buildNumber = current.buildNumber + 1;
    }

    const versionString = `${next.major}.${next.minor}.${next.patch}`;
    const buildNumberString = next.buildNumber.toString();

    return {
      current,
      next,
      bump,
      isManual,
      formatted: formatVersion(next),
      versionString,
      buildNumberString,
    };
  }
}
