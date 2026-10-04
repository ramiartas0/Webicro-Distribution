import jwt from 'jsonwebtoken';
import { readFileSync } from 'node:fs';
import type { AppStoreConfig } from './types.js';

export function generateAppStoreToken(config: AppStoreConfig): string {
  let privateKey = config.privateKeyContent;
  if (!privateKey && config.privateKeyPath) {
    privateKey = readFileSync(config.privateKeyPath, 'utf8');
  }

  if (!privateKey) {
    throw new Error('AppStoreConfig requires either privateKeyContent or privateKeyPath');
  }

  const payload = {
    iss: config.issuerId,
    exp: Math.floor(Date.now() / 1000) + 20 * 60, // 20 minutes
    aud: 'appstoreconnect-v1'
  };

  const token = jwt.sign(payload, privateKey, {
    algorithm: 'ES256',
    header: {
      kid: config.keyId,
      alg: 'ES256'
    }
  });

  return token;
}
