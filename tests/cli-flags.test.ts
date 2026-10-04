import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';
import { ReleaseOrchestrator, detectProjectMetadata } from '../packages/core/src/index.js';

describe('CLI Safety Flags & Orchestrator Modes', () => {
  let tempRepoDir: string;

  beforeEach(() => {
    tempRepoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'webicro-cli-test-'));
    execSync('git init', { cwd: tempRepoDir });
    execSync('git config user.name "Test User"', { cwd: tempRepoDir });
    execSync('git config user.email "test@example.com"', { cwd: tempRepoDir });

    // pubspec.yaml
    fs.writeFileSync(
      path.join(tempRepoDir, 'pubspec.yaml'),
      'name: sample_flutter_app\nversion: 2.1.0+42\n',
    );

    // android/app/build.gradle
    const androidAppDir = path.join(tempRepoDir, 'android/app');
    fs.mkdirSync(androidAppDir, { recursive: true });
    fs.writeFileSync(
      path.join(androidAppDir, 'build.gradle'),
      'defaultConfig {\n    applicationId "com.example.sampleapp"\n}\n',
    );

    execSync('git add . && git commit -m "chore: initial commit"', { cwd: tempRepoDir });
  });

  afterEach(() => {
    if (fs.existsSync(tempRepoDir)) {
      fs.rmSync(tempRepoDir, { recursive: true, force: true });
    }
  });

  it('should accurately detect project metadata and Android package ID from gradle', () => {
    const meta = detectProjectMetadata(tempRepoDir);
    expect(meta.name).toBe('sample_flutter_app');
    expect(meta.package).toBe('com.example.sampleapp');
    expect(meta.version).toBe('2.1.0');
    expect(meta.buildNumber).toBe(42);
  });

  it('should support validate-only mode without proceeding to building or stores', async () => {
    const orchestrator = new ReleaseOrchestrator();

    const summary = await orchestrator.execute({
      targetDir: tempRepoDir,
      validateOnly: true,
      skipTests: true,
      skipGit: true,
      manualVersion: '2.1.1',
    });

    expect(summary.status).toBe('VALIDATING');
    expect(summary.androidArtifact).toBeUndefined();
    expect(summary.iosArtifact).toBeUndefined();
  });

  it('should support build-only mode without proceeding to store upload or git operations', async () => {
    const orchestrator = new ReleaseOrchestrator();

    const summary = await orchestrator.execute({
      targetDir: tempRepoDir,
      buildOnly: true,
      skipAndroid: true,
      skipIos: true,
      skipTests: true,
      skipGit: true,
      manualVersion: '2.2.0',
    });

    expect(summary.status).toBe('ARTIFACT_READY');
    expect(summary.googlePlayStatus).toBeUndefined();
  });

  it('should throw CONFIG_ERROR if Android build/upload is requested but no packageId can be detected', async () => {
    // Gradle dosyasını sil ve commit et (git ağacı temiz kalsın)
    const gradleFile = path.join(tempRepoDir, 'android/app/build.gradle');
    if (fs.existsSync(gradleFile)) {
      fs.unlinkSync(gradleFile);
      execSync('git add . && git commit -m "chore: remove gradle for test"', { cwd: tempRepoDir });
    }

    const orchestrator = new ReleaseOrchestrator();

    await expect(
      orchestrator.execute({
        targetDir: tempRepoDir,
        skipTests: true,
        skipGit: true,
        skipAndroid: false,
      })
    ).rejects.toThrow(/Android paket kimliği/);
  });
});
