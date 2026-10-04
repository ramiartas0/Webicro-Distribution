import { describe, it, expect } from 'vitest';
import { GooglePlayAdapter } from '../packages/google-play/src/adapter.js';
import { AppStoreAdapter } from '../packages/app-store/src/adapter.js';

describe('Atomic Store & Pre-flight Validation', () => {
  it('should provide draft management methods on GooglePlayAdapter', () => {
    const adapter = new GooglePlayAdapter({
      packageName: 'com.example.app',
      serviceAccountJson: JSON.stringify({
        client_email: 'test@example.com',
        private_key: '-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQC7\n-----END PRIVATE KEY-----\n',
      }),
    });

    expect(typeof adapter.uploadDraftOnly).toBe('function');
    expect(typeof adapter.commitDraft).toBe('function');
    expect(typeof adapter.discardDraft).toBe('function');
  });

  it('should provide validateAppExists method on AppStoreAdapter', () => {
    const adapter = new AppStoreAdapter({
      keyId: 'TESTKEY123',
      issuerId: 'TEST-ISSUER-UUID',
      bundleId: 'com.example.missingapp',
      privateKeyContent: '-----BEGIN EC PRIVATE KEY-----\nMHcCAQEEI...\n-----END EC PRIVATE KEY-----\n',
    });

    expect(typeof adapter.validateAppExists).toBe('function');
  });

  it('should fail fast on validateAppExists when app is not found', async () => {
    const adapter = new AppStoreAdapter({
      keyId: 'TESTKEY123',
      issuerId: 'TEST-ISSUER-UUID',
      bundleId: 'com.example.nonexistent',
      privateKeyContent: '-----BEGIN EC PRIVATE KEY-----\nMHcCAQEEI...\n-----END EC PRIVATE KEY-----\n',
    });

    // Network / API request should fail and throw AppStoreError
    await expect(adapter.validateAppExists()).rejects.toThrow();
  });
});
