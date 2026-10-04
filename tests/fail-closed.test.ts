import { describe, it, expect } from 'vitest';
import { ReleaseOrchestrator } from '../packages/core/src/orchestrator.js';

describe('ReleaseOrchestrator - Fail-Closed Behavior', () => {
  it('should fail-closed if requireCleanGit is enabled and working tree is dirty', async () => {
    const orchestrator = new ReleaseOrchestrator();
    
    // Non dry-run, requireCleanGit enabled
    await expect(
      orchestrator.execute({
        dryRun: false,
        skipTests: true,
        skipGit: true,
      })
    ).rejects.toThrow(/Güvenlik kuralı ihlali|Git çalışma ağacı temiz değil/);
  });
});
