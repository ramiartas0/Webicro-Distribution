import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  isSafeProjectPath,
  saveStoreCredentials,
  getStoreCredentials,
} from '../apps/cli/src/commands/ui.js';

describe('Security & Loopback Hardening Verification', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'webicro-security-test-'));
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('Path Traversal Guard (isSafeProjectPath)', () => {
    it('should reject unsafe system directories and traversal patterns', () => {
      expect(isSafeProjectPath('/etc')).toBe(false);
      expect(isSafeProjectPath('/etc/passwd')).toBe(false);
      expect(isSafeProjectPath('/usr/bin')).toBe(false);
      expect(isSafeProjectPath('/System')).toBe(false);
      expect(isSafeProjectPath(path.join(os.homedir(), '.ssh'))).toBe(false);
      expect(isSafeProjectPath(path.join(os.homedir(), '.aws'))).toBe(false);
      expect(isSafeProjectPath('')).toBe(false);
    });

    it('should allow valid user project directories', () => {
      const validSubDir = path.join(tempDir, 'flutter_app');
      fs.mkdirSync(validSubDir, { recursive: true });
      expect(isSafeProjectPath(validSubDir)).toBe(true);
    });
  });

  describe('Strict 0600 Credentials Permissions', () => {
    it('should create credentials.json with 0600 mode and .release with 0700 mode', () => {
      const testCreds = {
        googlePlay: {
          serviceAccountEmail: 'test@serviceaccount.com',
          projectId: 'my-project-123',
        },
      };

      saveStoreCredentials(testCreds, tempDir);

      const relDir = path.join(tempDir, '.release');
      const credFile = path.join(relDir, 'credentials.json');

      expect(fs.existsSync(credFile)).toBe(true);

      const dirStat = fs.statSync(relDir);
      const fileStat = fs.statSync(credFile);

      if (process.platform !== 'win32') {
        const fileMode = fileStat.mode & 0o777;
        const dirMode = dirStat.mode & 0o777;
        expect(fileMode).toBe(0o600);
        expect(dirMode).toBe(0o700);
      }

      const loaded = getStoreCredentials(tempDir);
      expect(loaded.googlePlay?.serviceAccountEmail).toBe('test@serviceaccount.com');
    });

    it('should NOT automatically save env variables to disk in getStoreCredentials', () => {
      const isolatedDir = path.join(tempDir, 'isolated');
      fs.mkdirSync(isolatedDir, { recursive: true });

      process.env['GOOGLE_PLAY_SERVICE_ACCOUNT_JSON'] = '{"project_id":"temp-env-proj"}';

      getStoreCredentials(isolatedDir);

      const credFile = path.join(isolatedDir, '.release/credentials.json');
      expect(fs.existsSync(credFile)).toBe(false);

      delete process.env['GOOGLE_PLAY_SERVICE_ACCOUNT_JSON'];
    });
  });
});
