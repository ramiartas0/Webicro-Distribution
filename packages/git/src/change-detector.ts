import type { NativeChangeInfo } from './types.js';

export function isNativeFile(filePath: string): boolean {
  const androidPatterns = ['android/', 'androidmanifest.xml', '.gradle'];
  const iosPatterns = ['ios/', 'podfile', 'podfile.lock', 'info.plist', '.xcworkspace', '.xcodeproj'];

  const lowerPath = filePath.toLowerCase();
  return androidPatterns.some(p => lowerPath.includes(p)) ||
         iosPatterns.some(p => lowerPath.includes(p));
}

export function detectNativeChanges(changedFiles: string[]): NativeChangeInfo {
  const androidFiles: string[] = [];
  const iosFiles: string[] = [];

  const androidPatterns = ['android/', 'androidmanifest.xml', '.gradle'];
  const iosPatterns = ['ios/', 'podfile', 'podfile.lock', 'info.plist', '.xcworkspace', '.xcodeproj'];

  for (const file of changedFiles) {
    const lowerPath = file.toLowerCase();
    let isAndroid = false;

    for (const p of androidPatterns) {
      if (lowerPath.includes(p)) {
        isAndroid = true;
        androidFiles.push(file);
        break;
      }
    }

    if (!isAndroid) {
      for (const p of iosPatterns) {
        if (lowerPath.includes(p)) {
          iosFiles.push(file);
          break;
        }
      }
    }
  }

  return {
    androidChanged: androidFiles.length > 0,
    iosChanged: iosFiles.length > 0,
    androidFiles,
    iosFiles
  };
}
