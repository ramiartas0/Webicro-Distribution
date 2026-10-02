import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import fs from 'node:fs/promises';
import { AndroidBuildConfig, AndroidBuildResult } from './types.js';

const execAsync = promisify(exec);

export class AndroidBuilder {
  async build(config: AndroidBuildConfig, cwd?: string): Promise<AndroidBuildResult> {
    const startTime = Date.now();
    const workDir = cwd ?? process.cwd();

    if (config.clean) {
      await execAsync('flutter clean', { cwd: workDir });
    }

    await execAsync('flutter pub get', { cwd: workDir });

    let buildCommand = `flutter build appbundle --release --build-name=${config.buildName} --build-number=${config.buildNumber}`;
    
    if (config.flavor) {
      buildCommand += ` --flavor ${config.flavor}`;
    }
    if (config.target) {
      buildCommand += ` --target ${config.target}`;
    }
    if (config.dartDefines) {
      for (const [key, value] of Object.entries(config.dartDefines)) {
        buildCommand += ` --dart-define=${key}=${value}`;
      }
    }

    await execAsync(buildCommand, { cwd: workDir });

    const aabPath = path.join(workDir, 'build', 'app', 'outputs', 'bundle', 'release', 'app-release.aab');
    
    try {
      await fs.access(aabPath);
    } catch (err: unknown) {
      throw new Error(`AAB file not found at expected path: ${aabPath}`);
    }

    const durationMs = Date.now() - startTime;

    return {
      aabPath,
      versionName: config.buildName,
      versionCode: config.buildNumber,
      durationMs,
    };
  }
}
