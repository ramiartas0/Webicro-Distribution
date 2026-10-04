import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';
import { ReleaseOrchestrator } from '../packages/core/src/orchestrator.js';

describe('ReleaseOrchestrator - Dry Run Simulation', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'webicro-dry-run-'));
    execSync('git init', { cwd: tempDir });
    execSync('git config user.name "Test User"', { cwd: tempDir });
    execSync('git config user.email "test@example.com"', { cwd: tempDir });
    // İzole pubspec.yaml oluştur
    fs.writeFileSync(
      path.join(tempDir, 'pubspec.yaml'),
      'name: dry_run_app\nversion: 1.0.0+1\n',
    );
    execSync('git add . && git commit -m "chore: initial commit"', { cwd: tempDir });
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('should successfully execute a dry-run without modifying files or throwing artifact errors', async () => {
    const orchestrator = new ReleaseOrchestrator();

    // Dry-run simulation test on isolated directory
    const summary = await orchestrator.execute({
      targetDir: tempDir,
      packageName: 'com.example.dryrun',
      dryRun: true,
      skipTests: true,
      skipGit: true,
      manualVersion: '3.0.0',
    });

    expect(summary).toBeDefined();
    expect(summary.version).toBe('3.0.0');
    expect(summary.androidArtifact).toBeDefined();
    expect(summary.androidArtifact?.fileName).toContain('dry-run');
    expect(summary.status).toBe('ARTIFACT_READY');

    // Dry-run dosya mutasyonu yapmamalıdır:
    expect(fs.existsSync(path.join(tempDir, 'CHANGELOG.md'))).toBe(false);
    const pubspecContent = fs.readFileSync(path.join(tempDir, 'pubspec.yaml'), 'utf8');
    expect(pubspecContent).toContain('1.0.0+1');
  });
});
