import { mkdir, copyFile, stat, writeFile } from 'fs/promises';
import { join, basename, resolve, isAbsolute } from 'path';
import type { ArtifactManifest } from './types.js';
import { calculateFileHash } from './hasher.js';

export class ArtifactManager {
  private readonly artifactsBaseDir: string;

  constructor(artifactsBaseDir = '.release/artifacts') {
    this.artifactsBaseDir = artifactsBaseDir;
  }

  async registerArtifact(
    platform: 'android' | 'ios',
    sourcePath: string,
    version: string,
  ): Promise<ArtifactManifest> {
    const base = isAbsolute(this.artifactsBaseDir)
      ? this.artifactsBaseDir
      : resolve(process.cwd(), this.artifactsBaseDir);
    const targetDir = resolve(base, version, platform);
    await mkdir(targetDir, { recursive: true });

    const fileName = basename(sourcePath);
    const targetPath = join(targetDir, fileName);

    await copyFile(sourcePath, targetPath);

    const fileStat = await stat(targetPath);
    const sha256 = await calculateFileHash(targetPath);

    const manifest: ArtifactManifest = {
      platform,
      filePath: targetPath,
      fileName,
      sha256,
      sizeBytes: fileStat.size,
      createdAt: new Date().toISOString(),
    };

    const checksumContent = `${sha256}  ${fileName}\n`;
    await writeFile(join(targetDir, 'checksums.txt'), checksumContent, 'utf8');

    const manifestContent = JSON.stringify(manifest, null, 2);
    await writeFile(join(targetDir, 'manifest.json'), manifestContent, 'utf8');

    return manifest;
  }
}
