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
