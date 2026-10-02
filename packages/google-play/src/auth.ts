import { auth } from '@googleapis/androidpublisher';
import type { GooglePlayConfig } from './types.js';

export function createGoogleAuth(config: GooglePlayConfig): InstanceType<typeof auth.GoogleAuth> {
  const scopes = ['https://www.googleapis.com/auth/androidpublisher'];

  if (config.serviceAccountJson) {
    const credentials = JSON.parse(config.serviceAccountJson) as Record<string, unknown>;
    return new auth.GoogleAuth({
      credentials,
      scopes,
    });
  }

  if (config.serviceAccountJsonPath) {
    return new auth.GoogleAuth({
      keyFile: config.serviceAccountJsonPath,
      scopes,
    });
  }

  throw new Error('Google Play kimlik doğrulama bilgileri eksik (serviceAccountJson veya serviceAccountJsonPath gereklidir).');
}
