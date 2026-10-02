import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs/promises';
import { AndroidBuildConfig, AndroidBuildResult } from './types.js';

function runProcessWithLiveLogs(command: string, args: string[], cwd: string, onLog?: (line: string) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, shell: true });

    child.stdout.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
      for (const line of lines) {
        if (onLog) onLog(line);
      }
    });

    child.stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
      for (const line of lines) {
        if (onLog) onLog(line);
      }
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Komut başarısız oldu (çıkış kodu ${code}): ${command} ${args.join(' ')}`));
      }
    });

    child.on('error', (err) => {
      reject(err);
    });
  });
}

export class AndroidBuilder {
  async build(config: AndroidBuildConfig, cwd?: string): Promise<AndroidBuildResult> {
    const startTime = Date.now();
    const workDir = cwd ?? process.cwd();

    if (config.clean) {
      if (config.onLog) config.onLog('Flutter temizliği yapılıyor (flutter clean)...');
      await runProcessWithLiveLogs('flutter', ['clean'], workDir, config.onLog);
    }

    if (config.onLog) config.onLog('Bağımlılıklar indiriliyor (flutter pub get)...');
    await runProcessWithLiveLogs('flutter', ['pub', 'get'], workDir, config.onLog);

    const args = [
      'build',
      'appbundle',
      '--release',
      `--build-name=${config.buildName}`,
      `--build-number=${config.buildNumber}`,
    ];

    if (config.flavor) {
      args.push(`--flavor=${config.flavor}`);
    }
    if (config.target) {
      args.push(`--target=${config.target}`);
    }
    if (config.dartDefines) {
      for (const [key, value] of Object.entries(config.dartDefines)) {
        args.push(`--dart-define=${key}=${value}`);
      }
    }

    if (config.onLog) config.onLog(`Android AAB derlemesi başlatılıyor (Gradle bundleRelease)...`);
    await runProcessWithLiveLogs('flutter', args, workDir, config.onLog);

    const aabPath = path.join(workDir, 'build', 'app', 'outputs', 'bundle', 'release', 'app-release.aab');

    try {
      await fs.access(aabPath);
    } catch {
      throw new Error(`AAB paketi beklenen yolda bulunamadı: ${aabPath}`);
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
