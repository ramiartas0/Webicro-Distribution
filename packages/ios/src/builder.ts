import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import fs from 'node:fs/promises';
import type { IosBuildConfig, IosBuildResult } from './types.js';

const execAsync = promisify(exec);

export class IosBuilder {
  async build(config: IosBuildConfig, cwd?: string): Promise<IosBuildResult> {
    if (process.platform !== 'darwin') {
      throw new Error('BuildError: iOS builds are only supported on macOS.');
    }

    await this.verifyXcodeEnvironment();

    const startTime = Date.now();
    const workDir = cwd ?? process.cwd();

    await this.ensureDeploymentTarget(workDir);

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
      const ipaFiles = files.filter((f) => f.endsWith('.ipa'));
      if (ipaFiles.length === 0) {
        throw new Error('No .ipa file found in build directory.');
      }
      ipaPath = path.join(ipaDir, ipaFiles[0] as string);
    } catch (err: unknown) {
      throw new Error(
        `Failed to locate IPA file: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    const durationMs = Date.now() - startTime;

    return {
      ipaPath,
      versionName: config.buildName,
      versionCode: config.buildNumber,
      durationMs,
    };
  }

  private async ensureDeploymentTarget(workDir: string): Promise<void> {
    const podfilePath = path.join(workDir, 'ios', 'Podfile');
    try {
      let content = await fs.readFile(podfilePath, 'utf8');
      let modified = false;

      if (!/platform\s+:ios,\s*['"]1[5-9]\.0['"]/i.test(content)) {
        if (/platform\s+:ios/i.test(content)) {
          content = content.replace(/platform\s+:ios,\s*['"][^'"]+['"]/i, "platform :ios, '15.0'");
          modified = true;
        }
      }

      if (!content.includes("config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '15.0'")) {
        if (content.includes('flutter_additional_ios_build_settings(target)')) {
          content = content.replace(
            /flutter_additional_ios_build_settings\(target\)/g,
            "flutter_additional_ios_build_settings(target)\n    target.build_configurations.each do |config|\n      config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '15.0'\n    end",
          );
          modified = true;
        } else if (content.includes('post_install do |installer|')) {
          content = content.replace(
            /post_install do \|installer\|/g,
            "post_install do |installer|\n  installer.pods_project.targets.each do |target|\n    target.build_configurations.each do |config|\n      config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '15.0'\n    end\n  end",
          );
          modified = true;
        }
      }

      if (modified) {
        await fs.writeFile(podfilePath, content, 'utf8');
      }
    } catch {}
  }

  private async verifyXcodeEnvironment(): Promise<void> {
    try {
      await execAsync('/usr/bin/xcrun --find xcodebuild');
    } catch {
      let activeDevDir = '';
      try {
        const { stdout } = await execAsync('xcode-select -p');
        activeDevDir = stdout.trim();
      } catch {}

      const hint = activeDevDir.includes('CommandLineTools')
        ? `Etkin geliştirici dizini (${activeDevDir}) yalnızca macOS Command Line Tools içermektedir. iOS IPA derlemesi için tam Xcode.app kurulmalı ve 'sudo xcode-select -s /Applications/Xcode.app/Contents/Developer' komutuyla etkinleştirilmelidir.`
        : "Sistemde 'xcodebuild' aracı bulunamadı. Lütfen Xcode'un kurulu olduğundan ve xcode-select ile yapılandırıldığından emin olun.";

      throw new Error(`XcodeError: iOS IPA derlemesi için xcodebuild gereklidir. ${hint}`);
    }
  }
}

