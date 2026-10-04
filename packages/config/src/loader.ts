import fs from 'node:fs';
import path from 'node:path';
import yaml from 'yaml';
import { ReleaseConfigSchema } from './schema.js';
import type { ReleaseConfig } from './types.js';

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

function normalizeKeysToCamelCase(obj: unknown): unknown {
  if (Array.isArray(obj)) {
    return obj.map(normalizeKeysToCamelCase);
  }
  if (obj !== null && typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      const camelKey = key.replace(/_([a-z0-9])/g, (_, letter: string) => letter.toUpperCase());
      result[camelKey] = normalizeKeysToCamelCase(value);
    }
    return result;
  }
  return obj;
}

export class ConfigLoader {
  private static findConfigFile(startDir: string): string | null {
    let currentDir = startDir;

    while (true) {
      const yamlPath = path.join(currentDir, 'release.config.yaml');
      if (fs.existsSync(yamlPath)) return yamlPath;

      const ymlPath = path.join(currentDir, 'release.config.yml');
      if (fs.existsSync(ymlPath)) return ymlPath;

      const parentDir = path.dirname(currentDir);
      if (parentDir === currentDir) break;

      currentDir = parentDir;
    }

    return null;
  }

  public static loadFromFile(filePath?: string): ReleaseConfig {
    let targetPath = filePath;

    if (!targetPath) {
      targetPath = this.findConfigFile(process.cwd()) ?? undefined;
    }

    if (!targetPath || !fs.existsSync(targetPath)) {
      throw new ConfigError('Configuration file not found. Create a release.config.yaml file.');
    }

    try {
      const fileContents = fs.readFileSync(targetPath, 'utf8');
      const rawConfig = yaml.parse(fileContents);
      const normalizedConfig = normalizeKeysToCamelCase(rawConfig);

      const result = ReleaseConfigSchema.safeParse(normalizedConfig);

      if (!result.success) {
        const errorMessages = result.error.errors
          .map((err) => `${err.path.join('.')}: ${err.message}`)
          .join('\n');
        throw new ConfigError(`Configuration validation failed:\n${errorMessages}`);
      }

      return result.data as ReleaseConfig;
    } catch (error) {
      if (error instanceof ConfigError) {
        throw error;
      }
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new ConfigError(`Failed to read or parse configuration file: ${errorMessage}`);
    }
  }
}
