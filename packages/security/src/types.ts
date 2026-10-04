export interface SecurityIssue {
  type: 'SECRET_EXPOSED' | 'SUSPICIOUS_KEY' | 'UNPROTECTED_FILE';
  file: string;
  line?: number;
  description: string;
  severity: 'high' | 'critical' | 'medium';
}

export interface RiskFactor {
  name: string;
  score: number;
  reason: string;
}

export interface ReleaseRiskAssessment {
  totalScore: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  factors: RiskFactor[];
  requiresApproval: boolean;
}
