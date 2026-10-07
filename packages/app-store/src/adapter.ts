import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type {
  AppStoreConfig,
  AppStoreUploadHooks,
  AppStoreUploadResult,
  AppStoreVersionStatusResult,
  AppStoreMetadataLocalization,
  AppStoreCertificateInfo,
  AppStoreProfileInfo,
} from './types.js';
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
      let parsedDetail = '';
      try {
        const errorJson = JSON.parse(errText) as {
          errors?: { code?: string; title?: string; detail?: string; source?: { pointer?: string } }[];
        };
        if (errorJson.errors && errorJson.errors.length > 0) {
          parsedDetail = errorJson.errors
            .map((e) => `[${e.code || 'ERROR'}] ${e.detail || e.title || ''}${e.source?.pointer ? ` (pointer: ${e.source.pointer})` : ''}`)
            .join('; ');
        }
      } catch {}
      const fullError = parsedDetail ? `${res.statusText} (${res.status}): ${parsedDetail}` : `${res.statusText} ${errText}`;
      throw new AppStoreError(`API request failed: ${fullError}`);
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

  public async updateAppStoreVersion(
    versionId: string,
    versionString: string,
  ): Promise<void> {
    const payload = {
      data: {
        type: 'appStoreVersions',
        id: versionId,
        attributes: {
          versionString,
        },
      },
    };

    await this.fetchApi(`/appStoreVersions/${versionId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
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

  public async setExportCompliance(buildId: string, usesEncryption = false): Promise<void> {
    const payload = {
      data: {
        type: 'builds',
        id: buildId,
        attributes: {
          usesNonExemptEncryption: usesEncryption,
        },
      },
    };
    await this.fetchApi(`/builds/${buildId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
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

  public async submitForReview(versionId: string, appId?: string): Promise<void> {
    const targetAppId = appId || (await this.getAppId());
    try {
      // Modern Apple API akışı: reviewSubmissions -> reviewSubmissionItems -> PATCH submitted=true
      const submissionPayload = {
        data: {
          type: 'reviewSubmissions',
          attributes: {
            platform: 'IOS',
          },
          relationships: {
            app: {
              data: {
                type: 'apps',
                id: targetAppId,
              },
            },
          },
        },
      };

      const submissionRes = (await this.fetchApi('/reviewSubmissions', {
        method: 'POST',
        body: JSON.stringify(submissionPayload),
      })) as { data?: { id: string } };

      const submissionId = submissionRes?.data?.id;
      if (submissionId) {
        // İnceleme gönderimine versiyon öğesini bağla
        const itemPayload = {
          data: {
            type: 'reviewSubmissionItems',
            relationships: {
              reviewSubmission: {
                data: {
                  type: 'reviewSubmissions',
                  id: submissionId,
                },
              },
              appStoreVersion: {
                data: {
                  type: 'appStoreVersions',
                  id: versionId,
                },
              },
            },
          },
        };

        await this.fetchApi('/reviewSubmissionItems', {
          method: 'POST',
          body: JSON.stringify(itemPayload),
        });

        // İncelemeye resmi olarak teslim et
        const patchPayload = {
          data: {
            type: 'reviewSubmissions',
            id: submissionId,
            attributes: {
              submitted: true,
            },
          },
        };

        await this.fetchApi(`/reviewSubmissions/${submissionId}`, {
          method: 'PATCH',
          body: JSON.stringify(patchPayload),
        });
        return;
      }
    } catch (modernErr: unknown) {
      console.warn(
        `[AppStoreAdapter] Modern reviewSubmissions başarısız oldu, klasik appStoreVersionSubmissions deneniyor: ${modernErr instanceof Error ? modernErr.message : String(modernErr)}`,
      );
    }

    // Fallback: Eski appStoreVersionSubmissions API
    const fallbackPayload = {
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
      body: JSON.stringify(fallbackPayload),
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

    report?.('Apple build işlemesi tamamlandı. İhracat uyumluluğu (Export Compliance / Non-exempt encryption) otomatik onaylanıyor...');
    try {
      await this.setExportCompliance(buildId, false);
      report?.('İhracat uyumluluğu başarıyla onaylandı (usesNonExemptEncryption=false).');
    } catch (compErr: unknown) {
      report?.(`Uyumluluk otomatik doğrulama notu: ${compErr instanceof Error ? compErr.message : String(compErr)}`);
    }

    const versionId = await this.createAppStoreVersion(appId, versionString, 'IOS').catch(
      async (e) => {
        // 1. Önce tam olarak aynı sürüm numarasına (versionString) sahip kayıtları ara
        try {
          const exactVersions = (await this.fetchApi(
            `/apps/${appId}/appStoreVersions?filter[versionString]=${versionString}&filter[platform]=IOS`,
          )) as { data: { id: string; attributes: { appStoreState?: string; appVersionState?: string } }[] };
          const exactEditable = exactVersions.data?.find((v) => {
            const state = v.attributes.appVersionState || v.attributes.appStoreState || '';
            return ['PREPARE_FOR_SUBMISSION', 'DEVELOPER_REJECTED', 'REJECTED'].includes(state);
          });
          if (exactEditable) {
            report?.(`Mevcut taslak sürüm bulundu (${versionString}): ID ${exactEditable.id}`);
            return exactEditable.id;
          }
        } catch {}

        // 2. Eğer Apple 409 (You cannot create a new version of the App in the current state) vermişse,
        // panelde henüz gönderilmemiş / düzenlenebilir başka bir taslak sürüm (ör. 1.8.0 veya 1.9.0) vardır.
        // Apple aynı anda yalnızca 1 adet taslak sürüme izin verir.
        try {
          const allVersions = (await this.fetchApi(
            `/apps/${appId}/appStoreVersions?filter[platform]=IOS`,
          )) as { data: { id: string; attributes: { versionString: string; appStoreState?: string; appVersionState?: string } }[] };
          const anyEditable = allVersions.data?.find((v) => {
            const state = v.attributes.appVersionState || v.attributes.appStoreState || '';
            return ['PREPARE_FOR_SUBMISSION', 'DEVELOPER_REJECTED', 'REJECTED'].includes(state);
          });

          if (anyEditable) {
            report?.(
              `Panelde mevcut düzenlenebilir taslak sürüm (${anyEditable.attributes.versionString}) bulundu. Hedef sürüme (${versionString}) güncelleniyor...`,
            );
            if (anyEditable.attributes.versionString !== versionString) {
              await this.updateAppStoreVersion(anyEditable.id, versionString);
              report?.(`Sürüm numarası güncellendi: ${anyEditable.attributes.versionString} -> ${versionString}`);
            }
            return anyEditable.id;
          }
        } catch {}

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
      report?.('Sürüm resmi Apple inceleme kuyruğuna (Submit for Review) teslim ediliyor...');
      try {
        await this.submitForReview(versionId, appId);
        submitted = true;
        report?.('Sürüm başarıyla Apple inceleme kuyruğuna teslim edildi (In Review / Waiting for Review).');
      } catch (submitErr: unknown) {
        const subMsg = submitErr instanceof Error ? submitErr.message : String(submitErr);
        report?.(`Otomatik incelemeye gönderme notu: ${subMsg}`);
      }
    }

    return {
      buildId,
      version: versionString,
      buildNumber: buildNumberString,
      status: 'SUCCESS',
      submittedForReview: submitted,
    };
  }

  /**
   * App Store Connect üzerindeki sürümün güncel durumunu (WAITING_FOR_REVIEW, IN_REVIEW, READY_FOR_SALE vb.) sorgular.
   */
  public async getAppStoreVersionStatus(
    appId?: string,
    versionString?: string,
  ): Promise<AppStoreVersionStatusResult | null> {
    const targetAppId = appId || (await this.getAppId());
    const filter = versionString
      ? `/apps/${targetAppId}/appStoreVersions?filter[versionString]=${encodeURIComponent(versionString)}&filter[platform]=IOS`
      : `/apps/${targetAppId}/appStoreVersions?filter[platform]=IOS`;

    const res = (await this.fetchApi(filter)) as {
      data?: {
        id: string;
        attributes?: {
          versionString?: string;
          appStoreState?: string;
          appVersionState?: string;
        };
      }[];
    };

    const versions = res?.data ?? [];
    if (versions.length === 0) return null;

    const item = versions[0];
    if (!item) return null;

    const state =
      item.attributes?.appVersionState || item.attributes?.appStoreState || 'UNKNOWN';

    const isRejected = ['REJECTED', 'METADATA_REJECTED', 'DEVELOPER_REJECTED'].includes(state);
    let rejectionReasons: string[] | undefined;

    if (isRejected) {
      rejectionReasons = await this.getResolutionCenterMessages(item.id).catch(() => []);
    }

    return {
      versionId: item.id,
      versionString: item.attributes?.versionString || versionString || '',
      appStoreState: state,
      rawState: item.attributes?.appStoreState,
      rejectionReasons,
    };
  }

  /**
   * Reddedilen veya incelemede olan sürümün Resolution Center / İnceleme mesajlarını çeker.
   */
  public async getResolutionCenterMessages(versionId: string): Promise<string[]> {
    try {
      const res = (await this.fetchApi(
        `/appStoreVersions/${versionId}/customerReviews`,
      )) as {
        data?: { attributes?: { body?: string; title?: string } }[];
      };
      const messages: string[] = [];
      for (const item of res?.data ?? []) {
        if (item.attributes?.body) {
          messages.push(item.attributes.body);
        }
      }
      return messages;
    } catch {
      return [];
    }
  }

  /**
   * Sürüm meta verilerini (açıklama, anahtar kelimeler, vb.) günceller.
   */
  public async syncVersionMetadata(
    versionId: string,
    metadata: AppStoreMetadataLocalization,
  ): Promise<void> {
    const localizations = (await this.fetchApi(
      `/appStoreVersions/${versionId}/appStoreVersionLocalizations`,
    )) as { data: { id: string; attributes: { locale: string } }[] };

    let localizationId = localizations.data?.find((l) => l.attributes.locale === metadata.locale)?.id;

    if (!localizationId) {
      const locPayload = {
        data: {
          type: 'appStoreVersionLocalizations',
          attributes: { locale: metadata.locale },
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

    const attributesToUpdate: Record<string, string> = {};
    if (metadata.description) attributesToUpdate['description'] = metadata.description;
    if (metadata.keywords) attributesToUpdate['keywords'] = metadata.keywords;
    if (metadata.promotionalText) attributesToUpdate['promotionalText'] = metadata.promotionalText;
    if (metadata.supportUrl) attributesToUpdate['supportUrl'] = metadata.supportUrl;
    if (metadata.marketingUrl) attributesToUpdate['marketingUrl'] = metadata.marketingUrl;
    if (metadata.whatsNew) attributesToUpdate['whatsNew'] = metadata.whatsNew;

    if (Object.keys(attributesToUpdate).length > 0) {
      const updatePayload = {
        data: {
          type: 'appStoreVersionLocalizations',
          id: localizationId,
          attributes: attributesToUpdate,
        },
      };
      await this.fetchApi(`/appStoreVersionLocalizations/${localizationId}`, {
        method: 'PATCH',
        body: JSON.stringify(updatePayload),
      });
    }
  }

  /**
   * Apple Dağıtım Sertifikalarının (iOS Distribution) geçerlilik durumunu denetler.
   */
  public async getCertificates(): Promise<AppStoreCertificateInfo[]> {
    interface ApiCert {
      id: string;
      attributes?: {
        name?: string;
        certificateType?: string;
        expirationDate?: string;
        platform?: string;
      };
    }
    const res = (await this.fetchApi('/certificates')) as { data?: ApiCert[] };
    const certs: AppStoreCertificateInfo[] = [];

    for (const item of res?.data ?? []) {
      const expStr = item.attributes?.expirationDate;
      const expDate = expStr ? new Date(expStr) : new Date();
      const daysRemaining = Math.floor((expDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));

      certs.push({
        id: item.id,
        name: item.attributes?.name ?? 'Bilinmeyen Sertifika',
        certificateType: item.attributes?.certificateType ?? 'DISTRIBUTION',
        expirationDate: expStr ?? '',
        daysRemaining,
        isExpired: daysRemaining <= 0,
        platform: item.attributes?.platform,
      });
    }

    return certs;
  }

  /**
   * Apple Provisioning Profillerinin geçerlilik durumunu denetler.
   */
  public async getProfiles(): Promise<AppStoreProfileInfo[]> {
    interface ApiProfile {
      id: string;
      attributes?: {
        name?: string;
        profileType?: string;
        expirationDate?: string;
        profileState?: string;
      };
    }
    const res = (await this.fetchApi('/profiles')) as { data?: ApiProfile[] };
    const profiles: AppStoreProfileInfo[] = [];

    for (const item of res?.data ?? []) {
      const expStr = item.attributes?.expirationDate;
      const expDate = expStr ? new Date(expStr) : new Date();
      const daysRemaining = Math.floor((expDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));

      profiles.push({
        id: item.id,
        name: item.attributes?.name ?? 'Bilinmeyen Profil',
        profileType: item.attributes?.profileType ?? 'IOS_APP_STORE',
        expirationDate: expStr ?? '',
        daysRemaining,
        isExpired: daysRemaining <= 0,
        profileState: item.attributes?.profileState ?? 'ACTIVE',
      });
    }

    return profiles;
  }
}

