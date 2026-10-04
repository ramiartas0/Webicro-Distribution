import fs from 'node:fs';
import crypto from 'node:crypto';
import { auth } from '@googleapis/androidpublisher';
import type { GooglePlayConfig } from './types.js';

interface ServiceAccountKey {
  client_email?: string;
  private_key?: string;
}

const tokenCache = new Map<string, { token: string; expiresAt: number }>();

function base64UrlEncode(str: string): string {
  return Buffer.from(str)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

export function parseServiceAccount(config: GooglePlayConfig): ServiceAccountKey {
  if (config.serviceAccountJson) {
    try {
      return JSON.parse(config.serviceAccountJson) as ServiceAccountKey;
    } catch (e: unknown) {
      throw new Error(
        `Google Play serviceAccountJson geçersiz JSON: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  if (config.serviceAccountJsonPath) {
    if (!fs.existsSync(config.serviceAccountJsonPath)) {
      throw new Error(
        `Google Play serviceAccountJsonPath dosya bulunamadı: ${config.serviceAccountJsonPath}`,
      );
    }
    try {
      const raw = fs.readFileSync(config.serviceAccountJsonPath, 'utf8');
      return JSON.parse(raw) as ServiceAccountKey;
    } catch (e: unknown) {
      throw new Error(
        `Google Play key dosyası okunamadı: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  throw new Error(
    'Google Play kimlik doğrulama bilgileri eksik (serviceAccountJson veya serviceAccountJsonPath gereklidir).',
  );
}

export async function getGoogleAccessToken(config: GooglePlayConfig): Promise<string> {
  const sa = parseServiceAccount(config);
  if (!sa.client_email || !sa.private_key) {
    throw new Error('Service Account JSON içeriğinde client_email veya private_key bulunamadı.');
  }

  const cacheKey = sa.client_email;
  const now = Math.floor(Date.now() / 1000);
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.expiresAt > now + 60) {
    return cached.token;
  }

  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/androidpublisher',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(`${encodedHeader}.${encodedPayload}`);
  const signature = signer
    .sign(sa.private_key, 'base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  const assertion = `${encodedHeader}.${encodedPayload}.${signature}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Google OAuth2 token alınamadı (HTTP ${res.status}): ${errorText}`);
  }

  const data = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!data.access_token) {
    throw new Error('Google OAuth2 yanıtında access_token bulunamadı.');
  }

  const expiresIn = data.expires_in ?? 3600;
  tokenCache.set(cacheKey, {
    token: data.access_token,
    expiresAt: now + expiresIn,
  });

  return data.access_token;
}

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

  throw new Error(
    'Google Play kimlik doğrulama bilgileri eksik (serviceAccountJson veya serviceAccountJsonPath gereklidir).',
  );
}
