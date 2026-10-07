import fs from 'node:fs';
import type {
  GooglePlayConfig,
  GooglePlayReleaseNotes,
  GooglePlayUploadResult,
  GooglePlaySafeTrackResult,
  GooglePlayDraftResult,
  GooglePlayTrackReleaseStatus,
  GooglePlayListing,
} from './types.js';
import { getGoogleAccessToken } from './auth.js';
import { GooglePlayError } from '@webicro/shared';

export class GooglePlayAdapter {
  private packageName: string;
  private config: GooglePlayConfig;

  /** Aktif sürüm yayını devam eden paket adları ve açık Edit ID'leri (çakışma ve silinmeleri önler) */
  private static readonly activeReleaseEdits = new Map<string, string>();

  public static isReleaseActive(packageName: string): boolean {
    return GooglePlayAdapter.activeReleaseEdits.has(packageName);
  }

  public static setActiveReleaseEditForTesting(packageName: string, editId: string | null): void {
    if (editId) {
      GooglePlayAdapter.activeReleaseEdits.set(packageName, editId);
    } else {
      GooglePlayAdapter.activeReleaseEdits.delete(packageName);
    }
  }

  constructor(config: GooglePlayConfig) {
    this.config = config;
    this.packageName = config.packageName;
  }

  public async authenticate(): Promise<void> {
    try {
      await getGoogleAccessToken(this.config);
    } catch (error: unknown) {
      this.handleError(error, 'authenticate');
    }
  }

  public async getLatestVersionCode(): Promise<number | null> {
    const res = await this.getSafeLatestVersionCode();
    if (res.status === 'found' && res.versionCode && res.versionCode > 0) {
      return res.versionCode;
    }
    return null;
  }

  public async getSafeLatestVersionCode(): Promise<GooglePlaySafeTrackResult> {
    // Eğer bu paket için aktif bir dağıtım yayını (release edit) devam ediyorsa,
    // yeni bir Edit oluşturmak Play Console tarafından mevcut aktif yayının SİLİNMESİNE yol açar.
    if (GooglePlayAdapter.activeReleaseEdits.has(this.packageName)) {
      return {
        status: 'found',
        versionCode: 0,
        message: 'Aktif dağıtım süreci devam ediyor (Edit koruma altında)',
      };
    }

    let editId = '';
    let token = '';
    try {
      token = await getGoogleAccessToken(this.config);
    } catch (authErr: unknown) {
      const msg = authErr instanceof Error ? authErr.message : String(authErr);
      return { status: 'auth_error', message: msg };
    }

    try {
      const editRes = await fetch(
        `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${this.packageName}/edits`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        },
      );

      if (!editRes.ok) {
        const errText = await editRes.text();
        if (
          editRes.status === 404 ||
          errText.toLowerCase().includes('not found') ||
          errText.toLowerCase().includes('package not found')
        ) {
          return { status: 'not_found', message: 'Paket Play Console hesabında bulunamadı' };
        }
        if (
          editRes.status === 401 ||
          editRes.status === 403 ||
          errText.toLowerCase().includes('permission') ||
          errText.toLowerCase().includes('unauthorized')
        ) {
          return {
            status: 'auth_error',
            message: 'Erişim yetkisi yetersiz veya paket bu hesaba atanmamış',
          };
        }
        return {
          status: 'error',
          message: `Play Console API hatası (${editRes.status}): ${errText}`,
        };
      }

      const editData = (await editRes.json()) as { id?: string };
      editId = editData.id ?? '';

      const tracksRes = await fetch(
        `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${this.packageName}/edits/${editId}/tracks`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );

      let latestVersionCode = 0;
      let versionName = '';
      let bestTrack = '';
      let statusRelease = '';
      let releaseNotes: GooglePlayReleaseNotes[] = [];

      if (tracksRes.ok) {
        interface ReleaseItem {
          name?: string;
          versionCodes?: string[];
          status?: string;
          releaseNotes?: { language?: string; text?: string }[];
        }
        interface TrackItem {
          track?: string;
          releases?: ReleaseItem[];
        }
        const tracksData = (await tracksRes.json()) as { tracks?: TrackItem[] };
        const tracks = tracksData.tracks ?? [];

        const trackPriority: Record<string, number> = {
          production: 4,
          beta: 3,
          alpha: 2,
          internal: 1,
        };

        for (const track of tracks) {
          const tName = track.track ?? '';
          for (const release of track.releases ?? []) {
            for (const vCodeStr of release.versionCodes ?? []) {
              const vCode = parseInt(vCodeStr, 10);
              if (!isNaN(vCode)) {
                const currentPri = trackPriority[tName] ?? 0;
                const bestPri = trackPriority[bestTrack] ?? 0;

                if (
                  vCode > latestVersionCode ||
                  (vCode === latestVersionCode && currentPri > bestPri)
                ) {
                  latestVersionCode = vCode;
                  bestTrack = tName;
                  statusRelease = release.status ?? '';

                  if (release.name) {
                    const match = release.name.match(/\((.*?)\)/);
                    versionName = match ? match[1] : release.name;
                  }
                  if (release.releaseNotes) {
                    releaseNotes = release.releaseNotes.map((n) => ({
                      language: n.language ?? 'tr-TR',
                      text: n.text ?? '',
                    }));
                  }
                }
              }
            }
          }
        }
      }

      if (editId) {
        await fetch(
          `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${this.packageName}/edits/${editId}`,
          {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` },
          },
        ).catch(() => {});
      }

      if (latestVersionCode > 0) {
        return {
          status: 'found',
          versionCode: latestVersionCode,
          versionName: versionName || undefined,
          track: bestTrack || undefined,
          statusRelease: statusRelease || undefined,
          releaseNotes: releaseNotes.length > 0 ? releaseNotes : undefined,
          message: `v${versionName || latestVersionCode} (#${latestVersionCode}) ${bestTrack} yayında`,
        };
      }

      return { status: 'found', versionCode: 0, message: 'Henüz sürüm yayınlanmamış' };
    } catch (err: unknown) {
      if (editId && token) {
        await fetch(
          `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${this.packageName}/edits/${editId}`,
          {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` },
          },
        ).catch(() => {});
      }
      const msg = err instanceof Error ? err.message : String(err);
      return { status: 'error', message: msg };
    }
  }

  public async createEdit(): Promise<string> {
    try {
      const token = await getGoogleAccessToken(this.config);
      const res = await fetch(
        `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${this.packageName}/edits`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        },
      );
      if (!res.ok) {
        throw new Error(`Edit oluşturulamadı (HTTP ${res.status}): ${await res.text()}`);
      }
      const data = (await res.json()) as { id?: string };
      if (!data.id) throw new Error('Edit ID alınamadı');
      return data.id;
    } catch (error: unknown) {
      this.handleError(error, 'createEdit');
    }
  }

  public async uploadBundle(editId: string, aabPath: string): Promise<number> {
    try {
      const token = await getGoogleAccessToken(this.config);
      const fileBuffer = fs.readFileSync(aabPath);
      const res = await fetch(
        `https://androidpublisher.googleapis.com/upload/androidpublisher/v3/applications/${this.packageName}/edits/${editId}/bundles?uploadType=media`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/octet-stream',
          },
          body: fileBuffer,
        },
      );

      if (!res.ok) {
        throw new Error(`Bundle yüklenemedi (HTTP ${res.status}): ${await res.text()}`);
      }

      const data = (await res.json()) as { versionCode?: number };
      if (data.versionCode === undefined || data.versionCode === null) {
        throw new Error('Yükleme sonrasında version code alınamadı');
      }
      return data.versionCode;
    } catch (error: unknown) {
      this.handleError(error, 'uploadBundle');
    }
  }

  public async assignTrack(
    editId: string,
    versionCode: number,
    notes?: GooglePlayReleaseNotes[],
  ): Promise<void> {
    try {
      const token = await getGoogleAccessToken(this.config);
      const trackName = this.config.track ?? 'internal';
      const fraction = this.config.userFraction ?? 1.0;

      let status = 'completed';
      if (fraction < 1.0 && trackName !== 'internal') {
        status = 'inProgress';
      }

      const releaseNotes =
        notes?.map((note) => ({
          language: note.language,
          text: note.text,
        })) ?? [];

      const body = {
        track: trackName,
        releases: [
          {
            versionCodes: [versionCode.toString()],
            status,
            userFraction: status === 'inProgress' ? fraction : undefined,
            releaseNotes,
          },
        ],
      };

      const res = await fetch(
        `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${this.packageName}/edits/${editId}/tracks/${trackName}`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        },
      );

      if (!res.ok) {
        throw new Error(`Track atanamadı (HTTP ${res.status}): ${await res.text()}`);
      }
    } catch (error: unknown) {
      this.handleError(error, 'assignTrack');
    }
  }

  public async validate(editId: string): Promise<void> {
    try {
      const token = await getGoogleAccessToken(this.config);
      const res = await fetch(
        `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${this.packageName}/edits/${editId}:validate`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );
      if (!res.ok) {
        throw new Error(`Edit doğrulanamadı (HTTP ${res.status}): ${await res.text()}`);
      }
    } catch (error: unknown) {
      this.handleError(error, 'validate');
    }
  }

  public async commit(editId: string, changesNotSentForReview = false): Promise<void> {
    try {
      const token = await getGoogleAccessToken(this.config);
      const url = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${this.packageName}/edits/${editId}:commit?changesNotSentForReview=${changesNotSentForReview}`;
      const res = await fetch(
        url,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );
      if (!res.ok) {
        throw new Error(`Edit commit edilemedi (HTTP ${res.status}): ${await res.text()}`);
      }
    } catch (error: unknown) {
      this.handleError(error, 'commit');
    }
  }

  public async uploadAndRelease(
    aabPath: string,
    notes?: GooglePlayReleaseNotes[],
    changesNotSentForReview = false,
  ): Promise<GooglePlayUploadResult> {
    const editId = await this.createEdit();
    GooglePlayAdapter.activeReleaseEdits.set(this.packageName, editId);
    let versionCode = 0;
    try {
      versionCode = await this.uploadBundle(editId, aabPath);
      await this.assignTrack(editId, versionCode, notes);
      await this.commit(editId, changesNotSentForReview);
    } catch (error: unknown) {
      const token = await getGoogleAccessToken(this.config).catch(() => '');
      if (token) {
        await fetch(
          `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${this.packageName}/edits/${editId}`,
          {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` },
          },
        ).catch(() => {});
      }
      throw error;
    } finally {
      GooglePlayAdapter.activeReleaseEdits.delete(this.packageName);
    }

    const trackName = this.config.track ?? 'internal';
    const fraction = this.config.userFraction ?? 1.0;
    let status = 'completed';
    if (fraction < 1.0 && trackName !== 'internal') {
      status = 'inProgress';
    }

    return {
      versionCode,
      track: trackName,
      userFraction: status === 'inProgress' ? fraction : 1.0,
      status,
    };
  }

  public async uploadDraftOnly(
    aabPath: string,
    notes?: GooglePlayReleaseNotes[],
  ): Promise<GooglePlayDraftResult> {
    const editId = await this.createEdit();
    GooglePlayAdapter.activeReleaseEdits.set(this.packageName, editId);
    let versionCode = 0;
    try {
      versionCode = await this.uploadBundle(editId, aabPath);
      await this.assignTrack(editId, versionCode, notes);
    } catch (error: unknown) {
      GooglePlayAdapter.activeReleaseEdits.delete(this.packageName);
      await this.discardDraft(editId).catch(() => {});
      throw error;
    }

    const trackName = this.config.track ?? 'internal';
    const fraction = this.config.userFraction ?? 1.0;
    return {
      editId,
      versionCode,
      track: trackName,
      userFraction: fraction,
    };
  }

  public async discardDraft(editId: string): Promise<void> {
    GooglePlayAdapter.activeReleaseEdits.delete(this.packageName);
    try {
      const token = await getGoogleAccessToken(this.config).catch(() => '');
      if (token) {
        await fetch(
          `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${this.packageName}/edits/${editId}`,
          {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` },
          },
        ).catch(() => {});
      }
    } catch {}
  }

  public async commitDraft(
    editId: string,
    versionCode: number,
    changesNotSentForReview = false,
  ): Promise<GooglePlayUploadResult> {
    try {
      await this.commit(editId, changesNotSentForReview);
    } finally {
      GooglePlayAdapter.activeReleaseEdits.delete(this.packageName);
    }
    const trackName = this.config.track ?? 'internal';
    const fraction = this.config.userFraction ?? 1.0;
    let status = 'completed';
    if (fraction < 1.0 && trackName !== 'internal') {
      status = 'inProgress';
    }

    return {
      versionCode,
      track: trackName,
      userFraction: status === 'inProgress' ? fraction : 1.0,
      status,
    };
  }

  /**
   * Belirtilen track (üretim, beta, alpha, dahili) için son sürümün güncel mağaza durumunu çeker.
   */
  public async getTrackReleaseStatus(
    targetTrack?: string,
  ): Promise<GooglePlayTrackReleaseStatus | null> {
    const trackName = targetTrack ?? this.config.track ?? 'production';
    let editId = '';
    let token = '';

    try {
      token = await getGoogleAccessToken(this.config);
    } catch {
      return null;
    }

    try {
      const editRes = await fetch(
        `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${this.packageName}/edits`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        },
      );

      if (!editRes.ok) return null;
      const editData = (await editRes.json()) as { id?: string };
      editId = editData.id ?? '';

      const trackRes = await fetch(
        `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${this.packageName}/edits/${editId}/tracks/${trackName}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );

      if (!trackRes.ok) {
        if (editId) {
          await fetch(
            `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${this.packageName}/edits/${editId}`,
            {
              method: 'DELETE',
              headers: { Authorization: `Bearer ${token}` },
            },
          ).catch(() => {});
        }
        return null;
      }

      interface TrackData {
        track?: string;
        releases?: {
          status?: string;
          versionCodes?: string[];
          userFraction?: number;
          releaseNotes?: { language?: string; text?: string }[];
        }[];
      }

      const data = (await trackRes.json()) as TrackData;
      const latestRelease = data.releases?.[0];

      if (editId) {
        await fetch(
          `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${this.packageName}/edits/${editId}`,
          {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` },
          },
        ).catch(() => {});
      }

      if (!latestRelease) return null;

      const vCodes = (latestRelease.versionCodes ?? []).map((v) => parseInt(v, 10)).filter((n) => !isNaN(n));

      return {
        track: trackName,
        status: latestRelease.status ?? 'unknown',
        versionCodes: vCodes,
        userFraction: latestRelease.userFraction,
        releaseNotes: latestRelease.releaseNotes?.map((r) => ({
          language: r.language ?? 'tr-TR',
          text: r.text ?? '',
        })),
      };
    } catch {
      if (editId && token) {
        await fetch(
          `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${this.packageName}/edits/${editId}`,
          {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` },
          },
        ).catch(() => {});
      }
      return null;
    }
  }

  /**
   * Google Play mağaza listeleme detaylarını (başlık, kısa açıklama, tam açıklama) günceller.
   */
  public async syncListings(editId: string, listings: GooglePlayListing[]): Promise<void> {
    const token = await getGoogleAccessToken(this.config);

    for (const listing of listings) {
      const payload: Record<string, string> = { language: listing.language };
      if (listing.title) payload['title'] = listing.title;
      if (listing.shortDescription) payload['shortDescription'] = listing.shortDescription;
      if (listing.fullDescription) payload['fullDescription'] = listing.fullDescription;

      const res = await fetch(
        `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${this.packageName}/edits/${editId}/listings/${listing.language}`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        },
      );

      if (!res.ok) {
        throw new Error(
          `Listing (${listing.language}) güncellenemedi: ${res.status} ${await res.text()}`,
        );
      }
    }
  }

  /**
   * Google Play mağaza ekran görüntülerini veya simgelerini yükler.
   */
  public async uploadListingImage(
    editId: string,
    language: string,
    imageType: 'phoneScreenshots' | 'sevenInchScreenshots' | 'tenInchScreenshots' | 'icon' | 'featureGraphic',
    imagePath: string,
  ): Promise<void> {
    const token = await getGoogleAccessToken(this.config);
    const fileBuffer = fs.readFileSync(imagePath);

    const res = await fetch(
      `https://androidpublisher.googleapis.com/upload/androidpublisher/v3/applications/${this.packageName}/edits/${editId}/listings/${language}/${imageType}?uploadType=media`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'image/png',
        },
        body: fileBuffer,
      },
    );

    if (!res.ok) {
      throw new Error(`Ekran görüntüsü yüklenemedi (${imageType}): ${res.status} ${await res.text()}`);
    }
  }

  private handleError(error: unknown, operation: string): never {
    let message = error instanceof Error ? error.message : String(error);

    if (message.includes('photo and video permissions')) {
      message = `${message}\n\n[ÇÖZÜM REHBERİ]: Google Play Politikası uyarınca uygulamanız bir galeri yöneticisi değilse READ_MEDIA_IMAGES veya READ_EXTERNAL_STORAGE izni içeremez. Lütfen AndroidManifest.xml dosyasından bu izinleri kaldırın veya Google Play Console -> Uygulama İçeriği -> 'Fotoğraf ve video izinleri' formunu doldurun.`;
    }

    throw new GooglePlayError(`Google Play API hatası (${operation}): ${message}`, {
      cause: error,
    });
  }
}

