import { stat } from 'fs/promises';
import type { ArtifactManifest, ArtifactValidationResult } from './types.js';
import { calculateFileHash } from './hasher.js';

export async function validateArtifact(manifest: ArtifactManifest): Promise<ArtifactValidationResult> {
  try {
    const fileStat = await stat(manifest.filePath);
    
    if (fileStat.size === 0) {
      return {
        isValid: false,
        exists: true,
        hashMatches: false,
        sizeMatches: false,
        error: 'File size is 0 bytes',
      };
    }

    const actualSha256 = await calculateFileHash(manifest.filePath);
    const hashMatches = actualSha256 === manifest.sha256;
    const sizeMatches = fileStat.size === manifest.sizeBytes;

    return {
      isValid: hashMatches && sizeMatches,
      exists: true,
      hashMatches,
      sizeMatches,
      expectedSha256: manifest.sha256,
      actualSha256,
      error: (!hashMatches || !sizeMatches) ? 'Hash or size mismatch' : undefined,
    };
  } catch (error) {
    return {
      isValid: false,
      exists: false,
      hashMatches: false,
      sizeMatches: false,
      error: error instanceof Error ? error.message : 'Unknown error during validation',
    };
  }
}
