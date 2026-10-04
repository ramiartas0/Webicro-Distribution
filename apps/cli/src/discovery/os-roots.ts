import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

export function getPlatformSpecificDevRoots(customRoots?: string[]): string[] {
  if (customRoots && customRoots.length > 0) {
    return customRoots
      .filter((r) => typeof r === 'string' && r.trim().length > 0)
      .map((r) => path.resolve(r))
      .filter((r) => fs.existsSync(r));
  }

  const platform = process.platform;
  const home = os.homedir() || process.env['HOME'] || process.env['USERPROFILE'] || '';
  const roots: string[] = [];

  // 1. Ev Dizinindeki Standart Geliştirici & IDE Klasörleri (Tüm İşletim Sistemleri)
  if (home && fs.existsSync(home)) {
    const standardHomeDevDirs = [
      'Desktop',
      'Documents',
      'Downloads',
      'Projects',
      'projects',
      'Workspace',
      'workspace',
      'Development',
      'development',
      'Developer',
      'Code',
      'code',
      'src',
      'repos',
      'apps',
      'Sites',
      'AndroidStudioProjects',
      'IdeaProjects',
      'GitHub',
      'GitLab',
      'Bitbucket',
      path.join('source', 'repos'),
    ];

    for (const sub of standardHomeDevDirs) {
      const full = path.join(home, sub);
      if (fs.existsSync(full)) {
        roots.push(path.resolve(full));
      }
    }

    // Ev dizini (~) altındaki 1. seviye tüm kullanıcı klasörlerini dinamik olarak tara
    // (Böylece kullanıcının kendi açtığı ~/DEV, ~/Work, ~/mobil, ~/flutter_apps gibi tüm özel dizinler otomatik bulunur)
    try {
      const homeEntries = fs.readdirSync(home, { withFileTypes: true });
      const ignoreHomeFolders = new Set([
        'Library',
        'Applications',
        'Application Support',
        'AppData',
        'Local Settings',
        'Music',
        'Movies',
        'Pictures',
        'Photos',
        'Videos',
        'Podcasts',
        'Public',
        '.Trash',
        'webicro_distribution',
      ]);

      for (const entry of homeEntries) {
        if (entry.isDirectory()) {
          const dirName = entry.name;
          if (dirName.startsWith('.')) continue; // Gizli klasörleri atla (.ssh, .config, .cache vb.)
          if (ignoreHomeFolders.has(dirName)) continue;

          const candidate = path.join(home, dirName);
          roots.push(path.resolve(candidate));
        }
      }
    } catch {}
  }

  // 2. Windows'a Özgü Disk Sürücüleri Taraması (C:\, D:\, E:\, F:\, G:\)
  if (platform === 'win32') {
    const driveLetters = ['C', 'D', 'E', 'F', 'G', 'H'];
    const driveDevDirs = [
      'dev',
      'DEV',
      'Projects',
      'projects',
      'Workspace',
      'workspace',
      'src',
      'Code',
      'code',
      'Development',
      path.join('source', 'repos'),
    ];

    for (const drive of driveLetters) {
      const driveRoot = `${drive}:\\`;
      try {
        if (fs.existsSync(driveRoot)) {
          for (const sub of driveDevDirs) {
            const driveTarget = path.join(driveRoot, sub);
            if (fs.existsSync(driveTarget)) {
              roots.push(path.resolve(driveTarget));
            }
          }
        }
      } catch {
        // İrişilemeyen sürücüler sessizce geçilir
      }
    }
  }

  // 3. Linux'a Özgü Ek Dizinler
  if (platform === 'linux') {
    const linuxDirs = ['/var/www', '/srv', '/opt/projects', '/opt/dev'];
    for (const d of linuxDirs) {
      try {
        if (fs.existsSync(d)) {
          roots.push(path.resolve(d));
        }
      } catch {}
    }
  }

  // 4. Mevcut Çalışma Dizini ve Üst Dizini
  try {
    const cwd = process.cwd();
    if (fs.existsSync(cwd)) {
      roots.push(path.resolve(cwd));
      const parentDir = path.resolve(cwd, '..');
      if (fs.existsSync(parentDir)) {
        roots.push(parentDir);
      }
    }
  } catch {}

  // Tekilleştirme ve varlık kontrolü
  const uniqueRoots: string[] = [];
  const seen = new Set<string>();

  for (const r of roots) {
    const resolved = path.resolve(r);
    if (!seen.has(resolved)) {
      seen.add(resolved);
      uniqueRoots.push(resolved);
    }
  }

  return uniqueRoots;
}
