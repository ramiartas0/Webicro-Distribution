import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';
import { ReleaseOrchestrator } from '../packages/core/src/orchestrator.js';

describe('ReleaseOrchestrator - Fail-Closed Behavior', () => {
  let tempRepoDir: string;

  beforeEach(() => {
    tempRepoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'webicro-dirty-test-'));
    execSync('git init', { cwd: tempRepoDir });
    execSync('git config user.name "Test User"', { cwd: tempRepoDir });
    execSync('git config user.email "test@example.com"', { cwd: tempRepoDir });
    // İlk commit'i oluştur
    fs.writeFileSync(path.join(tempRepoDir, 'README.md'), '# Test App');
    execSync('git add . && git commit -m "initial commit"', { cwd: tempRepoDir });
    // Kirli dosya ekle (uncommitted dirty state)
    fs.writeFileSync(path.join(tempRepoDir, 'dirty.txt'), 'uncommitted changes');
  });

  afterEach(() => {
    if (fs.existsSync(tempRepoDir)) {
      fs.rmSync(tempRepoDir, { recursive: true, force: true });
    }
  });

  it('should fail-closed if requireCleanGit is enabled and working tree is dirty', async () => {
    const orchestrator = new ReleaseOrchestrator();

    // release.config.yaml oluştur: requireCleanGit: true
    const configContent = `
project:
  name: DirtyApp
  package: com.test.dirty
security:
  require_clean_git: true
`;
    fs.writeFileSync(path.join(tempRepoDir, 'release.config.yaml'), configContent);

    // requireCleanGit enabled
    await expect(
      orchestrator.execute({
        targetDir: tempRepoDir,
        configPath: path.join(tempRepoDir, 'release.config.yaml'),
        skipTests: true,
        skipGit: true,
      })
    ).rejects.toThrow(/Güvenlik kuralı ihlali|Git çalışma ağacı temiz değil/);
  });
});
