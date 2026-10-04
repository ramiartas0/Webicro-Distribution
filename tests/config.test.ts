import { describe, it, expect } from 'vitest';
import { ConfigLoader } from '../packages/config/src/loader.js';

describe('ConfigLoader - YAML Normalization & Validation', () => {
  it('should correctly load and normalize snake_case YAML configuration', () => {
    const config = ConfigLoader.loadFromFile('./release.config.yaml');
    
    expect(config).toBeDefined();
    expect(config.project.name).toBe('Piyyuu');
    expect(config.build.runTests).toBe(true);
    expect(config.build.runAnalyze).toBe(true);
    expect(config.security.scanSecrets).toBe(true);
    expect(config.security.requireCleanGit).toBe(true);
    expect(config.ai.enabled).toBe(true);
    expect(config.ai.languages).toEqual(['en', 'tr']);
    expect(config.version.autoIncrement).toBe(true);
  });
});
