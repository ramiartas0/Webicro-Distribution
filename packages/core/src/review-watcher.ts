import type { AppStoreAdapter } from '@webicro/app-store';
import type { GooglePlayAdapter } from '@webicro/google-play';
import type { ReleaseNotifier, ReviewNotificationPayload } from '@webicro/notifications';
import { AIDiagnostician, type StoreRejectionDiagnosis } from '@webicro/ai';

export interface ReviewWatcherStatusUpdate {
  store: 'apple' | 'google';
  oldStatus?: string;
  newStatus: string;
  version: string;
  rejectionDiagnosis?: StoreRejectionDiagnosis;
}

export interface ReviewWatcherOptions {
  project: string;
  version: string;
  appStoreAdapter?: AppStoreAdapter;
  googlePlayAdapter?: GooglePlayAdapter;
  notifier?: ReleaseNotifier;
  webhooks?: string[];
  pollIntervalMs?: number;
  signal?: AbortSignal;
  onStatusChange?: (update: ReviewWatcherStatusUpdate) => void;
}

export class ReviewWatcher {
  private lastAppleStatus?: string;
  private lastGoogleStatus?: string;
  private intervalTimer: NodeJS.Timeout | null = null;
  private isPolling = false;

  constructor(private readonly options: ReviewWatcherOptions) {}

  /**
   * Hem Apple App Store hem de Google Play Console üzerindeki sürüm durumunu tek seferlik sorgular.
   * Durum değişikliği veya ret varsa bildirim ve AI teşhisi tetikler.
   */
  public async checkOnce(): Promise<{
    appleStatus?: string;
    googleStatus?: string;
    updates: ReviewWatcherStatusUpdate[];
  }> {
    const updates: ReviewWatcherStatusUpdate[] = [];

    // 1. Apple App Store Kontrolü
    if (this.options.appStoreAdapter) {
      try {
        const appleRes = await this.options.appStoreAdapter.getAppStoreVersionStatus(
          undefined,
          this.options.version,
        );

        if (appleRes) {
          const newStatus = appleRes.appStoreState;
          if (newStatus !== this.lastAppleStatus) {
            let diagnosis: StoreRejectionDiagnosis | undefined;
            const isRejected = [
              'REJECTED',
              'METADATA_REJECTED',
              'DEVELOPER_REJECTED',
              'INVALID_BINARY',
            ].includes(newStatus.toUpperCase());

            if (isRejected) {
              const rawMessage = (appleRes.rejectionReasons || []).join('\n') || `Version ${this.options.version} status is ${newStatus}`;
              diagnosis = AIDiagnostician.diagnoseStoreRejection('apple', rawMessage, {
                appName: this.options.project,
                version: this.options.version,
              });
            }

            const update: ReviewWatcherStatusUpdate = {
              store: 'apple',
              oldStatus: this.lastAppleStatus,
              newStatus,
              version: this.options.version,
              rejectionDiagnosis: diagnosis,
            };

            updates.push(update);
            this.lastAppleStatus = newStatus;
            this.options.onStatusChange?.(update);
            await this.notifyUpdate(update);
          }
        }
      } catch (appleErr) {
        console.warn(`[ReviewWatcher] Apple durum sorgusu hatası:`, appleErr);
      }
    }

    // 2. Google Play Store Kontrolü
    if (this.options.googlePlayAdapter) {
      try {
        const googleRes = await this.options.googlePlayAdapter.getTrackReleaseStatus();
        if (googleRes) {
          const newStatus = googleRes.status;
          if (newStatus !== this.lastGoogleStatus) {
            let diagnosis: StoreRejectionDiagnosis | undefined;
            const isRejected = ['HALTED', 'REJECTED', 'SUSPENDED'].includes(newStatus.toUpperCase());

            if (isRejected) {
              const rawMessage = `Google Play track ${googleRes.track} release is ${newStatus}`;
              diagnosis = AIDiagnostician.diagnoseStoreRejection('google', rawMessage, {
                appName: this.options.project,
                version: this.options.version,
              });
            }

            const update: ReviewWatcherStatusUpdate = {
              store: 'google',
              oldStatus: this.lastGoogleStatus,
              newStatus,
              version: this.options.version,
              rejectionDiagnosis: diagnosis,
            };

            updates.push(update);
            this.lastGoogleStatus = newStatus;
            this.options.onStatusChange?.(update);
            await this.notifyUpdate(update);
          }
        }
      } catch (googleErr) {
        console.warn(`[ReviewWatcher] Google Play durum sorgusu hatası:`, googleErr);
      }
    }

    return {
      appleStatus: this.lastAppleStatus,
      googleStatus: this.lastGoogleStatus,
      updates,
    };
  }

  /**
   * Arka plan periyodik gözlem döngüsünü başlatır.
   */
  public startPolling(): void {
    if (this.isPolling) return;
    this.isPolling = true;

    const interval = this.options.pollIntervalMs ?? 60_000;

    // İlk denetimi hemen çalıştır
    void this.checkOnce();

    this.intervalTimer = setInterval(() => {
      if (this.options.signal?.aborted) {
        this.stopPolling();
        return;
      }
      void this.checkOnce().then(({ appleStatus, googleStatus }) => {
        // Her iki mağazada da nihai duruma ulaşıldıysa polling durdurulabilir
        const appleFinished = !appleStatus || ['READY_FOR_SALE', 'REJECTED'].includes(appleStatus.toUpperCase());
        const googleFinished = !googleStatus || ['COMPLETED', 'HALTED'].includes(googleStatus.toUpperCase());
        if (appleFinished && googleFinished) {
          this.stopPolling();
        }
      });
    }, interval);
  }

  /**
   * Gözlemci döngüsünü durdurur.
   */
  public stopPolling(): void {
    this.isPolling = false;
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = null;
    }
  }

  private async notifyUpdate(update: ReviewWatcherStatusUpdate): Promise<void> {
    if (!this.options.notifier) return;

    const payload: ReviewNotificationPayload = {
      project: this.options.project,
      version: update.version,
      store: update.store,
      oldStatus: update.oldStatus,
      newStatus: update.newStatus,
      rejectionDiagnosis: update.rejectionDiagnosis
        ? {
            guidelineOrPolicy: update.rejectionDiagnosis.guidelineOrPolicy,
            rootCause: update.rejectionDiagnosis.rootCause,
            appealDraft: update.rejectionDiagnosis.appealLetterDraft,
          }
        : undefined,
    };

    await this.options.notifier.notifyReviewStatus(payload, this.options.webhooks);
  }
}
