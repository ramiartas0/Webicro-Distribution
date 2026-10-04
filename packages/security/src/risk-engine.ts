import type { ReleaseRiskAssessment, RiskFactor } from './types.js';

export class RiskEngine {
  calculateRisk(params: {
    hasNativeChanges: boolean;
    isBreakingChange: boolean;
    commitsCount: number;
    changedFilesCount: number;
  }): ReleaseRiskAssessment {
    const factors: RiskFactor[] = [];
    let totalScore = 0;

    if (params.hasNativeChanges) {
      factors.push({ name: 'Native Changes', score: 30, reason: 'Includes native iOS/Android code modifications.' });
      totalScore += 30;
    }

    if (params.isBreakingChange) {
      factors.push({ name: 'Breaking Change', score: 30, reason: 'Marked as a breaking change.' });
      totalScore += 30;
    }

    if (params.changedFilesCount > 20) {
      factors.push({ name: 'Large File Count', score: 15, reason: 'More than 20 files changed.' });
      totalScore += 15;
    }

    if (params.commitsCount > 30) {
      factors.push({ name: 'High Commit Volume', score: 15, reason: 'More than 30 commits included.' });
      totalScore += 15;
    }

    let riskLevel: ReleaseRiskAssessment['riskLevel'];
    if (totalScore < 25) {
      riskLevel = 'LOW';
    } else if (totalScore <= 50) {
      riskLevel = 'MEDIUM';
    } else {
      riskLevel = 'HIGH';
    }

    return {
      totalScore,
      riskLevel,
      factors,
      requiresApproval: riskLevel === 'HIGH',
    };
  }
}
