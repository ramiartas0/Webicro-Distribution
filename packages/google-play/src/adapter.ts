import fs from 'node:fs';
import { androidpublisher_v3, androidpublisher } from '@googleapis/androidpublisher';
import { GooglePlayConfig, GooglePlayReleaseNotes, GooglePlayUploadResult } from './types.js';
import { createGoogleAuth } from './auth.js';
import { GooglePlayError } from '@webicro/shared';

export class GooglePlayAdapter {
  private publisher: androidpublisher_v3.Androidpublisher;
  private packageName: string;
  private config: GooglePlayConfig;

  constructor(config: GooglePlayConfig) {
    this.config = config;
    this.packageName = config.packageName;
    const authClient = createGoogleAuth(config);
    this.publisher = androidpublisher({
      version: 'v3',
      auth: authClient as androidpublisher_v3.Options['auth'],
    });
  }

  public async authenticate(): Promise<void> {
    try {
      await this.publisher.reviews.list({ packageName: this.packageName, maxResults: 1 });
    } catch (error: unknown) {
      this.handleError(error, 'authenticate');
    }
  }

  public async getLatestVersionCode(): Promise<number | null> {
    let editId = '';
    try {
      const edit = await this.publisher.edits.insert({
        packageName: this.packageName,
      });
      editId = edit.data.id ?? '';
      
      const tracks = await this.publisher.edits.tracks.list({
        editId,
        packageName: this.packageName,
      });

      let latestVersionCode = 0;
      if (tracks.data.tracks) {
        for (const track of tracks.data.tracks) {
          const releases = track.releases ?? [];
          for (const release of releases) {
            const versionCodes = release.versionCodes ?? [];
            for (const vCodeStr of versionCodes) {
              const vCode = parseInt(vCodeStr, 10);
              if (!isNaN(vCode) && vCode > latestVersionCode) {
                latestVersionCode = vCode;
              }
            }
          }
        }
      }

      await this.publisher.edits.delete({ editId, packageName: this.packageName });
      return latestVersionCode === 0 ? null : latestVersionCode;
    } catch (error: unknown) {
      if (editId) {
         await this.publisher.edits.delete({ editId, packageName: this.packageName }).catch(() => {});
      }
      this.handleError(error, 'getLatestVersionCode');
    }
  }

  public async createEdit(): Promise<string> {
    try {
      const res = await this.publisher.edits.insert({
        packageName: this.packageName,
      });
      if (!res.data.id) throw new Error('Edit ID alınamadı');
      return res.data.id;
    } catch (error: unknown) {
      this.handleError(error, 'createEdit');
    }
  }

  public async uploadBundle(editId: string, aabPath: string): Promise<number> {
    try {
      const res = await this.publisher.edits.bundles.upload({
        editId,
        packageName: this.packageName,
        media: {
          mimeType: 'application/octet-stream',
          body: fs.createReadStream(aabPath),
        },
      });
      if (res.data.versionCode === undefined || res.data.versionCode === null) {
        throw new Error('Yükleme sonrasında version code alınamadı');
      }
      return res.data.versionCode;
    } catch (error: unknown) {
      this.handleError(error, 'uploadBundle');
    }
  }

  public async assignTrack(editId: string, versionCode: number, notes?: GooglePlayReleaseNotes[]): Promise<void> {
    try {
      const trackName = this.config.track ?? 'internal';
      const fraction = this.config.userFraction ?? 1.0;
      
      let status = 'completed';
      if (fraction < 1.0 && trackName !== 'internal') {
        status = 'inProgress';
      }

      const releaseNotes = notes?.map(note => ({
        language: note.language,
        text: note.text,
      })) ?? [];

      await this.publisher.edits.tracks.update({
        editId,
        packageName: this.packageName,
        track: trackName,
        requestBody: {
          releases: [
            {
              versionCodes: [versionCode.toString()],
              status,
              userFraction: status === 'inProgress' ? fraction : undefined,
              releaseNotes,
            }
          ]
        }
      });
    } catch (error: unknown) {
      this.handleError(error, 'assignTrack');
    }
  }

  public async commit(editId: string): Promise<void> {
    try {
      await this.publisher.edits.commit({
        editId,
        packageName: this.packageName,
      });
    } catch (error: unknown) {
      this.handleError(error, 'commit');
    }
  }

  public async uploadAndRelease(aabPath: string, notes?: GooglePlayReleaseNotes[], isDryRun?: boolean): Promise<GooglePlayUploadResult> {
    const editId = await this.createEdit();
    let versionCode = 0;
    try {
      versionCode = await this.uploadBundle(editId, aabPath);
      await this.assignTrack(editId, versionCode, notes);

      if (isDryRun) {
        await this.publisher.edits.validate({
          editId,
          packageName: this.packageName,
        });
      } else {
        await this.commit(editId);
      }
    } catch (error: unknown) {
      await this.publisher.edits.delete({ editId, packageName: this.packageName }).catch(() => {});
      throw error; // Rethrow to avoid silent failures
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

  private handleError(error: unknown, operation: string): never {
    const message = error instanceof Error ? error.message : String(error);
    throw new GooglePlayError(`Google Play API hatası (${operation}): ${message}`, { cause: error });
  }
}
