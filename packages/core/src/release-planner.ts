import type { VersionResolution } from '@webicro/versioning';
import type { OrchestratorOptions } from './types.js';

export interface ReleasePlan {
  steps: string[];
  estimatedDurationMs: number;
  versionResolution: VersionResolution;
  requiresManualApproval: boolean;
}

export class ReleasePlanner {
  public createPlan(
    resolution: VersionResolution,
    options: OrchestratorOptions
  ): ReleasePlan {
    const steps: string[] = [
      'ENVIRONMENT_CHECK',
      'DATABASE_INIT',
      'GIT_ANALYSIS',
      'VERSION_RESOLUTION',
      'CHANGELOG_GENERATION',
      'NOTES_GENERATION',
      'NOTES_VALIDATION',
      'PUBSPEC_UPDATE',
      'FLUTTER_CHECK'
    ];

    if (!options.skipTests) {
      steps.push('RUN_TESTS');
    }

    if (!options.validateOnly && !options.skipAndroid) {
      steps.push('ANDROID_BUILD');
      steps.push('ANDROID_VERIFICATION');
      if (!options.buildOnly) {
        steps.push('GOOGLE_PLAY_UPLOAD');
      }
    }

    if (!options.validateOnly && !options.skipIos) {
      steps.push('IOS_BUILD');
      steps.push('IOS_VERIFICATION');
      if (!options.buildOnly) {
        steps.push('APP_STORE_UPLOAD');
      }
    }

    steps.push('FINAL_REVIEW');
    steps.push('AUDIT_COMPLETION');

    return {
      steps,
      estimatedDurationMs: steps.length * 60000, // 1 minute per step avg
      versionResolution: resolution,
      requiresManualApproval: !options.autoApprove
    };
  }
}
