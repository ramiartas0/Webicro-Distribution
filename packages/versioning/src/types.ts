import type { VersionBump } from '@webicro/git';

export interface SemanticVersion {
  major: number;
  minor: number;
  patch: number;
  buildNumber: number;
}

export interface VersionResolution {
  current: SemanticVersion;
  next: SemanticVersion;
  bump: VersionBump;
  isManual: boolean;
  formatted: string;
  versionString: string;
  buildNumberString: string;
}

export interface VersionConflict {
  source: string;
  existingVersion: string;
  existingBuildNumber: number;
  conflictType: 'version_exists' | 'build_number_exists' | 'higher_version_exists';
}
