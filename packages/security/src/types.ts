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

export type CertificateHealthStatus = 'HEALTHY' | 'WARNING' | 'EXPIRED' | 'NOT_CONFIGURED';

export interface CertificateItemStatus {
  name: string;
  type: 'APPLE_CERT' | 'APPLE_PROFILE' | 'ANDROID_KEYSTORE';
  expirationDate: string;
  daysRemaining: number;
  isExpired: boolean;
  status: 'VALID' | 'WARNING' | 'EXPIRED';
  details?: string;
}

export interface CertificateHealthReport {
  overallStatus: CertificateHealthStatus;
  minDaysRemaining: number;
  items: CertificateItemStatus[];
  warnings: string[];
  errors: string[];
}

