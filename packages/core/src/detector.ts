import fs from 'node:fs';
import path from 'node:path';
import { ConfigLoader } from '@webicro/config';

export interface ProjectMetadata {
  name: string;
  package: string;
  iosBundleId?: string;
  version: string;
  buildNumber: number;
}

/**
 * Hedef Flutter projesinin kök dizininden proje adını,
 * Android paket kimliğini (applicationId/namespace),
 * iOS bundle ID'sini ve sürüm bilgilerini tespit eder.
 */
export function detectProjectMetadata(projectPath: string): ProjectMetadata {
  let name = path.basename(projectPath);
  let pkg = '';
  let iosBundleId = '';
  let version = '1.0.0';
  let buildNumber = 1;

  // 1. release.config.yaml dosyasından kontrol et
  try {
    const configPath = path.join(projectPath, 'release.config.yaml');
    if (fs.existsSync(configPath)) {
      const cfg = ConfigLoader.loadFromFile(configPath);
      if (cfg.project?.name) name = cfg.project.name;
      if (cfg.project?.package) pkg = cfg.project.package;
    }
  } catch {
    // Yapılandırma yoksa veya geçersizse devam et
  }

  // 2. pubspec.yaml dosyasından kontrol et
  try {
    const pubspecPath = path.join(projectPath, 'pubspec.yaml');
    if (fs.existsSync(pubspecPath)) {
      const content = fs.readFileSync(pubspecPath, 'utf8');
      const nameMatch = content.match(/^name:\s*([^\s#]+)/m);
      if (nameMatch?.[1]) name = nameMatch[1];
      const verMatch = content.match(/^version:\s*([^\s#]+)/m);
      if (verMatch?.[1]) {
        const full = verMatch[1].trim();
        const [v, b] = full.split('+');
        version = v || '1.0.0';
        buildNumber = b ? parseInt(b, 10) : 1;
      }
    }
  } catch {
    // Devam et
  }

  // 3. Android build.gradle veya build.gradle.kts dosyasından applicationId / namespace ara
  if (!pkg) {
    const gradlePaths = [
      path.join(projectPath, 'android/app/build.gradle'),
      path.join(projectPath, 'android/app/build.gradle.kts'),
    ];
    for (const gp of gradlePaths) {
      if (fs.existsSync(gp)) {
        try {
          const content = fs.readFileSync(gp, 'utf8');
          const appMatch = content.match(/applicationId\s*=?\s*["']([^"']+)["']/);
          if (appMatch?.[1]) {
            pkg = appMatch[1];
            break;
          }
          const nsMatch = content.match(/namespace\s*=?\s*["']([^"']+)["']/);
          if (nsMatch?.[1]) {
            pkg = nsMatch[1];
            break;
          }
        } catch {
          // Devam et
        }
      }
    }
  }

  // 4. iOS Runner project.pbxproj dosyasından PRODUCT_BUNDLE_IDENTIFIER oku
  const pbxPath = path.join(projectPath, 'ios/Runner.xcodeproj/project.pbxproj');
  if (fs.existsSync(pbxPath)) {
    try {
      const content = fs.readFileSync(pbxPath, 'utf8');
      const bundleMatches = content.matchAll(/PRODUCT_BUNDLE_IDENTIFIER\s*=\s*([^;]+);/g);
      for (const m of bundleMatches) {
        const val = m[1]?.trim();
        if (val && !val.includes('$(') && !val.includes('RunnerTests')) {
          iosBundleId = val;
          break;
        }
      }
    } catch {
      // Devam et
    }
  }

  return {
    name,
    package: pkg,
    iosBundleId: iosBundleId || undefined,
    version,
    buildNumber,
  };
}
