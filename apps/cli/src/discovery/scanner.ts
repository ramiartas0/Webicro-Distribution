import fs from 'node:fs';
import path from 'node:path';
import { getPlatformSpecificDevRoots } from './os-roots.js';
import { detectMobileProject } from './project-detector.js';
import type { DiscoveredProjectMeta } from './types.js';

export const GLOBAL_IGNORE_DIRS = new Set([
  'node_modules',
  '.git',
  '.dart_tool',
  'build',
  'Pods',
  'dist',
  'vendor',
  'DerivedData',
  '.gradle',
  '.idea',
  '.vscode',
  'Library',
  'Applications',
  'Music',
  'Movies',
  'Pictures',
  'webicro_distribution',
  '.pub-cache',
  '.sdk',
  'engine',
  'SourcePackages',
  'checkouts',
  'AppData',
  'Application Data',
  'Local Settings',
  '$Recycle.Bin',
  'System Volume Information',
  '.Trash',
  '.npm',
  '.cache',
  'venv',
  '.venv',
  '__pycache__',
  '.cargo',
  '.rustup',
]);

export function scanDirectoriesForMobileProjects(
  customRoots?: string[],
  maxDepth = 8,
): DiscoveredProjectMeta[] {
  const roots = getPlatformSpecificDevRoots(customRoots);
  const foundProjects: DiscoveredProjectMeta[] = [];
  const visitedRealPaths = new Set<string>();

  function scan(currentDir: string, depth: number): void {
    if (depth > maxDepth) return;
    if (!fs.existsSync(currentDir)) return;

    let realPath: string;
    try {
      realPath = fs.realpathSync(currentDir);
    } catch {
      return;
    }

    if (visitedRealPaths.has(realPath)) return;
    visitedRealPaths.add(realPath);

    // Kendi repo/dağıtım dizinimizi atla
    if (path.resolve(currentDir).endsWith('webicro_distribution')) {
      return;
    }

    // Bu klasörün kendisi bir mobil proje mi?
    const meta = detectMobileProject(currentDir);
    if (meta) {
      foundProjects.push(meta);
      // Bir mobil projenin alt klasörlerine (android, ios vb.) daha fazla inmiyoruz
      return;
    }

    // Değilse, alt klasörleri tara
    try {
      const entries = fs.readdirSync(currentDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const dirName = entry.name;
          if (dirName.startsWith('.') && dirName !== '.release') continue;
          if (GLOBAL_IGNORE_DIRS.has(dirName)) continue;

          scan(path.join(currentDir, dirName), depth + 1);
        }
      }
    } catch {}
  }

  for (const root of roots) {
    if (fs.existsSync(root)) {
      scan(root, 0);
    }
  }

  return deduplicateDiscoveredProjects(foundProjects);
}

export function deduplicateDiscoveredProjects(
  projects: DiscoveredProjectMeta[],
): DiscoveredProjectMeta[] {
  const seenPaths = new Set<string>();
  const seenPackages = new Set<string>();
  const uniqueList: DiscoveredProjectMeta[] = [];

  // Flutter projelerine öncelik ver
  const sorted = [...projects].sort((a, b) => {
    if (a.type === 'flutter' && b.type !== 'flutter') return -1;
    if (a.type !== 'flutter' && b.type === 'flutter') return 1;
    return a.name.localeCompare(b.name);
  });

  for (const p of sorted) {
    const resolvedPath = path.resolve(p.path);
    if (seenPaths.has(resolvedPath)) continue;

    const normPkg = p.package ? p.package.trim().toLowerCase() : '';
    if (normPkg && seenPackages.has(normPkg)) {
      continue;
    }

    seenPaths.add(resolvedPath);
    if (normPkg) seenPackages.add(normPkg);
    uniqueList.push(p);
  }

  return uniqueList;
}
