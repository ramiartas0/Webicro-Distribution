import { describe, it, expect } from 'vitest';
import { ReleaseOrchestrator } from '../packages/core/src/orchestrator.js';

describe('ReleaseOrchestrator - Dry Run Simulation', () => {
  it('should successfully execute a dry-run without throwing artifact errors', async () => {
    const orchestrator = new ReleaseOrchestrator();
    
    // Dry-run simulation test
    const summary = await orchestrator.execute({
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
  });
});
