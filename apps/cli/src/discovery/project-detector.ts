import fs from 'node:fs';
import path from 'node:path';
import type { DiscoveredProjectMeta } from './types.js';

function extractGradlePackage(projectPath: string): string | undefined {
  const gradlePaths = [
    path.join(projectPath, 'android/app/build.gradle'),
    path.join(projectPath, 'android/app/build.gradle.kts'),
    path.join(projectPath, 'app/build.gradle'),
    path.join(projectPath, 'app/build.gradle.kts'),
  ];

  for (const gp of gradlePaths) {
    if (fs.existsSync(gp)) {
      try {
        const content = fs.readFileSync(gp, 'utf8');
        const appMatch = content.match(/applicationId\s*=?\s*["']([^"']+)["']/);
        if (appMatch && appMatch[1]) {
          return appMatch[1];
        }
        const nsMatch = content.match(/namespace\s*=?\s*["']([^"']+)["']/);
        if (nsMatch && nsMatch[1]) {
          return nsMatch[1];
        }
      } catch {}
    }
  }
  return undefined;
}

function extractIosBundleId(projectPath: string): string | undefined {
  const possiblePbxDirs = [
    path.join(projectPath, 'ios/Runner.xcodeproj/project.pbxproj'),
    path.join(projectPath, 'Runner.xcodeproj/project.pbxproj'),
  ];

  // Ayrıca kökteki herhangi bir *.xcodeproj/project.pbxproj dosyasını ara
  try {
    const entries = fs.readdirSync(projectPath, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && entry.name.endsWith('.xcodeproj')) {
        possiblePbxDirs.push(path.join(projectPath, entry.name, 'project.pbxproj'));
      }
    }
    const iosDir = path.join(projectPath, 'ios');
    if (fs.existsSync(iosDir)) {
      const iosEntries = fs.readdirSync(iosDir, { withFileTypes: true });
      for (const entry of iosEntries) {
        if (entry.isDirectory() && entry.name.endsWith('.xcodeproj')) {
          possiblePbxDirs.push(path.join(iosDir, entry.name, 'project.pbxproj'));
        }
      }
    }
  } catch {}

  for (const pbx of possiblePbxDirs) {
    if (fs.existsSync(pbx)) {
      try {
        const content = fs.readFileSync(pbx, 'utf8');
        const matches = content.matchAll(/PRODUCT_BUNDLE_IDENTIFIER\s*=\s*([^;]+);/g);
        for (const m of matches) {
          const val = m[1]?.trim().replace(/["']/g, '');
          if (val && !val.includes('$') && !val.includes('Tests')) {
            return val;
          }
        }
      } catch {}
    }
  }
  return undefined;
}

export function detectMobileProject(projectPath: string): DiscoveredProjectMeta | null {
  const resolved = path.resolve(projectPath);
  const baseName = path.basename(resolved);

  // 1. FLUTTER PROJESİ TESPİTİ
  const pubspecPath = path.join(resolved, 'pubspec.yaml');
  if (fs.existsSync(pubspecPath)) {
    try {
      const content = fs.readFileSync(pubspecPath, 'utf8');
      const isFlutter =
        content.includes('flutter:') ||
        fs.existsSync(path.join(resolved, 'android')) ||
        fs.existsSync(path.join(resolved, 'ios'));

      if (isFlutter) {
        let name = baseName;
        const nameMatch = content.match(/^name:\s*([^\s#]+)/m);
        if (nameMatch && nameMatch[1]) {
          name = nameMatch[1];
        }

        let version = '1.0.0';
        let buildNumber = 1;
        const verMatch = content.match(/^version:\s*([^\s#]+)/m);
        if (verMatch && verMatch[1]) {
          const full = verMatch[1].trim();
          const [v, b] = full.split('+');
          version = v || '1.0.0';
          buildNumber = b ? parseInt(b, 10) : 1;
        }

        const pkg = extractGradlePackage(resolved);
        const iosBundle = extractIosBundleId(resolved);

        const supportedPlatforms: ('android' | 'ios')[] = [];
        if (fs.existsSync(path.join(resolved, 'android'))) supportedPlatforms.push('android');
        if (fs.existsSync(path.join(resolved, 'ios'))) supportedPlatforms.push('ios');
        if (supportedPlatforms.length === 0) {
          supportedPlatforms.push('android', 'ios');
        }

        return {
          id: resolved.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase(),
          name,
          path: resolved,
          type: 'flutter',
          typeLabel: 'Flutter',
          package: pkg || iosBundle,
          iosBundleId: iosBundle,
          version,
          buildNumber,
          hasPubspec: true,
          supportedPlatforms,
          isDirectlySupported: true,
        };
      }
    } catch {}
  }

  // 2. REACT NATIVE / EXPO TESPİTİ
  const packageJsonPath = path.join(resolved, 'package.json');
  if (fs.existsSync(packageJsonPath)) {
    try {
      const content = fs.readFileSync(packageJsonPath, 'utf8');
      const pkgJson = JSON.parse(content) as {
        name?: string;
        version?: string;
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      const deps = { ...pkgJson.dependencies, ...pkgJson.devDependencies };

      const isExpo = Boolean(deps['expo']);
      const isReactNative = Boolean(deps['react-native']);

      if (isExpo || isReactNative) {
        const name = pkgJson.name || baseName;
        const version = pkgJson.version || '1.0.0';
        let pkg = extractGradlePackage(resolved);
        let iosBundle = extractIosBundleId(resolved);

        // Expo için app.json incelemesi
        const appJsonPath = path.join(resolved, 'app.json');
        if (fs.existsSync(appJsonPath)) {
          try {
            const appContent = fs.readFileSync(appJsonPath, 'utf8');
            const appJson = JSON.parse(appContent) as {
              expo?: {
                android?: { package?: string };
                ios?: { bundleIdentifier?: string };
              };
            };
            if (appJson.expo?.android?.package && !pkg) {
              pkg = appJson.expo.android.package;
            }
            if (appJson.expo?.ios?.bundleIdentifier && !iosBundle) {
              iosBundle = appJson.expo.ios.bundleIdentifier;
            }
          } catch {}
        }

        const supportedPlatforms: ('android' | 'ios')[] = [];
        if (fs.existsSync(path.join(resolved, 'android'))) supportedPlatforms.push('android');
        if (fs.existsSync(path.join(resolved, 'ios'))) supportedPlatforms.push('ios');
        if (supportedPlatforms.length === 0) {
          supportedPlatforms.push('android', 'ios');
        }

        const projectType = isExpo ? 'expo' : 'react-native';
        const typeLabel = isExpo ? 'Expo' : 'React Native';

        return {
          id: resolved.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase(),
          name,
          path: resolved,
          type: projectType,
          typeLabel,
          package: pkg || iosBundle,
          iosBundleId: iosBundle,
          version,
          buildNumber: 1,
          hasPubspec: false,
          supportedPlatforms,
          isDirectlySupported: false,
        };
      }
    } catch {}
  }

  // 3. NATIVE ANDROID TESPİTİ
  const androidManifestPaths = [
    path.join(resolved, 'app/src/main/AndroidManifest.xml'),
    path.join(resolved, 'src/main/AndroidManifest.xml'),
  ];
  const hasGradle =
    fs.existsSync(path.join(resolved, 'build.gradle')) ||
    fs.existsSync(path.join(resolved, 'build.gradle.kts')) ||
    fs.existsSync(path.join(resolved, 'settings.gradle')) ||
    fs.existsSync(path.join(resolved, 'settings.gradle.kts'));

  for (const amp of androidManifestPaths) {
    if (fs.existsSync(amp) && hasGradle) {
      const pkg = extractGradlePackage(resolved);
      return {
        id: resolved.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase(),
        name: baseName,
        path: resolved,
        type: 'android-native',
        typeLabel: 'Android Native',
        package: pkg,
        version: '1.0.0',
        buildNumber: 1,
        hasPubspec: false,
        supportedPlatforms: ['android'],
        isDirectlySupported: false,
      };
    }
  }

  // 4. NATIVE IOS TESPİTİ
  try {
    const entries = fs.readdirSync(resolved, { withFileTypes: true });
    const xcodeProj = entries.find((e) => e.isDirectory() && e.name.endsWith('.xcodeproj'));
    if (xcodeProj && !fs.existsSync(pubspecPath)) {
      const iosBundle = extractIosBundleId(resolved);
      return {
        id: resolved.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase(),
        name: baseName,
        path: resolved,
        type: 'ios-native',
        typeLabel: 'iOS Native',
        package: iosBundle,
        iosBundleId: iosBundle,
        version: '1.0.0',
        buildNumber: 1,
        hasPubspec: false,
        supportedPlatforms: ['ios'],
        isDirectlySupported: false,
      };
    }
  } catch {}

  return null;
}
