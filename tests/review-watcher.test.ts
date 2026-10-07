import { describe, it, expect, vi } from 'vitest';
import { ReviewWatcher } from '../packages/core/src/review-watcher.js';
import { AIDiagnostician } from '../packages/ai/src/diagnostician.js';
import type { AppStoreAdapter } from '../packages/app-store/src/adapter.js';
import type { ReleaseNotifier } from '../packages/notifications/src/notifier.js';

describe('Store Review Watcher & AI Rejection Diagnostician', () => {
  it('Apple Guideline 2.1 demo credentials reddini doğru teşhis edip itiraz taslağı üretmeli', () => {
    const rawRejection =
      'Guideline 2.1 - Performance - App Completeness. We were unable to review your app because you did not provide a demo account. Please provide user name and password.';
    const diagnosis = AIDiagnostician.diagnoseStoreRejection('apple', rawRejection, {
      appName: 'Piyyu Kurye',
      version: '2.7.0',
    });

    expect(diagnosis.store).toBe('apple');
    expect(diagnosis.guidelineOrPolicy).toContain('Guideline 2.1');
    expect(diagnosis.solutionSteps.length).toBeGreaterThan(0);
    expect(diagnosis.appealLetterDraft).toContain('Piyyu Kurye');
    expect(diagnosis.appealLetterDraft).toContain('App Review Information');
  });

  it('Apple Guideline 5.1.1 Purpose String eksikliğini doğru teşhis etmeli', () => {
    const rawRejection =
      'Guideline 5.1.1 - Legal - Privacy - Data Collection. Your app Info.plist is missing NSCameraUsageDescription with adequate purpose explanation.';
    const diagnosis = AIDiagnostician.diagnoseStoreRejection('apple', rawRejection);

    expect(diagnosis.guidelineOrPolicy).toContain('Guideline 5.1.1');
    expect(diagnosis.rootCause).toContain('Info.plist');
    expect(diagnosis.appealLetterDraft).toContain('Info.plist');
  });

  it('Google Play Photo Permissions politikasını doğru teşhis etmeli', () => {
    const rawRejection =
      'Your app declaration form for Photo and Video permissions is invalid. READ_MEDIA_IMAGES permission is not allowed.';
    const diagnosis = AIDiagnostician.diagnoseStoreRejection('google', rawRejection);

    expect(diagnosis.store).toBe('google');
    expect(diagnosis.guidelineOrPolicy).toContain('Photo and Video Permissions');
    expect(diagnosis.solutionSteps.some((s) => s.includes('AndroidManifest.xml'))).toBe(true);
    expect(diagnosis.appealLetterDraft).toContain('Photo Picker');
  });

  it('ReviewWatcher Apple durum geçişlerini ve AI teşhisini tetiklemeli', async () => {
    let mockState = 'WAITING_FOR_REVIEW';

    const mockAppStoreAdapter = {
      getAppStoreVersionStatus: vi.fn().mockImplementation(() =>
        Promise.resolve({
          versionId: 'ver-123',
          versionString: '2.7.0',
          appStoreState: mockState,
          rejectionReasons:
            mockState === 'REJECTED'
              ? ['Guideline 2.1: Demo account is missing for testing']
              : [],
        }),
      ),
    } as unknown as AppStoreAdapter;

    const mockNotifier = {
      notifyReviewStatus: vi.fn().mockResolvedValue(undefined),
    } as unknown as ReleaseNotifier;

    const statusChanges: string[] = [];

    const watcher = new ReviewWatcher({
      project: 'Piyyu Kurye',
      version: '2.7.0',
      appStoreAdapter: mockAppStoreAdapter,
      notifier: mockNotifier,
      onStatusChange: (evt) => {
        statusChanges.push(evt.newStatus);
      },
    });

    // 1. İlk kontrol: WAITING_FOR_REVIEW
    const res1 = await watcher.checkOnce();
    expect(res1.appleStatus).toBe('WAITING_FOR_REVIEW');
    expect(statusChanges).toEqual(['WAITING_FOR_REVIEW']);
    expect(mockNotifier.notifyReviewStatus).toHaveBeenCalledTimes(1);

    // 2. Durum değişmediğinde yeni bildirim fırlatmamalı
    await watcher.checkOnce();
    expect(statusChanges.length).toBe(1);

    // 3. Durum REJECTED olduğunda AI teşhisi üretip bildirim atmalı
    mockState = 'REJECTED';
    const res2 = await watcher.checkOnce();
    expect(res2.appleStatus).toBe('REJECTED');
    expect(statusChanges).toEqual(['WAITING_FOR_REVIEW', 'REJECTED']);
    expect(res2.updates[0]?.rejectionDiagnosis).toBeDefined();
    expect(res2.updates[0]?.rejectionDiagnosis?.guidelineOrPolicy).toContain('Guideline 2.1');
  });
});
