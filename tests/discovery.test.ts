import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  getPlatformSpecificDevRoots,
  detectMobileProject,
  scanDirectoriesForMobileProjects,
  deduplicateDiscoveredProjects,
} from '../apps/cli/src/discovery/index.js';

describe('Universal Cross-Platform Mobile Project Discovery', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'webicro-discovery-test-'));
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  });

  describe('OS Roots Discovery', () => {
    it('should return valid existing roots for the current platform', () => {
      const roots = getPlatformSpecificDevRoots();
      expect(Array.isArray(roots)).toBe(true);
      expect(roots.length).toBeGreaterThan(0);
      expect(roots).toContain(process.cwd());
    });

    it('should prioritize custom roots when provided', () => {
      const customSub = path.join(tempDir, 'custom-workspace');
      fs.mkdirSync(customSub);

      const roots = getPlatformSpecificDevRoots([customSub]);
      expect(roots).toContain(path.resolve(customSub));
      expect(roots.length).toBe(1);
    });
  });

  describe('Mobile Project Framework Detection', () => {
    it('should detect Flutter projects with name, version, and buildNumber', () => {
      const flutterDir = path.join(tempDir, 'my_flutter_app');
      fs.mkdirSync(flutterDir);
      fs.writeFileSync(
        path.join(flutterDir, 'pubspec.yaml'),
        `name: my_flutter_app\ndescription: Test app\nversion: 2.3.4+42\nflutter:\n  uses-material-design: true\n`,
      );

      const meta = detectMobileProject(flutterDir);
      expect(meta).not.toBeNull();
      expect(meta?.type).toBe('flutter');
      expect(meta?.name).toBe('my_flutter_app');
      expect(meta?.version).toBe('2.3.4');
      expect(meta?.buildNumber).toBe(42);
      expect(meta?.hasPubspec).toBe(true);
      expect(meta?.isDirectlySupported).toBe(true);
    });

    it('should detect React Native projects from package.json', () => {
      const rnDir = path.join(tempDir, 'my_rn_app');
      fs.mkdirSync(rnDir);
      fs.writeFileSync(
        path.join(rnDir, 'package.json'),
        JSON.stringify({
          name: 'my_rn_app',
          version: '1.5.0',
          dependencies: {
            'react': '18.2.0',
            'react-native': '0.73.0',
          },
        }),
      );

      const meta = detectMobileProject(rnDir);
      expect(meta).not.toBeNull();
      expect(meta?.type).toBe('react-native');
      expect(meta?.typeLabel).toBe('React Native');
      expect(meta?.name).toBe('my_rn_app');
      expect(meta?.version).toBe('1.5.0');
      expect(meta?.hasPubspec).toBe(false);
    });

    it('should detect Expo projects from package.json with app.json configuration', () => {
      const expoDir = path.join(tempDir, 'my_expo_app');
      fs.mkdirSync(expoDir);
      fs.writeFileSync(
        path.join(expoDir, 'package.json'),
        JSON.stringify({
          name: 'my_expo_app',
          version: '1.0.0',
          dependencies: {
            'expo': '~50.0.0',
            'react-native': '0.73.0',
          },
        }),
      );
      fs.writeFileSync(
        path.join(expoDir, 'app.json'),
        JSON.stringify({
          expo: {
            name: 'Expo Cool App',
            android: { package: 'com.cool.expoapp' },
            ios: { bundleIdentifier: 'com.cool.expoapp.ios' },
          },
        }),
      );

      const meta = detectMobileProject(expoDir);
      expect(meta).not.toBeNull();
      expect(meta?.type).toBe('expo');
      expect(meta?.typeLabel).toBe('Expo');
      expect(meta?.package).toBe('com.cool.expoapp');
    });

    it('should detect Native Android projects with Gradle and AndroidManifest.xml', () => {
      const androidDir = path.join(tempDir, 'my_android_native');
      fs.mkdirSync(path.join(androidDir, 'app', 'src', 'main'), { recursive: true });
      fs.writeFileSync(path.join(androidDir, 'build.gradle'), '// top level gradle');
      fs.writeFileSync(
        path.join(androidDir, 'app', 'build.gradle'),
        `android { namespace "com.example.nativedemo" }`,
      );
      fs.writeFileSync(
        path.join(androidDir, 'app', 'src', 'main', 'AndroidManifest.xml'),
        `<manifest xmlns:android="http://schemas.android.com/apk/res/android"></manifest>`,
      );

      const meta = detectMobileProject(androidDir);
      expect(meta).not.toBeNull();
      expect(meta?.type).toBe('android-native');
      expect(meta?.typeLabel).toBe('Android Native');
      expect(meta?.package).toBe('com.example.nativedemo');
    });

    it('should return null for non-mobile directory', () => {
      const nonMobileDir = path.join(tempDir, 'plain_node_server');
      fs.mkdirSync(nonMobileDir);
      fs.writeFileSync(
        path.join(nonMobileDir, 'package.json'),
        JSON.stringify({ name: 'server', version: '1.0.0', dependencies: { express: '^4.18.2' } }),
      );

      const meta = detectMobileProject(nonMobileDir);
      expect(meta).toBeNull();
    });
  });

  describe('Directory Scanning and Deduplication', () => {
    it('should recursively discover projects in nested subdirectories and deduplicate them', () => {
      const subFolder = path.join(tempDir, 'workspace', 'client');
      fs.mkdirSync(subFolder, { recursive: true });

      const flutterApp = path.join(subFolder, 'flutter_client');
      fs.mkdirSync(flutterApp);
      fs.writeFileSync(
        path.join(flutterApp, 'pubspec.yaml'),
        `name: flutter_client\nversion: 1.0.0+1\nflutter:\n  plugin: true\n`,
      );

      const results = scanDirectoriesForMobileProjects([tempDir]);
      expect(results.length).toBe(1);
      expect(results[0]?.name).toBe('flutter_client');
      expect(results[0]?.type).toBe('flutter');
    });

    it('should deduplicate projects with identical paths or package identifiers', () => {
      const p1 = {
        id: 'p1',
        name: 'App1',
        path: path.join(tempDir, 'app1'),
        type: 'flutter' as const,
        typeLabel: 'Flutter',
        package: 'com.example.same',
        version: '1.0.0',
        buildNumber: 1,
        hasPubspec: true,
        supportedPlatforms: ['android' as const],
        isDirectlySupported: true,
      };
      const p2 = {
        id: 'p2',
        name: 'App2',
        path: path.join(tempDir, 'app2'),
        type: 'react-native' as const,
        typeLabel: 'React Native',
        package: 'com.example.same',
        version: '1.0.0',
        buildNumber: 1,
        hasPubspec: false,
        supportedPlatforms: ['android' as const],
        isDirectlySupported: false,
      };

      const deduped = deduplicateDiscoveredProjects([p2, p1]);
      // Flutter olan önceliklendirilerek tekilleştirilmeli
      expect(deduped.length).toBe(1);
      expect(deduped[0]?.type).toBe('flutter');
    });
  });
});
