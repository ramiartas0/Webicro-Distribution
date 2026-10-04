import { spawn } from 'node:child_process';
import type { AppStoreConfig, AppStoreUploadResult } from './types.js';
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
  private readonly baseUrl = 'https://api.appstoreconnect.apple.com/v1';

  constructor(private readonly config: AppStoreConfig) {}

  public authenticate(): string {
    this.token = generateAppStoreToken(this.config);
    return this.token;
  }

  private getToken(): string {
    if (!this.token) {
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

    return res.json();
  }

  public async listAllApps(): Promise<{ id: string; name: string; bundleId: string; sku?: string }[]> {
    try {
      const data = await this.fetchApi('/apps') as {
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
    const data = await this.fetchApi(`/apps?filter[bundleId]=${this.config.bundleId}`) as { data: { id: string }[] };
    if (!data.data || data.data.length === 0) {
      throw new AppStoreError(`App not found with bundle ID: ${this.config.bundleId}`);
    }
    const app = data.data[0];
    if (!app) {
      throw new AppStoreError('App not found');
    }
    return app.id;
  }

  public async getLatestBuild(): Promise<{ version: string; buildNumber: string } | null> {
    const appId = await this.getAppId();
    const data = await this.fetchApi(`/builds?filter[app]=${appId}&sort=-uploadedDate&limit=1`) as { data: { attributes: { version: string, uploadedDate: string } }[] };
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

  public async createAppStoreVersion(appId: string, versionString: string): Promise<string> {
    const payload = {
      data: {
        type: 'appStoreVersions',
        attributes: {
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

    const data = await this.fetchApi('/appStoreVersions', {
      method: 'POST',
      body: JSON.stringify(payload),
    }) as { data: { id: string } };

    return data.data.id;
  }

  public async updateWhatsNew(versionId: string, locale: string, text: string): Promise<void> {
    const localizations = await this.fetchApi(`/appStoreVersions/${versionId}/appStoreVersionLocalizations`) as { data: { id: string, attributes: { locale: string } }[] };
    let localizationId = localizations.data.find(l => l.attributes.locale === locale)?.id;

    if (!localizationId) {
      const locPayload = {
        data: {
          type: 'appStoreVersionLocalizations',
          attributes: { locale },
          relationships: {
            appStoreVersion: { data: { type: 'appStoreVersions', id: versionId } }
          }
        }
      };
      const created = await this.fetchApi('/appStoreVersionLocalizations', {
        method: 'POST',
        body: JSON.stringify(locPayload)
      }) as { data: { id: string } };
      localizationId = created.data.id;
    }

    const updatePayload = {
      data: {
        type: 'appStoreVersionLocalizations',
        id: localizationId,
        attributes: { whatsNew: text }
      }
    };
    await this.fetchApi(`/appStoreVersionLocalizations/${localizationId}`, {
      method: 'PATCH',
      body: JSON.stringify(updatePayload)
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

  public async uploadAndRelease(
    ipaPath: string,
    versionString: string,
    buildNumberString: string,
    whatsNew?: Record<string, string>,
    submitReview?: boolean
  ): Promise<AppStoreUploadResult> {
    const appId = await this.getAppId();

    await new Promise<void>((resolve, reject) => {
      const cmd = spawn('xcrun', [
        'altool',
        '--upload-app',
        '-f', ipaPath,
        '-t', 'ios',
        '--apiKey', this.config.keyId,
        '--apiIssuer', this.config.issuerId
      ]);

      cmd.stdout.on('data', (data) => console.log(`altool: ${data}`));
      cmd.stderr.on('data', (data) => console.error(`altool err: ${data}`));

      cmd.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new AppStoreError(`altool exited with code ${code}`));
      });
    });

    const token = this.getToken();
    const buildId = await waitForBuildProcessing(appId, buildNumberString, token);

    const versionId = await this.createAppStoreVersion(appId, versionString).catch(async (e) => {
      const versions = await this.fetchApi(`/apps/${appId}/appStoreVersions?filter[versionString]=${versionString}`) as { data: { id: string, attributes: { appStoreState: string } }[] };
      const editable = versions.data.find(v => ['PREPARE_FOR_SUBMISSION', 'DEVELOPER_REJECTED', 'REJECTED'].includes(v.attributes.appStoreState));
      if (editable) return editable.id;
      throw e;
    });

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
