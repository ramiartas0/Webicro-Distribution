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

  // 1. Ev Dizinindeki Standart Geliştirici Klasörleri (Tüm İşletim Sistemleri)
  if (home && fs.existsSync(home)) {
    const standardHomeDevDirs = [
      'Projects',
      'projects',
      'Workspace',
      'workspace',
      'Desktop',
      'Desktop/DEV',
      'DEV',
      'dev',
      'Development',
      'development',
      'Developer',
      'Code',
      'code',
      'src',
      'repos',
      'apps',
      'Documents',
      'Sites',
      path.join('source', 'repos'),
    ];

    for (const sub of standardHomeDevDirs) {
      const full = path.join(home, sub);
      if (fs.existsSync(full)) {
        roots.push(path.resolve(full));
      }
    }
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
