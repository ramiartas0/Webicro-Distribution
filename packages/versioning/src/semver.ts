import type { VersionBump } from '@webicro/git';
import type { SemanticVersion } from './types.js';

export function parseVersion(versionString: string): SemanticVersion {
  const [ver, build] = versionString.split('+');
  const parts = (ver || '').split('.');

  const major = parseInt(parts[0] || '0', 10);
  const minor = parseInt(parts[1] || '0', 10);
  const patch = parseInt(parts[2] || '0', 10);
  const buildNumber = build ? parseInt(build, 10) : 0;

  if (isNaN(major) || isNaN(minor) || isNaN(patch) || isNaN(buildNumber)) {
    throw new Error(`Invalid version format: ${versionString}`);
  }

  return { major, minor, patch, buildNumber };
}

export function formatVersion(version: SemanticVersion): string {
  const base = `${version.major}.${version.minor}.${version.patch}`;
  return version.buildNumber > 0 ? `${base}+${version.buildNumber}` : base;
}

export function compareVersions(a: SemanticVersion, b: SemanticVersion): number {
  if (a.major !== b.major) return a.major > b.major ? 1 : -1;
  if (a.minor !== b.minor) return a.minor > b.minor ? 1 : -1;
  if (a.patch !== b.patch) return a.patch > b.patch ? 1 : -1;
  if (a.buildNumber !== b.buildNumber) return a.buildNumber > b.buildNumber ? 1 : -1;
  return 0;
}

export function bumpVersion(current: SemanticVersion, bump: VersionBump): SemanticVersion {
  const next = { ...current };

  switch (bump) {
    case 'major':
      next.major += 1;
      next.minor = 0;
      next.patch = 0;
      break;
    case 'minor':
      next.minor += 1;
      next.patch = 0;
      break;
    case 'patch':
      next.patch += 1;
      break;
    case 'none':
    default:
      break;
  }

  return next;
}

export function incrementBuildNumber(version: SemanticVersion): SemanticVersion {
  return {
    ...version,
    buildNumber: version.buildNumber + 1,
  };
}
