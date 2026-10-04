import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { AppStoreConfig, AppStoreUploadHooks, AppStoreUploadResult } from './types.js';
import { generateAppStoreToken } from './auth.js';
import { waitForBuildProcessing } from './polling.js';

export class AppStoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AppStoreError';
  }
}

export class AppStoreAdapter {
  private token: string | null = null;
  private tokenIssuedAt = 0;
  /** JWT 20 dk gecerli uretilir; 15 dk dolunca guvenlik payi ile yenilenir. */
  private static readonly TOKEN_REFRESH_MS = 15 * 60 * 1000;
  private readonly baseUrl = 'https://api.appstoreconnect.apple.com/v1';

  constructor(private readonly config: AppStoreConfig) {}

  public authenticate(): string {
    this.token = generateAppStoreToken(this.config);
    this.tokenIssuedAt = Date.now();
    return this.token;
  }

  private getToken(): string {
    if (!this.token || Date.now() - this.tokenIssuedAt > AppStoreAdapter.TOKEN_REFRESH_MS) {
      return this.authenticate();
    }
    return this.token;
  }

  private async fetchApi(path: string, options?: RequestInit): Promise<unknown> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${this.getToken()}`,
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new AppStoreError(`API request failed: ${res.statusText} ${errText}`);
    }

    if (res.status === 204) {
      return null;
    }

    if (typeof res.text === 'function') {
      const text = await res.text().catch(() => '');
      if (!text || !text.trim()) {
        return null;
      }

      try {
        return JSON.parse(text);
      } catch {
        return text;
      }
    }

    return res.json();
  }

  public async listAllApps(): Promise<
    { id: string; name: string; bundleId: string; sku?: string }[]
  > {
    try {
      const data = (await this.fetchApi('/apps')) as {
        data?: {
          id: string;
          attributes: { name: string; bundleId: string; sku?: string };
        }[];
      };
      if (!data?.data) return [];
      return data.data.map((app) => ({
        id: app.id,
        name: app.attributes.name,
        bundleId: app.attributes.bundleId,
        sku: app.attributes.sku,
      }));
    } catch {
      return [];
    }
  }

  public async getAppId(): Promise<string> {
    const data = (await this.fetchApi(`/apps?filter[bundleId]=${this.config.bundleId}`)) as {
      data: { id: string }[];
    };
    if (!data.data || data.data.length === 0) {
      throw new AppStoreError(`App not found with bundle ID: ${this.config.bundleId}`);
    }
    const app = data.data[0];
    if (!app) {
      throw new AppStoreError('App not found');
    }
    return app.id;
  }

  public async validateAppExists(): Promise<{ appId: string; appName?: string }> {
    const data = (await this.fetchApi(`/apps?filter[bundleId]=${this.config.bundleId}`)) as {
      data: { id: string; attributes?: { name?: string } }[];
    };
    if (!data.data || data.data.length === 0) {
      throw new AppStoreError(
        `App Store Connect üzerinde '${this.config.bundleId}' Bundle ID'sine sahip bir uygulama kaydı bulunamadı. Lütfen developer.apple.com veya App Store Connect üzerinde bu Bundle ID için uygulama oluşturulduğundan emin olun.`,
      );
    }
    const app = data.data[0];
    if (!app) {
      throw new AppStoreError(
        `App Store Connect üzerinde '${this.config.bundleId}' Bundle ID'sine sahip bir uygulama kaydı bulunamadı.`,
      );
    }
    return {
      appId: app.id,
      appName: app.attributes?.name,
    };
  }

  public async getLatestBuild(): Promise<{ version: string; buildNumber: string } | null> {
    const appId = await this.getAppId();
    const data = (await this.fetchApi(
      `/builds?filter[app]=${appId}&sort=-uploadedDate&limit=1`,
    )) as { data: { attributes: { version: string; uploadedDate: string } }[] };
    if (!data.data || data.data.length === 0) {
      return null;
    }
    const build = data.data[0];
    if (!build) return null;
    return {
      version: 'unknown',
      buildNumber: build.attributes.version,
    };
  }

  public async createAppStoreVersion(
    appId: string,
    versionString: string,
    platform: 'IOS' | 'MAC_OS' | 'TV_OS' | 'VISION_OS' = 'IOS',
  ): Promise<string> {
    const payload = {
      data: {
        type: 'appStoreVersions',
        attributes: {
          platform,
          versionString,
        },
        relationships: {
          app: {
            data: {
              type: 'apps',
              id: appId,
            },
          },
        },
      },
    };

    const data = (await this.fetchApi('/appStoreVersions', {
      method: 'POST',
      body: JSON.stringify(payload),
    })) as { data: { id: string } };

    return data.data.id;
  }

  public async updateWhatsNew(versionId: string, locale: string, text: string): Promise<void> {
    const localizations = (await this.fetchApi(
      `/appStoreVersions/${versionId}/appStoreVersionLocalizations`,
    )) as { data: { id: string; attributes: { locale: string } }[] };
    let localizationId = localizations.data.find((l) => l.attributes.locale === locale)?.id;

    if (!localizationId) {
      const locPayload = {
        data: {
          type: 'appStoreVersionLocalizations',
          attributes: { locale },
          relationships: {
            appStoreVersion: { data: { type: 'appStoreVersions', id: versionId } },
          },
        },
      };
      const created = (await this.fetchApi('/appStoreVersionLocalizations', {
        method: 'POST',
        body: JSON.stringify(locPayload),
      })) as { data: { id: string } };
      localizationId = created.data.id;
    }

    const updatePayload = {
      data: {
        type: 'appStoreVersionLocalizations',
        id: localizationId,
        attributes: { whatsNew: text },
      },
    };
    await this.fetchApi(`/appStoreVersionLocalizations/${localizationId}`, {
      method: 'PATCH',
      body: JSON.stringify(updatePayload),
    });
  }

  public async attachBuildToVersion(versionId: string, buildId: string): Promise<void> {
    const payload = {
      data: {
        type: 'builds',
        id: buildId,
      },
    };
    await this.fetchApi(`/appStoreVersions/${versionId}/relationships/build`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  }

  public async submitForReview(versionId: string): Promise<void> {
    const payload = {
      data: {
        type: 'appStoreVersionSubmissions',
        relationships: {
          appStoreVersion: {
            data: {
              type: 'appStoreVersions',
              id: versionId,
            },
          },
        },
      },
    };
    await this.fetchApi('/appStoreVersionSubmissions', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  private ensureAuthKeyFile(): void {
    const keyId = this.config.keyId;
    const homedir = os.homedir();
    const candidateDirs = [
      path.join(homedir, '.appstoreconnect', 'private_keys'),
      path.join(homedir, '.private_keys'),
      path.join(homedir, 'private_keys'),
    ];

    for (const dir of candidateDirs) {
      const candidateFile = path.join(dir, `AuthKey_${keyId}.p8`);
      if (fs.existsSync(candidateFile)) {
        return;
      }
    }

    let keyContent = this.config.privateKeyContent;
    if (!keyContent && this.config.privateKeyPath && fs.existsSync(this.config.privateKeyPath)) {
      keyContent = fs.readFileSync(this.config.privateKeyPath, 'utf8');
    }

    if (!keyContent) {
      return;
    }

    const targetDir = path.join(homedir, '.appstoreconnect', 'private_keys');
    try {
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true, mode: 0o700 });
      }
      const targetFile = path.join(targetDir, `AuthKey_${keyId}.p8`);
      fs.writeFileSync(targetFile, keyContent, { mode: 0o600, encoding: 'utf8' });
    } catch (err: unknown) {
      console.warn(
        `[AppStoreAdapter] AuthKey dosyası yazılamadı: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  public async uploadAndRelease(
    ipaPath: string,
    versionString: string,
    buildNumberString: string,
    whatsNew?: Record<string, string>,
    submitReview?: boolean,
    hooks?: AppStoreUploadHooks,
  ): Promise<AppStoreUploadResult> {
    const signal = hooks?.signal;
    const report = hooks?.onProgress;
    const throwIfAborted = (): void => {
      if (signal?.aborted) {
        throw new AppStoreError('App Store yüklemesi diğer mağazadaki hata nedeniyle iptal edildi.');
      }
    };

    throwIfAborted();
    this.ensureAuthKeyFile();
    const appId = await this.getAppId();
    throwIfAborted();

    report?.('altool ile IPA Apple sunucularına yükleniyor...');
    await new Promise<void>((resolve, reject) => {
      const cmd = spawn(
        'xcrun',
        [
          'altool',
          '--upload-app',
          '-f',
          ipaPath,
          '-t',
          'ios',
          '--apiKey',
          this.config.keyId,
          '--apiIssuer',
          this.config.issuerId,
        ],
        { signal },
      );

      const forward = (prefix: string, data: Buffer): void => {
        const text = data.toString();
        if (prefix === 'altool err') console.error(`${prefix}: ${text}`);
        else console.log(`${prefix}: ${text}`);
        for (const raw of text.split('\n')) {
          const line = raw.trim();
          if (line) report?.(`altool: ${line}`);
        }
      };
      cmd.stdout.on('data', (data: Buffer) => forward('altool', data));
      cmd.stderr.on('data', (data: Buffer) => forward('altool err', data));

      cmd.on('error', (err: Error) => {
        if (err.name === 'AbortError') {
          reject(
            new AppStoreError('App Store yüklemesi diğer mağazadaki hata nedeniyle iptal edildi.'),
          );
        } else {
          reject(new AppStoreError(`altool başlatılamadı: ${err.message}`));
        }
      });
      cmd.on('close', (code) => {
        if (code === 0) resolve();
        else if (!signal?.aborted) reject(new AppStoreError(`altool exited with code ${code}`));
      });
    });

    report?.('IPA yüklendi. Apple build işlemesi bekleniyor (genelde 5-30 dk)...');
    let buildId: string;
    try {
      buildId = await waitForBuildProcessing(appId, buildNumberString, () => this.getToken(), {
        signal,
        onProgress: report,
      });
    } catch (err: unknown) {
      if (signal?.aborted) {
        throw new AppStoreError('App Store yüklemesi diğer mağazadaki hata nedeniyle iptal edildi.');
      }
      throw err;
    }
    throwIfAborted();

    const versionId = await this.createAppStoreVersion(appId, versionString, 'IOS').catch(
      async (e) => {
        const versions = (await this.fetchApi(
          `/apps/${appId}/appStoreVersions?filter[versionString]=${versionString}&filter[platform]=IOS`,
        )) as { data: { id: string; attributes: { appStoreState: string } }[] };
        const editable = versions.data.find((v) =>
          ['PREPARE_FOR_SUBMISSION', 'DEVELOPER_REJECTED', 'REJECTED'].includes(
            v.attributes.appStoreState,
          ),
        );
        if (editable) return editable.id;
        throw e;
      },
    );

    if (whatsNew) {
      for (const [locale, text] of Object.entries(whatsNew)) {
        await this.updateWhatsNew(versionId, locale, text);
      }
    }

    await this.attachBuildToVersion(versionId, buildId);

    let submitted = false;
    if (submitReview) {
      await this.submitForReview(versionId);
      submitted = true;
    }

    return {
      buildId,
      version: versionString,
      buildNumber: buildNumberString,
      status: 'SUCCESS',
      submittedForReview: submitted,
    };
  }
}
