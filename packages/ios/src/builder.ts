import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import fs from 'node:fs/promises';
import { IosBuildConfig, IosBuildResult } from './types.js';

const execAsync = promisify(exec);

export class IosBuilder {
  async build(config: IosBuildConfig, cwd?: string): Promise<IosBuildResult> {
    if (process.platform !== 'darwin') {
      throw new Error('BuildError: iOS builds are only supported on macOS.');
    }

    const startTime = Date.now();
    const workDir = cwd ?? process.cwd();

    if (config.clean) {
      await execAsync('flutter clean', { cwd: workDir });
    }

    await execAsync('flutter pub get', { cwd: workDir });

    let buildCommand = `flutter build ipa --release --build-name=${config.buildName} --build-number=${config.buildNumber}`;
    
    if (config.flavor) {
      buildCommand += ` --flavor ${config.flavor}`;
    }
    if (config.exportOptionsPlist) {
      buildCommand += ` --export-options-plist=${config.exportOptionsPlist}`;
    }
    if (config.dartDefines) {
      for (const [key, value] of Object.entries(config.dartDefines)) {
        buildCommand += ` --dart-define=${key}=${value}`;
      }
    }

    await execAsync(buildCommand, { cwd: workDir });

    const ipaDir = path.join(workDir, 'build', 'ios', 'ipa');
    let ipaPath = '';

    try {
      const files = await fs.readdir(ipaDir);
      const ipaFiles = files.filter(f => f.endsWith('.ipa'));
      if (ipaFiles.length === 0) {
        throw new Error('No .ipa file found in build directory.');
      }
      ipaPath = path.join(ipaDir, ipaFiles[0] as string);
    } catch (err: unknown) {
      throw new Error(`Failed to locate IPA file: ${err instanceof Error ? err.message : String(err)}`);
    }

    const durationMs = Date.now() - startTime;

    return {
      ipaPath,
      versionName: config.buildName,
      versionCode: config.buildNumber,
      durationMs,
    };
  }
}
