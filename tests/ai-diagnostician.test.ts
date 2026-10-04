import { describe, it, expect } from 'vitest';
import { AIDiagnostician } from '../packages/ai/src/diagnostician.js';

describe('AIDiagnostician', () => {
  it('Google Play fotoğraf ve video izinleri 403 hatasını anında tespit etmeli ve REMOVE_PHOTO_PERMISSIONS aksiyonu sunmalı', () => {
    const errorText = `Google Play API hatası (commit): Edit commit edilemedi (HTTP 403): {
  "error": {
    "code": 403,
    "message": "All developers requesting access to the photo and video permissions are required to tell Google Play about the core functionality of their app",
    "status": "PERMISSION_DENIED"
  }
}`;

    const diagnosis = AIDiagnostician.diagnoseHeuristics({
      failedStep: 'Google Play Upload',
      errorText,
      recentLogs: [errorText],
    });

    expect(diagnosis).not.toBeNull();
    expect(diagnosis?.category).toBe('STORE_POLICY');
    expect(diagnosis?.source).toBe('google_play');
    expect(diagnosis?.autoFixAvailable).toBe(true);
    expect(diagnosis?.autoFixAction).toBe('REMOVE_PHOTO_PERMISSIONS');
    expect(diagnosis?.rootCause).toContain('READ_MEDIA_IMAGES');
    expect(diagnosis?.solutionSteps.length).toBeGreaterThan(0);
  });

  it('Google Play sürüm kodu çakışması hatasını tespit etmeli', () => {
    const errorText =
      'The current release already has version code 3, which has already been used.';
    const diagnosis = AIDiagnostician.diagnoseHeuristics({
      failedStep: 'Google Play Upload',
      errorText,
    });

    expect(diagnosis).not.toBeNull();
    expect(diagnosis?.category).toBe('STORE_POLICY');
    expect(diagnosis?.source).toBe('google_play');
  });

  it('Flutter analyze kod hatasını APP_CODE olarak tespit etmeli', () => {
    const errorText = 'Target flutter_analyze failed: 2 errors found in lib/main.dart';
    const diagnosis = AIDiagnostician.diagnoseHeuristics({
      failedStep: 'Flutter Check',
      errorText,
    });

    expect(diagnosis).not.toBeNull();
    expect(diagnosis?.category).toBe('APP_CODE');
    expect(diagnosis?.source).toBe('flutter_code');
  });

  it('Apple App Store Connect eksik platform alanı 409 hatasını doğru tespit etmeli', () => {
    const errorText = `API request failed: Conflict {
  "errors" : [ {
    "id" : "ca01edcd-aaba-43ef-bb2f-6cbb1f7c29be",
    "status" : "409",
    "code" : "ENTITY_ERROR.ATTRIBUTE.REQUIRED",
    "title" : "The provided entity is missing a required attribute",
    "detail" : "You must provide a value for the attribute 'platform' with this request",
    "source" : {
      "pointer" : "/data/attributes/platform"
    }
  } ]
}`;
    const diagnosis = AIDiagnostician.diagnoseHeuristics({
      failedStep: 'App Store Upload',
      errorText,
      recentLogs: [errorText],
    });

    expect(diagnosis).not.toBeNull();
    expect(diagnosis?.category).toBe('STORE_API');
    expect(diagnosis?.source).toBe('app_store');
    expect(diagnosis?.categoryTitle).toContain('Platform Parametresi');
    expect(diagnosis?.rootCause).toContain('platform');
  });

  it('Google Play This Edit has been deleted hatasını doğru tespit etmeli', () => {
    const errorText = `HATA: Google Play API hatası (uploadBundle): Bundle yüklenemedi (HTTP 400): {
  "error": {
    "code": 400,
    "message": "This Edit has been deleted.",
    "status": "FAILED_PRECONDITION"
  }
}`;
    const diagnosis = AIDiagnostician.diagnoseHeuristics({
      failedStep: 'Google Play Upload',
      errorText,
      recentLogs: [errorText],
    });

    expect(diagnosis).not.toBeNull();
    expect(diagnosis?.category).toBe('STORE_API');
    expect(diagnosis?.source).toBe('google_play');
    expect(diagnosis?.categoryTitle).toContain('Edit Oturumu Silinme');
    expect(diagnosis?.rootCause).toContain('(Edit) oturumu');
  });
});

