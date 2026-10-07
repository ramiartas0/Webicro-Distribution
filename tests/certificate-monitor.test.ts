import { describe, it, expect, vi } from 'vitest';
import { CertificateHealthMonitor } from '../packages/security/src/certificate-monitor.js';
import type { AppStoreAdapter } from '../packages/app-store/src/adapter.js';

describe('Certificate & Keystore Health Monitor', () => {
  it('Süresi dolan sertifikalar için EXPIRED raporu üretmeli', async () => {
    const mockAppStore = {
      getCertificates: vi.fn().mockResolvedValue([
        {
          id: 'cert-1',
          name: 'Apple Distribution Certificate',
          certificateType: 'IOS_DISTRIBUTION',
          expirationDate: '2025-01-01T00:00:00Z',
          daysRemaining: -10,
          isExpired: true,
        },
      ]),
      getProfiles: vi.fn().mockResolvedValue([]),
    } as unknown as AppStoreAdapter;

    const report = await CertificateHealthMonitor.generateHealthReport({
      appleAdapter: mockAppStore,
    });

    expect(report.overallStatus).toBe('EXPIRED');
    expect(report.errors.length).toBeGreaterThan(0);
    expect(report.errors[0]).toContain('SÜRESİ DOLMUŞ');
    expect(report.minDaysRemaining).toBe(-10);
  });

  it('30 günden az kalan sertifikalar için WARNING raporu üretmeli', async () => {
    const mockAppStore = {
      getCertificates: vi.fn().mockResolvedValue([
        {
          id: 'cert-2',
          name: 'Apple Distribution Certificate',
          certificateType: 'IOS_DISTRIBUTION',
          expirationDate: '2026-10-25T00:00:00Z',
          daysRemaining: 18,
          isExpired: false,
        },
      ]),
      getProfiles: vi.fn().mockResolvedValue([
        {
          id: 'prof-1',
          name: 'App Store Profile',
          profileType: 'IOS_APP_STORE',
          expirationDate: '2026-11-20T00:00:00Z',
          daysRemaining: 44,
          isExpired: false,
          profileState: 'ACTIVE',
        },
      ]),
    } as unknown as AppStoreAdapter;

    const report = await CertificateHealthMonitor.generateHealthReport({
      appleAdapter: mockAppStore,
    });

    expect(report.overallStatus).toBe('WARNING');
    expect(report.warnings.length).toBeGreaterThan(0);
    expect(report.warnings[0]).toContain('KRİTİK YAKLAŞIM');
    expect(report.minDaysRemaining).toBe(18);
  });

  it('Geçerli ve süresine uzun zaman olan sertifikalar için HEALTHY dönmeli', async () => {
    const mockAppStore = {
      getCertificates: vi.fn().mockResolvedValue([
        {
          id: 'cert-3',
          name: 'Apple Distribution Certificate',
          certificateType: 'IOS_DISTRIBUTION',
          expirationDate: '2027-05-01T00:00:00Z',
          daysRemaining: 210,
          isExpired: false,
        },
      ]),
      getProfiles: vi.fn().mockResolvedValue([]),
    } as unknown as AppStoreAdapter;

    const report = await CertificateHealthMonitor.generateHealthReport({
      appleAdapter: mockAppStore,
    });

    expect(report.overallStatus).toBe('HEALTHY');
    expect(report.warnings).toHaveLength(0);
    expect(report.errors).toHaveLength(0);
    expect(report.minDaysRemaining).toBe(210);
  });
});
