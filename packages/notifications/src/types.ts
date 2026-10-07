export interface NotificationPayload {
  releaseId: string;
  project: string;
  version: string;
  buildNumber: number;
  status: 'SUCCESS' | 'FAILED' | 'PARTIAL_SUCCESS';
  androidStatus?: string;
  iosStatus?: string;
  error?: string;
  notes?: string;
}

export interface ReviewNotificationPayload {
  project: string;
  version: string;
  store: 'apple' | 'google';
  oldStatus?: string;
  newStatus: string;
  rejectionDiagnosis?: {
    guidelineOrPolicy: string;
    rootCause: string;
    appealDraft?: string;
  };
}

