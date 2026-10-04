import { describe, it, expect, vi, afterEach } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { ArtifactManager } from '../packages/artifacts/src/manager.js';
import { runParallelWithAbort } from '../packages/core/src/parallel-store.js';
import { waitForBuildProcessing } from '../packages/app-store/src/polling.js';

describe('ArtifactManager Path Safety', () => {
  it('should write artifacts directly to absolute path without prepending process.cwd()', async () => {
    const tmpBase = await fs.mkdtemp(path.join(os.tmpdir(), 'webicro-artifact-test-'));
    const absoluteArtifactsDir = path.join(tmpBase, 'my_project', '.release', 'artifacts');

    // Create a dummy source artifact file
    const dummyIpa = path.join(tmpBase, 'app.ipa');
    await fs.writeFile(dummyIpa, 'dummy-ipa-content', 'utf8');

    const manager = new ArtifactManager(absoluteArtifactsDir);
    const manifest = await manager.registerArtifact('ios', dummyIpa, '1.0.0');

    // Expected target path must be strictly inside absoluteArtifactsDir/1.0.0/ios/
    const expectedDir = path.join(absoluteArtifactsDir, '1.0.0', 'ios');
    expect(manifest.filePath).toBe(path.join(expectedDir, 'app.ipa'));

    const fileExists = await fs
      .access(manifest.filePath)
      .then(() => true)
      .catch(() => false);
    expect(fileExists).toBe(true);

    // Ensure it NEVER created a path containing duplicate cwd
    expect(manifest.filePath).not.toContain(path.join(process.cwd(), process.cwd()));

    // Cleanup
    await fs.rm(tmpBase, { recursive: true, force: true });
  });
});

describe('runParallelWithAbort Orchestration', () => {
  it('should resolve both tasks when both succeed', async () => {
    const result = await runParallelWithAbort(
      async () => 'google-result',
      async () => 'apple-result',
    );

    expect(result.first).toBe('google-result');
    expect(result.second).toBe('apple-result');
  });

  it('should abort sibling signal and throw the first error when one task fails', async () => {
    let task1SawAbort = false;

    const promise = runParallelWithAbort(
      async (signal) => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        if (signal.aborted) {
          task1SawAbort = true;
        }
        return 'task1-done';
      },
      async () => {
        throw new Error('Apple upload failed');
      },
      { abortOnFailure: true },
    );

    await expect(promise).rejects.toThrow('Apple upload failed');
    expect(task1SawAbort).toBe(true);
  });

  it('should wait for both tasks to settle before throwing so rollback state is clean', async () => {
    let task1Settled = false;

    const promise = runParallelWithAbort(
      async () => {
        await new Promise((resolve) => setTimeout(resolve, 40));
        task1Settled = true;
        return 'delayed-task1';
      },
      async () => {
        throw new Error('Fast failure');
      },
    );

    await expect(promise).rejects.toThrow('Fast failure');
    // Function must have awaited task1's completion before rejecting
    expect(task1Settled).toBe(true);
  });

  it('should forward parent abort signal to child tasks', async () => {
    const controller = new AbortController();
    let taskSawAbort = false;

    const promise = runParallelWithAbort(
      async (signal) => {
        await new Promise((resolve) => {
          signal.addEventListener('abort', () => {
            taskSawAbort = true;
            resolve(undefined);
          });
        });
        return 'done';
      },
      async () => 'done2',
      { parentSignal: controller.signal },
    );

    controller.abort();
    await promise;
    expect(taskSawAbort).toBe(true);
  });
});

describe('waitForBuildProcessing Live Progress & Abort', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should report progress when processing and resolve on VALID', async () => {
    const progressMessages: string[] = [];
    let pollCount = 0;

    vi.stubGlobal('fetch', async () => {
      pollCount++;
      const state = pollCount === 1 ? 'PROCESSING' : 'VALID';
      return {
        ok: true,
        json: async () => ({
          data: [
            {
              id: 'build-uuid-123',
              attributes: { processingState: state },
            },
          ],
        }),
      };
    });

    const buildId = await waitForBuildProcessing('app-1', '10', 'dummy-token', {
      initialDelayMs: 10,
      onProgress: (msg) => progressMessages.push(msg),
    });

    expect(buildId).toBe('build-uuid-123');
    expect(progressMessages.some((m) => m.includes('Apple build isliyor: PROCESSING'))).toBe(true);
    expect(progressMessages.some((m) => m.includes('Apple build islemeyi tamamladi: VALID'))).toBe(
      true,
    );
  });

  it('should abort cleanly when signal is triggered', async () => {
    const controller = new AbortController();

    vi.stubGlobal('fetch', async () => {
      return {
        ok: true,
        json: async () => ({
          data: [{ id: 'b', attributes: { processingState: 'PROCESSING' } }],
        }),
      };
    });

    setTimeout(() => controller.abort(), 20);

    const promise = waitForBuildProcessing('app-1', '10', 'dummy-token', {
      initialDelayMs: 100,
      signal: controller.signal,
    });

    await expect(promise).rejects.toThrow();
  });
});

describe('Store Adapters Reliability & Isolation', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('AppStoreAdapter.createAppStoreVersion zorunlu platform: "IOS" parametresini göndermeli', async () => {
    const { AppStoreAdapter } = await import('../packages/app-store/src/adapter.js');

    let sentBody: { data?: { attributes?: { platform?: string; versionString?: string } } } | null = null;
    vi.stubGlobal('fetch', async (_url: string, options?: RequestInit) => {
      if (options?.body) {
        sentBody = JSON.parse(options.body as string);
      }
      return new Response(JSON.stringify({ data: { id: 'version-123' } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    const adapter = new AppStoreAdapter({
      keyId: 'KEY123',
      issuerId: 'ISS123',
      bundleId: 'com.webicro.test',
      privateKeyContent: 'dummy-key',
    });

    // Mock authenticate to avoid JWT generation failure
    vi.spyOn(adapter, 'authenticate').mockReturnValue('mock-jwt');

    const versionId = await adapter.createAppStoreVersion('app-123', '1.8.0');
    expect(versionId).toBe('version-123');
    expect(sentBody).not.toBeNull();
    expect(sentBody?.data?.attributes?.platform).toBe('IOS');
    expect(sentBody?.data?.attributes?.versionString).toBe('1.8.0');
  });

  it('GooglePlayAdapter aktif yayın sürerken geçici Edit açmayarak açık Editi silinmekten korumalı', async () => {
    const { GooglePlayAdapter } = await import('../packages/google-play/src/adapter.js');

    const adapter = new GooglePlayAdapter({
      packageName: 'com.webicro.protecttest',
      serviceAccountJson: JSON.stringify({
        client_email: 'test@example.com',
        private_key: 'dummy',
      }),
    });

    // Simulate active release edit
    GooglePlayAdapter.setActiveReleaseEditForTesting('com.webicro.protecttest', 'active-edit-999');

    expect(GooglePlayAdapter.isReleaseActive('com.webicro.protecttest')).toBe(true);

    let fetchCalled = false;
    vi.stubGlobal('fetch', async () => {
      fetchCalled = true;
      return { ok: true, json: async () => ({}) };
    });

    const res = await adapter.getSafeLatestVersionCode();
    expect(res.status).toBe('found');
    expect(res.message).toContain('Edit koruma altında');
    // Fetch should NOT have been called to create or delete an edit!
    expect(fetchCalled).toBe(false);

    // Cleanup
    GooglePlayAdapter.setActiveReleaseEditForTesting('com.webicro.protecttest', null);
    expect(GooglePlayAdapter.isReleaseActive('com.webicro.protecttest')).toBe(false);
  });

  it('AppStoreAdapter HTTP 204 No Content (attachBuildToVersion) yanitini parse hatasi vermeden basariyla tamamlamali', async () => {
    const { AppStoreAdapter } = await import('../packages/app-store/src/adapter.js');

    let patchCalled = false;
    vi.stubGlobal('fetch', async () => {
      patchCalled = true;
      return new Response(null, { status: 204, statusText: 'No Content' });
    });

    const adapter = new AppStoreAdapter({
      keyId: 'KEY123',
      issuerId: 'ISS123',
      bundleId: 'com.webicro.test',
      privateKeyContent: 'dummy-key',
    });

    vi.spyOn(adapter, 'authenticate').mockReturnValue('mock-jwt');

    await expect(
      adapter.attachBuildToVersion('version-123', 'build-456'),
    ).resolves.toBeUndefined();
    expect(patchCalled).toBe(true);
  });

  it('AppStoreAdapter modern reviewSubmissions API akışını başarıyla yürütmeli', async () => {
    const { AppStoreAdapter } = await import('../packages/app-store/src/adapter.js');

    const calledPaths: string[] = [];
    vi.stubGlobal('fetch', async (url: string, options?: RequestInit) => {
      const urlStr = String(url);
      calledPaths.push(`${options?.method || 'GET'} ${urlStr}`);
      if (urlStr.endsWith('/reviewSubmissions') && options?.method === 'POST') {
        return new Response(JSON.stringify({ data: { id: 'submission-999' } }), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (urlStr.endsWith('/reviewSubmissionItems') && options?.method === 'POST') {
        return new Response(JSON.stringify({ data: { id: 'item-111' } }), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (urlStr.includes('/reviewSubmissions/submission-999') && options?.method === 'PATCH') {
        return new Response(null, { status: 204 });
      }
      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    });

    const adapter = new AppStoreAdapter({
      keyId: 'KEY123',
      issuerId: 'ISS123',
      bundleId: 'com.webicro.test',
      privateKeyContent: 'dummy-key',
    });
    vi.spyOn(adapter, 'authenticate').mockReturnValue('mock-jwt');

    await expect(adapter.submitForReview('version-123', 'app-456')).resolves.toBeUndefined();
    expect(calledPaths.some((p) => p.includes('POST') && p.includes('/reviewSubmissions'))).toBe(true);
    expect(calledPaths.some((p) => p.includes('POST') && p.includes('/reviewSubmissionItems'))).toBe(true);
    expect(calledPaths.some((p) => p.includes('PATCH') && p.includes('/reviewSubmissions/submission-999'))).toBe(true);
  });

  it('AppStoreAdapter Apple JSON API formatındaki hataları anlaşılır ayrıştırmalı', async () => {
    const { AppStoreAdapter, AppStoreError } = await import('../packages/app-store/src/adapter.js');

    vi.stubGlobal('fetch', async () => {
      const appleErrorPayload = {
        errors: [
          {
            code: 'ENTITY_ERROR.ATTRIBUTE.REQUIRED',
            title: 'An attribute is required',
            detail: "You must provide a value for the attribute 'platform'",
            source: { pointer: '/data/attributes/platform' },
          },
        ],
      };
      return new Response(JSON.stringify(appleErrorPayload), {
        status: 409,
        statusText: 'Conflict',
        headers: { 'Content-Type': 'application/json' },
      });
    });

    const adapter = new AppStoreAdapter({
      keyId: 'KEY123',
      issuerId: 'ISS123',
      bundleId: 'com.webicro.test',
      privateKeyContent: 'dummy-key',
    });
    vi.spyOn(adapter, 'authenticate').mockReturnValue('mock-jwt');

    await expect(adapter.createAppStoreVersion('app-1', '1.0.0')).rejects.toThrow(AppStoreError);
    await expect(adapter.createAppStoreVersion('app-1', '1.0.0')).rejects.toThrow(
      "ENTITY_ERROR.ATTRIBUTE.REQUIRED",
    );
    await expect(adapter.createAppStoreVersion('app-1', '1.0.0')).rejects.toThrow(
      "/data/attributes/platform",
    );
  });
});


