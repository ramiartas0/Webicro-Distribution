import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';
import { ReleaseOrchestrator } from '../packages/core/src/orchestrator.js';

describe('ReleaseOrchestrator - Execution Modes (Validate-Only & Build-Only)', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'webicro-modes-test-'));
    execSync('git init', { cwd: tempDir });
    execSync('git config user.name "Test User"', { cwd: tempDir });
    execSync('git config user.email "test@example.com"', { cwd: tempDir });

    fs.writeFileSync(
      path.join(tempDir, 'pubspec.yaml'),
      'name: modes_test_app\nversion: 1.0.0+1\n',
    );
    execSync('git add . && git commit -m "chore: initial commit"', { cwd: tempDir });
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('should successfully execute in validate-only mode without modifying files or building artifacts', async () => {
    const orchestrator = new ReleaseOrchestrator();

    const summary = await orchestrator.execute({
      targetDir: tempDir,
      packageName: 'com.example.modestest',
      validateOnly: true,
      skipFlutterCheck: true,
      skipTests: true,
      skipGit: true,
      manualVersion: '3.0.0',
    });

    expect(summary).toBeDefined();
    expect(summary.version).toBe('3.0.0+2');
    expect(summary.status).toBe('VALIDATING');
    expect(summary.androidArtifact).toBeUndefined();
    expect(summary.iosArtifact).toBeUndefined();

    expect(fs.existsSync(path.join(tempDir, 'CHANGELOG.md'))).toBe(false);
    const pubspecContent = fs.readFileSync(path.join(tempDir, 'pubspec.yaml'), 'utf8');
    expect(pubspecContent).toContain('1.0.0+1');
  });

  it('should successfully execute in build-only mode without store upload or git sync', async () => {
    const orchestrator = new ReleaseOrchestrator();

    const summary = await orchestrator.execute({
      targetDir: tempDir,
      packageName: 'com.example.modestest',
      buildOnly: true,
      skipFlutterCheck: true,
      skipAndroid: true,
      skipIos: true,
      skipTests: true,
      skipGit: true,
      manualVersion: '3.1.0',
    });

    expect(summary).toBeDefined();
    expect(summary.version).toBe('3.1.0+2');
    expect(summary.status).toBe('ARTIFACT_READY');
    expect(summary.googlePlayStatus).toBeUndefined();
    expect(summary.appStoreStatus).toBeUndefined();
  });
});
