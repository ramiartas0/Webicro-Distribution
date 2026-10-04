import { describe, it, expect } from 'vitest';
import { SensitiveDataScanner } from '../packages/validation/src/sensitive-data.js';
import {
  validateGooglePlayReleaseNotes,
  validateAppStoreWhatsNew,
} from '../packages/validation/src/store-limits.js';

describe('Validation & Security Scanners', () => {
  it('should detect AWS and Google API keys in text', () => {
    const scanner = new SensitiveDataScanner();
    const cleanText = 'Fixed courier notification issues and improved offline performance.';
    expect(scanner.scan(cleanText)).toHaveLength(0);

    const dirtyText =
      'Debugged with key AIzaSyD1234567890123456789012345678901 and secret AKIA1234567890ABCDEF';
    const issues = scanner.scan(dirtyText);
    expect(issues.length).toBeGreaterThan(0);
  });

  it('should validate store character limits', () => {
    const shortNotes = 'Great performance improvements and fixes.';
    const playResult = validateGooglePlayReleaseNotes(shortNotes);
    expect(playResult.isValid).toBe(true);

    const longNotes = 'A'.repeat(550);
    const playTooLong = validateGooglePlayReleaseNotes(longNotes);
    expect(playTooLong.isValid).toBe(false);

    const appStoreResult = validateAppStoreWhatsNew('A'.repeat(3000));
    expect(appStoreResult.isValid).toBe(true);
  });
});
